import "server-only";

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

import { sql } from "kysely";
import { after } from "next/server";

import { formatPhone } from "@/lib/phone";
import { planHasFeature } from "@/lib/plans";
import type { OrgContext } from "@/server/auth/context";
import { assertOrgAdmin } from "@/server/auth/db-guards";
import { withRls, withSystem } from "@/server/db/client";
import { DomainError } from "@/server/db/errors";
import { integrationsKeyConfigured, open, seal } from "@/server/integrations/crypto";
import * as google from "@/server/integrations/google";
import { logger } from "@/server/logger";
import type { ServiceCtx } from "@/server/modules/branches/service";

/**
 * Google Calendar (plan Max o superior, PDF §6): las citas aparecen en la
 * agenda del taller. Una conexión por taller (organización); los tokens se
 * guardan cifrados. Las solicitudes aparecen como "pendiente de confirmar" y
 * las citas confirmadas con su día y hora; al rechazar o cancelar se quitan.
 * Si Google falla, la cita no se ve afectada: queda pendiente y se reintenta.
 */

type Ctx = ServiceCtx & Pick<OrgContext, "subscription">;

const STATE_TTL_MS = 10 * 60_000;

function stateSecret(): Buffer {
  const k = process.env.INTEGRATIONS_ENCRYPTION_KEY;
  if (!k) throw new DomainError("integration_not_configured");
  return createHmac("sha256", Buffer.from(k, "base64")).update("google-oauth-state").digest();
}

function signState(payload: string): string {
  return `${payload}.${createHmac("sha256", stateSecret()).update(payload).digest("base64url")}`;
}

/** state = org.user.nonce.caducidad.firma; además viaja en una cookie (doble comprobación). */
export function makeState(orgId: string, userId: string, now = Date.now()): string {
  return signState(`${orgId}.${userId}.${randomBytes(12).toString("base64url")}.${now + STATE_TTL_MS}`);
}

export function readState(state: string, now = Date.now()): { orgId: string; userId: string } | null {
  const parts = state.split(".");
  if (parts.length !== 5) return null;
  const expected = Buffer.from(signState(parts.slice(0, 4).join(".")));
  const given = Buffer.from(state);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  if (Number(parts[3]) < now) return null;
  return { orgId: parts[0], userId: parts[1] };
}

export function redirectUri(appUrl: string): string {
  return new URL("/api/integrations/google/callback", appUrl).toString();
}

export interface CalendarStatus {
  available: boolean; // incluido en el plan
  configured: boolean; // credenciales de Google en el servidor
  integration: { id: string; status: string; email: string | null; connectedAt: Date | null; lastSyncAt: Date | null; lastError: string | null } | null;
}

export async function getCalendarStatus(ctx: Ctx): Promise<CalendarStatus> {
  const plan = ctx.subscription.planCode;
  const row = await withRls(ctx.auth, (tx) =>
    tx
      .selectFrom("integrations")
      .select(["id", "status", sql<string | null>`external_account_email::text`.as("email"), "connected_at", "last_sync_at", "last_error"])
      .where("organization_id", "=", ctx.membership.organizationId)
      .where("type", "=", "google_calendar")
      .where("status", "in", ["connected", "error"])
      .executeTakeFirst(),
  );
  return {
    available: ctx.subscription.active && Boolean(plan && planHasFeature(plan, "google_calendar")),
    configured: google.googleConfigured() && integrationsKeyConfigured(),
    integration: row ? { id: row.id, status: row.status, email: row.email, connectedAt: row.connected_at, lastSyncAt: row.last_sync_at, lastError: row.last_error } : null,
  };
}

async function assertCanConnect(ctx: Ctx) {
  await assertOrgAdmin(ctx);
  const plan = ctx.subscription.planCode;
  if (!ctx.subscription.active) throw new DomainError("subscription_inactive");
  if (!plan || !planHasFeature(plan, "google_calendar")) throw new DomainError("feature_unavailable", "google_calendar");
  if (!google.googleConfigured() || !integrationsKeyConfigured()) throw new DomainError("integration_not_configured");
}

export async function startConnect(ctx: Ctx, appUrl: string): Promise<{ url: string; state: string }> {
  await assertCanConnect(ctx);
  const state = makeState(ctx.membership.organizationId, ctx.auth.userId);
  return { url: google.authUrl(state, redirectUri(appUrl)), state };
}

interface StoredTokens {
  refreshToken: string;
  accessToken: string;
  expiresAt: number;
}

async function storeTokens(integrationId: string, tokens: StoredTokens) {
  const s = seal(JSON.stringify(tokens), integrationId);
  await withSystem((tx) =>
    tx
      .insertInto("private.integration_secrets" as never)
      .values({ integration_id: integrationId, ciphertext: s.ciphertext, nonce: s.nonce, auth_tag: s.authTag, key_version: s.keyVersion, updated_at: new Date() } as never)
      .onConflict((oc) => oc.column("integration_id" as never).doUpdateSet({ ciphertext: s.ciphertext, nonce: s.nonce, auth_tag: s.authTag, key_version: s.keyVersion, updated_at: new Date() } as never))
      .execute(),
  );
}

async function loadTokens(integrationId: string): Promise<StoredTokens | null> {
  const { rows } = await withSystem((tx) =>
    sql<{ ciphertext: Buffer; nonce: Buffer; auth_tag: Buffer; key_version: number }>`
      select ciphertext, nonce, auth_tag, key_version from private.integration_secrets where integration_id = ${integrationId}
    `.execute(tx),
  );
  const r = rows[0];
  if (!r) return null;
  return JSON.parse(open({ ciphertext: r.ciphertext, nonce: r.nonce, authTag: r.auth_tag, keyVersion: r.key_version }, integrationId)) as StoredTokens;
}

/** Vuelta de Google: comprueba el state (firma, caducidad, usuario y cookie) y guarda la conexión. */
export async function completeConnect(
  ctx: Ctx,
  input: { code: string; state: string; cookieState: string | undefined },
  appUrl: string,
): Promise<void> {
  const st = readState(input.state);
  if (!st || !input.cookieState || input.cookieState !== input.state) throw new DomainError("validation_error", "oauth_state");
  if (st.userId !== ctx.auth.userId || st.orgId !== ctx.membership.organizationId) throw new DomainError("permission_denied");
  await assertCanConnect(ctx);

  const tokens = await google.exchangeCode(input.code, redirectUri(appUrl)).catch((err) => {
    logger.warn("google_exchange_failed", { error: err });
    throw new DomainError("integration_failed");
  });
  if (!tokens.refreshToken) throw new DomainError("integration_failed");
  if (!tokens.scope.includes("https://www.googleapis.com/auth/calendar.events")) throw new DomainError("validation_error", "google_scope");
  const email = await google.accountEmail(tokens.accessToken);
  const orgId = ctx.membership.organizationId;

  const integrationId = await withSystem(async (tx) => {
    await tx
      .updateTable("integrations")
      .set({ status: "disconnected" })
      .where("organization_id", "=", orgId)
      .where("type", "=", "google_calendar")
      .where("status", "in", ["connected", "error"])
      .execute();
    const row = await tx
      .insertInto("integrations")
      .values({
        organization_id: orgId,
        type: "google_calendar",
        status: "connected",
        external_account_email: email,
        scopes: tokens.scope,
        calendar_id: "primary",
        connected_by: ctx.auth.userId,
        connected_at: new Date(),
      })
      .returning("id")
      .executeTakeFirstOrThrow();
    await sql`select app.write_audit(${orgId}::uuid, 'google_calendar.connected', 'integration', ${row.id}, ${JSON.stringify({ by: ctx.auth.userId })}::jsonb)`.execute(tx);
    return row.id;
  });
  await storeTokens(integrationId, { refreshToken: tokens.refreshToken, accessToken: tokens.accessToken, expiresAt: tokens.expiresAt });
}

export async function disconnect(ctx: Ctx): Promise<void> {
  await assertOrgAdmin(ctx);
  const status = await getCalendarStatus(ctx);
  if (!status.integration) throw new DomainError("not_found");
  const id = status.integration.id;
  const tokens = await loadTokens(id).catch(() => null);
  if (tokens) await google.revoke(tokens.refreshToken);
  await withSystem(async (tx) => {
    await sql`delete from private.integration_secrets where integration_id = ${id}`.execute(tx);
    await tx.updateTable("integrations").set({ status: "disconnected", last_error: null }).where("id", "=", id).execute();
    await sql`select app.write_audit(${ctx.membership.organizationId}::uuid, 'google_calendar.disconnected', 'integration', ${id}, ${JSON.stringify({ by: ctx.auth.userId })}::jsonb)`.execute(tx);
  });
}

async function accessToken(integrationId: string): Promise<string> {
  const t = await loadTokens(integrationId);
  if (!t) throw new google.GoogleError(401, "no_tokens");
  if (t.expiresAt - 60_000 > Date.now()) return t.accessToken;
  const fresh = await google.refreshTokens(t.refreshToken);
  await storeTokens(integrationId, { refreshToken: fresh.refreshToken ?? t.refreshToken, accessToken: fresh.accessToken, expiresAt: fresh.expiresAt });
  return fresh.accessToken;
}

export type SyncOutcome = "synced" | "removed" | "skipped" | "failed" | "reconnect";

/** Refleja una cita en Google Calendar. Nunca lanza: la cita no depende de Google. */
export async function syncAppointment(appointmentId: string, appUrl = process.env.APP_URL ?? "http://localhost:3000"): Promise<SyncOutcome> {
  try {
    const ctx = await withSystem(async (tx) => {
      const { rows } = await sql<{
        org_id: string;
        status: string;
        requester_name: string;
        requester_email: string | null;
        requester_phone: string | null;
        plate: string | null;
        vehicle: string | null;
        message: string | null;
        start: Date | null;
        end: Date | null;
        requested_date: string | null;
        tz: string;
        address: string | null;
        integration_id: string | null;
        calendar_id: string | null;
        has_feature: boolean;
        link_event: string | null;
      }>`
        select a.organization_id as org_id, a.status, a.requester_name, a.requester_email::text, a.requester_phone,
               coalesce(v.plate, a.plate_entered) as plate, nullif(trim(coalesce(v.make, '') || ' ' || coalesce(v.model, '')), '') as vehicle,
               a.customer_message as message,
               coalesce(a.confirmed_start, lower(a.requested_slot)) as start, coalesce(a.confirmed_end, upper(a.requested_slot)) as "end",
               a.requested_date::text, coalesce(b.timezone, o.timezone) as tz,
               nullif(concat_ws(', ', coalesce(b.address_line1, o.address_line1), coalesce(b.city, o.city)), '') as address,
               i.id as integration_id, i.calendar_id, app.has_feature(a.organization_id, 'google_calendar') as has_feature,
               l.google_event_id as link_event
          from appointments a
          join branches b on b.id = a.branch_id
          join organizations o on o.id = a.organization_id
          left join vehicles v on v.id = a.vehicle_id
          left join integrations i on i.organization_id = a.organization_id and i.type = 'google_calendar' and i.status = 'connected'
          left join calendar_event_links l on l.appointment_id = a.id
         where a.id = ${appointmentId}
      `.execute(tx);
      return rows[0];
    });
    if (!ctx?.integration_id || !ctx.calendar_id || !ctx.has_feature) return "skipped";
    const eventId = google.eventIdFor(appointmentId);
    const token = await accessToken(ctx.integration_id);

    if (["rejected", "canceled"].includes(ctx.status)) {
      if (ctx.link_event) await google.deleteEvent(token, ctx.calendar_id, ctx.link_event);
      await withSystem((tx) =>
        tx.updateTable("calendar_event_links").set({ sync_status: "deleted", last_synced_at: new Date(), last_error: null }).where("appointment_id", "=", appointmentId).execute(),
      );
      return "removed";
    }
    const tentative = ctx.status === "requested";
    if (tentative && !ctx.start && !ctx.requested_date) return "skipped";
    const who = [ctx.requester_name, ctx.plate].filter(Boolean).join(" · ");
    const description = [
      tentative ? "Solicitud de cita PENDIENTE de confirmar en RevisaYa." : "Cita confirmada en RevisaYa.",
      ctx.vehicle ? `Vehículo: ${ctx.vehicle}${ctx.plate ? ` (${ctx.plate})` : ""}` : null,
      ctx.requester_phone ? `Teléfono: ${formatPhone(ctx.requester_phone)}` : null,
      ctx.requester_email ? `Correo: ${ctx.requester_email}` : null,
      ctx.message ? `Mensaje: ${ctx.message}` : null,
      new URL(`/app/citas/${appointmentId}`, appUrl).toString(),
    ]
      .filter(Boolean)
      .join("\n");
    const res = await google.upsertEvent(token, ctx.calendar_id, eventId, {
      summary: `${tentative ? "Solicitud (sin confirmar)" : "Cita"}: ${who}`,
      description,
      location: ctx.address,
      start: ctx.start ?? new Date(),
      end: ctx.end ?? new Date(),
      timeZone: ctx.tz,
      allDayDate: ctx.start ? null : ctx.requested_date,
      tentative,
    });
    await withSystem(async (tx) => {
      await tx
        .insertInto("calendar_event_links")
        .values({ appointment_id: appointmentId, organization_id: ctx.org_id, integration_id: ctx.integration_id!, google_calendar_id: ctx.calendar_id!, google_event_id: res.id, etag: res.etag, sync_status: "synced", last_synced_at: new Date() })
        .onConflict((oc) => oc.column("appointment_id").doUpdateSet({ integration_id: ctx.integration_id!, google_calendar_id: ctx.calendar_id!, google_event_id: res.id, etag: res.etag, sync_status: "synced", last_synced_at: new Date(), last_error: null }))
        .execute();
      await tx.updateTable("integrations").set({ last_sync_at: new Date(), last_error: null }).where("id", "=", ctx.integration_id!).execute();
    });
    return "synced";
  } catch (err) {
    const reconnect = err instanceof google.GoogleError && (err.code === "invalid_grant" || err.status === 401);
    logger.warn("calendar_sync_failed", { appointmentId, error: err });
    await withSystem(async (tx) => {
      const { rows } = await sql<{ organization_id: string; integration_id: string | null }>`
        select a.organization_id, i.id as integration_id from appointments a
          left join integrations i on i.organization_id = a.organization_id and i.type = 'google_calendar' and i.status = 'connected'
         where a.id = ${appointmentId}
      `.execute(tx);
      const r = rows[0];
      if (!r?.integration_id) return;
      const message = reconnect ? "reconnect_required" : err instanceof Error ? err.message.slice(0, 200) : "error";
      if (reconnect) await tx.updateTable("integrations").set({ status: "error", last_error: message }).where("id", "=", r.integration_id).execute();
      await tx
        .insertInto("calendar_event_links")
        .values({ appointment_id: appointmentId, organization_id: r.organization_id, integration_id: r.integration_id, google_calendar_id: "primary", google_event_id: google.eventIdFor(appointmentId), sync_status: "pending", last_error: message })
        .onConflict((oc) => oc.column("appointment_id").doUpdateSet({ sync_status: "pending", last_error: message }))
        .execute();
    }).catch(() => undefined);
    return reconnect ? "reconnect" : "failed";
  }
}

/** Proceso programado: reintenta lo pendiente y sube las citas próximas que aún no están en la agenda. */
export async function syncPendingCalendar(limit = 100): Promise<Record<SyncOutcome, number>> {
  const stats: Record<SyncOutcome, number> = { synced: 0, removed: 0, skipped: 0, failed: 0, reconnect: 0 };
  if (!google.googleConfigured() || !integrationsKeyConfigured()) return stats;
  const ids = await withSystem(async (tx) => {
    const { rows } = await sql<{ id: string }>`
      select a.id from appointments a
        join integrations i on i.organization_id = a.organization_id and i.type = 'google_calendar' and i.status = 'connected'
        left join calendar_event_links l on l.appointment_id = a.id
       where (l.appointment_id is null and a.status in ('requested', 'confirmed')
              and coalesce(a.confirmed_end, upper(a.requested_slot), a.requested_date::timestamptz + interval '1 day', a.created_at + interval '30 days') > now())
          or l.sync_status = 'pending'
          or (l.sync_status = 'synced' and a.status in ('rejected', 'canceled'))
       order by a.updated_at
       limit ${limit}
    `.execute(tx);
    return rows.map((r) => r.id);
  });
  for (const id of ids) stats[await syncAppointment(id)]++;
  return stats;
}

/** Tras responder al usuario, refleja la cita en Google (si el taller lo tiene conectado). */
export function syncAppointmentLater(appointmentId: string): void {
  try {
    after(async () => {
      await syncAppointment(appointmentId);
    });
  } catch {
    // Fuera de una petición (procesos, pruebas): en segundo plano; el proceso programado reintenta.
    void syncAppointment(appointmentId);
  }
}

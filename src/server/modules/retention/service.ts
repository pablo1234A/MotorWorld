import "server-only";

import { randomUUID } from "node:crypto";

import { sql } from "kysely";

import { formatDate } from "@/lib/dates";
import { renderPlatformEmail } from "@/lib/email/platform-email";
import { withSystem } from "@/server/db/client";
import type { EmailPort } from "@/server/email/port";
import type { SenderConfig } from "@/server/email/provider";
import { platformFrom } from "@/server/email/sender";
import { logger } from "@/server/logger";
import { removeObject } from "@/server/storage";

/**
 * Conservación tras la baja (P9): aviso por correo 7 días antes y borrado de
 * los datos del taller al vencer los 60 días (private.purge_organization_data).
 * Si vuelve a contratar antes, la fecha se anula al instante (webhook de Stripe).
 */

interface Deps {
  email: EmailPort | null;
  sender: SenderConfig | null;
}

export async function sendRetentionWarnings(deps: Deps): Promise<{ sent: number; skipped: number }> {
  const stats = { sent: 0, skipped: 0 };
  if (!deps.email || !deps.sender) return stats;
  const due = await withSystem(async (tx) => {
    const { rows } = await sql<{ id: string; name: string; until: string; branch_id: string; emails: string[] }>`
      select o.id, o.trade_name as name, o.data_retention_until::text as until, b.id as branch_id,
             array(select p.email::text from organization_members m join profiles p on p.id = m.user_id
                    where m.organization_id = o.id and m.role = 'admin' and m.status = 'active' order by m.is_owner desc limit 10) as emails
        from organizations o join branches b on b.organization_id = o.id and b.is_primary
       where o.data_retention_until between current_date and current_date + 7
         and not exists (select 1 from private.retention_notices n where n.organization_id = o.id and n.retention_until = o.data_retention_until)
    `.execute(tx);
    return rows;
  });
  for (const o of due) {
    const msg = renderPlatformEmail({
      title: `Los datos de ${o.name} se borrarán el ${formatDate(o.until)}`,
      intro: `Tu suscripción a RevisaYa terminó y, como indican los términos, los datos del taller se conservan 60 días. El ${formatDate(o.until)} se borrarán definitivamente: clientes, vehículos, historial, citas y presupuestos.`,
      notes: [
        "Si quieres conservarlos, descárgalos antes en Configuración → Datos y privacidad (un Excel con todo).",
        "Si vuelves a contratar un plan antes de esa fecha, no se borra nada y todo sigue como estaba.",
      ],
      link: { href: new URL("/app/configuracion/datos", deps.sender.appUrl).toString(), label: "Descargar mis datos" },
    });
    const { from, address } = platformFrom(deps.sender);
    let ok = 0;
    for (const to of o.emails) {
      const r = await deps.email
        .send({ from, to, subject: `Tus datos en RevisaYa se borrarán el ${formatDate(o.until)}`, html: msg.html, text: msg.text, headers: {}, idempotencyKey: `retention-${o.id}-${o.until}-${randomUUID()}`, tags: { kind: "billing" } })
        .catch((err: Error) => ({ kind: "retryable" as const, code: "adapter_exception", message: err.message }));
      if (r.kind === "accepted") ok++;
      await withSystem((tx) =>
        tx
          .insertInto("email_logs")
          .values({
            organization_id: o.id,
            branch_id: o.branch_id,
            kind: "billing",
            to_email: to,
            from_email: address,
            subject: "Aviso de borrado de datos",
            provider: deps.email!.name,
            provider_message_id: r.kind === "accepted" ? r.messageId : null,
            status: r.kind === "accepted" ? "accepted" : "failed",
            error_code: r.kind === "accepted" ? null : r.code.slice(0, 100),
            sent_at: r.kind === "accepted" ? new Date() : null,
          })
          .execute(),
      ).catch((err) => logger.error("retention_email_log_failed", { error: err }));
    }
    if (ok > 0) {
      await withSystem((tx) => sql`insert into private.retention_notices (organization_id, retention_until) values (${o.id}::uuid, ${o.until}::date) on conflict do nothing`.execute(tx));
      stats.sent++;
    } else stats.skipped++;
  }
  return stats;
}

export async function purgeExpiredOrganizations(limit = 20): Promise<{ purged: number; files: number; failed: number }> {
  const stats = { purged: 0, files: 0, failed: 0 };
  const ids = await withSystem(async (tx) => {
    const { rows } = await sql<{ id: string }>`
      select o.id from organizations o where o.data_retention_until < current_date and private.retention_due(o.id) order by o.data_retention_until limit ${limit}
    `.execute(tx);
    return rows.map((r) => r.id);
  });
  for (const id of ids) {
    try {
      const r = await withSystem(async (tx) => (await sql<{ r: { files: string[] } }>`select private.purge_organization_data(${id}::uuid) as r`.execute(tx)).rows[0].r);
      for (const path of r.files ?? []) {
        const bucket = fileBucket(path);
        await removeObject(bucket, path).catch((err) => logger.warn("retention_file_delete_failed", { error: err }));
        stats.files++;
      }
      stats.purged++;
      logger.info("organization_purged", { organizationId: id });
    } catch (err) {
      stats.failed++;
      logger.error("organization_purge_failed", { organizationId: id, error: err });
    }
  }
  return stats;
}

/** Bucket de un archivo de la empresa: presupuestos y documentos PCI son privados; logos, públicos. */
export function fileBucket(path: string): "documents" | "org-assets" {
  return path.includes("/quotes/") || path.includes("/pci/") ? "documents" : "org-assets";
}

/**
 * Archivos pendientes de borrar del almacenamiento (fotos y documentos de
 * instalaciones y equipos eliminados definitivamente): los encola la BD al
 * purgar y aquí se borran. Si el borrado falla, la fila se queda para el
 * siguiente intento.
 */
export async function processStorageDeletions(limit = 500): Promise<{ deleted: number; failed: number }> {
  const stats = { deleted: 0, failed: 0 };
  const rows = await withSystem(async (tx) => (await sql<{ id: string; bucket: string; path: string }>`select id, bucket, path from private.storage_deletions order by id limit ${limit}`.execute(tx)).rows);
  for (const r of rows) {
    try {
      await removeObject(r.bucket === "documents" ? "documents" : "org-assets", r.path);
      await withSystem((tx) => sql`delete from private.storage_deletions where id = ${r.id}::bigint`.execute(tx));
      stats.deleted++;
    } catch (err) {
      stats.failed++;
      logger.warn("storage_deletion_failed", { error: err });
    }
  }
  return stats;
}

import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import type { OperatorPermission } from "@/lib/permissions";
import type { PlanCode } from "@/lib/plans";
import type { SubscriptionState } from "@/server/auth/context";
import { closePool } from "@/server/db/client";
import { bookingToken } from "@/server/email/links";
import type { EmailPort, OutboundEmail, SendResult } from "@/server/email/port";
import type { SenderConfig } from "@/server/email/provider";
import { sendAppointmentEmail } from "@/server/modules/appointments/notify";
import {
  createPublicRequest,
  resolveBookingPage,
} from "@/server/modules/appointments/public";
import * as appointments from "@/server/modules/appointments/service";
import { sendInvitationEmail } from "@/server/modules/members/invitation-email";
import * as profile from "@/server/modules/organizations/profile";
import {
  emailQuote,
  issueQuote,
  quotePdf,
} from "@/server/modules/quotes/issue";
import * as quotes from "@/server/modules/quotes/service";
import { runDispatcher } from "@/server/reminders/dispatcher";

import {
  addMember,
  createOrg,
  createUser,
  ownerMemberId,
  query,
  type TestOrg,
} from "./support/db";

/**
 * Fase 7 por el camino real: página pública de citas, panel, correos, presupuestos
 * con PDF, datos del taller y pendientes (invitaciones). El puerto de correo de
 * prueba existe SOLO aquí.
 */

class FakeEmail implements EmailPort {
  readonly name = "smtp" as const;
  sent: OutboundEmail[] = [];
  async send(e: OutboundEmail): Promise<SendResult> {
    this.sent.push(e);
    return { kind: "accepted", messageId: randomUUID() };
  }
}

const LINK_SECRET = "test-link-secret-0123456789abcdef0123456789";
process.env.EMAIL_LINK_SECRET = LINK_SECRET;
const sender: SenderConfig = {
  sharedDomain: "avisos.revisaya.test",
  appUrl: "http://localhost:3000",
  linkSecret: LINK_SECRET,
};

type Ctx = Parameters<typeof appointments.confirmAppointment>[0];
const sub = (planCode: PlanCode, active = true): SubscriptionState => ({
  planCode,
  status: active ? "active" : "canceled",
  active,
  trialEnd: null,
  currentPeriodEnd: null,
  cancelAtPeriodEnd: false,
});

async function admin(o: TestOrg, plan: PlanCode = "business"): Promise<Ctx> {
  return {
    auth: { userId: o.ownerId },
    membership: {
      organizationId: o.orgId,
      memberId: await ownerMemberId(o),
      role: "admin",
      permissions: [],
    },
    subscription: sub(plan),
  };
}
async function operator(
  o: TestOrg,
  permissions: OperatorPermission[],
): Promise<Ctx> {
  const user = await createUser();
  const memberId = await addMember(o, user, "operator", permissions);
  return {
    auth: { userId: user },
    membership: {
      organizationId: o.orgId,
      memberId,
      role: "operator",
      permissions,
    },
    subscription: sub("business"),
  };
}
async function slugOf(o: TestOrg) {
  return (
    await query<{ slug: string }>(
      "select slug::text from organizations where id = $1",
      [o.orgId],
    )
  )[0].slug;
}
async function customerWithVehicle(
  o: TestOrg,
  email: string | null = `c-${randomUUID().slice(0, 6)}@cliente.test`,
) {
  const [{ id: customerId }] = await query<{ id: string }>(
    "insert into customers (organization_id, branch_id, first_name, last_name, email) values ($1, $2, 'Rosa', 'Gil', $3) returning id",
    [o.orgId, o.branchId, email],
  );
  const plate = `${String(Math.floor(1000 + Math.random() * 8999))} KLM`;
  const [{ id: vehicleId }] = await query<{ id: string }>(
    "insert into vehicles (organization_id, branch_id, customer_id, plate, make, model, next_service_date, next_service_source) values ($1, $2, $3, $4, 'Kia', 'Ceed', current_date + 30, 'manual') returning id",
    [o.orgId, o.branchId, customerId, plate],
  );
  return { customerId, vehicleId, plate, email };
}
const tomorrow = () =>
  new Date(Date.now() + 86_400_000 * 2).toISOString().slice(0, 10);

let org: TestOrg;
let other: TestOrg;

beforeAll(async () => {
  org = await createOrg("business");
  other = await createOrg("pro");
  await query(
    "update branch_settings set reminders_enabled = true, send_window_start = '00:00', send_window_end = '23:59:59', send_weekdays = '{1,2,3,4,5,6,7}' where branch_id = $1",
    [org.branchId],
  );
});
beforeEach(async () => {
  await query(
    "delete from private.rate_limit_buckets where key like 'booking:%' or key like 'test-email:%'",
  );
  await query(
    "update reminders set status = 'canceled', skip_reason = 'canceled_by_user' where status in ('scheduled', 'retrying')",
  );
});
afterAll(closePool);

describe("citas: del aviso a la cita confirmada", () => {
  it("el aviso lleva el enlace firmado; la solicitud queda vinculada; el taller la confirma con .ics", async () => {
    const c = await customerWithVehicle(org);
    const [{ id: reminderId }] = await query<{ id: string }>(
      `insert into reminders (organization_id, branch_id, customer_id, vehicle_id, type, due_date, offset_days, scheduled_for)
       values ($1, $2, $3, $4, 'service_date', current_date + 30, 30, now() - interval '1 minute') returning id`,
      [org.orgId, org.branchId, c.customerId, c.vehicleId],
    );
    const email = new FakeEmail();
    await runDispatcher({ email, sender });
    const mail = email.sent.find((m) => m.to === c.email)!;
    const slug = await slugOf(org);
    const token = bookingToken(reminderId, LINK_SECRET);
    expect(mail.html).toContain(
      `/t/${slug}/cita?t=${encodeURIComponent(token)}`,
    );

    const page = await resolveBookingPage(slug, { token });
    expect(page).toMatchObject({
      open: true,
      tokenStatus: "valid",
      prefill: { name: "Rosa Gil", plate: c.plate, vehicle: "Kia Ceed" },
    });

    const mails = new FakeEmail();
    const id = await createPublicRequest(
      {
        slug,
        token,
        branchId: null,
        name: "Rosa Gil",
        email: c.email,
        phone: null,
        plate: c.plate,
        requestedDate: tomorrow(),
        slot: null,
        message: "Por la mañana",
        website: "",
      },
      "198.51.100.7",
      { email: mails, sender },
    );
    const [appt] = await query<{
      status: string;
      source: string;
      customer_id: string;
      vehicle_id: string;
      reminder_id: string;
    }>(
      "select status, source, customer_id, vehicle_id, reminder_id from appointments where id = $1",
      [id],
    );
    expect(appt).toEqual({
      status: "requested",
      source: "reminder_link",
      customer_id: c.customerId,
      vehicle_id: c.vehicleId,
      reminder_id: reminderId,
    });
    expect(mails.sent.find((m) => m.to === c.email)?.subject).toContain(
      "Hemos recibido tu solicitud",
    );
    expect(
      mails.sent.some((m) => m.subject.startsWith("Nueva solicitud de cita")),
    ).toBe(true);

    // Pulsar otra vez el botón no crea otra solicitud.
    await expect(
      createPublicRequest(
        {
          slug,
          token,
          branchId: null,
          name: "Rosa Gil",
          email: c.email,
          phone: null,
          plate: c.plate,
          requestedDate: tomorrow(),
          slot: null,
          message: null,
          website: "",
        },
        "198.51.100.8",
        { email: mails, sender },
      ),
    ).rejects.toMatchObject({ code: "conflict" });

    const ctx = await admin(org);
    expect(
      await appointments.confirmAppointment(ctx, {
        id: id!,
        date: "2026-11-24",
        time: "10:00",
        durationMinutes: 60,
      }),
    ).toBe("confirmed");
    const [conf] = await query<{ start: Date; end: Date }>(
      'select confirmed_start as start, confirmed_end as "end" from appointments where id = $1',
      [id],
    );
    expect(conf.start.toISOString()).toBe("2026-11-24T09:00:00.000Z"); // 10:00 en Madrid
    expect(conf.end.toISOString()).toBe("2026-11-24T10:00:00.000Z");

    const out = new FakeEmail();
    expect(
      await sendAppointmentEmail("booking_confirmed", id!, {
        email: out,
        sender,
      }),
    ).toBe("sent");
    expect(out.sent[0].subject).toBe(
      `Visita confirmada con Taller de prueba: 24/11/2026 a las 10:00`,
    );
    const ics = out.sent[0].attachments?.[0];
    expect(ics?.filename).toBe("cita.ics");
    expect(ics?.content.toString()).toContain("DTSTART:20261124T090000Z");

    expect(
      await appointments.confirmAppointment(ctx, {
        id: id!,
        date: "2026-11-25",
        time: "16:30",
        durationMinutes: 90,
      }),
    ).toBe("rescheduled");
    await appointments.completeAppointment(ctx, id!);
    const detail = await appointments.getAppointment(ctx, id!);
    expect(detail?.events.map((e) => e.toStatus)).toEqual([
      "requested",
      "confirmed",
      "confirmed",
      "completed",
    ]);
    await expect(
      appointments.cancelAppointment(ctx, id!),
    ).rejects.toMatchObject({ code: "not_found" });
  });

  it("modo huecos: la última plaza no se la quedan dos personas a la vez", async () => {
    const o = await createOrg("pro");
    await query(
      "update branch_settings set booking_mode = 'slots', slot_minutes = 60, booking_notice_hours = 0 where branch_id = $1",
      [o.branchId],
    );
    await query(
      "insert into availability_rules (organization_id, branch_id, weekday, start_time, end_time, capacity) select $1, $2, d, '09:00', '10:00', 1 from generate_series(1, 7) d",
      [o.orgId, o.branchId],
    );
    const slug = await slugOf(o);
    const page = await resolveBookingPage(slug);
    const slot = page!.slots.find(
      (s) => new Date(s.start).getTime() > Date.now() + 3600_000,
    )!;
    const req = (n: number) =>
      createPublicRequest(
        {
          slug,
          token: null,
          branchId: null,
          name: `Persona ${n}`,
          email: `p${n}-${randomUUID().slice(0, 4)}@cliente.test`,
          phone: null,
          plate: null,
          requestedDate: null,
          slot: slot.start,
          message: null,
          website: "",
        },
        `203.0.113.${n}`,
        { email: null, sender: null },
      );
    const results = await Promise.allSettled([req(1), req(2), req(3)]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(
      results
        .filter((r) => r.status === "rejected")
        .map((r) => (r as PromiseRejectedResult).reason.detail),
    ).toEqual(["slot_unavailable", "slot_unavailable"]);
    expect(
      (await resolveBookingPage(slug))!.slots.some(
        (s) => s.start === slot.start,
      ),
    ).toBe(false);
  });

  it("robots, página cerrada y límites", async () => {
    const slug = await slugOf(org);
    const base = {
      slug,
      token: null,
      branchId: null,
      name: "Robot",
      email: "r@x.test",
      phone: null,
      plate: null,
      requestedDate: tomorrow(),
      slot: null,
      message: null,
    };
    expect(
      await createPublicRequest(
        { ...base, website: "http://spam" },
        "192.0.2.1",
        { email: null, sender: null },
      ),
    ).toBeNull();
    expect(
      await query("select 1 from appointments where requester_name = 'Robot'"),
    ).toHaveLength(0);
    await expect(
      createPublicRequest(
        { ...base, website: "", requestedDate: "2020-01-01" },
        "192.0.2.2",
        { email: null, sender: null },
      ),
    ).rejects.toMatchObject({ detail: "booking_date" });
    for (let i = 0; i < 5; i++)
      await createPublicRequest(
        { ...base, website: "", name: `Rafaga ${i}` },
        "192.0.2.3",
        { email: null, sender: null },
      );
    await expect(
      createPublicRequest(
        { ...base, website: "", name: "Rafaga 6" },
        "192.0.2.3",
        { email: null, sender: null },
      ),
    ).rejects.toMatchObject({ code: "rate_limited" });

    const closed = await createOrg(null);
    const page = await resolveBookingPage(await slugOf(closed));
    expect(page).toMatchObject({ open: false, branches: [] });
    expect(await resolveBookingPage("no-existe-este-taller")).toBeNull();
    // Un enlace firmado de OTRO taller no prellena nada.
    const c = await customerWithVehicle(other);
    const [{ id: rid }] = await query<{ id: string }>(
      "insert into reminders (organization_id, branch_id, customer_id, vehicle_id, type, due_date, offset_days, scheduled_for, status, skip_reason) values ($1, $2, $3, $4, 'service_date', current_date + 30, 30, now(), 'canceled', 'canceled_by_user') returning id",
      [other.orgId, other.branchId, c.customerId, c.vehicleId],
    );
    expect(
      (
        await resolveBookingPage(slug, {
          token: bookingToken(rid, LINK_SECRET),
        })
      )?.tokenStatus,
    ).toBe("invalid");
  });

  it("permisos: sin 'appointments.manage' no se ven ni se gestionan; otro taller tampoco", async () => {
    const slug = await slugOf(org);
    const id = (await createPublicRequest(
      {
        slug,
        token: null,
        branchId: null,
        name: "Permisos",
        email: "perm@cliente.test",
        phone: null,
        plate: "9999 ZZZ",
        requestedDate: tomorrow(),
        slot: null,
        message: null,
        website: "",
      },
      "192.0.2.50",
      { email: null, sender: null },
    ))!;
    const noPerm = await operator(org, ["customers.write"]);
    expect(
      (await appointments.listAppointments(noPerm, { page: 1, pageSize: 25 }))
        .total,
    ).toBe(0);
    await expect(
      appointments.confirmAppointment(noPerm, {
        id,
        date: "2026-12-01",
        time: "09:00",
        durationMinutes: 60,
      }),
    ).rejects.toMatchObject({ code: "not_found" });
    const foreign = await admin(other, "pro");
    await expect(
      appointments.rejectAppointment(foreign, id),
    ).rejects.toMatchObject({ code: "not_found" });
    await expect(
      appointments.rejectAppointment(
        {
          ...foreign,
          membership: { ...foreign.membership, organizationId: org.orgId },
        },
        id,
      ),
    ).rejects.toMatchObject({ code: "not_found" });

    const manager = await operator(org, [
      "appointments.manage",
      "customers.write",
      "vehicles.write",
    ]);
    await appointments.linkToCustomer(manager, id, null);
    const [linked] = await query<{
      customer_id: string;
      vehicle_id: string;
      source: string;
    }>(
      "select a.customer_id, a.vehicle_id, c.source from appointments a join customers c on c.id = a.customer_id where a.id = $1",
      [id],
    );
    expect(linked).toMatchObject({ source: "booking_page" });
    expect(linked.vehicle_id).not.toBeNull();
    await appointments.rejectAppointment(manager, id);
  });
});

describe("presupuestos", () => {
  const items = [
    {
      description: "Aceite 5W30",
      quantity: "4.5",
      unitPrice: "12.35",
      taxRate: 21,
    },
    {
      description: "Mano de obra",
      quantity: "1.5",
      unitPrice: "40",
      taxRate: 21,
    },
    { description: "Tasa", quantity: "1", unitPrice: "3.10", taxRate: 0 },
  ];

  it("borrador → editar → emitir (PDF guardado, datos congelados) → enviar con adjunto → aceptar", async () => {
    const ctx = await admin(org);
    const c = await customerWithVehicle(org);
    await query(
      "update organizations set legal_name = 'Taller de Prueba S.L.', tax_id = 'B12345674' where id = $1",
      [org.orgId],
    );
    const id = await quotes.createQuote(ctx, {
      customerId: c.customerId,
      vehicleId: c.vehicleId,
      issueDate: "2026-11-08",
      validUntil: "2026-12-08",
      notes: "Pago al recoger",
      items,
    });
    let q = (await quotes.getQuote(ctx, id))!;
    // 55,58 + 60,00 + 3,10 = 118,68; IVA 11,67 + 12,60 = 24,27
    expect(q).toMatchObject({
      status: "draft",
      subtotal: "118.68",
      taxTotal: "24.27",
      total: "142.95",
    });
    expect(q.number).toMatch(/^P-2026-\d{4}$/);

    await quotes.updateQuote(ctx, id, {
      customerId: c.customerId,
      vehicleId: c.vehicleId,
      issueDate: "2026-11-08",
      validUntil: "2026-12-08",
      notes: null,
      items: items.slice(0, 1),
    });
    q = (await quotes.getQuote(ctx, id))!;
    expect(q).toMatchObject({ subtotal: "55.58", total: "67.25", notes: null });
    expect(q.items).toHaveLength(1);

    const draftPdf = await quotePdf(ctx, id);
    expect(draftPdf!.body.subarray(0, 5).toString()).toBe("%PDF-");
    expect(draftPdf!.filename).toContain("borrador");

    await issueQuote(ctx, id);
    q = (await quotes.getQuote(ctx, id))!;
    expect(q.status).toBe("sent");
    expect(q.snapshot?.workshop).toMatchObject({
      legalName: "Taller de Prueba S.L.",
      taxId: "B12345674",
    });
    expect(q.pdfPath).toMatch(new RegExp(`^${org.orgId}/quotes/`));
    await expect(
      quotes.updateQuote(ctx, id, {
        customerId: c.customerId,
        vehicleId: null,
        issueDate: "2026-11-08",
        validUntil: "2026-12-08",
        notes: null,
        items,
      }),
    ).rejects.toMatchObject({
      detail: "quote_not_editable",
    });
    // Datos congelados: cambiar la razón social no cambia el presupuesto emitido.
    await query(
      "update organizations set legal_name = 'Otra S.L.' where id = $1",
      [org.orgId],
    );
    expect((await quotes.getQuote(ctx, id))!.snapshot?.workshop.legalName).toBe(
      "Taller de Prueba S.L.",
    );

    const mail = new FakeEmail();
    expect(await emailQuote(ctx, id, { email: mail, sender })).toBe("sent");
    expect(mail.sent[0]).toMatchObject({
      to: c.email,
      subject: `Presupuesto ${q.number} de Taller de prueba`,
    });
    expect(
      mail.sent[0].attachments?.[0].content.subarray(0, 5).toString(),
    ).toBe("%PDF-");
    expect(mail.sent[0].text).toContain("67,25");

    await quotes.setDecision(ctx, id, "accepted");
    expect((await quotes.getQuote(ctx, id))!.status).toBe("accepted");
    const copy = await quotes.duplicateQuote(ctx, id);
    expect((await quotes.getQuote(ctx, copy))!).toMatchObject({
      status: "draft",
      total: "67.25",
    });
  });

  it("numeración sin duplicados con 10 presupuestos simultáneos", async () => {
    const o = await createOrg("pro");
    const ctx = await admin(o, "pro");
    const c = await customerWithVehicle(o);
    const ids = await Promise.all(
      Array.from({ length: 10 }, () =>
        quotes.createQuote(ctx, {
          customerId: c.customerId,
          vehicleId: null,
          issueDate: "2026-11-08",
          validUntil: "2026-11-30",
          notes: null,
          items: items.slice(0, 1),
        }),
      ),
    );
    const numbers = await query<{ number: string }>(
      "select number from quotes where id = any($1) order by sequence",
      [ids],
    );
    expect(numbers.map((n) => n.number)).toEqual(
      Array.from(
        { length: 10 },
        (_, i) => `P-2026-${String(i + 1).padStart(4, "0")}`,
      ),
    );
  });

  it("permisos y plan", async () => {
    const c = await customerWithVehicle(org);
    const noPerm = await operator(org, ["customers.write"]);
    const input = {
      customerId: c.customerId,
      vehicleId: null,
      issueDate: "2026-11-08",
      validUntil: "2026-11-30",
      notes: null,
      items: items.slice(0, 1),
    };
    await expect(quotes.createQuote(noPerm, input)).rejects.toThrow();
    const foreign = await admin(other, "pro");
    await expect(quotes.createQuote(foreign, input)).rejects.toMatchObject({
      code: "not_found",
    });
    const ctx = await admin(org);
    const id = await quotes.createQuote(ctx, input);
    expect(await quotes.getQuote(foreign, id)).toBeNull();
    const seller = await operator(org, ["quotes.manage"]);
    await expect(quotes.deleteDraft(seller, id)).rejects.toMatchObject({
      code: "not_found",
    }); // borrar: solo administradores
    await quotes.deleteDraft(ctx, id);
    await expect(
      quotes.createQuote(
        { ...ctx, subscription: sub("business", false) },
        input,
      ),
    ).rejects.toMatchObject({ code: "subscription_inactive" });
  });
});

describe("pendientes de fases anteriores", () => {
  it("datos del taller y logo (almacenamiento real)", async () => {
    const o = await createOrg("pro");
    const ctx = await admin(o, "pro");
    await profile.updateProfile(ctx, {
      tradeName: "Taller Norte",
      legalName: "Taller Norte S.L.",
      taxId: "B12345674",
      addressLine1: "Calle Mayor 1",
      addressLine2: null,
      postalCode: "28001",
      city: "Madrid",
      province: "Madrid",
      phone: "+34600123456",
      email: "hola@tallernorte.test",
      brandPrimary: "#0a7a5c",
    });
    expect(await profile.getProfile(ctx)).toMatchObject({
      tradeName: "Taller Norte",
      taxId: "B12345674",
      brandPrimary: "#0a7a5c",
    });

    const png = Buffer.from(
      "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360000002000154a24f5d0000000049454e44ae426082",
      "hex",
    );
    await profile.uploadLogo(
      ctx,
      new File([png], "logo.png", { type: "image/png" }),
    );
    const path = (await profile.getProfile(ctx)).logoPath!;
    expect(path).toMatch(new RegExp(`^${o.orgId}/logo-[0-9a-f-]{36}\\.png$`));
    const file = path.split("/").pop()!;
    expect((await profile.readLogo(o.orgId, file))?.body.equals(png)).toBe(
      true,
    );
    expect(await profile.readLogo(o.orgId, "logo-otro.png")).toBeNull();
    await expect(
      profile.uploadLogo(
        ctx,
        new File([Buffer.from("<svg onload=alert(1)>")], "x.png", {
          type: "image/png",
        }),
      ),
    ).rejects.toMatchObject({ detail: "logo_type" });

    const op = await operator(o, []).catch(() => null); // plan Pro: un solo usuario
    expect(op).toBeNull();
    const foreign = await admin(other, "pro");
    await expect(
      profile.uploadLogo(
        {
          ...foreign,
          membership: { ...foreign.membership, organizationId: o.orgId },
        },
        new File([png], "l.png"),
      ),
    ).rejects.toMatchObject({
      code: "permission_denied",
    });
    await profile.removeLogo(ctx);
    expect((await profile.getProfile(ctx)).logoPath).toBeNull();
    expect(await profile.readLogo(o.orgId)).toBeNull();
  });

  it("la invitación se envía por correo de la plataforma con el enlace", async () => {
    const mail = new FakeEmail();
    const ok = await sendInvitationEmail(
      { email: mail, sender },
      {
        organizationId: org.orgId,
        to: "nuevo@taller.test",
        url: "http://localhost:3000/invitacion/abc",
        role: "operator",
        replyTo: "jefe@taller.test",
      },
    );
    expect(ok).toBe(true);
    expect(mail.sent[0]).toMatchObject({
      to: "nuevo@taller.test",
      replyTo: "jefe@taller.test",
      subject: "Te han invitado a Taller de prueba en RevisaYa",
    });
    expect(mail.sent[0].from).toBe(
      `"Taller de prueba vía RevisaYa" <no_reply@${sender.sharedDomain}>`,
    );
    expect(mail.sent[0].html).toContain("http://localhost:3000/invitacion/abc");
    expect(
      await sendInvitationEmail(
        { email: null, sender: null },
        {
          organizationId: org.orgId,
          to: "x@y.z",
          url: "u",
          role: "admin",
          replyTo: null,
        },
      ),
    ).toBe(false);
  });
});

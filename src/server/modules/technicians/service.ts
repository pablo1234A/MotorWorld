import "server-only";

import { sql } from "kysely";

import { withRls } from "@/server/db/client";
import { DomainError } from "@/server/db/errors";

import type { ServiceCtx } from "../branches/service";

/**
 * Técnicos: ficha operativa (nombre, contacto, notas de cualificación) que
 * puede vincularse a un usuario de la empresa para que vea sus órdenes en el
 * móvil. RevisaYa no verifica ni atribuye habilitaciones o carnés: la nota
 * es responsabilidad de la empresa. Solo administradores escriben (RLS).
 */

export interface TechnicianRow {
  id: string;
  fullName: string;
  phone: string | null;
  email: string | null;
  memberId: string | null;
  memberEmail: string | null;
  qualificationNotes: string | null;
  active: boolean;
  openOrders: number;
}

export async function listTechnicians(ctx: ServiceCtx, opts: { activeOnly?: boolean } = {}): Promise<TechnicianRow[]> {
  return withRls(ctx.auth, async (tx) => {
    const { rows } = await sql<Record<string, unknown>>`
      select t.id, t.full_name, t.phone, t.email::text as email, t.member_id, p.email::text as member_email, t.qualification_notes, t.active,
             (select count(*) from work_orders w where w.technician_id = t.id and w.status in ('pending', 'scheduled', 'assigned', 'in_progress')) as open_orders
        from technicians t
        left join organization_members m on m.id = t.member_id
        left join profiles p on p.id = m.user_id
       where t.organization_id = ${ctx.membership.organizationId}
         ${opts.activeOnly ? sql`and t.active` : sql``}
       order by t.active desc, t.full_name
    `.execute(tx);
    return rows.map((r) => ({
      id: r.id as string, fullName: r.full_name as string, phone: r.phone as string | null, email: r.email as string | null,
      memberId: r.member_id as string | null, memberEmail: r.member_email as string | null, qualificationNotes: r.qualification_notes as string | null,
      active: Boolean(r.active), openOrders: Number(r.open_orders),
    }));
  });
}

export async function saveTechnician(
  ctx: ServiceCtx,
  input: { id: string | null; fullName: string; phone: string | null; email: string | null; memberId: string | null; qualificationNotes: string | null; active: boolean },
): Promise<string> {
  return withRls(ctx.auth, async (tx) => {
    if (input.memberId) {
      const m = await tx.selectFrom("organization_members").select("id").where("id", "=", input.memberId)
        .where("organization_id", "=", ctx.membership.organizationId).where("status", "=", "active").executeTakeFirst();
      if (!m) throw new DomainError("validation_error", "member_not_found");
    }
    const values = { full_name: input.fullName, phone: input.phone, email: input.email, member_id: input.memberId, qualification_notes: input.qualificationNotes, active: input.active };
    if (input.id) {
      const r = await tx.updateTable("technicians").set(values).where("id", "=", input.id)
        .where("organization_id", "=", ctx.membership.organizationId).returning("id").executeTakeFirst();
      if (!r) throw new DomainError("not_found");
      return r.id;
    }
    const r = await tx.insertInto("technicians").values({ organization_id: ctx.membership.organizationId, ...values }).returning("id").executeTakeFirstOrThrow();
    return r.id;
  });
}

/** Ficha de técnico del usuario actual en la empresa activa (si la tiene). */
export async function myTechnicianId(ctx: ServiceCtx): Promise<string | null> {
  return withRls(ctx.auth, async (tx) => {
    const r = await tx.selectFrom("technicians").select("id").where("member_id", "=", ctx.membership.memberId).where("active", "=", true).executeTakeFirst();
    return r?.id ?? null;
  });
}

/** Miembros que se pueden vincular a un técnico (solo para el formulario del administrador). */
export async function memberOptions(ctx: ServiceCtx): Promise<Array<{ id: string; label: string }>> {
  return withRls(ctx.auth, async (tx) => {
    const { rows } = await sql<{ id: string; label: string }>`
      select m.id, trim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')) || ' · ' || p.email::text as label
        from organization_members m join profiles p on p.id = m.user_id
       where m.organization_id = ${ctx.membership.organizationId} and m.status = 'active'
       order by p.first_name
    `.execute(tx);
    return rows;
  });
}

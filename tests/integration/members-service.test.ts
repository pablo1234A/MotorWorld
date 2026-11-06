import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { closePool } from "@/server/db/client";
import * as members from "@/server/modules/members/service";
import type { MemberCtx } from "@/server/modules/members/service";
import { createOrganization } from "@/server/modules/organizations/service";

import { addMember, createOrg, createUser, ownerMemberId, query, type TestOrg } from "./support/db";

/**
 * Autorización en la capa de servicios (independiente de la UI): estas
 * comprobaciones se ejecutan aunque alguien llame a las acciones a mano.
 */

let maxOrg: TestOrg;
let otherOrg: TestOrg;
let adminCtx: MemberCtx;
let operatorCtx: MemberCtx;
let operatorUser: string;

function ctxFor(org: TestOrg, userId: string, memberId: string, role: "admin" | "operator"): MemberCtx {
  return { auth: { userId }, membership: { organizationId: org.orgId, memberId, role } };
}

beforeAll(async () => {
  await query("delete from private.rate_limit_buckets where key like 'invite:%'");
  maxOrg = await createOrg("max");
  otherOrg = await createOrg("max");
  adminCtx = ctxFor(maxOrg, maxOrg.ownerId, await ownerMemberId(maxOrg), "admin");
  operatorUser = await createUser();
  const opMember = await addMember(maxOrg, operatorUser, "operator", ["customers.write"]);
  operatorCtx = ctxFor(maxOrg, operatorUser, opMember, "operator");
});
afterAll(closePool);

const invite = (email: string) => ({ email, role: "operator" as const, permissions: [], branchScope: "all" as const, branchIds: [] });

describe("servicio de miembros", () => {
  it("un operario no puede listar, invitar ni modificar usuarios", async () => {
    await expect(members.listMembers(operatorCtx)).rejects.toMatchObject({ code: "permission_denied" });
    await expect(members.createInvitation(operatorCtx, invite("x@test.local"))).rejects.toMatchObject({ code: "permission_denied" });
    await expect(members.removeMember(operatorCtx, adminCtx.membership.memberId)).rejects.toMatchObject({ code: "permission_denied" });
  });

  it("aunque el operario se haga pasar por admin en el contexto, la base de datos lo impide", async () => {
    const forged: MemberCtx = { ...operatorCtx, membership: { ...operatorCtx.membership, role: "admin" } };
    await expect(members.createInvitation(forged, invite("y@test.local"))).rejects.toMatchObject({ code: "permission_denied" });
    await expect(
      members.updateMember(forged, { memberId: operatorCtx.membership.memberId, role: "admin", permissions: [], branchScope: "all", branchIds: [] }),
    ).rejects.toMatchObject({ code: "not_found" });
    const [{ role }] = await query<{ role: string }>("select role from organization_members where id = $1", [operatorCtx.membership.memberId]);
    expect(role).toBe("operator");
  });

  it("el administrador crea una invitación con enlace de un solo uso; se guarda solo el hash", async () => {
    const { id, url } = await members.createInvitation(adminCtx, invite("nuevo@test.local"));
    const token = url.split("/invitacion/")[1];
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const [row] = await query<{ hex: string }>("select encode(token_hash, 'hex') as hex from invitations where id = $1", [id]);
    expect(row.hex).not.toContain(Buffer.from(token).toString("hex"));
    expect(row.hex).toHaveLength(64);
    const preview = await members.previewInvitation(token);
    expect(preview).toMatchObject({ state: "pending", role: "operator", emailMasked: "n•••@test.local" });
  });

  it("límite del plan: Max admite 3 usuarios contando invitaciones pendientes", async () => {
    // propietario + operario + 1 invitación pendiente = 3
    await expect(members.createInvitation(adminCtx, invite("cuarto@test.local"))).rejects.toMatchObject({
      code: "plan_limit_reached",
      detail: "users",
    });
  });

  it("no se puede invitar a quien ya es miembro", async () => {
    const [{ email }] = await query<{ email: string }>("select email from profiles where id = $1", [operatorUser]);
    await query("update invitations set revoked_at = now() where organization_id = $1", [maxOrg.orgId]);
    await expect(members.createInvitation(adminCtx, invite(email))).rejects.toMatchObject({ code: "conflict" });
  });

  it("aceptar exige que el correo coincida y no permite reutilizar el enlace", async () => {
    const email = `aceptar-${randomUUID().slice(0, 6)}@test.local`;
    const { url } = await members.createInvitation(adminCtx, invite(email));
    const token = url.split("/invitacion/")[1];

    const stranger = await createUser();
    await expect(members.acceptInvitation({ userId: stranger }, token)).rejects.toMatchObject({
      code: "invitation_invalid",
      detail: "email_mismatch",
    });
    const invited = await createUser(email);
    await expect(members.acceptInvitation({ userId: invited }, token)).resolves.toBe(maxOrg.orgId);
    await expect(members.acceptInvitation({ userId: invited }, token)).rejects.toMatchObject({ code: "invitation_invalid" });
    await expect(members.acceptInvitation({ userId: invited }, "no-es-un-token")).rejects.toMatchObject({ code: "invitation_invalid" });
  });

  it("el propietario no se puede degradar ni eliminar; nadie se elimina a sí mismo", async () => {
    await expect(
      members.updateMember(adminCtx, { memberId: adminCtx.membership.memberId, role: "operator", permissions: [], branchScope: "all", branchIds: [] }),
    ).rejects.toMatchObject({ code: "permission_denied", detail: "owner_protected" });
    await expect(members.removeMember(adminCtx, adminCtx.membership.memberId)).rejects.toMatchObject({ code: "permission_denied" });
  });

  it("un administrador no puede tocar miembros ni invitaciones de otro taller", async () => {
    const otherOwnerMember = await ownerMemberId(otherOrg);
    const otherAdminCtx = ctxFor(otherOrg, otherOrg.ownerId, otherOwnerMember, "admin");
    const { id: foreignInvitation } = await members.createInvitation(otherAdminCtx, invite("ajeno@test.local"));

    await expect(members.revokeInvitation(adminCtx, foreignInvitation)).rejects.toMatchObject({ code: "not_found" });
    await expect(members.removeMember(adminCtx, otherOwnerMember)).rejects.toMatchObject({ code: "not_found" });
    await expect(members.setMemberStatus(adminCtx, otherOwnerMember, "suspended")).rejects.toMatchObject({ code: "not_found" });

    // Ni siquiera fingiendo ser de la otra organización: RLS comprueba la membresía real.
    const forged: MemberCtx = { ...adminCtx, membership: { ...adminCtx.membership, organizationId: otherOrg.orgId } };
    await expect(members.revokeInvitation(forged, foreignInvitation)).rejects.toMatchObject({ code: "not_found" });
    await expect(members.listMembers(forged)).resolves.toEqual({ members: [], invitations: [] });
    const [{ revoked }] = await query<{ revoked: boolean }>("select revoked_at is not null as revoked from invitations where id = $1", [foreignInvitation]);
    expect(revoked).toBe(false);
  });

  it("suspender a un operario le quita el acceso a los datos", async () => {
    await members.setMemberStatus(adminCtx, operatorCtx.membership.memberId, "suspended");
    await expect(members.listBranches(operatorCtx)).resolves.toEqual([]);
    await members.setMemberStatus(adminCtx, operatorCtx.membership.memberId, "active");
    await expect(members.listBranches(operatorCtx)).resolves.toHaveLength(1);
  });
});

describe("alta de taller", () => {
  it("crea organización, sucursal y propietario; si la dirección pública está ocupada añade sufijo", async () => {
    const user = await createUser();
    const first = await createOrganization({ userId: user }, { tradeName: `Taller Sol ${randomUUID().slice(0, 4)}`, timezone: "Europe/Madrid" });
    const [{ slug, trade_name }] = await query<{ slug: string; trade_name: string }>("select slug, trade_name from organizations where id = $1", [first]);
    const second = await createOrganization({ userId: user }, { tradeName: trade_name, timezone: "Atlantic/Canary" });
    const [{ slug: slug2, timezone }] = await query<{ slug: string; timezone: string }>("select slug, timezone from organizations where id = $1", [second]);
    expect(slug2).not.toBe(slug);
    expect(slug2.startsWith(slug.slice(0, 20))).toBe(true);
    expect(timezone).toBe("Atlantic/Canary");
  });

  it("una dirección pública explícita ocupada devuelve conflicto", async () => {
    const user = await createUser();
    const id = await createOrganization({ userId: user }, { tradeName: "Taller Uno", timezone: "Europe/Madrid" });
    const [{ slug }] = await query<{ slug: string }>("select slug from organizations where id = $1", [id]);
    await expect(createOrganization({ userId: user }, { tradeName: "Otro", slug, timezone: "Europe/Madrid" })).rejects.toMatchObject({ code: "conflict" });
  });

  it("un nombre que coincide con un buzón reservado (postmaster@, admin@…) recibe otro slug; elegido a mano, se rechaza", async () => {
    const user = await createUser();
    const id = await createOrganization({ userId: user }, { tradeName: "Admin", timezone: "Europe/Madrid" });
    const [{ slug }] = await query<{ slug: string }>("select slug from organizations where id = $1", [id]);
    expect(slug).toMatch(/^admin-[0-9a-f]{6}$/);
    await expect(createOrganization({ userId: user }, { tradeName: "Otro", slug: "postmaster", timezone: "Europe/Madrid" })).rejects.toMatchObject({
      code: "validation_error",
      detail: "slug_reserved",
    });
  });

  it("sin email verificado no se puede crear un taller", async () => {
    const user = await createUser(undefined, false);
    await expect(createOrganization({ userId: user }, { tradeName: "Taller X", timezone: "Europe/Madrid" })).rejects.toMatchObject({
      code: "permission_denied",
      detail: "email_not_verified",
    });
  });
});

import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { BASE_URL, HttpSession, extractConfirmLink, resetRateLimits, waitForEmail } from "../support/http";
import { adminClient, createProduct, createTestUser, deleteTestUser, setPlan, type TestUser } from "../support/supabase";

let owner: TestUser;
let bob: TestUser;
let carol: TestUser;
let dave: TestUser;
let token: string;

const invite = (actor: TestUser, email: string, role = "editor") => actor.client.rpc("invite_member", { p_workspace: owner.workspaceId, p_email: email, p_role: role });

beforeAll(async () => {
  const health = await fetch(`${BASE_URL}/api/health`).catch(() => null);
  if (!health?.ok) throw new Error(`El servidor no responde en ${BASE_URL}.`);
  await resetRateLimits();
  [owner, bob, carol, dave] = await Promise.all([createTestUser("team-owner"), createTestUser("team-bob"), createTestUser("team-carol"), createTestUser("team-dave")]);
  await createProduct(owner, "Producto del equipo");
});
afterAll(async () => {
  await Promise.all([owner, bob, carol, dave].map(deleteTestUser));
  await resetRateLimits();
});

describe("equipos: invitaciones y permisos", () => {
  it("el plan Free no admite más miembros", async () => {
    const { data } = await invite(owner, bob.email);
    expect(data).toMatchObject({ ok: false, reason: "member_limit", limit: 1 });
  });

  it("el propietario invita y solo la persona invitada puede aceptar", async () => {
    await setPlan(owner.workspaceId, "pro");
    const { data } = await invite(owner, bob.email.toUpperCase());
    expect(data).toMatchObject({ ok: true, email: bob.email, role: "editor" });
    token = (data as { token: string }).token;

    // Un extraño no puede invitar ni ver las invitaciones de un espacio ajeno.
    expect((await invite(carol, dave.email)).error?.code).toBe("42501");
    expect((await carol.client.from("workspace_invitations").select("id")).data).toEqual([]);

    // Un enlace reenviado no sirve con otra cuenta.
    expect((await carol.client.rpc("accept_invitation", { p_token: token })).data).toMatchObject({ ok: false, reason: "wrong_account" });
    expect((await carol.client.rpc("get_invitation", { p_token: token })).data).toMatchObject({ for_current_user: false });

    const mine = await bob.client.rpc("my_invitations");
    expect(mine.data?.map((row) => row.token)).toEqual([token]);
    expect((await bob.client.from("products").select("id").eq("workspace_id", owner.workspaceId)).data).toEqual([]);

    expect((await bob.client.rpc("accept_invitation", { p_token: token })).data).toMatchObject({ ok: true, workspace_id: owner.workspaceId });
    expect((await bob.client.rpc("accept_invitation", { p_token: token })).data).toMatchObject({ ok: false, reason: "not_found" });
  });

  it("un editor comparte el catálogo; no puede gestionar el equipo ni la suscripción", async () => {
    const products = await bob.client.from("products").select("name").eq("workspace_id", owner.workspaceId);
    expect(products.data).toEqual([{ name: "Producto del equipo" }]);
    expect((await bob.client.from("products").insert({ workspace_id: owner.workspaceId, name: "Creado por Bob" })).error).toBeNull();
    expect((await invite(bob, dave.email)).error?.code).toBe("42501");
    expect((await bob.client.from("workspace_members").insert({ workspace_id: owner.workspaceId, user_id: dave.id, role: "admin" })).error?.code).toBe("42501");
    expect((await bob.client.from("workspace_members").update({ role: "owner" }).eq("user_id", bob.id).select()).error?.code).toBe("42501");
    expect((await bob.client.from("workspaces").update({ name: "Tomado" }).eq("id", owner.workspaceId).select()).data).toEqual([]);
  });

  it("los roles se respetan: solo lectura y administradores", async () => {
    await invite(owner, carol.email, "viewer");
    const carolToken = (await carol.client.rpc("my_invitations")).data![0]!.token;
    await carol.client.rpc("accept_invitation", { p_token: carolToken });
    expect((await carol.client.from("products").select("id").eq("workspace_id", owner.workspaceId)).data?.length).toBe(2);
    expect((await carol.client.from("products").insert({ workspace_id: owner.workspaceId, name: "No debería" })).error?.code).toBe("42501");
    expect((await carol.client.rpc("consume_usage", { p_workspace: owner.workspaceId, p_operation: "generation", p_idempotency_key: randomUUID() })).error?.code).toBe("42501");

    // Bob pasa a administrador (solo el propietario puede nombrarlo).
    expect((await bob.client.rpc("set_member_role", { p_workspace: owner.workspaceId, p_user: carol.id, p_role: "editor" })).error?.code).toBe("42501");
    expect((await owner.client.rpc("set_member_role", { p_workspace: owner.workspaceId, p_user: bob.id, p_role: "admin" })).data).toMatchObject({ ok: true });
    // Un administrador gestiona editores, pero no nombra administradores ni toca al propietario.
    expect((await bob.client.rpc("set_member_role", { p_workspace: owner.workspaceId, p_user: carol.id, p_role: "editor" })).data).toMatchObject({ ok: true });
    expect((await bob.client.rpc("set_member_role", { p_workspace: owner.workspaceId, p_user: carol.id, p_role: "admin" })).data).toMatchObject({ ok: false, reason: "owner_required" });
    expect((await bob.client.rpc("set_member_role", { p_workspace: owner.workspaceId, p_user: owner.id, p_role: "viewer" })).data).toMatchObject({ ok: false, reason: "owner_required" });
    expect((await invite(bob, dave.email, "admin")).data).toMatchObject({ ok: false, reason: "owner_required" });
  });

  it("aplica el límite de miembros del plan (3 en Pro) contando invitaciones", async () => {
    expect((await invite(owner, dave.email)).data).toMatchObject({ ok: false, reason: "member_limit", limit: 3 });
    expect((await invite(owner, bob.email)).data).toMatchObject({ ok: false, reason: "already_member" });
  });

  it("el consumo es del espacio: cuenta para todos sus miembros", async () => {
    await bob.client.rpc("consume_usage", { p_workspace: owner.workspaceId, p_operation: "generation", p_idempotency_key: randomUUID() });
    const { data } = await owner.client.rpc("get_usage_summary", { p_workspace: owner.workspaceId });
    expect(data).toMatchObject({ used: 1, plan_code: "pro" });
  });

  it("al quitar a un miembro pierde el acceso de inmediato; el propietario no puede salir", async () => {
    expect((await carol.client.rpc("remove_member", { p_workspace: owner.workspaceId, p_user: bob.id })).error?.code).toBe("42501");
    expect((await owner.client.rpc("remove_member", { p_workspace: owner.workspaceId, p_user: owner.id })).data).toMatchObject({ ok: false, reason: "owner_cannot_leave" });
    expect((await bob.client.rpc("remove_member", { p_workspace: owner.workspaceId, p_user: carol.id })).data).toMatchObject({ ok: true });
    expect((await carol.client.from("products").select("id").eq("workspace_id", owner.workspaceId)).data).toEqual([]);
    // Lo que creó Bob se queda en el espacio aunque él lo abandone.
    expect((await bob.client.rpc("remove_member", { p_workspace: owner.workspaceId, p_user: bob.id })).data).toMatchObject({ ok: true });
    expect((await owner.client.from("products").select("name").eq("workspace_id", owner.workspaceId)).data?.length).toBe(2);
    const { data: logs } = await adminClient().from("audit_logs").select("action").eq("workspace_id", owner.workspaceId).like("action", "team.%");
    expect(logs?.map((log) => log.action)).toEqual(expect.arrayContaining(["team.member_invited", "team.member_joined", "team.role_changed", "team.member_removed", "team.member_left"]));
  });
});

describe("equipos por HTTP: invitar, aceptar y cambiar de espacio", () => {
  it("flujo completo con cambio de espacio activo", async () => {
    const ownerHttp = new HttpSession();
    const daveHttp = new HttpSession();
    await Promise.all([ownerHttp.signInDirect(owner.email, owner.password), daveHttp.signInDirect(dave.email, dave.password)]);

    const created = await ownerHttp.json<{ id: string; link: string }>("/api/team/invitations", { body: { email: dave.email, role: "viewer" } });
    expect(created.status).toBe(201);
    const inviteToken = created.data.link.split("/").pop()!;
    expect(created.data.link).toContain("/invitacion/");

    // Sin sesión la página pide iniciar sesión; con otra cuenta no deja aceptar.
    expect(await (await new HttpSession().request(`/invitacion/${inviteToken}`)).text()).toContain("Iniciar sesión");
    const page = await (await daveHttp.request(`/invitacion/${inviteToken}`)).text();
    expect(page).toContain("Únete a");

    const before = await daveHttp.json<{ items: unknown[] }>("/api/products");
    expect(before.data.items).toEqual([]);
    expect((await daveHttp.json(`/api/invitations/${inviteToken}`, { body: { action: "accept" } })).status).toBe(200);

    // Tras aceptar, el espacio activo es el del equipo: ve su catálogo pero, como lector, no puede escribir.
    const shared = await daveHttp.json<{ items: { name: string }[] }>("/api/products");
    expect(shared.data.items.length).toBe(2);
    expect((await daveHttp.json("/api/products", { body: { name: "Intento" } })).status).toBe(403);
    expect((await daveHttp.json("/api/team/invitations", { body: { email: "x@pruebas.anunciapro.test", role: "editor" } })).status).toBe(403);

    // Vuelve a su espacio personal; no puede "cambiar" a un espacio del que no es miembro.
    expect((await daveHttp.json("/api/workspace/switch", { body: { workspaceId: dave.workspaceId } })).status).toBe(200);
    expect((await daveHttp.json<{ items: unknown[] }>("/api/products")).data.items).toEqual([]);
    expect((await daveHttp.json("/api/workspace/switch", { body: { workspaceId: bob.workspaceId } })).status).toBe(404);
    // Una cookie manipulada con un espacio ajeno se ignora.
    daveHttp.cookies.set("ap_workspace", bob.workspaceId);
    expect((await daveHttp.json<{ items: unknown[] }>("/api/products")).data.items).toEqual([]);

    const team = await ownerHttp.json<{ members: { email: string; role: string }[] }>("/api/team/invitations");
    expect(team.data.members.map((member) => member.role).sort()).toEqual(["owner", "viewer"]);
    expect((await ownerHttp.json(`/api/team/members/${dave.id}`, { method: "DELETE" })).status).toBe(200);
  });
});

describe("cambio de correo electrónico", () => {
  it("exige la contraseña y solo se aplica tras confirmar por correo", async () => {
    const user = await createTestUser("email-change");
    const http = new HttpSession();
    await http.signInDirect(user.email, user.password);
    const newEmail = `nuevo-${randomUUID().slice(0, 8)}@pruebas.anunciapro.test`;

    expect((await http.json("/api/account/email", { body: { email: newEmail, password: "incorrecta1" } })).status).toBe(422);
    expect((await http.json("/api/account/email", { body: { email: owner.email, password: user.password } })).status).toBe(409);
    expect((await http.json("/api/account/email", { body: { email: newEmail, password: user.password } })).status).toBe(200);

    // Todavía no ha cambiado.
    const profile = () => adminClient().from("profiles").select("email").eq("id", user.id).single();
    expect((await profile()).data?.email).toBe(user.email);

    // Confirmación doble: enlace en el correo nuevo y en el actual.
    for (const address of [newEmail, user.email]) {
      const mail = await waitForEmail(address, "Confirma tu nuevo correo");
      const response = await http.request(extractConfirmLink(mail.html));
      expect(response.status).toBe(307);
    }
    expect((await profile()).data?.email).toBe(newEmail);
    const login = await new HttpSession().json("/api/auth/login", { body: { email: newEmail, password: user.password } });
    expect(login.status).toBe(200);
    await deleteTestUser(user);
  });
});

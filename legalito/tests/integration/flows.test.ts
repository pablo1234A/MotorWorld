import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { createAuthUser, createTestDatabase, databaseAvailable, type TestDb } from "./db-harness";
import { createMemoryStorage, createPgSupabase, type MemoryStorage } from "../harness/pg-supabase";
import { freelancerAnswers, shopAnswers } from "@/lib/documents/samples";

/**
 * Flujos de negocio completos contra PostgreSQL real (RLS, disparadores y
 * funciones SQL activos). Stripe se sustituye por un doble configurable.
 */
const available = await databaseAvailable();

const state: { db: TestDb | null; userId: string | null; storage: MemoryStorage } = { db: null, userId: null, storage: createMemoryStorage() };
const stripe = {
  checkout: { sessions: { retrieve: vi.fn(), create: vi.fn() } },
  subscriptions: { retrieve: vi.fn() },
  invoices: { retrieve: vi.fn() },
  customers: { create: vi.fn() },
  billingPortal: { sessions: { create: vi.fn() } },
  prices: { retrieve: vi.fn() },
};

vi.mock("@/lib/supabase/server", () => ({
  createAdminClient: () => createPgSupabase(state.db!.pool, { role: "service_role", storage: state.storage }),
  createSessionClient: async () => createPgSupabase(state.db!.pool, { role: "authenticated", userId: () => state.userId, storage: state.storage }),
  ServiceNotConfiguredError: class extends Error {},
}));
vi.mock("@/lib/billing/stripe", async (orig) => ({ ...(await orig<typeof import("@/lib/billing/stripe")>()), getStripe: () => stripe }));
vi.mock("next/headers", () => ({ headers: async () => new Headers({ "x-real-ip": "203.0.113.7" }), cookies: async () => ({ getAll: () => [], set: () => {} }) }));
vi.mock("next/cache", () => ({ revalidatePath: () => {}, updateTag: () => {}, revalidateTag: () => {}, cacheLife: () => {}, cacheTag: () => {} }));
vi.mock("next/server", async (orig) => ({ ...(await orig<typeof import("next/server")>()), connection: async () => {} }));

/** Ejecuta una Server Action que termina en redirect() y devuelve el destino. */
async function redirectOf(p: Promise<unknown>): Promise<string> {
  try {
    await p;
  } catch (e) {
    const digest = (e as { digest?: string }).digest ?? "";
    if (digest.startsWith("NEXT_REDIRECT")) return digest.split(";")[2];
    throw e;
  }
  throw new Error("La acción no redirigió");
}

let alice: { userId: string; orgId: string };
let bob: { userId: string; orgId: string };
let admin: { userId: string; orgId: string };

const q = (sql: string, params: unknown[] = []) => state.db!.pool.query(sql, params);

describe.skipIf(!available)("Flujos de negocio completos", () => {
  beforeAll(async () => {
    Object.assign(process.env, {
      APP_ENV: "test",
      ALLOW_DEMO_TEMPLATES: "true",
      NEXT_PUBLIC_SUPABASE_URL: "http://supabase.test",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-key-for-tests-000000000000",
      SUPABASE_SERVICE_ROLE_KEY: "service-key-for-tests-0000000000",
      STRIPE_SECRET_KEY: "sk_test_flows",
      STRIPE_WEBHOOK_SECRET: "whsec_flows",
      NEXT_PUBLIC_SITE_URL: "https://legalito.test",
    });
    delete process.env.RESEND_API_KEY;
    (await import("@/lib/env")).resetEnvCache();
    state.db = await createTestDatabase();
    alice = await createAuthUser(state.db.pool, "alice@example.com", { full_name: "Alice" });
    bob = await createAuthUser(state.db.pool, "bob@example.com", { full_name: "Bob" });
    admin = await createAuthUser(state.db.pool, "admin@example.com", { full_name: "Admin" });
    await q("insert into public.user_roles (user_id, role) values ($1, 'admin')", [admin.userId]);
    await q("update public.organizations set stripe_customer_id = 'cus_alice' where id = $1", [alice.orgId]);
    await q("update public.organizations set stripe_customer_id = 'cus_bob' where id = $1", [bob.orgId]);
    await q("update public.products set stripe_price_id = 'price_one' where code = 'one_time_pack'");
    await q("update public.products set stripe_price_id = 'price_sub' where code = 'subscription_monthly'");
  }, 60_000);

  afterAll(async () => {
    await state.db?.drop();
  });

  beforeEach(() => {
    state.userId = alice?.userId ?? null;
  });

  const as = (u: { userId: string }) => {
    state.userId = u.userId;
  };

  describe("Formulario", () => {
    it("crea un borrador, autoguarda y completa con validación en servidor", async () => {
      const forms = await import("@/lib/actions/forms");
      const draft = await forms.getOrCreateDraft();
      expect(draft.status).toBe("draft");
      expect((await forms.saveDraft(draft.id, shopAnswers, "datos")).ok).toBe(true);

      const invalid = await forms.completeForm(draft.id, { ...shopAnswers, nif: "123" });
      expect(invalid.errors?.nif).toBeDefined();

      expect(await redirectOf(forms.completeForm(draft.id, shopAnswers))).toBe("/panel/generador/revision");
      const r = await q("select status, answers from public.form_responses where id = $1", [draft.id]);
      expect(r.rows[0].status).toBe("completed");
      expect(r.rows[0].answers).not.toHaveProperty("regulated_profession");
      const org = await q("select legal_name, nif from public.organizations where id = $1", [alice.orgId]);
      expect(org.rows[0]).toEqual({ legal_name: "Cerámicas Ficticias S.L.", nif: "B12345674" });
    });

    it("al editar, el nuevo borrador parte de las últimas respuestas (no se pide nada dos veces)", async () => {
      const forms = await import("@/lib/actions/forms");
      const draft = await forms.getOrCreateDraft();
      expect(draft.answers.legal_name).toBe("Cerámicas Ficticias S.L.");
      await q("delete from public.form_responses where id = $1", [draft.id]);
    });

    it("otro usuario no puede guardar en un borrador ajeno", async () => {
      const forms = await import("@/lib/actions/forms");
      as(alice);
      const draft = await forms.getOrCreateDraft();
      as(bob);
      expect((await forms.saveDraft(draft.id, { legal_name: "hack" }, "titular")).ok).toBe(false);
      await q("delete from public.form_responses where id = $1", [draft.id]);
    });

    it("la vista previa muestra el inicio del documento y reserva el resto", async () => {
      const { buildPreview } = await import("@/lib/documents/service");
      const p = await buildPreview(shopAnswers, "privacidad");
      expect(p.html).toContain("Cerámicas Ficticias S.L.");
      expect(p.html).toContain("Contenido completo disponible al finalizar la compra.");
      expect(p.isDemo).toBe(true);
    });
  });

  describe("Pago único", () => {
    it("sin pago no se puede generar", async () => {
      const forms = await import("@/lib/actions/forms");
      const r = await forms.generateNow({});
      expect(r.error).toMatch(/Necesitas una compra/);
      expect((await q("select count(*)::int n from public.document_versions")).rows[0].n).toBe(0);
    });

    it("el checkout se crea en servidor con el precio y el cliente de la organización", async () => {
      stripe.checkout.sessions.create.mockResolvedValue({ id: "cs_test_alice", url: "https://checkout.stripe.com/c/pay/cs_test_alice" });
      const { startCheckout } = await import("@/lib/actions/billing");
      const fd = new FormData();
      fd.set("product", "one_time_pack");
      fd.set("terms", "on");
      fd.set("immediate", "on");
      expect(await redirectOf(startCheckout({}, fd))).toBe("https://checkout.stripe.com/c/pay/cs_test_alice");
      const args = stripe.checkout.sessions.create.mock.calls[0][0];
      expect(args).toMatchObject({ mode: "payment", customer: "cus_alice", client_reference_id: alice.orgId, line_items: [{ price: "price_one", quantity: 1 }] });
      const audit = await q("select metadata from public.audit_logs where action = 'checkout.started'");
      expect(audit.rows[0].metadata.immediate_supply_and_withdrawal_waiver).toBe(true);
    });

    it("el checkout exige los consentimientos", async () => {
      const { startCheckout } = await import("@/lib/actions/billing");
      const fd = new FormData();
      fd.set("product", "one_time_pack");
      fd.set("terms", "on");
      expect((await startCheckout({}, fd)).error).toMatch(/acceso inmediato/);
    });

    it("el pago confirmado crea compra, genera los 3 documentos y registra los emails", async () => {
      stripe.checkout.sessions.retrieve.mockResolvedValue({
        id: "cs_test_alice",
        mode: "payment",
        status: "complete",
        payment_status: "paid",
        customer: "cus_alice",
        metadata: { organization_id: alice.orgId },
        amount_total: 3900,
        currency: "eur",
        payment_intent: "pi_alice",
        line_items: { data: [{ price: { id: "price_one" } }] },
      });
      const { fulfillCheckoutSession } = await import("@/lib/billing/fulfillment");
      expect(await fulfillCheckoutSession("cs_test_alice")).toMatchObject({ status: "paid", organizationId: alice.orgId });

      const purchase = await q("select status, generations_used, generations_limit, template_version_ids from public.purchases");
      expect(purchase.rows).toHaveLength(1);
      expect(purchase.rows[0]).toMatchObject({ status: "active", generations_used: 1, generations_limit: 3 });
      expect(Object.keys(purchase.rows[0].template_version_ids).sort()).toEqual(["aviso_legal", "cookies", "privacidad"]);

      const versions = await q("select is_demo, entitlement_source, pdf_path from public.document_versions where organization_id = $1", [alice.orgId]);
      expect(versions.rows).toHaveLength(3);
      expect(versions.rows.every((v) => v.is_demo && v.entitlement_source === "purchase")).toBe(true);
      expect(state.storage.files.size).toBe(6);
      const pdf = state.storage.files.get(`documents/${versions.rows[0].pdf_path}`)!;
      expect(pdf.body.subarray(0, 5).toString()).toBe("%PDF-");

      const emails = await q("select template, status from public.email_events order by created_at");
      expect(emails.rows.map((e) => e.template)).toEqual(expect.arrayContaining(["purchase_confirmed", "documents_ready"]));
      expect(emails.rows.every((e) => e.status === "skipped")).toBe(true); // Resend no configurado: no se simula el envío.
    });

    it("reintentos del webhook o de la página de confirmación no duplican nada", async () => {
      const { fulfillCheckoutSession } = await import("@/lib/billing/fulfillment");
      await fulfillCheckoutSession("cs_test_alice");
      await fulfillCheckoutSession("cs_test_alice");
      const counts = await q(`select (select count(*) from public.payments)::int p, (select count(*) from public.purchases)::int c,
        (select count(*) from public.document_versions)::int v, (select generations_used from public.purchases) g,
        (select count(*) from public.email_events)::int e`);
      expect(counts.rows[0]).toEqual({ p: 1, c: 1, v: 3, g: 1, e: 2 });
    });

    it("ignora sesiones cuyo cliente no coincide con la organización indicada", async () => {
      stripe.checkout.sessions.retrieve.mockResolvedValueOnce({
        id: "cs_test_forged",
        mode: "payment",
        status: "complete",
        payment_status: "paid",
        customer: "cus_bob",
        metadata: { organization_id: alice.orgId },
        line_items: { data: [{ price: { id: "price_one" } }] },
      });
      const { fulfillCheckoutSession } = await import("@/lib/billing/fulfillment");
      expect((await fulfillCheckoutSession("cs_test_forged")).status).toBe("ignored");
      expect((await q("select count(*)::int n from public.payments")).rows[0].n).toBe(1);
    });

    it("el cliente ve sus documentos y otro cliente no", async () => {
      const { listDocuments } = await import("@/lib/data/panel");
      as(alice);
      const docs = await listDocuments();
      expect(docs.map((d) => d.document_type).sort()).toEqual(["aviso_legal", "cookies", "privacidad"]);
      expect(docs[0].current?.template?.is_demo).toBe(true);
      as(bob);
      expect(await listDocuments()).toEqual([]);
    });

    it("descarga: el propietario obtiene URL firmada, otro usuario recibe 404", async () => {
      const { GET } = await import("@/app/api/documentos/[versionId]/descargar/route");
      const v = await q("select id from public.document_versions where organization_id = $1 limit 1", [alice.orgId]);
      const call = (format: string) =>
        GET(new NextRequest(`http://localhost/api/documentos/${v.rows[0].id}/descargar?formato=${format}`), {
          params: Promise.resolve({ versionId: v.rows[0].id }),
        } as never);
      as(alice);
      const ok = await call("pdf");
      expect(ok.status).toBe(303);
      expect(ok.headers.get("location")).toContain(`https://storage.test/documents/${alice.orgId}/`);
      as(bob);
      expect((await call("pdf")).status).toBe(404);
    });

    it("permite regenerar hasta el límite de la compra", async () => {
      const forms = await import("@/lib/actions/forms");
      as(alice);
      expect(await redirectOf(forms.generateNow({}))).toBe("/panel/documentos?generado=1");
      expect(await redirectOf(forms.generateNow({}))).toBe("/panel/documentos?generado=1");
      const r = await forms.generateNow({});
      expect(r.error).toMatch(/agotado/);
      const v = await q("select max(version_number)::int m from public.document_versions where organization_id = $1", [alice.orgId]);
      expect(v.rows[0].m).toBe(3);
    });

    it("un reembolso total revoca el acceso a los documentos de esa compra", async () => {
      const { recordRefund } = await import("@/lib/billing/fulfillment");
      await recordRefund({ id: "ch_alice", payment_intent: "pi_alice", amount: 3900, amount_refunded: 3900, refunded: true } as never);
      expect((await q("select status from public.purchases")).rows[0].status).toBe("refunded");
      expect((await q("select status, amount_refunded_cents from public.payments")).rows[0]).toEqual({ status: "refunded", amount_refunded_cents: 3900 });
      expect((await q("select count(*)::int n from public.document_versions where revoked_at is null and organization_id = $1", [alice.orgId])).rows[0].n).toBe(0);

      const { GET } = await import("@/app/api/documentos/[versionId]/descargar/route");
      const v = await q("select id from public.document_versions where organization_id = $1 limit 1", [alice.orgId]);
      as(alice);
      const r = await GET(new NextRequest(`http://localhost/api/documentos/${v.rows[0].id}/descargar`), { params: Promise.resolve({ versionId: v.rows[0].id }) } as never);
      expect(r.status).toBe(403);
    });
  });

  describe("Suscripción", () => {
    const subObject = (over: Record<string, unknown> = {}) => ({
      id: "sub_bob",
      customer: "cus_bob",
      status: "active",
      cancel_at_period_end: false,
      cancel_at: null,
      canceled_at: null,
      ended_at: null,
      trial_end: null,
      latest_invoice: "in_bob_1",
      items: { data: [{ current_period_start: 1798761600, current_period_end: 1801440000, price: { id: "price_sub", unit_amount: 999, currency: "eur", recurring: { interval: "month" } } }] },
      ...over,
    });

    beforeAll(async () => {
      await q(
        "insert into public.form_responses (organization_id, created_by, questionnaire_version, answers, status, completed_at) values ($1, $2, 1, $3, 'completed', now())",
        [bob.orgId, bob.userId, JSON.stringify(freelancerAnswers)],
      );
    });

    it("la activación sincroniza la suscripción, avisa y genera los documentos del plan", async () => {
      stripe.subscriptions.retrieve.mockResolvedValue(subObject());
      const { syncSubscription } = await import("@/lib/billing/fulfillment");
      const s = await syncSubscription("sub_bob");
      expect(s).toMatchObject({ status: "active", organization_id: bob.orgId, amount_cents: 999 });
      const v = await q("select entitlement_source from public.document_versions where organization_id = $1", [bob.orgId]);
      expect(v.rows).toHaveLength(3);
      expect(v.rows.every((r) => r.entitlement_source === "subscription")).toBe(true);
      const e = await q("select template from public.email_events where organization_id = $1", [bob.orgId]);
      expect(e.rows.map((r) => r.template)).toEqual(expect.arrayContaining(["subscription_activated", "documents_ready"]));
    });

    it("el suscriptor regenera sin límite", async () => {
      const forms = await import("@/lib/actions/forms");
      as(bob);
      for (let i = 0; i < 4; i++) expect(await redirectOf(forms.generateNow({}))).toBe("/panel/documentos?generado=1");
    });

    it("un impago registra la incidencia, avisa una vez por intento y bloquea la generación", async () => {
      stripe.subscriptions.retrieve.mockResolvedValue(subObject({ status: "past_due" }));
      stripe.invoices.retrieve.mockResolvedValue({
        id: "in_bob_2",
        customer: "cus_bob",
        currency: "eur",
        amount_due: 999,
        amount_paid: 0,
        attempt_count: 1,
        next_payment_attempt: 1802044800,
        hosted_invoice_url: "https://invoice.stripe.test/in_bob_2",
        parent: { subscription_details: { subscription: "sub_bob" } },
        payments: { data: [] },
      });
      const { recordInvoice } = await import("@/lib/billing/fulfillment");
      await recordInvoice("in_bob_2", "failed");
      await recordInvoice("in_bob_2", "failed"); // reintento del webhook
      expect((await q("select status, attempt_count from public.payments where stripe_invoice_id = 'in_bob_2'")).rows[0]).toEqual({ status: "failed", attempt_count: 1 });
      expect((await q("select count(*)::int n from public.email_events where template = 'payment_failed'")).rows[0].n).toBe(1);
      as(bob);
      const forms = await import("@/lib/actions/forms");
      expect((await forms.generateNow({})).error).toMatch(/pago pendiente/);

      // El reintento de cobro tiene éxito: el pago pasa a cobrado y la suscripción se reactiva.
      stripe.subscriptions.retrieve.mockResolvedValue(subObject());
      stripe.invoices.retrieve.mockResolvedValue({ ...(await stripe.invoices.retrieve.mock.results[0].value), amount_paid: 999, attempt_count: 2 });
      await recordInvoice("in_bob_2", "paid");
      expect((await q("select status from public.payments where stripe_invoice_id = 'in_bob_2'")).rows[0].status).toBe("succeeded");
    });

    it("la cancelación programada y el final de la suscripción se notifican una vez", async () => {
      const { syncSubscription } = await import("@/lib/billing/fulfillment");
      stripe.subscriptions.retrieve.mockResolvedValue(subObject({ cancel_at_period_end: true }));
      await syncSubscription("sub_bob");
      await syncSubscription("sub_bob");
      stripe.subscriptions.retrieve.mockResolvedValue(subObject({ status: "canceled", canceled_at: 1801440000, ended_at: 1801440000 }));
      await syncSubscription("sub_bob");
      const e = await q("select template, count(*)::int n from public.email_events where organization_id = $1 group by template", [bob.orgId]);
      const counts = Object.fromEntries(e.rows.map((r) => [r.template, r.n]));
      expect(counts.subscription_cancel_scheduled).toBe(1);
      expect(counts.subscription_ended).toBe(1);
      as(bob);
      const { getMyEntitlements } = await import("@/lib/data/panel");
      expect((await getMyEntitlements()).canGenerate).toBe(false);
      // Los documentos generados mientras estaba activa siguen disponibles.
      expect((await q("select count(*)::int n from public.document_versions where organization_id = $1 and revoked_at is null", [bob.orgId])).rows[0].n).toBeGreaterThan(0);
    });
  });

  describe("Webhook e idempotencia de eventos", () => {
    it("cada evento se procesa una vez y los fallidos se reintentan", async () => {
      const { claimEvent, markEvent } = await import("@/lib/billing/webhook");
      const evt = { id: "evt_flow_1", type: "invoice.paid", livemode: false } as never;
      expect(await claimEvent(evt)).toBe("process");
      expect(await claimEvent(evt)).toBe("in_progress");
      await markEvent("evt_flow_1", "failed", "boom");
      expect(await claimEvent(evt)).toBe("process");
      await markEvent("evt_flow_1", "processed");
      expect(await claimEvent(evt)).toBe("duplicate");
    });

    it("los emails no se envían dos veces con la misma clave", async () => {
      const { sendEmail } = await import("@/lib/email/send");
      const input = { key: "test:dedupe", to: "x@example.com", email: { template: "support_received" as const, data: { subject: "Hola" } } };
      expect(await sendEmail(input)).toBe("skipped");
      expect(await sendEmail(input)).toBe("duplicate");
    });
  });

  describe("Administración y flujo editorial", () => {
    it("crear, editar, revisar, aprobar y publicar una plantilla; los suscriptores generan con ella", async () => {
      const adm = await import("@/lib/actions/admin");
      as(admin);
      const tpl = await q("select id from public.templates where document_type = 'aviso_legal'");
      const url = await redirectOf(adm.createTemplateVersion(tpl.rows[0].id));
      const versionId = url.split("/").pop()!;
      const current = await q("select content, version_label from public.template_versions where id = $1", [versionId]);
      expect(current.rows[0].version_label).toBe("1.0.0");

      const fd = new FormData();
      fd.set("version_label", "1.0.0");
      fd.set("changelog", "Primera versión revisada por el despacho.");
      fd.set("content", JSON.stringify(current.rows[0].content));
      expect((await adm.saveTemplateVersion(versionId, {}, fd)).ok).toBe(true);
      const bad = new FormData();
      bad.set("version_label", "1.0.0");
      bad.set("changelog", "Cambio inválido");
      bad.set("content", '{"title":"x","sections":[]}');
      expect((await adm.saveTemplateVersion(versionId, {}, bad)).error).toMatch(/esquema/);

      await adm.submitTemplateVersion(versionId);
      const approve = new FormData();
      Object.entries({ reviewer_name: "Marta Ruiz Abogada", reviewer_credentials: "ICAM 12345", reviewed_at: "2026-10-30", review_reference: "INF-2026-014", attest: "on" }).forEach(([k, v]) => approve.set(k, v));
      expect((await adm.approveTemplateVersion(versionId, {}, approve)).ok).toBe(true);
      await adm.publishTemplateVersion(versionId);
      expect((await q("select published_version_id from public.templates where id = $1", [tpl.rows[0].id])).rows[0].published_version_id).toBe(versionId);

      // Un cliente normal no puede ejecutar acciones de administración.
      as(alice);
      await expect(adm.createTemplateVersion(tpl.rows[0].id)).rejects.toThrow();

      // Un nuevo suscriptor genera con la versión publicada (no demo).
      const carol = await createAuthUser(state.db!.pool, "carol@example.com");
      await q("update public.organizations set stripe_customer_id = 'cus_carol' where id = $1", [carol.orgId]);
      await q("insert into public.form_responses (organization_id, created_by, questionnaire_version, answers, status, completed_at) values ($1, $2, 1, $3, 'completed', now())", [
        carol.orgId,
        carol.userId,
        JSON.stringify(freelancerAnswers),
      ]);
      stripe.subscriptions.retrieve.mockResolvedValue({
        id: "sub_carol", customer: "cus_carol", status: "active", cancel_at_period_end: false, cancel_at: null, canceled_at: null, ended_at: null, trial_end: null, latest_invoice: null,
        items: { data: [{ current_period_end: 1801440000, price: { id: "price_sub", unit_amount: 999, currency: "eur", recurring: { interval: "month" } } }] },
      });
      const { syncSubscription } = await import("@/lib/billing/fulfillment");
      await syncSubscription("sub_carol");
      const v = await q(
        "select dv.is_demo from public.document_versions dv join public.documents d on d.id = dv.document_id where dv.organization_id = $1 and d.document_type = 'aviso_legal'",
        [carol.orgId],
      );
      expect(v.rows[0].is_demo).toBe(false);

      // Bob (suscripción ya cancelada) tiene una actualización disponible respecto a su versión demo.
      as(bob);
      const { listDocuments } = await import("@/lib/data/panel");
      expect((await listDocuments()).find((d) => d.document_type === "aviso_legal")?.updateAvailable).toBe(true);
    });

    it("las métricas reflejan los datos reales", async () => {
      as(admin);
      const db = createPgSupabase(state.db!.pool, { role: "authenticated", userId: () => admin.userId });
      const { data, error } = await db.rpc("admin_metrics", { p_days: 30 });
      expect(error).toBeNull();
      expect(data).toMatchObject({ total_users: 4, one_time_purchases: 1, failed_payments: 0 });
    });

    it("los listados de administración cargan sin errores de relación", async () => {
      as(admin);
      const db = createPgSupabase(state.db!.pool, { role: "authenticated", userId: () => admin.userId });
      const r = await db
        .from("document_versions")
        .select("id, organization_id, version_number, template_version_id, entitlement_source, is_demo, generated_at, revoked_at, documents!document_versions_document_id_fkey(document_type)")
        .order("generated_at", { ascending: false })
        .limit(200);
      expect(r.error).toBeNull();
    });
  });
});

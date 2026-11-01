import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { as, createAuthUser, createTestDatabase, databaseAvailable, type TestDb } from "./db-harness";

const available = await databaseAvailable();

describe.skipIf(!available)("Base de datos: RLS, privilegios y reglas de negocio", () => {
  let db: TestDb;
  let alice: { userId: string; orgId: string };
  let bob: { userId: string; orgId: string };
  let admin: { userId: string; orgId: string };
  let templateId: string;

  beforeAll(async () => {
    db = await createTestDatabase();
    alice = await createAuthUser(db.pool, "alice@example.com", {
      full_name: "Alice",
      acquisition: { utm_source: "google", evil: "x".repeat(500) },
    });
    bob = await createAuthUser(db.pool, "bob@example.com", { full_name: "Bob" });
    admin = await createAuthUser(db.pool, "admin@example.com", { full_name: "Admin" });
    await db.pool.query("insert into public.user_roles (user_id, role) values ($1, 'admin')", [admin.userId]);

    // Datos de Bob creados por el servidor (service_role).
    const product = await db.pool.query("select id from public.products where code = 'one_time_pack'");
    const pay = await db.pool.query(
      `insert into public.payments (organization_id, product_id, kind, status, amount_cents, currency, stripe_payment_intent_id, paid_at)
       values ($1, $2, 'one_time', 'succeeded', 3900, 'eur', 'pi_test_bob', now()) returning id`,
      [bob.orgId, product.rows[0].id],
    );
    await db.pool.query(
      `insert into public.purchases (organization_id, product_id, payment_id, document_types, generations_limit)
       values ($1, $2, $3, array['aviso_legal'], 2)`,
      [bob.orgId, product.rows[0].id, pay.rows[0].id],
    );
    await db.pool.query(
      `insert into public.form_responses (organization_id, created_by, questionnaire_version, answers)
       values ($1, $2, 1, '{"legal_name":"Bob SL"}')`,
      [bob.orgId, bob.userId],
    );
    // Plantilla cargada por el seed de demostración.
    const t = await db.pool.query("select id from public.templates where slug = 'aviso-legal'");
    templateId = t.rows[0].id;
    await db.pool.query("insert into storage.objects (bucket_id, name) values ('documents', $1), ('documents', $2)", [
      `${bob.orgId}/aviso_legal/${randomUUID()}.pdf`,
      `${alice.orgId}/aviso_legal/${randomUUID()}.pdf`,
    ]);
  }, 60_000);

  afterAll(async () => {
    await db?.drop();
  });

  describe("Alta de usuario", () => {
    it("crea perfil, organización y membresía, filtrando la captación", async () => {
      const p = await db.pool.query("select * from public.profiles where id = $1", [alice.userId]);
      expect(p.rows[0].full_name).toBe("Alice");
      expect(p.rows[0].acquisition).toEqual({ utm_source: "google" });
      const m = await db.pool.query("select role from public.organization_members where user_id = $1", [alice.userId]);
      expect(m.rows).toEqual([{ role: "owner" }]);
    });
  });

  describe("Aislamiento entre clientes", () => {
    it("un usuario solo ve su perfil y su organización", async () => {
      await as(db.pool, "authenticated", alice.userId, async (q) => {
        expect((await q("select id from public.profiles")).rows.map((r) => r.id)).toEqual([alice.userId]);
        expect((await q("select id from public.organizations")).rows.map((r) => r.id)).toEqual([alice.orgId]);
      });
    });

    it("no puede leer pagos, compras ni formularios de otro cliente", async () => {
      await as(db.pool, "authenticated", alice.userId, async (q) => {
        expect((await q("select * from public.payments")).rowCount).toBe(0);
        expect((await q("select * from public.purchases")).rowCount).toBe(0);
        expect((await q("select * from public.form_responses")).rowCount).toBe(0);
        expect((await q("select * from public.payments where organization_id = $1", [bob.orgId])).rowCount).toBe(0);
      });
      await as(db.pool, "authenticated", bob.userId, async (q) => {
        expect((await q("select * from public.payments")).rowCount).toBe(1);
        expect((await q("select * from public.form_responses")).rowCount).toBe(1);
      });
    });

    it("no puede modificar la organización de otro cliente", async () => {
      await as(db.pool, "authenticated", alice.userId, async (q) => {
        const r = await q("update public.organizations set legal_name = 'hack' where id = $1", [bob.orgId]);
        expect(r.rowCount).toBe(0);
      });
    });

    it("no puede crear formularios en la organización de otro cliente", async () => {
      await as(db.pool, "authenticated", alice.userId, async (q) => {
        await expect(
          q("insert into public.form_responses (organization_id, created_by, questionnaire_version) values ($1, $2, 1)", [
            bob.orgId,
            alice.userId,
          ]),
        ).rejects.toThrow(/row-level security/);
      });
    });

    it("solo ve los archivos de su organización en el almacenamiento", async () => {
      await as(db.pool, "authenticated", alice.userId, async (q) => {
        const r = await q("select name from storage.objects");
        expect(r.rowCount).toBe(1);
        expect(r.rows[0].name.startsWith(alice.orgId)).toBe(true);
      });
    });

    it("anónimo no ve datos personales pero sí el catálogo público", async () => {
      await as(db.pool, "anon", null, async (q) => {
        await expect(q("select * from public.profiles")).rejects.toThrow(/permission denied/);
        expect((await q("select code from public.products")).rowCount).toBe(4); // pago único + 3 planes
        expect((await q("select id from public.faqs")).rowCount).toBeGreaterThan(5);
      });
    });
  });

  describe("Privilegios por columna y escrituras reservadas al servidor", () => {
    it("no permite al cliente cambiar su stripe_customer_id ni su propietario", async () => {
      await as(db.pool, "authenticated", alice.userId, async (q) => {
        await expect(q("update public.organizations set stripe_customer_id = 'cus_x'")).rejects.toThrow(/permission denied/);
        await expect(q("update public.organizations set owner_id = $1", [bob.userId])).rejects.toThrow(/permission denied/);
        const ok = await q("update public.organizations set legal_name = 'Alice SL' where id = $1", [alice.orgId]);
        expect(ok.rowCount).toBe(1);
      });
    });

    it("no permite insertar pagos, suscripciones ni documentos desde el cliente", async () => {
      await as(db.pool, "authenticated", alice.userId, async (q) => {
        await expect(
          q("insert into public.payments (organization_id, kind, status, amount_cents, currency) values ($1, 'one_time', 'succeeded', 0, 'eur')", [
            alice.orgId,
          ]),
        ).rejects.toThrow(/permission denied/);
        await expect(
          q("insert into public.documents (organization_id, document_type, title) values ($1, 'aviso_legal', 'x')", [alice.orgId]),
        ).rejects.toThrow(/permission denied/);
        await expect(q("update public.purchases set generations_used = 0")).rejects.toThrow(/permission denied/);
      });
    });

    it("no permite marcar un formulario como completado desde el cliente", async () => {
      await as(db.pool, "authenticated", alice.userId, async (q) => {
        const ins = await q(
          "insert into public.form_responses (organization_id, created_by, questionnaire_version) values ($1, $2, 1) returning id",
          [alice.orgId, alice.userId],
        );
        await expect(q("update public.form_responses set status = 'completed' where id = $1", [ins.rows[0].id])).rejects.toThrow(
          /permission denied/,
        );
        const ok = await q("update public.form_responses set answers = '{\"a\":1}' where id = $1", [ins.rows[0].id]);
        expect(ok.rowCount).toBe(1);
      });
    });

    it("un usuario no puede concederse roles", async () => {
      await as(db.pool, "authenticated", alice.userId, async (q) => {
        await expect(q("insert into public.user_roles (user_id, role) values ($1, 'admin')", [alice.userId])).rejects.toThrow(
          /permission denied/,
        );
      });
    });

    it("las funciones internas no son ejecutables por clientes", async () => {
      await as(db.pool, "authenticated", alice.userId, async (q) => {
        await expect(q("select public.consume_purchase_generation(gen_random_uuid())")).rejects.toThrow(/permission denied/);
        await expect(q("select public.check_rate_limit('x', 1, 60)")).rejects.toThrow(/permission denied/);
      });
    });
  });

  describe("Administración", () => {
    it("las métricas y plantillas solo son accesibles para administradores", async () => {
      await as(db.pool, "authenticated", alice.userId, async (q) => {
        await expect(q("select public.admin_metrics(30)")).rejects.toThrow(/No autorizado/);
        expect((await q("select * from public.templates")).rowCount).toBe(0);
        expect((await q("select * from public.audit_logs")).rowCount).toBe(0);
      });
      await as(db.pool, "authenticated", admin.userId, async (q) => {
        const m = await q("select public.admin_metrics(30) as m");
        expect(m.rows[0].m.total_users).toBe(3);
        expect(m.rows[0].m.one_time_purchases).toBe(1);
        expect((await q("select * from public.templates")).rowCount).toBe(3);
      });
    });
  });

  describe("Flujo editorial de plantillas", () => {
    it("el seed carga las plantillas demo como borradores no publicables", async () => {
      const r = await db.pool.query("select status, is_demo from public.template_versions");
      expect(r.rowCount).toBe(3);
      expect(r.rows.every((x) => x.status === "draft" && x.is_demo)).toBe(true);
      const t = await db.pool.query("select count(*)::int as n from public.templates where published_version_id is null");
      expect(t.rows[0].n).toBe(3);
    });

    it("bloquea la aprobación sin revisión documentada y de versiones demo", async () => {
      await as(db.pool, "authenticated", admin.userId, async (q) => {
        const demo = await q(
          `insert into public.template_versions (template_id, version_label, content, questionnaire_version, is_demo)
           values ($1, '0.1.0-demo', '{"title":"x","sections":[]}', 1, true) returning id`,
          [templateId],
        );
        await q("select public.submit_template_version($1)", [demo.rows[0].id]);
        await expect(
          q("select public.approve_template_version($1, 'Abogada Uno', 'ICAM 1', now(), 'INF-1', null)", [demo.rows[0].id]),
        ).rejects.toThrow(/template_versions_review_required/);
        const v = await q(
          `insert into public.template_versions (template_id, version_label, content, questionnaire_version)
           values ($1, '1.0.0', '{"title":"x","sections":[]}', 1) returning id, version_number`,
          [templateId],
        );
        expect(v.rows[0].version_number).toBe(3); // 1 = seed demo, 2 = demo anterior
        await expect(q("select public.publish_template_version($1)", [v.rows[0].id])).rejects.toThrow(/aprobadas/);
        await q("select public.submit_template_version($1)", [v.rows[0].id]);
        await expect(q("select public.approve_template_version($1, '', '', now(), '', null)", [v.rows[0].id])).rejects.toThrow(
          /Faltan datos/,
        );
        // Contenido inmutable una vez enviado a revisión.
        await expect(q(`update public.template_versions set content = '{"title":"y","sections":[]}' where id = $1`, [v.rows[0].id])).rejects.toThrow(
          /inmutable/,
        );
      });
    });

    it("publica una versión aprobada y retira la anterior", async () => {
      await as(db.pool, "authenticated", admin.userId, async (q) => {
        const ids: string[] = [];
        for (const label of ["1.0.0", "1.1.0"]) {
          const v = await q(
            `insert into public.template_versions (template_id, version_label, content, questionnaire_version)
             values ($1, $2, '{"title":"x","sections":[]}', 1) returning id`,
            [templateId, label],
          );
          ids.push(v.rows[0].id);
          await q("select public.submit_template_version($1)", [v.rows[0].id]);
          await q("select public.approve_template_version($1, 'Abogada Uno', 'ICAM 1234', now() - interval '1 day', 'INF-2026-01', 'ok')", [
            v.rows[0].id,
          ]);
          await q("select public.publish_template_version($1)", [v.rows[0].id]);
        }
        const t = await q("select published_version_id from public.templates where id = $1", [templateId]);
        expect(t.rows[0].published_version_id).toBe(ids[1]);
        const old = await q("select status from public.template_versions where id = $1", [ids[0]]);
        expect(old.rows[0].status).toBe("retired");
        const audit = await q("select count(*)::int as n from public.audit_logs where action = 'template_version.published'");
        expect(audit.rows[0].n).toBe(2);
      });
    });

    it("un cliente no puede crear ni aprobar plantillas", async () => {
      await as(db.pool, "authenticated", alice.userId, async (q) => {
        await expect(
          q(
            `insert into public.template_versions (template_id, version_label, content, questionnaire_version) values ($1, '9.0.0', '{}', 1)`,
            [templateId],
          ),
        ).rejects.toThrow(/row-level security/);
        await expect(
          q("select public.approve_template_version(gen_random_uuid(), 'x', 'x', now(), 'x', null)"),
        ).rejects.toThrow(/No autorizado/);
      });
    });
  });

  describe("Generaciones, versiones y límites", () => {
    it("consume generaciones de una compra respetando el límite", async () => {
      const p = await db.pool.query("select id from public.purchases where organization_id = $1", [bob.orgId]);
      const id = p.rows[0].id;
      const r1 = await db.pool.query("select public.consume_purchase_generation($1) as ok", [id]);
      const r2 = await db.pool.query("select public.consume_purchase_generation($1) as ok", [id]);
      const r3 = await db.pool.query("select public.consume_purchase_generation($1) as ok", [id]);
      expect([r1.rows[0].ok, r2.rows[0].ok, r3.rows[0].ok]).toEqual([true, true, false]);
      await db.pool.query("select public.release_purchase_generation($1)", [id]);
      const r4 = await db.pool.query("select generations_used from public.purchases where id = $1", [id]);
      expect(r4.rows[0].generations_used).toBe(1);
    });

    it("numera versiones de documento de forma correlativa y mantiene la actual", async () => {
      const tv = await db.pool.query(
        `insert into public.template_versions (template_id, version_label, content, questionnaire_version, is_demo)
         values ($1, '0.2.0-demo', '{"title":"x","sections":[]}', 1, true) returning id`,
        [templateId],
      );
      const purchase = await db.pool.query("select id from public.purchases where organization_id = $1", [bob.orgId]);
      const call = (key: string) =>
        db.pool.query(
          `select * from public.record_document_version($1, $2, 'aviso_legal', 'Aviso legal', $3, null, '{}', 'purchase', null, $7, $4, true, 'a.html', 'a.pdf', $5, $6)`,
          [randomUUID(), bob.orgId, tv.rows[0].id, key, "a".repeat(64), bob.userId, purchase.rows[0].id],
        );
      const v1 = await call("k1");
      const v2 = await call("k2");
      expect(v1.rows[0].version_number).toBe(1);
      expect(v2.rows[0].version_number).toBe(2);
      await expect(call("k2")).rejects.toThrow(/generation_key/);
      await as(db.pool, "authenticated", alice.userId, async (q) => {
        expect((await q("select * from public.document_versions")).rowCount).toBe(0);
        expect((await q("select * from public.documents")).rowCount).toBe(0);
      });
      await as(db.pool, "authenticated", bob.userId, async (q) => {
        expect((await q("select * from public.document_versions")).rowCount).toBe(2);
      });
    });

    it("limita la frecuencia por clave", async () => {
      const results: boolean[] = [];
      for (let i = 0; i < 4; i++) {
        const r = await db.pool.query("select public.check_rate_limit('test:key', 3, 3600) as ok");
        results.push(r.rows[0].ok);
      }
      expect(results).toEqual([true, true, true, false]);
    });

    it("no publica actualizaciones legales sin revisión documentada", async () => {
      await expect(
        db.pool.query(
          "insert into public.legal_updates (title, summary, status, published_at) values ('Cambio', 'Resumen del cambio', 'published', now())",
        ),
      ).rejects.toThrow(/legal_updates_review_required/);
    });
  });

  describe("Modo agencia / gestoría", () => {
    let agency: { userId: string; orgId: string };
    let clientA: string;
    let clientB: string;
    let subId: string;
    let tvId: string;

    beforeAll(async () => {
      agency = await createAuthUser(db.pool, "agencia@example.com", { full_name: "Agencia", account_type: "agency" });
      const tv = await db.pool.query(
        `insert into public.template_versions (template_id, version_label, content, questionnaire_version, is_demo)
         values ($1, '0.3.0-demo', '{"title":"x","sections":[]}', 1, true) returning id`,
        [templateId],
      );
      tvId = tv.rows[0].id;
      // Alta real (confirmada) de dos clientes con la sesión de la agencia.
      const create = async (name: string) => {
        const c = await db.pool.connect();
        try {
          await c.query("begin");
          await c.query("set local role authenticated");
          await c.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: agency.userId, role: "authenticated" })]);
          const r = await c.query("select public.create_client_organization($1) as id", [name]);
          await c.query("commit");
          return r.rows[0].id as string;
        } finally {
          c.release();
        }
      };
      clientA = await create("Panadería Sol");
      clientB = await create("Clínica Mar");
    });

    it("el registro como agencia crea una cuenta principal de tipo agencia", async () => {
      const r = await db.pool.query("select account_type, parent_organization_id from public.organizations where id = $1", [agency.orgId]);
      expect(r.rows[0]).toEqual({ account_type: "agency", parent_organization_id: null });
      const other = await db.pool.query("select account_type from public.organizations where id = $1", [alice.orgId]);
      expect(other.rows[0].account_type).toBe("business");
    });

    it("solo una agencia puede dar de alta clientes", async () => {
      await as(db.pool, "authenticated", alice.userId, async (q) => {
        await expect(q("select public.create_client_organization('Cliente')")).rejects.toThrow(/modo agencia/);
      });
      await as(db.pool, "authenticated", agency.userId, async (q) => {
        await expect(q("select public.create_client_organization('   ')")).rejects.toThrow(/entre 1 y 120/);
        const tmp = (await q("select public.create_client_organization('Taller Norte') as id")).rows[0].id;
        const visible = (await q("select id, parent_organization_id, client_name from public.organizations order by created_at")).rows;
        expect(visible.map((r) => r.id)).toEqual([agency.orgId, clientA, clientB, tmp]);
        expect(visible[1]).toMatchObject({ parent_organization_id: agency.orgId, client_name: "Panadería Sol" });
        const member = await q("select role from public.organization_members where organization_id = $1", [tmp]);
        expect(member.rows).toEqual([{ role: "owner" }]);
      });
      await as(db.pool, "anon", null, async (q) => {
        await expect(q("select public.create_client_organization('X')")).rejects.toThrow(/permission denied/);
      });
    });

    it("los clientes de una agencia son invisibles para otros usuarios", async () => {
      await as(db.pool, "authenticated", alice.userId, async (q) => {
        expect((await q("select id from public.organizations where id = any($1)", [[clientA, clientB, agency.orgId]])).rowCount).toBe(0);
        const upd = await q("update public.organizations set client_name = 'Hackeado' where id = $1", [clientA]);
        expect(upd.rowCount).toBe(0);
      });
    });

    it("protege la jerarquía: no se puede mover un cliente, archivar la cuenta principal ni anidar agencias", async () => {
      await as(db.pool, "authenticated", agency.userId, async (q) => {
        await expect(q("update public.organizations set parent_organization_id = null where id = $1", [clientA])).rejects.toThrow(/permission denied/);
        await expect(q("update public.organizations set archived_at = now() where id = $1", [agency.orgId])).rejects.toThrow(/organizations_root_not_archived/);
        await expect(q("update public.organizations set account_type = 'agency' where id = $1", [clientA])).rejects.toThrow(/no puede ser a su vez una agencia/);
        await expect(q("update public.organizations set account_type = 'business' where id = $1", [agency.orgId])).rejects.toThrow(/Archiva primero/);
        const ok = await q("update public.organizations set client_name = 'Panadería Sol SL', client_notes = 'Web en WordPress' where id = $1", [clientA]);
        expect(ok.rowCount).toBe(1);
      });
      await expect(
        db.pool.query("insert into public.organizations (owner_id, parent_organization_id, client_name) values ($1, $2, 'X')", [alice.userId, agency.orgId]),
      ).rejects.toThrow(/titular de la agencia/);
      await expect(
        db.pool.query("insert into public.organizations (owner_id, parent_organization_id, client_name) values ($1, $2, 'X')", [agency.userId, clientA]),
      ).rejects.toThrow(/cuenta principal de tipo agencia/);
    });

    it("el cupo de la suscripción de la agencia se comparte entre clientes y se aplica en base de datos", async () => {
      const product = await db.pool.query(
        `insert into public.products (code, name, kind, price_cents, billing_interval, included_document_types, documents_per_period, active)
         values ('test_quota_3', 'Prueba', 'subscription', 100, 'month', array['aviso_legal'], 3, false) returning id`,
      );
      const sub = await db.pool.query(
        `insert into public.subscriptions (organization_id, product_id, stripe_subscription_id, stripe_customer_id, status, current_period_start)
         values ($1, $2, 'sub_agency', 'cus_agency', 'active', now() - interval '1 day') returning id`,
        [agency.orgId, product.rows[0].id],
      );
      subId = sub.rows[0].id;
      const gen = (org: string, key: string, sid = subId) =>
        db.pool.query(
          `select * from public.record_document_version($1, $2, 'aviso_legal', 'Aviso legal', $3, null, '{}', 'subscription', $4, null, $5, true, 'a.html', 'a.pdf', $6, $7)`,
          [randomUUID(), org, tvId, sid, key, "b".repeat(64), agency.userId],
        );
      await gen(clientA, "ag:1");
      await gen(clientB, "ag:2");
      await gen(agency.orgId, "ag:3");
      await expect(gen(clientA, "ag:4")).rejects.toThrow(/quota_exceeded/);
      // La suscripción de la agencia no sirve para cuentas ajenas.
      await expect(gen(alice.orgId, "ag:5")).rejects.toThrow(/no corresponde/);
      await as(db.pool, "authenticated", agency.userId, async (q) => {
        const docs = await q("select organization_id from public.documents where organization_id = any($1)", [[clientA, clientB, agency.orgId]]);
        expect(docs.rowCount).toBe(3);
      });
    });

    it("las generaciones simultáneas nunca superan el cupo", async () => {
      await db.pool.query("update public.products set documents_per_period = 6 where code = 'test_quota_3'");
      const attempts = Array.from({ length: 8 }, (_, i) =>
        db.pool.query(
          `select * from public.record_document_version($1, $2, 'aviso_legal', 'Aviso legal', $3, null, '{}', 'subscription', $4, null, $5, true, 'a.html', 'a.pdf', $6, $7)`,
          [randomUUID(), i % 2 ? clientA : clientB, tvId, subId, `race:${i}`, "c".repeat(64), agency.userId],
        ),
      );
      const results = await Promise.allSettled(attempts);
      expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(3);
      const used = await db.pool.query("select count(*)::int as n from public.document_versions where subscription_id = $1", [subId]);
      expect(used.rows[0].n).toBe(6);
    });

    it("una compra de pago único no se puede usar en otra cuenta", async () => {
      const purchase = await db.pool.query("select id from public.purchases where organization_id = $1", [bob.orgId]);
      await expect(
        db.pool.query(
          `select * from public.record_document_version($1, $2, 'aviso_legal', 'Aviso legal', $3, null, '{}', 'purchase', null, $4, 'steal:1', true, 'a.html', 'a.pdf', $5, null)`,
          [randomUUID(), clientA, tvId, purchase.rows[0].id, "d".repeat(64)],
        ),
      ).rejects.toThrow(/no corresponde/);
    });
  });
});

import { readdir } from 'node:fs/promises';
import pg from 'pg';
import { afterAll, describe, expect, it } from 'vitest';
import { MIGRATIONS_DIR, migrate } from '../src/db/migrator.js';

const ownerUrl = process.env.TEST_MIGRATION_DATABASE_URL!;
const appRole = decodeURIComponent(new URL(process.env.TEST_DATABASE_URL!).username);
const owner = new pg.Client({ connectionString: ownerUrl });
await owner.connect();
afterAll(() => owner.end());

/** Ejecuta SQL como propietario (sin RLS) dentro de una transacción que se deshace. */
async function rolledBack(fn: () => Promise<void>) {
  await owner.query('BEGIN');
  try {
    await fn();
  } finally {
    await owner.query('ROLLBACK');
  }
}

/** Comprueba que una sentencia falla con la restricción indicada sin abortar la transacción. */
async function expectViolation(text: string, params: unknown[], constraint: RegExp) {
  await owner.query('SAVEPOINT check_violation');
  try {
    await expect(owner.query(text, params)).rejects.toThrow(constraint);
  } finally {
    await owner.query('ROLLBACK TO SAVEPOINT check_violation');
  }
}

async function seedCompany(name: string) {
  const company = (await owner.query<{ id: string }>('INSERT INTO companies (name) VALUES ($1) RETURNING id', [name])).rows[0]!.id;
  const contact = (
    await owner.query<{ id: string }>("INSERT INTO contacts (company_id, full_name, email) VALUES ($1, 'C', $2) RETURNING id", [
      company,
      `c.${company.slice(0, 8)}@ejemplo.test`,
    ])
  ).rows[0]!.id;
  return { company, contact };
}

describe('migraciones', () => {
  it('todas las migraciones están aplicadas y registradas con su checksum', async () => {
    const files = (await readdir(MIGRATIONS_DIR)).filter((f) => f.endsWith('.sql'));
    const { rows } = await owner.query<{ version: string; checksum: string }>('SELECT version, checksum FROM schema_migrations');
    expect(rows.map((r) => `${r.version}.sql`).sort()).toEqual(files.sort());
    expect(rows.every((r) => /^[0-9a-f]{64}$/.test(r.checksum))).toBe(true);
  });

  it('volver a migrar es idempotente', async () => {
    const result = await migrate({ connectionString: ownerUrl, appRole });
    expect(result.applied).toEqual([]);
    expect(result.alreadyApplied.length).toBeGreaterThan(0);
  });

  it('RLS está activado en todas las tablas con datos de empresa', async () => {
    const { rows } = await owner.query<{ relname: string; relrowsecurity: boolean }>(
      `SELECT c.relname, c.relrowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = 'public' AND c.relkind = 'r'`,
    );
    const withCompany = await owner.query<{ table_name: string }>(
      "SELECT table_name FROM information_schema.columns WHERE table_schema = 'public' AND column_name = 'company_id'",
    );
    const rls = new Map(rows.map((r) => [r.relname, r.relrowsecurity]));
    const tenantTables = [...withCompany.rows.map((r) => r.table_name).filter((t) => t !== 'sessions'), 'companies'];
    for (const t of tenantTables) expect(rls.get(t), t).toBe(true);
  });

  it('el rol de la aplicación no es superusuario ni puede saltarse RLS', async () => {
    const { rows } = await owner.query('SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = $1', [appRole]);
    expect(rows[0]).toEqual({ rolsuper: false, rolbypassrls: false });
  });
});

describe('restricciones de integridad', () => {
  it('importes negativos, estados incoherentes y aceptaciones sin evidencia se rechazan', async () => {
    const { company, contact } = await seedCompany('Integridad SL');
    const insert = (extra: string, values: unknown[] = []) =>
      owner.query(`INSERT INTO quotes (company_id, contact_id, title ${extra.split('|')[0]}) VALUES ($1, $2, 'T' ${extra.split('|')[1] ?? ''})`, [
        company,
        contact,
        ...values,
      ]);
    try {
      await expect(insert(', amount_cents|, -1')).rejects.toThrow(/quotes_amount_positive/);
      await expect(insert(", status|, 'sent'")).rejects.toThrow(/quotes_sent_requires_date/);
      await expect(insert(", status, sent_at, responded_at, accepted_at|, 'accepted', now(), now(), now()")).rejects.toThrow(
        /quotes_accepted_consistency/,
      );
      await expect(insert(', reactivated_at|, now()')).rejects.toThrow(/quotes_reactivated_after_response/);
      await expect(insert(", status, sent_at|, 'draft', now()")).rejects.toThrow(/quotes_draft_not_sent/);
    } finally {
      await owner.query('DELETE FROM companies WHERE id = $1', [company]);
    }
  });

  it('las claves foráneas compuestas impiden mezclar datos de dos empresas', async () => {
    await rolledBack(async () => {
      const a = await seedCompany('A SL');
      const b = await seedCompany('B SL');
      await expect(
        owner.query("INSERT INTO quotes (company_id, contact_id, title) VALUES ($1, $2, 'Cruzado')", [b.company, a.contact]),
      ).rejects.toThrow(/quotes_contact_fk/);
    });
  });

  it('no se puede borrar un contacto con presupuestos (sin huérfanos)', async () => {
    await rolledBack(async () => {
      const { company, contact } = await seedCompany('Huérfanos SL');
      await owner.query("INSERT INTO quotes (company_id, contact_id, title) VALUES ($1, $2, 'P')", [company, contact]);
      await expect(owner.query('DELETE FROM contacts WHERE id = $1', [contact])).rejects.toThrow(/quotes_contact_fk/);
    });
  });

  it('al borrar una empresa se borran en cascada todos sus datos', async () => {
    await rolledBack(async () => {
      const { company, contact } = await seedCompany('Cascada SL');
      await owner.query("INSERT INTO quotes (company_id, contact_id, title) VALUES ($1, $2, 'P')", [company, contact]);
      await owner.query('DELETE FROM companies WHERE id = $1', [company]);
      const { rows } = await owner.query('SELECT count(*)::int AS n FROM quotes WHERE company_id = $1', [company]);
      expect(rows[0].n).toBe(0);
    });
  });

  it('emails en minúsculas, únicos por empresa y teléfonos normalizados', async () => {
    await rolledBack(async () => {
      const { company } = await seedCompany('Formatos SL');
      await expectViolation("INSERT INTO contacts (company_id, full_name, email) VALUES ($1, 'X', 'MAYUS@EJEMPLO.TEST')", [company], /contacts_email_lowercase/);
      await expectViolation("INSERT INTO contacts (company_id, full_name, phone) VALUES ($1, 'X', '600 11 22')", [company], /contacts_phone_format/);
      await expectViolation("INSERT INTO contacts (company_id, full_name) VALUES ($1, 'Sin datos')", [company], /contacts_reachable/);
      const email = `c.${company.slice(0, 8)}@ejemplo.test`;
      await expectViolation("INSERT INTO contacts (company_id, full_name, email) VALUES ($1, 'Dup', $2)", [company, email], /contacts_company_email_key/);
    });
  });

  it('un mismo paso automático no puede crearse dos veces (idempotencia para la fase 3)', async () => {
    await rolledBack(async () => {
      const { company, contact } = await seedCompany('Idempotencia SL');
      const quote = (
        await owner.query<{ id: string }>(
          "INSERT INTO quotes (company_id, contact_id, title, status, sent_at) VALUES ($1, $2, 'P', 'sent', now()) RETURNING id",
          [company, contact],
        )
      ).rows[0]!.id;
      const insert = (step: number, key: string) =>
        owner.query(
          "INSERT INTO follow_ups (company_id, quote_id, channel, source, title, dedupe_key, sequence_step, sequence_key) VALUES ($1, $2, 'email', 'rule', 'Paso', $3, $4, 'k')",
          [company, quote, key, step],
        );
      await insert(1, 'auto:1');
      await expectViolation(
        "INSERT INTO follow_ups (company_id, quote_id, channel, source, title, dedupe_key, sequence_step, sequence_key) VALUES ($1, $2, 'email', 'rule', 'Paso', 'auto:1', 1, 'k')",
        [company, quote],
        /follow_ups_dedupe_key/,
      );
      // Nunca dos pasos automáticos en curso a la vez para el mismo presupuesto.
      await expectViolation(
        "INSERT INTO follow_ups (company_id, quote_id, channel, source, title, dedupe_key, sequence_step, sequence_key) VALUES ($1, $2, 'email', 'rule', 'Paso', 'auto:2', 2, 'k')",
        [company, quote],
        /follow_ups_one_active_rule_step/,
      );
      // Un paso automático sin secuencia o "enviado" sin confirmación no son posibles.
      await owner.query("UPDATE follow_ups SET status = 'cancelled', cancelled_at = now() WHERE company_id = $1", [company]);
      await expectViolation(
        "INSERT INTO follow_ups (company_id, quote_id, channel, source, title) VALUES ($1, $2, 'email', 'rule', 'Sin secuencia')",
        [company, quote],
        /follow_ups_rule_sequence/,
      );
      await expectViolation(
        "INSERT INTO follow_ups (company_id, quote_id, channel, source, title, dedupe_key, sequence_step, sequence_key, status) VALUES ($1, $2, 'email', 'rule', 'Paso', 'auto:3', 3, 'k', 'sent')",
        [company, quote],
        /follow_ups_sent_consistency/,
      );
      await expectViolation(
        "INSERT INTO follow_ups (company_id, quote_id, channel, source, title, status, sent_at) VALUES ($1, $2, 'phone', 'manual', 'Manual', 'sent', now())",
        [company, quote],
        /follow_ups_automatic_statuses/,
      );
    });
  });

  it('una suscripción no puede estar activa sin plan', async () => {
    await rolledBack(async () => {
      const { company } = await seedCompany('Plan SL');
      await expect(owner.query("INSERT INTO subscriptions (company_id, status) VALUES ($1, 'active')", [company])).rejects.toThrow(
        /subscriptions_plan_required/,
      );
    });
  });
});

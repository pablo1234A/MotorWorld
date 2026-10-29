/**
 * Herramienta de operación (solo personal autorizado, desde el servidor). Usa
 * MIGRATION_DATABASE_URL (rol propietario del esquema): la aplicación web y su rol de base de
 * datos NO pueden cambiar planes ni borrar empresas.
 *
 *   npm run ops -- companies
 *   npm run ops -- usage   --company <uuid>
 *   npm run ops -- plan    --company <uuid> --plan starter|pro|business --status active|trialing|past_due|canceled|none
 *                          [--trial-days 14] [--period-start ISO --period-end ISO]
 *   npm run ops -- delete-company --company <uuid> --confirm "<nombre exacto de la empresa>"
 *   npm run ops -- backdated [--days 30]   (respuestas no contabilizadas por fecha anterior al seguimiento)
 *
 * Hasta la fase 5 (pagos), `plan` es la forma controlada por el backend de asignar un plan
 * para pruebas o pilotos. Cada cambio queda en el historial de la empresa.
 */
import pg from 'pg';

const PLANS = ['starter', 'pro', 'business'] as const;
const STATUSES = ['none', 'trialing', 'active', 'past_due', 'canceled', 'unpaid', 'incomplete'] as const;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : undefined;
}

function fail(message: string): never {
  console.error(`Error: ${message}`);
  process.exit(1);
}

function companyArg(): string {
  const id = arg('company');
  if (!id || !UUID.test(id)) fail('Indica --company <uuid>');
  return id;
}

async function main() {
  const url = process.env.MIGRATION_DATABASE_URL;
  if (!url) fail('Falta MIGRATION_DATABASE_URL (rol propietario del esquema).');
  const command = process.argv[2];
  const client = new pg.Client({ connectionString: url, application_name: 'presupio-ops' });
  await client.connect();
  try {
    switch (command) {
      case 'companies': {
        const { rows } = await client.query(
          `SELECT c.id, c.name, s.plan, s.status, s.trial_ends_at, c.created_at
           FROM companies c LEFT JOIN subscriptions s ON s.company_id = c.id ORDER BY c.created_at`,
        );
        console.table(rows);
        break;
      }
      case 'usage': {
        const id = companyArg();
        const { rows } = await client.query(
          `SELECT period_start, period_end, period_source, plan, recovery_limit, recoveries_counted, recoveries_over_limit, limit_reached_at
           FROM usage_periods WHERE company_id = $1 ORDER BY period_start DESC LIMIT 12`,
          [id],
        );
        console.table(rows);
        break;
      }
      case 'plan': {
        const id = companyArg();
        const plan = arg('plan');
        const status = arg('status') ?? 'active';
        if (!plan || !(PLANS as readonly string[]).includes(plan)) fail(`--plan debe ser ${PLANS.join(', ')}`);
        if (!(STATUSES as readonly string[]).includes(status)) fail(`--status debe ser ${STATUSES.join(', ')}`);
        const trialDays = arg('trial-days');
        const trialEndsAt = status === 'trialing' ? new Date(Date.now() + Number(trialDays ?? 14) * 86_400_000) : null;
        const periodStart = arg('period-start') ? new Date(arg('period-start')!) : null;
        const periodEnd = arg('period-end') ? new Date(arg('period-end')!) : null;
        if ((periodStart && Number.isNaN(periodStart.getTime())) || (periodEnd && Number.isNaN(periodEnd.getTime()))) fail('Fechas de periodo no válidas');
        await client.query('BEGIN');
        const before = await client.query('SELECT plan, status FROM subscriptions WHERE company_id = $1 FOR UPDATE', [id]);
        if (!before.rows[0]) fail('Empresa sin suscripción o inexistente');
        await client.query(
          `UPDATE subscriptions SET plan = $2, status = $3, trial_ends_at = $4, current_period_start = $5, current_period_end = $6
           WHERE company_id = $1`,
          [id, plan, status, trialEndsAt, periodStart, periodEnd],
        );
        await client.query(
          `INSERT INTO activity_log (company_id, actor_user_id, action, entity_type, entity_id, metadata)
           VALUES ($1, NULL, 'subscription.changed', 'company', $1, $2)`,
          [id, JSON.stringify({ from: before.rows[0], to: { plan, status }, by: 'operator' })],
        );
        await client.query('COMMIT');
        console.log(`Plan de ${id}: ${before.rows[0].plan ?? '—'}/${before.rows[0].status} → ${plan}/${status}`);
        break;
      }
      case 'delete-company': {
        const id = companyArg();
        const confirm = arg('confirm');
        const { rows } = await client.query('SELECT name FROM companies WHERE id = $1', [id]);
        if (!rows[0]) fail('Empresa inexistente');
        if (confirm !== rows[0].name) fail(`Para borrar, repite el nombre exacto: --confirm "${rows[0].name}"`);
        // Las tablas de empresa se borran en cascada. Las cuentas de usuario sin otras empresas
        // se conservan (pueden pertenecer a otras); ver docs/operacion.md.
        await client.query('DELETE FROM companies WHERE id = $1', [id]);
        console.log(`Empresa ${id} y todos sus datos eliminados.`);
        break;
      }
      case 'backdated': {
        // Revisión de posibles evasiones del conteo: respuestas fechadas antes de un seguimiento
        // que ya estaba registrado. No prueba mala fe (el cliente pudo responder antes), pero un
        // patrón repetido merece revisarse con la empresa.
        const days = Number(arg('days') ?? 30);
        if (!Number.isInteger(days) || days < 1 || days > 365) fail('--days debe ser un número entre 1 y 365');
        const { rows } = await client.query(
          `SELECT c.id, c.name, count(*)::int AS respuestas_no_contadas,
                  round(avg((a.metadata->>'backdatedHours')::numeric), 1) AS horas_retroactivas_media,
                  (SELECT count(*)::int FROM recovery_events e WHERE e.company_id = c.id AND e.status = 'counted'
                     AND e.registered_at > now() - make_interval(days => $1)) AS recuperaciones_contadas
           FROM activity_log a JOIN companies c ON c.id = a.company_id
           WHERE a.action = 'recovery.not_counted' AND a.metadata->>'reason' = 'response_dated_before_follow_up'
             AND a.created_at > now() - make_interval(days => $1)
           GROUP BY c.id, c.name ORDER BY respuestas_no_contadas DESC`,
          [days],
        );
        console.table(rows);
        break;
      }
      default:
        fail('Comando desconocido. Usa: companies | usage | plan | delete-company | backdated');
    }
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(`Error: ${(error as Error).message}`);
  process.exit(1);
});

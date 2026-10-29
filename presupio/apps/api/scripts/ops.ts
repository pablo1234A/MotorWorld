/**
 * Herramienta de operación (solo personal autorizado, desde el servidor). Usa
 * MIGRATION_DATABASE_URL (rol propietario del esquema): la aplicación web y su rol de base de
 * datos NO pueden cambiar planes ni borrar empresas.
 *
 *   npm run ops -- companies
 *   npm run ops -- usage   --company <uuid>
 *   npm run ops -- plan    --company <uuid> --plan starter|pro|business --status active|trialing|past_due|canceled|none
 *                          [--trial-days 14] [--period-start ISO --period-end ISO]
 *   npm run ops -- delete-company --company <uuid> --confirm "<nombre exacto de la empresa>" [--before-deadline]
 *   npm run ops -- backdated [--days 30]   (respuestas fechadas antes del seguimiento: revisión manual, D4)
 *   npm run ops -- retention               (cuentas sin plan activo y fecha de conservación de sus datos)
 *   npm run ops -- billing-events [--days 7] (eventos de facturación con error, sin empresa o duplicados)
 *   npm run ops -- set-limit --company <uuid> --attempts <n> --reason "<motivo>" (ajuste del periodo vigente)
 *
 * `plan` asigna un plan sin pasar por el proveedor de pagos (pruebas, pilotos o correcciones).
 * Con pagos activos, el plan de una empresa con suscripción de Stripe lo fijan los webhooks:
 * un cambio manual se sobrescribirá con el siguiente evento. Cada cambio queda en el historial.
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
          `SELECT period_start, period_end, period_source, plan, attempt_limit, attempts_counted, attempts_reserved, attempts_limit_reached_at,
                  recovery_limit AS recovery_limit_anterior, recoveries_counted AS recuperaciones_regla_anterior
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
          `UPDATE subscriptions SET plan = $2::subscription_plan, status = $3::subscription_status, trial_ends_at = $4, current_period_start = $5, current_period_end = $6,
             past_due_since = CASE WHEN $3::text = 'past_due' THEN coalesce(past_due_since, now()) END,
             ended_at = CASE WHEN $3::text IN ('canceled', 'unpaid') THEN coalesce(ended_at, now()) END
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
        // Política de conservación (docs/facturacion.md): sin plan activo, los datos se conservan
        // 90 días desde el fin del acceso. Antes de ese plazo solo se borra a petición expresa
        // de la empresa (--before-deadline). Revisa antes las obligaciones legales de conservación.
        const due = await client.query(
          `SELECT s.status, coalesce(s.ended_at, s.trial_ends_at, c.created_at) + interval '90 days' AS due
           FROM subscriptions s JOIN companies c ON c.id = s.company_id WHERE s.company_id = $1`,
          [id],
        );
        const sub = due.rows[0];
        if (sub && sub.status === 'active' && !process.argv.includes('--before-deadline')) fail('La empresa tiene un plan activo. Usa --before-deadline solo si lo ha pedido expresamente.');
        if (sub && new Date(sub.due) > new Date() && !process.argv.includes('--before-deadline')) {
          fail(`El plazo de conservación termina el ${new Date(sub.due).toISOString().slice(0, 10)}. Para borrar antes (a petición de la empresa) añade --before-deadline.`);
        }
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
      case 'retention': {
        // Sin acceso (aproximación en SQL; la regla exacta está en domain/plans.ts): prueba
        // terminada, cancelada, impagada o con el cobro pendiente más de 7 días.
        const { rows } = await client.query(
          `SELECT c.id, c.name, s.status, coalesce(s.ended_at, s.trial_ends_at, c.created_at) AS fin_del_acceso,
                  coalesce(s.ended_at, s.trial_ends_at, c.created_at) + interval '90 days' AS conservar_hasta,
                  (SELECT string_agg(n.stage || ':' || n.delivery, ', ' ORDER BY n.created_at) FROM retention_notices n WHERE n.company_id = c.id) AS avisos
           FROM companies c JOIN subscriptions s ON s.company_id = c.id
           WHERE s.status IN ('canceled', 'unpaid', 'incomplete', 'none')
              OR (s.status = 'trialing' AND s.trial_ends_at <= now())
              OR (s.status = 'past_due' AND s.past_due_since <= now() - interval '7 days')
           ORDER BY conservar_hasta`,
        );
        console.table(rows);
        console.log('Nada se borra automáticamente. Tras el plazo, revisa las obligaciones legales y usa delete-company.');
        break;
      }
      case 'billing-events': {
        const days = Number(arg('days') ?? 7);
        if (!Number.isInteger(days) || days < 1 || days > 365) fail('--days debe ser un número entre 1 y 365');
        const { rows } = await client.query(
          `SELECT created_at, company_id, event_type, outcome, subscription_status, plan, detail, provider_event_id
           FROM billing_events WHERE outcome IN ('error', 'unmatched', 'duplicate_subscription')
             AND created_at > now() - make_interval(days => $1)
           ORDER BY created_at DESC LIMIT 200`,
          [days],
        );
        console.table(rows);
        break;
      }
      case 'set-limit': {
        // Ajuste de soporte del límite de intentos del periodo vigente (p. ej. una compensación o
        // una corrección acordada). Se mantiene hasta que cambie el plan o empiece otro periodo.
        const id = companyArg();
        const attempts = Number(arg('attempts'));
        const reason = arg('reason')?.trim();
        if (!Number.isInteger(attempts) || attempts < 0 || attempts > 10_000) fail('--attempts debe ser un entero entre 0 y 10000');
        if (!reason || reason.length < 5) fail('Indica --reason "<motivo>" (queda en el historial de la empresa)');
        await client.query('BEGIN');
        const { rows } = await client.query(
          `SELECT period_start, attempt_limit, attempts_counted, attempts_reserved FROM usage_periods
           WHERE company_id = $1 AND period_start <= now() AND period_end > now() ORDER BY period_start DESC LIMIT 1 FOR UPDATE`,
          [id],
        );
        const p = rows[0];
        if (!p) fail('La empresa no tiene periodo de uso vigente (se crea con el primer envío del periodo).');
        if (attempts < p.attempts_counted + p.attempts_reserved) fail(`El periodo ya tiene ${p.attempts_counted + p.attempts_reserved} intentos contados o en curso: el límite no puede ser menor.`);
        await client.query('UPDATE usage_periods SET attempt_limit = $3 WHERE company_id = $1 AND period_start = $2', [id, p.period_start, attempts]);
        await client.query(
          `INSERT INTO activity_log (company_id, actor_user_id, action, entity_type, entity_id, metadata)
           VALUES ($1, NULL, 'usage.limit_adjusted', 'company', $1, $2)`,
          [id, JSON.stringify({ from: p.attempt_limit, to: attempts, periodStart: p.period_start, reason, by: 'operator' })],
        );
        await client.query('COMMIT');
        console.log(`Límite de intentos del periodo ${new Date(p.period_start).toISOString().slice(0, 10)}: ${p.attempt_limit} → ${attempts}`);
        break;
      }
      default:
        fail('Comando desconocido. Usa: companies | usage | plan | delete-company | backdated | retention | billing-events | set-limit');
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

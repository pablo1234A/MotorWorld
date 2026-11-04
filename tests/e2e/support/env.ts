import { randomUUID } from "node:crypto";

import pg from "pg";

export const DATABASE_URL = process.env.DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
export const MAILPIT_URL = process.env.MAILPIT_URL ?? "http://127.0.0.1:54324";

/** Contraseña que cumple la política (≥ 10, mayúsculas, minúsculas y números). */
export const PASSWORD = "Taller2026Seguro";

export function uniqueEmail(prefix: string): string {
  return `${prefix}-${randomUUID().slice(0, 8)}@e2e.test`;
}

export async function db<T = Record<string, unknown>>(text: string, params: unknown[] = []): Promise<T[]> {
  const client = new pg.Client({ connectionString: DATABASE_URL });
  await client.connect();
  try {
    return (await client.query(text, params)).rows as T[];
  } finally {
    await client.end();
  }
}

/**
 * Da a la organización del usuario una suscripción activa. En la Fase 8 esto
 * lo hará el webhook de Stripe (modo TEST); aquí se prepara el dato para
 * probar flujos que dependen del plan.
 */
export async function grantPlan(ownerEmail: string, plan: "pro" | "max" | "business" | "excelencia"): Promise<void> {
  await db(
    `insert into subscriptions (organization_id, plan_code, status, billing_interval)
     select m.organization_id, $2, 'active', 'month'
     from organization_members m join profiles p on p.id = m.user_id
     where p.email = $1 and m.is_owner
     on conflict (organization_id) do update set plan_code = excluded.plan_code, status = 'active'`,
    [ownerEmail, plan],
  );
}

interface MailpitSummary {
  ID: string;
  Subject: string;
  Created: string;
}

/** Espera el último correo para `to` cuyo asunto contiene `subject` y devuelve su enlace de acción. */
export async function waitForEmailLink(to: string, subject: string, after = new Date(0)): Promise<string> {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    const res = await fetch(`${MAILPIT_URL}/api/v1/search?query=${encodeURIComponent(`to:"${to}"`)}`);
    const data = (await res.json()) as { messages: MailpitSummary[] };
    const msg = data.messages.find((m) => m.Subject.includes(subject) && new Date(m.Created) >= after);
    if (msg) {
      const full = (await (await fetch(`${MAILPIT_URL}/api/v1/message/${msg.ID}`)).json()) as { HTML: string };
      const href = full.HTML.match(/href="([^"]*token_hash=[^"]*)"/)?.[1];
      if (!href) throw new Error(`El correo "${msg.Subject}" no contiene enlace con token_hash`);
      return href.replace(/&amp;/g, "&");
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`No ha llegado el correo "${subject}" a ${to}`);
}

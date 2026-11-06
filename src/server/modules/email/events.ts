import "server-only";

import { sql } from "kysely";

import { withSystem } from "@/server/db/client";
import type { EmailEvent } from "@/server/email/webhooks";

/**
 * Aplica un evento del proveedor (idempotente, sin retroceder de estado y con
 * supresión automática: private.apply_email_event). Devuelve el resultado:
 * delivered | delivery_delayed | hard_bounce | complaint | stale | ignored |
 * duplicate | unknown_message.
 */
export async function applyEmailEvent(provider: "resend" | "smtp", eventId: string, event: EmailEvent): Promise<string> {
  return withSystem(async (tx) => {
    const { rows } = await sql<{ outcome: string }>`
      select private.apply_email_event(${provider}, ${eventId.slice(0, 200)}, ${event.messageId}, ${event.type},
                                       ${event.occurredAt}, ${event.bounceType}, '{}'::jsonb) as outcome
    `.execute(tx);
    return rows[0].outcome;
  });
}

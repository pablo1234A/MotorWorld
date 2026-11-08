import "server-only";

import { randomUUID } from "node:crypto";

import { renderPlatformEmail } from "@/lib/email/platform-email";
import { ROLE_LABELS, type Role } from "@/lib/permissions";
import { withSystem } from "@/server/db/client";
import type { EmailPort } from "@/server/email/port";
import type { SenderConfig } from "@/server/email/provider";
import { displayName } from "@/server/email/sender";
import { logger } from "@/server/logger";

/**
 * Correo de invitación a una empresa. Es un correo de la plataforma (no cuenta
 * en el consumo de la empresa). Si el envío no está configurado o falla, la
 * invitación sigue siendo válida y el administrador puede copiar el enlace.
 */
export async function sendInvitationEmail(
  deps: { email: EmailPort | null; sender: SenderConfig | null },
  input: { organizationId: string; to: string; url: string; role: Role; replyTo: string | null },
): Promise<boolean> {
  if (!deps.email || !deps.sender) return false;
  const org = await withSystem((tx) =>
    tx
      .selectFrom("organizations as o")
      .innerJoin("branches as b", (j) => j.onRef("b.organization_id", "=", "o.id").on("b.is_primary", "=", true))
      .select(["o.trade_name as name", "b.id as branchId"])
      .where("o.id", "=", input.organizationId)
      .executeTakeFirstOrThrow(),
  );
  const address = `no_reply@${deps.sender.sharedDomain}`;
  const subject = `Te han invitado a ${org.name} en RevisaYa`.slice(0, 200);
  const msg = renderPlatformEmail({
    title: `Te han invitado a ${org.name}`,
    intro: `Te han invitado a unirte al panel de ${org.name} en RevisaYa como ${ROLE_LABELS[input.role].toLowerCase()}.`,
    notes: [
      "Entra o crea tu cuenta con esta misma dirección de correo para aceptarla.",
      "La invitación caduca en 7 días y solo sirve una vez. Si no la esperabas, ignora este correo.",
    ],
    link: { href: input.url, label: "Aceptar la invitación" },
  });
  const result = await deps.email
    .send({
      from: `${displayName(`${org.name} vía RevisaYa`)} <${address}>`,
      to: input.to,
      replyTo: input.replyTo ?? undefined,
      subject,
      html: msg.html,
      text: msg.text,
      headers: {},
      idempotencyKey: `invitation-${randomUUID()}`,
      tags: { kind: "invitation" },
    })
    .catch((err: Error) => ({ kind: "retryable" as const, code: "adapter_exception", message: err.message }));
  await withSystem((tx) =>
    tx
      .insertInto("email_logs")
      .values({
        organization_id: input.organizationId,
        branch_id: org.branchId,
        kind: "invitation",
        to_email: input.to,
        from_email: address,
        reply_to: input.replyTo,
        subject,
        provider: deps.email!.name,
        provider_message_id: result.kind === "accepted" ? result.messageId : null,
        status: result.kind === "accepted" ? "accepted" : "failed",
        error_code: result.kind === "accepted" ? null : result.code.slice(0, 100),
        sent_at: result.kind === "accepted" ? new Date() : null,
      })
      .execute(),
  ).catch((err) => logger.error("invitation_email_log_failed", { error: err }));
  return result.kind === "accepted";
}

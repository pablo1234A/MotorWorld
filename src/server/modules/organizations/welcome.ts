import "server-only";

import { renderPlatformEmail } from "@/lib/email/platform-email";
import { withSystem } from "@/server/db/client";
import { getEmailProvider, getSenderConfig } from "@/server/email/provider";
import { platformFrom } from "@/server/email/sender";
import { logger } from "@/server/logger";

/** Correo de bienvenida al crear la empresa (PDF §11). No cuenta en el consumo. */
export async function sendWelcomeEmail(organizationId: string, to: string): Promise<boolean> {
  const email = getEmailProvider();
  const sender = getSenderConfig();
  if (!email || !sender) return false;
  try {
    const org = await withSystem((tx) =>
      tx
        .selectFrom("organizations as o")
        .innerJoin("branches as b", (j) => j.onRef("b.organization_id", "=", "o.id").on("b.is_primary", "=", true))
        .select(["o.trade_name", "b.id as branch_id"])
        .where("o.id", "=", organizationId)
        .executeTakeFirst(),
    );
    if (!org) return false;
    const url = (p: string) => new URL(p, sender.appUrl).toString();
    const subject = `Bienvenido a RevisaYa, ${org.trade_name}`;
    const msg = renderPlatformEmail({
      title: `${org.trade_name} ya está en RevisaYa`,
      intro: "Estos son los pasos para poner en marcha el mantenimiento de tus instalaciones:",
      rows: [
        ["1. Elige un plan (7 días gratis)", "Facturación"],
        ["2. Pon tu logo y tus datos", "Configuración → Datos de la empresa"],
        ["3. Revisa las operaciones de mantenimiento", "Configuración → Mantenimiento"],
        ["4. Importa clientes, instalaciones y equipos", "Importar"],
        ["5. Crea tu primera orden de trabajo", "Instalaciones → Nueva orden de trabajo"],
        ["6. Activa los avisos de vencimiento", "Configuración → Avisos"],
      ],
      notes: [`La guía de inicio, paso a paso: ${url("/ayuda")}`, "Si tienes cualquier duda, responde a este correo."],
      link: { href: url("/app"), label: "Ir a mi panel" },
    });
    const { from, address } = platformFrom(sender);
    const result = await email
      .send({ from, to, subject, html: msg.html, text: msg.text, headers: {}, idempotencyKey: `welcome-${organizationId}`, tags: { kind: "welcome" } })
      .catch((err: Error) => ({ kind: "retryable" as const, code: "adapter_exception", message: err.message }));
    await withSystem((tx) =>
      tx
        .insertInto("email_logs")
        .values({
          organization_id: organizationId,
          branch_id: org.branch_id,
          kind: "welcome",
          to_email: to,
          from_email: address,
          subject,
          provider: email.name,
          provider_message_id: result.kind === "accepted" ? result.messageId : null,
          status: result.kind === "accepted" ? "accepted" : "failed",
          error_code: result.kind === "accepted" ? null : result.code.slice(0, 100),
          sent_at: result.kind === "accepted" ? new Date() : null,
        })
        .execute(),
    );
    return result.kind === "accepted";
  } catch (err) {
    logger.error("welcome_email_failed", { error: err });
    return false;
  }
}

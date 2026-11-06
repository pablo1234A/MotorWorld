import type { Metadata } from "next";

import { TemplateEditor } from "@/components/email/template-editor";
import { Alert } from "@/components/ui/feedback";
import { isAdmin } from "@/server/auth/context";
import { requireOrgPage } from "@/server/auth/guards";
import { getEmailProvider } from "@/server/email/provider";
import { listTemplates, previewSample } from "@/server/modules/email/templates";

export const metadata: Metadata = { title: "Plantillas de correo · RevisaYa" };

export default async function TemplatesPage() {
  const ctx = await requireOrgPage("/app/configuracion/plantillas");
  if (!isAdmin(ctx)) {
    return <Alert tone="error" title="Sin permiso">Solo los administradores del taller pueden editar las plantillas.</Alert>;
  }
  const [templates, sample] = await Promise.all([listTemplates(ctx), previewSample(ctx)]);
  const readOnly = !ctx.subscription.active;
  const providerConfigured = getEmailProvider() !== null;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Plantillas de correo</h1>
        <p className="text-sm text-[var(--muted)]">
          El texto que reciben tus clientes. El diseño, tus datos de contacto y el enlace de baja los añade RevisaYa.
        </p>
      </div>
      {readOnly ? <Alert tone="warning">Tu suscripción no está activa: las plantillas están en solo lectura.</Alert> : null}
      {!providerConfigured ? (
        <Alert tone="info">El envío de correo aún no está configurado en RevisaYa: puedes editar y previsualizar, pero no enviar pruebas.</Alert>
      ) : null}
      {[
        ["Avisos de revisión", templates.filter((t) => t.kind.startsWith("reminder_"))],
        ["Correos de citas", templates.filter((t) => t.kind.startsWith("booking_"))],
      ].map(([title, list]) => (
        <div key={title as string} className="flex flex-col gap-4">
          <h2 className="text-xl font-semibold tracking-tight">{title as string}</h2>
          {(list as typeof templates).map((t) => (
            <TemplateEditor
              key={t.kind}
              kind={t.kind}
              initial={{ subject: t.subject, body: t.body, buttonLabel: t.buttonLabel, buttonEnabled: t.buttonEnabled }}
              custom={t.custom}
              sample={sample}
              readOnly={readOnly}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

import type { Metadata } from "next";

import { TemplateEditor } from "@/components/email/template-editor";
import { Alert } from "@/components/ui/feedback";
import { isAdmin } from "@/server/auth/context";
import { requireOrgPage } from "@/server/auth/guards";
import { getEmailProvider } from "@/server/email/provider";
import { listTemplates, previewSample } from "@/server/modules/email/templates";
import { legacyVehicleCounts } from "@/server/modules/vehicles/service";

export const metadata: Metadata = { title: "Plantillas de correo · RevisaYa" };

export default async function TemplatesPage() {
  const ctx = await requireOrgPage("/app/configuracion/plantillas");
  if (!isAdmin(ctx)) {
    return (
      <Alert tone="error" title="Sin permiso">
        Solo los administradores de la empresa pueden editar las plantillas.
      </Alert>
    );
  }
  const [templates, sample, legacy] = await Promise.all([
    listTemplates(ctx),
    previewSample(ctx),
    legacyVehicleCounts(ctx),
  ]);
  const hasVehicles = legacy.vehicles > 0;
  const readOnly = !ctx.subscription.active;
  const providerConfigured = getEmailProvider() !== null;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Plantillas de correo
        </h1>
        <p className="text-sm text-[var(--muted)]">
          El texto que reciben tus clientes. El diseño, tus datos de contacto y
          el enlace de baja los añade RevisaYa.
        </p>
      </div>
      {readOnly ? (
        <Alert tone="warning">
          Tu suscripción no está activa: las plantillas están en solo lectura.
        </Alert>
      ) : null}
      {!providerConfigured ? (
        <Alert tone="info">
          El envío de correo aún no está configurado en RevisaYa: puedes editar
          y previsualizar, pero no enviar pruebas.
        </Alert>
      ) : null}
      {[
        [
          "Avisos y órdenes de trabajo",
          templates.filter((t) =>
            [
              "reminder_maintenance",
              "action_upcoming",
              "service_completed",
              "incident_detected",
              "report_sent",
            ].includes(t.kind),
          ),
        ],
        [
          "Solicitudes de visita",
          templates.filter((t) => t.kind.startsWith("booking_")),
        ],
        ...(hasVehicles
          ? [
              [
                "Vehículos (etapa anterior)",
                templates.filter(
                  (t) =>
                    t.kind === "reminder_service_date" ||
                    t.kind === "reminder_service_km",
                ),
              ],
            ]
          : []),
      ].map(([title, list]) => (
        <div key={title as string} className="flex flex-col gap-4">
          <h2 className="text-xl font-semibold tracking-tight">
            {title as string}
          </h2>
          {(list as typeof templates).map((t) => (
            <TemplateEditor
              key={t.kind}
              kind={t.kind}
              initial={{
                subject: t.subject,
                body: t.body,
                buttonLabel: t.buttonLabel,
                buttonEnabled: t.buttonEnabled,
              }}
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

import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/layout";
import { QuestionnaireWizard } from "@/components/app/questionnaire-wizard";
import { getOrCreateDraft } from "@/lib/actions/forms";
import { Alert } from "@/components/ui/feedback";
import { requireOrganization } from "@/lib/auth";
import { accountLabel } from "@/lib/accounts";

export const metadata: Metadata = { title: "Generador" };

export default async function GeneratorPage({ searchParams }: PageProps<"/panel/generador">) {
  const [draft, sp, { org, account }] = await Promise.all([getOrCreateDraft(), searchParams, requireOrganization()]);
  const step = typeof sp.paso === "string" ? sp.paso : draft.current_step;
  const client = org.id !== account.root.id ? accountLabel(org) : null;
  return (
    <>
      {client ? (
        <PageHeader title={`Formulario de ${client}`} description="Responde con los datos del negocio de tu cliente: titular, actividad y herramientas de su web. Al final verás la vista previa de sus documentos." />
      ) : (
        <PageHeader title="Cuéntanos sobre tu negocio" description="Solo te haremos las preguntas que correspondan a tu actividad. Al final verás una vista previa de tus documentos." />
      )}
      {client && sp.cliente === "nuevo" && (
        <Alert tone="success" title="Cliente creado" className="mb-6">
          Completa su formulario. Se guarda automáticamente: puedes dejarlo a medias y seguir más tarde, o pedirle los datos que falten.
        </Alert>
      )}
      <QuestionnaireWizard responseId={draft.id} initialAnswers={draft.answers} initialStep={step} />
    </>
  );
}

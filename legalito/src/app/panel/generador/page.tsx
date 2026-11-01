import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/layout";
import { QuestionnaireWizard } from "@/components/app/questionnaire-wizard";
import { getOrCreateDraft } from "@/lib/actions/forms";

export const metadata: Metadata = { title: "Generador" };

export default async function GeneratorPage({ searchParams }: PageProps<"/panel/generador">) {
  const [draft, sp] = await Promise.all([getOrCreateDraft(), searchParams]);
  const step = typeof sp.paso === "string" ? sp.paso : draft.current_step;
  return (
    <>
      <PageHeader title="Cuéntanos sobre tu negocio" description="Solo te haremos las preguntas que correspondan a tu actividad. Al final verás una vista previa de tus documentos." />
      <QuestionnaireWizard responseId={draft.id} initialAnswers={draft.answers} initialStep={step} />
    </>
  );
}

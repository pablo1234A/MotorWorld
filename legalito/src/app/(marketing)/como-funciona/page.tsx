import type { Metadata } from "next";
import { Container } from "@/components/ui/layout";
import { CtaBand, SectionHeading, StepsList } from "@/components/marketing/sections";
import { DISCLAIMER } from "@/config/site";

export const metadata: Metadata = {
  title: "Cómo funciona",
  description: "Cómo genera Legalito tu aviso legal, tu política de privacidad y tu política de cookies: formulario adaptado, vista previa, pago y descarga en PDF y HTML.",
  alternates: { canonical: "/como-funciona" },
};

const ENGINE = [
  { t: "Validamos tus respuestas", b: "Comprobamos formatos como el NIF, el código postal o la dirección web, y detectamos datos obligatorios que faltan." },
  { t: "Seleccionamos los bloques aplicables", b: "Cada plantilla tiene reglas: si no vendes online, el apartado de contratación no aparece; si usas Google Analytics, se incluyen sus cookies." },
  { t: "Aplicamos tus datos", b: "Tus datos se insertan en los bloques. Si falta alguno necesario, no generamos un documento incompleto: te pedimos que lo completes." },
  { t: "Registramos la versión", b: "Cada documento guarda la versión de plantilla con la que se generó, para que siempre sepas qué texto tienes publicado." },
];

export default function HowItWorksPage() {
  return (
    <>
      <section className="pt-16 pb-20">
        <Container>
          <SectionHeading as="h1" eyebrow="Cómo funciona" title="Seis pasos, sin necesidad de conocimientos jurídicos" lead="El proceso está pensado para completarse sin ayuda. Si algo no está claro, cada pregunta incluye una explicación." />
          <div className="mt-14">
            <StepsList />
          </div>
        </Container>
      </section>
      <section className="border-y border-line bg-white py-20">
        <Container className="grid gap-12 lg:grid-cols-[1fr_1.4fr]">
          <SectionHeading eyebrow="Por dentro" title="Plantillas estructuradas, no texto improvisado" lead="Legalito no redacta cláusulas nuevas con inteligencia artificial. Los documentos se construyen con plantillas revisadas y reglas explícitas." />
          <ol className="space-y-6">
            {ENGINE.map((e, i) => (
              <li key={e.t} className="flex gap-4">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-navy text-sm font-semibold text-white">{i + 1}</span>
                <div>
                  <h3 className="font-semibold">{e.t}</h3>
                  <p className="mt-1 text-[15px] leading-relaxed text-muted">{e.b}</p>
                </div>
              </li>
            ))}
          </ol>
        </Container>
      </section>
      <section className="py-20">
        <Container className="max-w-3xl">
          <SectionHeading title="Qué no hace Legalito" />
          <ul className="mt-6 space-y-3 text-[15px] leading-relaxed text-ink-soft">
            <li>No presta asesoramiento jurídico ni sustituye a un abogado.</li>
            <li>No instala un banner de cookies: te indica si lo necesitas.</li>
            <li>No genera, por ahora, condiciones generales de contratación para tiendas online.</li>
            <li>No garantiza el cumplimiento normativo: los documentos son una parte, y debes aplicar lo que describen.</li>
          </ul>
          <p className="mt-8 text-sm text-muted">{DISCLAIMER}</p>
        </Container>
      </section>
      <CtaBand />
    </>
  );
}

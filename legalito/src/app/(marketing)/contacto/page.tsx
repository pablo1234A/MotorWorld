import type { Metadata } from "next";
import { Mail, Clock, LifeBuoy } from "lucide-react";
import { Container } from "@/components/ui/layout";
import { SectionHeading } from "@/components/marketing/sections";
import { SupportForm } from "@/components/support-form";
import { site } from "@/config/site";

export const metadata: Metadata = {
  title: "Contacto",
  description: "Escríbenos si tienes dudas sobre Legalito, tus documentos, tu cuenta o tus pagos.",
  alternates: { canonical: "/contacto" },
};

export default function ContactPage() {
  return (
    <section className="pt-16 pb-24">
      <Container className="grid gap-14 lg:grid-cols-[1fr_1.5fr]">
        <div>
          <SectionHeading as="h1" eyebrow="Contacto" title="¿En qué podemos ayudarte?" lead="Respondemos personalmente a cada mensaje. Si ya eres cliente, también puedes escribirnos desde la sección de ayuda de tu panel." />
          <ul className="mt-10 space-y-6 text-[15px]">
            <li className="flex gap-3">
              <Clock className="mt-0.5 h-5 w-5 text-blue" aria-hidden />
              <span className="text-ink-soft">Respuesta habitual en uno o dos días laborables.</span>
            </li>
            <li className="flex gap-3">
              <Mail className="mt-0.5 h-5 w-5 text-blue" aria-hidden />
              <a href={`mailto:${site.supportEmail}`} className="text-ink-soft underline-offset-2 hover:underline">
                {site.supportEmail}
              </a>
            </li>
            <li className="flex gap-3">
              <LifeBuoy className="mt-0.5 h-5 w-5 text-blue" aria-hidden />
              <span className="text-ink-soft">No podemos ofrecer asesoramiento jurídico sobre casos concretos.</span>
            </li>
          </ul>
        </div>
        <div className="rounded-2xl border border-line bg-white p-6 shadow-[var(--shadow-soft)] sm:p-8">
          <SupportForm />
        </div>
      </Container>
    </section>
  );
}

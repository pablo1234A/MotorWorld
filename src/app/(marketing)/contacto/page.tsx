import type { Metadata } from "next";
import { ContactForm } from "@/components/forms/contact-form";
import { Card } from "@/components/ui/primitives";

export const metadata: Metadata = { title: "Contacto", description: "Escríbenos con tus dudas sobre AnunciaPro." };

export default function ContactPage() {
  return (
    <div className="mx-auto grid max-w-5xl gap-12 px-5 py-16 lg:grid-cols-[1fr_1.2fr]">
      <div>
        <h1 className="text-4xl font-bold sm:text-5xl">Contacto</h1>
        <p className="mt-4 text-lg leading-relaxed text-muted">¿Tienes una duda sobre el producto, tu cuenta o los planes? Cuéntanosla y te responderemos por correo electrónico.</p>
        <ul className="mt-8 space-y-3 text-sm leading-relaxed text-ink-soft">
          <li>· Indica el correo con el que te registraste si la consulta es sobre tu cuenta.</li>
          <li>· No incluyas contraseñas ni datos de pago en el mensaje.</li>
          <li>· Para ejercer tus derechos de protección de datos, consulta la política de privacidad.</li>
        </ul>
      </div>
      <Card className="p-6 sm:p-8">
        <ContactForm />
      </Card>
    </div>
  );
}

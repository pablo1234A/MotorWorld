import type { Metadata } from "next";

import { Alert } from "@/components/ui/feedback";

export const metadata: Metadata = { title: "Solicitud enviada", robots: { index: false } };

export default function BookingSentPage() {
  return (
    <div className="flex flex-1 flex-col items-center px-4 py-10 sm:py-16">
      <main className="w-full max-w-md rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 shadow-sm sm:p-8">
        <Alert tone="success" title="¡Solicitud enviada!">
          El taller la revisará y te confirmará el día y la hora. Todavía no es una cita confirmada. Si nos has dejado tu correo, te hemos enviado
          un resumen.
        </Alert>
      </main>
    </div>
  );
}

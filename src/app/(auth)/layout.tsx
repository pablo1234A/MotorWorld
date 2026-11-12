import { Check } from "lucide-react";
import type { ReactNode } from "react";
import { Logo } from "@/components/logo";

const POINTS = ["Anuncios completos a partir de los datos de tu producto", "Generación masiva desde CSV con validación por fila", "Perfiles para adaptar cada anuncio a su plataforma"];

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[1fr_minmax(0,34rem)]">
      <main id="contenido" className="flex flex-col px-6 py-8 sm:px-10">
        <Logo />
        <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center py-10">{children}</div>
      </main>
      <aside className="relative hidden overflow-hidden bg-ink text-white lg:block">
        <div className="dotgrid absolute inset-0 opacity-30 invert" aria-hidden />
        <div className="relative flex h-full flex-col justify-end p-12">
          <p className="font-display text-3xl font-semibold leading-tight">Menos tiempo redactando, más tiempo vendiendo.</p>
          <ul className="mt-8 space-y-3.5">
            {POINTS.map((point) => (
              <li key={point} className="flex gap-3 text-[15px] text-white/75">
                <Check className="mt-0.5 size-4 shrink-0 text-brand" aria-hidden />
                {point}
              </li>
            ))}
          </ul>
        </div>
      </aside>
    </div>
  );
}

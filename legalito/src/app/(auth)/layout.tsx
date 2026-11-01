import type { Metadata } from "next";
import Link from "next/link";
import { Check } from "lucide-react";
import { Logo, LogoMark } from "@/components/ui/logo";

export const metadata: Metadata = { robots: { index: false, follow: true } };

const POINTS = [
  "Solo las preguntas que corresponden a tu negocio",
  "Vista previa de tus documentos antes de pagar",
  "Descarga en PDF y código HTML para tu web",
  "Guardamos tus respuestas mientras avanzas",
];

export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="flex min-h-dvh flex-1">
      {/* Panel de marca (escritorio) */}
      <aside className="relative hidden w-[44%] max-w-xl shrink-0 flex-col justify-between overflow-hidden bg-navy p-12 text-white lg:flex">
        <div aria-hidden className="pointer-events-none absolute inset-0 opacity-[0.08] [background-image:radial-gradient(circle_at_1px_1px,white_1px,transparent_0)] [background-size:22px_22px]" />
        <Link href="/" className="relative inline-flex items-center gap-2" aria-label="Legalito, inicio">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-white">
            <LogoMark className="h-6 w-6" />
          </span>
          <span className="text-xl font-semibold">Legalito</span>
        </Link>
        <div className="relative">
          <p className="text-[32px] leading-tight font-semibold text-white">Los textos legales de tu web, sin complicaciones.</p>
          <ul className="mt-8 space-y-3.5">
            {POINTS.map((p) => (
              <li key={p} className="flex gap-3 text-[15px] text-white/85">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white/15">
                  <Check className="h-3.5 w-3.5" aria-hidden />
                </span>
                {p}
              </li>
            ))}
          </ul>
        </div>
        <p className="relative max-w-sm text-xs leading-relaxed text-white/60">
          Legalito no es un despacho de abogados ni sustituye el asesoramiento jurídico profesional.
        </p>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col bg-canvas">
        <header className="px-4 py-5 sm:px-8 lg:hidden">
          <Logo />
        </header>
        <main id="contenido" className="flex flex-1 items-start justify-center px-4 pt-6 pb-16 sm:items-center sm:pt-0">
          <div className="w-full max-w-[420px] animate-rise">{children}</div>
        </main>
        <footer className="px-4 pb-6 text-center text-xs text-subtle">
          <Link href="/legal/privacidad" className="hover:underline">
            Privacidad
          </Link>{" "}
          ·{" "}
          <Link href="/legal/condiciones" className="hover:underline">
            Condiciones
          </Link>{" "}
          ·{" "}
          <Link href="/contacto" className="hover:underline">
            Ayuda
          </Link>
        </footer>
      </div>
    </div>
  );
}

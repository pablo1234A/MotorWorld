import Link from "next/link";

import { buttonClass } from "@/components/ui/button-styles";

// Página provisional. La web pública completa (cómo funciona, funcionalidades,
// precios, FAQ, contacto y textos legales) se construye en la Fase 10.
export default function Home() {
  return (
    <main className="flex flex-1 items-center justify-center px-4">
      <div className="max-w-md text-center">
        <h1 className="text-3xl font-semibold tracking-tight">RevisaYa</h1>
        <p className="mt-3 text-base text-[var(--muted)]">Avisos automáticos de revisión para talleres mecánicos.</p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Link href="/registro" className={buttonClass("primary")}>
            Crear cuenta
          </Link>
          <Link href="/acceso" className={buttonClass("secondary")}>
            Iniciar sesión
          </Link>
        </div>
      </div>
    </main>
  );
}

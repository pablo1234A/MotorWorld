import Link from "next/link";
import { LogoMark } from "@/components/ui/logo";
import { buttonClass } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main id="contenido" className="flex flex-1 flex-col items-center justify-center px-4 py-24 text-center">
      <LogoMark className="h-10 w-10" />
      <p className="mt-6 text-sm font-semibold text-blue">Error 404</p>
      <h1 className="mt-2 text-3xl font-semibold">No encontramos esta página</h1>
      <p className="mt-3 max-w-md text-muted">Puede que el enlace sea antiguo o que la página se haya movido.</p>
      <div className="mt-8 flex gap-3">
        <Link href="/" className={buttonClass("primary")}>
          Ir al inicio
        </Link>
        <Link href="/contacto" className={buttonClass("secondary")}>
          Contactar
        </Link>
      </div>
    </main>
  );
}

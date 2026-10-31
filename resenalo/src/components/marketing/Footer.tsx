import Link from "next/link";
import { Logo } from "@/components/brand/Logo";
import { LEGAL_PAGES } from "@/config/legal";

export function Footer() {
  return (
    <footer className="border-t border-ink-200 bg-cream-200/60">
      <div className="container-page grid gap-10 py-12 md:grid-cols-[1.4fr_1fr_1.4fr]">
        <div>
          <Logo />
          <p className="mt-3 max-w-xs text-sm text-ink-500">Solicitudes de reseñas automáticas, personales y honestas, enviadas desde tu propio correo.</p>
        </div>
        <div>
          <h2 className="mb-3 text-sm font-semibold">Producto</h2>
          <ul className="space-y-2 text-sm text-ink-600">
            <li><Link href="/#como-funciona" className="hover:text-ink-900">Cómo funciona</Link></li>
            <li><Link href="/#precios" className="hover:text-ink-900">Precios</Link></li>
            <li><Link href="/registro" className="hover:text-ink-900">Crear cuenta</Link></li>
            <li><Link href="/login" className="hover:text-ink-900">Iniciar sesión</Link></li>
          </ul>
        </div>
        <div>
          <h2 className="mb-3 text-sm font-semibold">Legal</h2>
          <ul className="grid grid-cols-1 gap-2 text-sm text-ink-600 sm:grid-cols-2">
            {LEGAL_PAGES.map((p) => (
              <li key={p.slug}>
                <Link href={`/legal/${p.slug}`} className="hover:text-ink-900">
                  {p.title}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </div>
      <div className="border-t border-ink-200">
        <div className="container-page flex flex-col gap-2 py-5 text-xs text-ink-500 sm:flex-row sm:items-center sm:justify-between">
          <p>© {new Date().getFullYear()} Reseñalo. Precios con IVA incluido.</p>
          <p>Reseñalo no ofrece incentivos por reseñas ni filtra opiniones.</p>
        </div>
      </div>
    </footer>
  );
}

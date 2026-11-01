"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";

const ITEMS = [
  { href: "/admin", label: "Métricas", exact: true },
  { href: "/admin/usuarios", label: "Clientes" },
  { href: "/admin/suscripciones", label: "Suscripciones" },
  { href: "/admin/pagos", label: "Pagos e incidencias" },
  { href: "/admin/documentos", label: "Documentos" },
  { href: "/admin/plantillas", label: "Plantillas" },
  { href: "/admin/productos", label: "Planes" },
  { href: "/admin/actualizaciones", label: "Actualizaciones" },
  { href: "/admin/avisos", label: "Avisos" },
  { href: "/admin/faq", label: "FAQ" },
  { href: "/admin/soporte", label: "Soporte" },
  { href: "/admin/errores", label: "Errores" },
  { href: "/admin/auditoria", label: "Auditoría" },
];

export function AdminSubnav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Secciones de administración" className="-mx-4 mb-8 overflow-x-auto px-4 sm:mx-0 sm:px-0">
      <ul className="flex min-w-max gap-1 border-b border-line">
        {ITEMS.map((i) => {
          const active = i.exact ? pathname === i.href : pathname.startsWith(i.href);
          return (
            <li key={i.href}>
              <Link
                href={i.href}
                aria-current={active ? "page" : undefined}
                className={cn("-mb-px inline-block border-b-2 px-3 py-2.5 text-sm transition-colors", active ? "border-navy font-medium text-navy" : "border-transparent text-muted hover:text-navy")}
              >
                {i.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

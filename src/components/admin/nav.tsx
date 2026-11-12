"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const ITEMS = [
  ["/admin", "Resumen"],
  ["/admin/usuarios", "Usuarios"],
  ["/admin/espacios", "Espacios"],
  ["/admin/catalogo", "Productos y anuncios"],
  ["/admin/trabajos", "Trabajos y errores"],
  ["/admin/consumo", "Consumo"],
  ["/admin/planes", "Planes"],
  ["/admin/suscripciones", "Suscripciones"],
  ["/admin/auditoria", "Auditoría"],
  ["/admin/mensajes", "Mensajes"],
] as const;

export function AdminNav() {
  const pathname = usePathname();
  return (
    <nav className="-mb-px flex gap-1 overflow-x-auto" aria-label="Administración">
      {ITEMS.map(([href, label]) => {
        const active = href === "/admin" ? pathname === href : pathname.startsWith(href);
        return (
          <Link key={href} href={href} aria-current={active ? "page" : undefined} className={cn("whitespace-nowrap border-b-2 px-3 py-3 text-sm font-medium", active ? "border-brand text-ink" : "border-transparent text-muted hover:text-ink")}>
            {label}
          </Link>
        );
      })}
    </nav>
  );
}

import Link from "next/link";

import { BRAND } from "@/config/brand";
import type { OrgContext } from "@/server/auth/context";
import { signOutAction } from "@/server/modules/auth/actions";
import { logoUrl } from "@/server/modules/organizations/profile";
import { switchOrganizationAction } from "@/server/modules/organizations/actions";

import { AppNav, type NavGroup } from "./app-nav";

/** Navegación según permisos. Ocultar un enlace nunca sustituye a la comprobación en el servidor. */
export function navGroups(ctx: OrgContext): NavGroup[] {
  const admin = ctx.membership.role === "admin";
  const has = (p: string) => admin || (ctx.membership.permissions as readonly string[]).includes(p);
  const orders = has("work_orders.manage") || has("work_orders.execute");
  const groups: NavGroup[] = [
    { title: null, items: [["/app", "Inicio"]] },
    {
      title: "Trabajo",
      items: [
        ...(orders ? ([["/app/ordenes-trabajo", "Órdenes de trabajo"]] as const) : []),
        ...(orders || has("appointments.manage") ? ([["/app/calendario", "Calendario"]] as const) : []),
        ["/app/mantenimientos", "Mantenimientos"],
        ["/app/incidencias", "Incidencias"],
      ],
    },
    { title: "Instalaciones", items: [["/app/clientes", "Clientes"], ["/app/instalaciones", "Instalaciones"], ["/app/equipos", "Equipos PCI"]] },
    {
      title: "Clientes y avisos",
      items: [
        ...(has("appointments.manage") ? ([["/app/citas", "Solicitudes de visita"]] as const) : []),
        ...(has("quotes.manage") ? ([["/app/presupuestos", "Presupuestos"]] as const) : []),
        ...(has("reminders.read") ? ([["/app/recordatorios", "Avisos"]] as const) : []),
      ],
    },
    {
      title: "Gestión",
      items: [
        ...(has("reports.read") ? ([["/app/informes", "Informes"]] as const) : []),
        ...(has("imports.run") ? ([["/app/importar", "Importar"]] as const) : []),
        ...(admin ? ([["/app/configuracion", "Configuración"], ["/app/usuarios", "Usuarios"]] as const) : []),
        ["/app/cuenta", "Mi cuenta"],
      ],
    },
  ];
  return groups.filter((g) => g.items.length > 0);
}

export function AppHeader({ ctx }: { ctx: OrgContext }) {
  const logo = logoUrl("http://local", ctx.membership.organizationId, ctx.membership.logoPath)?.replace("http://local", "");
  return (
    <header className="sticky top-0 z-20 border-b border-[var(--border)] bg-[var(--carbon)] text-white">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2.5">
        <Link href="/app" className="flex items-center gap-2.5 text-base font-semibold tracking-tight">
          <svg aria-hidden viewBox="0 0 24 24" className="h-6 w-6 text-[#ff4b63]" fill="currentColor">
            <path d="M12 2c1.5 3.4 5 5.8 5 10.1A5 5 0 0 1 12 17a5 5 0 0 1-5-4.9c0-2 1-3.5 2.2-4.6.2 1.6 1 2.7 2.1 3.2C11 8.4 11 5 12 2Zm-6 17h12v3H6z" />
          </svg>
          <span>{BRAND.name}</span>
        </Link>
        {logo ? (
          // eslint-disable-next-line @next/next/no-img-element -- logo servido por la ruta pública de la empresa
          <img src={logo} alt={ctx.membership.organizationName} className="hidden h-7 max-w-28 rounded bg-white object-contain px-1 sm:block" />
        ) : null}
        {ctx.memberships.length > 1 ? (
          <form action={switchOrganizationAction} className="flex items-center gap-2">
            <label htmlFor="org-switch" className="sr-only">
              Empresa activa
            </label>
            <select id="org-switch" name="organizationId" defaultValue={ctx.membership.organizationId} className="rounded-lg border border-white/20 bg-white/10 px-2 py-1.5 text-sm text-white">
              {ctx.memberships.map((m) => (
                <option key={m.organizationId} value={m.organizationId} className="text-black">
                  {m.organizationName}
                </option>
              ))}
            </select>
            <button type="submit" className="rounded-lg px-2 py-1.5 text-sm font-medium hover:bg-white/10">
              Cambiar
            </button>
          </form>
        ) : (
          <span className="max-w-[14rem] truncate text-sm text-white/70">{ctx.membership.organizationName}</span>
        )}
        <div className="ml-auto flex items-center gap-2">
          <div className="text-[var(--foreground)] lg:hidden">
            <AppNav groups={navGroups(ctx)} />
          </div>
          <form action={signOutAction}>
            <button type="submit" className="rounded-lg px-3 py-1.5 text-sm font-medium hover:bg-white/10">
              Cerrar sesión
            </button>
          </form>
        </div>
      </div>
    </header>
  );
}

export function AppSidebar({ ctx }: { ctx: OrgContext }) {
  return (
    <div className="hidden lg:block">
      <AppNav groups={navGroups(ctx)} />
    </div>
  );
}

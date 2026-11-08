import Link from "next/link";

import { BRAND } from "@/config/brand";
import type { OrgContext } from "@/server/auth/context";
import { logoUrl } from "@/server/modules/organizations/profile";
import { signOutAction } from "@/server/modules/auth/actions";
import { switchOrganizationAction } from "@/server/modules/organizations/actions";

import { AppNav } from "./app-nav";

/**
 * Cabecera del panel: marca, taller activo, navegación (según permisos) y
 * cierre de sesión. Ocultar un enlace nunca sustituye a la comprobación en el
 * servidor de cada página.
 */
export function AppHeader({ ctx }: { ctx: OrgContext }) {
  const admin = ctx.membership.role === "admin";
  const logo = logoUrl("http://local", ctx.membership.organizationId, ctx.membership.logoPath)?.replace("http://local", "");
  return (
    <header className="border-b border-[var(--border)] bg-[var(--surface)]">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-3 px-4 py-3">
        <Link href="/app" className="flex items-center gap-3 text-lg font-semibold tracking-tight">
          {logo ? (
            // eslint-disable-next-line @next/next/no-img-element -- logo servido por la ruta pública del taller
            <img src={logo} alt={ctx.membership.organizationName} className="h-8 max-w-32 object-contain" />
          ) : null}
          <span>{BRAND.name}</span>
        </Link>

        {ctx.memberships.length > 1 ? (
          <form action={switchOrganizationAction} className="flex items-center gap-2">
            <label htmlFor="org-switch" className="sr-only">
              Taller activo
            </label>
            <select
              id="org-switch"
              name="organizationId"
              defaultValue={ctx.membership.organizationId}
              className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2 py-1.5 text-sm"
            >
              {ctx.memberships.map((m) => (
                <option key={m.organizationId} value={m.organizationId}>
                  {m.organizationName}
                </option>
              ))}
            </select>
            <button type="submit" className="rounded-lg px-2 py-1.5 text-sm font-medium text-[var(--accent)] hover:bg-[var(--surface-2)]">
              Cambiar
            </button>
          </form>
        ) : (
          <span className="text-sm text-[var(--muted)]">{ctx.membership.organizationName}</span>
        )}

        <AppNav
          items={[
            ["/app", "Inicio"],
            ["/app/clientes", "Clientes"],
            ["/app/vehiculos", "Vehículos"],
            ["/app/historial", "Historial"],
            ...(admin || ctx.membership.permissions.includes("appointments.manage") ? ([["/app/citas", "Citas"]] as const) : []),
            ...(admin || ctx.membership.permissions.includes("quotes.manage") ? ([["/app/presupuestos", "Presupuestos"]] as const) : []),
            ...(admin || ctx.membership.permissions.includes("reminders.read") ? ([["/app/recordatorios", "Recordatorios"]] as const) : []),
            ...(admin || ctx.membership.permissions.includes("reports.read") ? ([["/app/informes", "Informes"]] as const) : []),
            ...(admin || ctx.membership.permissions.includes("imports.run") ? ([["/app/importar", "Importar"]] as const) : []),
            ...(admin ? ([["/app/configuracion", "Configuración"], ["/app/usuarios", "Usuarios"]] as const) : []),
            ["/app/cuenta", "Mi cuenta"],
          ]}
        />

        <form action={signOutAction}>
          <button type="submit" className="rounded-lg px-3 py-1.5 text-sm font-medium hover:bg-[var(--surface-2)]">
            Cerrar sesión
          </button>
        </form>
      </div>
    </header>
  );
}

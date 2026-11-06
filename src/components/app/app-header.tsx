import Link from "next/link";

import type { OrgContext } from "@/server/auth/context";
import { signOutAction } from "@/server/modules/auth/actions";
import { switchOrganizationAction } from "@/server/modules/organizations/actions";

/**
 * Cabecera del panel. Solo enlaza a pantallas que ya existen; el resto de
 * módulos (citas, presupuestos…) se añaden en su fase. El
 * diseño definitivo con barra lateral llega en la Fase 10.
 */
export function AppHeader({ ctx }: { ctx: OrgContext }) {
  const admin = ctx.membership.role === "admin";
  return (
    <header className="border-b border-[var(--border)] bg-[var(--surface)]">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-3 px-4 py-3">
        <Link href="/app" className="text-lg font-semibold tracking-tight">
          RevisaYa
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

        <nav aria-label="Principal" className="flex flex-1 flex-wrap items-center gap-1 text-sm">
          {[
            ["/app", "Inicio"],
            ["/app/clientes", "Clientes"],
            ["/app/vehiculos", "Vehículos"],
            ["/app/historial", "Historial"],
            ...(admin || ctx.membership.permissions.includes("reminders.read") ? [["/app/recordatorios", "Recordatorios"]] : []),
            ...(admin || ctx.membership.permissions.includes("imports.run") ? [["/app/importar", "Importar"]] : []),
          ].map(([href, label]) => (
            <Link key={href} className="rounded-lg px-3 py-1.5 hover:bg-[var(--surface-2)]" href={href}>
              {label}
            </Link>
          ))}
          {admin ? (
            <>
              <Link className="rounded-lg px-3 py-1.5 hover:bg-[var(--surface-2)]" href="/app/configuracion">
                Configuración
              </Link>
              <Link className="rounded-lg px-3 py-1.5 hover:bg-[var(--surface-2)]" href="/app/usuarios">
                Usuarios
              </Link>
            </>
          ) : null}
          <Link className="rounded-lg px-3 py-1.5 hover:bg-[var(--surface-2)]" href="/app/cuenta">
            Mi cuenta
          </Link>
        </nav>

        <form action={signOutAction}>
          <button type="submit" className="rounded-lg px-3 py-1.5 text-sm font-medium hover:bg-[var(--surface-2)]">
            Cerrar sesión
          </button>
        </form>
      </div>
    </header>
  );
}

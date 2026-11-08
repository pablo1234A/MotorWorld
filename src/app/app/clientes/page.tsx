import type { Metadata } from "next";
import Link from "next/link";

import { ReadOnlyNotice } from "@/components/app/read-only-notice";
import { buttonClass } from "@/components/ui/button-styles";
import { Alert } from "@/components/ui/feedback";
import { Pagination } from "@/components/ui/pagination";
import { NextServiceBadge } from "@/components/workshop/badges";
import { todayIn } from "@/lib/dates";
import { PAGE_SIZE, param, parsePage } from "@/lib/pagination";
import { formatPhone } from "@/lib/phone";
import { capabilities } from "@/server/auth/capabilities";
import { requireOrgPage } from "@/server/auth/guards";
import { listAccessibleBranches } from "@/server/modules/branches/service";
import { listCustomers } from "@/server/modules/customers/service";

export const metadata: Metadata = { title: "Clientes · RevisaYa" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function CustomersPage({ searchParams }: { searchParams: SearchParams }) {
  const ctx = await requireOrgPage("/app/clientes");
  const sp = await searchParams;
  const filters = {
    q: param(sp.q),
    branchId: param(sp.taller, 40),
    email: (param(sp.correo) === "con" ? "with" : param(sp.correo) === "sin" ? "without" : undefined) as "with" | "without" | undefined,
    sort: (param(sp.orden) === "nombre" ? "name" : "recent") as "name" | "recent",
  };
  const page = parsePage(param(sp.pagina));
  const [result, branches] = await Promise.all([
    listCustomers(ctx, { ...filters, branchId: filters.branchId && /^[0-9a-f-]{36}$/.test(filters.branchId) ? filters.branchId : undefined, page, pageSize: PAGE_SIZE }),
    listAccessibleBranches(ctx),
  ]);
  const caps = capabilities(ctx);
  const today = todayIn();
  const hasFilters = Boolean(filters.q || filters.branchId || filters.email);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Clientes</h1>
          <p className="text-sm text-[var(--muted)]">Fichas de los clientes del taller y sus vehículos.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {caps.customersDelete || caps.vehiclesDelete ? (
            <Link href="/app/papelera" className={buttonClass("secondary")}>
              Papelera
            </Link>
          ) : null}
          {caps.customersWrite ? (
            <Link href="/app/clientes/nuevo" className={buttonClass("primary")}>
              Nuevo cliente
            </Link>
          ) : null}
        </div>
      </div>
      {caps.readOnly ? <ReadOnlyNotice /> : null}
      {param(sp.borrado) ? <Alert tone="success">Cliente borrado.</Alert> : null}
      {param(sp.suprimido) ? <Alert tone="success">Cliente borrado definitivamente, con todos sus datos. Queda constancia en el registro de solicitudes de protección de datos.</Alert> : null}

      <form method="get" className="grid gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 sm:grid-cols-[1fr_auto_auto_auto_auto]">
        <label className="sr-only" htmlFor="q">
          Buscar
        </label>
        <input
          id="q"
          name="q"
          type="search"
          defaultValue={filters.q}
          placeholder="Nombre, correo, teléfono o matrícula"
          className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm"
        />
        {branches.length > 1 ? (
          <select name="taller" defaultValue={filters.branchId ?? ""} aria-label="Taller" className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2 py-2 text-sm">
            <option value="">Todos los talleres</option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        ) : null}
        <select name="correo" defaultValue={param(sp.correo) ?? ""} aria-label="Correo" className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2 py-2 text-sm">
          <option value="">Con y sin correo</option>
          <option value="con">Con correo</option>
          <option value="sin">Sin correo (no reciben avisos)</option>
        </select>
        <select name="orden" defaultValue={param(sp.orden) ?? ""} aria-label="Orden" className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2 py-2 text-sm">
          <option value="">Más recientes</option>
          <option value="nombre">Por nombre</option>
        </select>
        <button type="submit" className={buttonClass("secondary")}>
          Buscar
        </button>
      </form>

      {result.rows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[var(--border)] p-10 text-center">
          <p className="font-medium">{hasFilters ? "Ningún cliente coincide con la búsqueda." : "Todavía no hay clientes."}</p>
          <p className="mt-1 text-sm text-[var(--muted)]">
            {hasFilters ? (
              <Link className="text-[var(--accent)]" href="/app/clientes">
                Quitar filtros
              </Link>
            ) : caps.customersWrite ? (
              "Crea el primero con «Nuevo cliente»."
            ) : null}
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-[var(--border)] bg-[var(--surface)]">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="border-b border-[var(--border)] text-xs uppercase tracking-wide text-[var(--muted)]">
              <tr>
                <th className="px-4 py-3 font-medium">Cliente</th>
                <th className="px-4 py-3 font-medium">Contacto</th>
                <th className="px-4 py-3 font-medium">Vehículos</th>
                <th className="px-4 py-3 font-medium">Próxima revisión</th>
                {branches.length > 1 ? <th className="px-4 py-3 font-medium">Taller</th> : null}
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]">
              {result.rows.map((c) => (
                <tr key={c.id} className="hover:bg-[var(--surface-2)]">
                  <td className="px-4 py-3">
                    <Link href={`/app/clientes/${c.id}`} className="font-medium text-[var(--accent)]">
                      {`${c.firstName} ${c.lastName}`.trim()}
                    </Link>
                    {c.remindersOptOut ? <span className="ml-2 text-xs text-[var(--muted)]">sin avisos</span> : null}
                  </td>
                  <td className="px-4 py-3">
                    <div>{c.email ?? <span className="text-[var(--muted)]">Sin correo</span>}</div>
                    <div className="text-[var(--muted)]">{formatPhone(c.phone)}</div>
                  </td>
                  <td className="px-4 py-3 tabular-nums">{c.vehicleCount}</td>
                  <td className="px-4 py-3">
                    <NextServiceBadge date={c.nextServiceDate} today={today} />
                  </td>
                  {branches.length > 1 ? <td className="px-4 py-3">{c.branchName}</td> : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Pagination page={result} basePath="/app/clientes" params={{ q: filters.q, taller: filters.branchId, correo: param(sp.correo), orden: param(sp.orden) }} />
    </div>
  );
}

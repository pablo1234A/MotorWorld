import type { Metadata } from "next";
import Link from "next/link";

import { buttonClass } from "@/components/ui/button-styles";
import { Alert, Card } from "@/components/ui/feedback";
import { param } from "@/lib/pagination";
import { capabilities } from "@/server/auth/capabilities";
import { requireOrgPage } from "@/server/auth/guards";
import { listCustomers } from "@/server/modules/customers/service";

export const metadata: Metadata = { title: "Nuevo vehículo · RevisaYa" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/**
 * Un vehículo siempre tiene propietario: primero se elige (o se crea) el
 * cliente y el alta se hace desde su ficha.
 */
export default async function NewVehiclePage({ searchParams }: { searchParams: SearchParams }) {
  const ctx = await requireOrgPage("/app/vehiculos/nuevo");
  const caps = capabilities(ctx);
  const q = param((await searchParams).q);
  const results = q && q.length >= 2 ? await listCustomers(ctx, { q, page: 1, pageSize: 15, sort: "name" }) : null;

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <div>
        <Link href="/app/vehiculos" className="text-sm text-[var(--accent)]">
          ← Vehículos
        </Link>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">Nuevo vehículo</h1>
        <p className="text-sm text-[var(--muted)]">Elige el propietario. El vehículo se dará de alta en su ficha.</p>
      </div>
      {!caps.vehiclesWrite ? (
        <Alert tone="error" title="No puedes crear vehículos">
          {caps.readOnly ? "Tu taller no tiene un plan activo." : "Tu usuario no tiene permiso para crear vehículos."}
        </Alert>
      ) : (
        <Card>
          <form method="get" className="flex gap-2">
            <input
              name="q"
              type="search"
              aria-label="Buscar propietario"
              defaultValue={q}
              placeholder="Nombre, correo, teléfono o matrícula"
              className="flex-1 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm"
            />
            <button type="submit" className={buttonClass("secondary")}>
              Buscar
            </button>
          </form>
          {results ? (
            results.rows.length ? (
              <ul className="mt-4 divide-y divide-[var(--border)]">
                {results.rows.map((c) => (
                  <li key={c.id} className="flex items-center justify-between gap-3 py-3 text-sm">
                    <span>
                      <strong>{`${c.firstName} ${c.lastName}`.trim()}</strong>
                      <span className="text-[var(--muted)]"> {c.email ? `· ${c.email}` : ""} · {c.vehicleCount} vehículos</span>
                    </span>
                    <Link className={buttonClass("secondary", "!py-1.5")} href={`/app/clientes/${c.id}#nuevo-vehiculo`}>
                      Elegir
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-4 text-sm text-[var(--muted)]">Ningún cliente coincide.</p>
            )
          ) : null}
          {caps.customersWrite ? (
            <p className="mt-4 text-sm">
              ¿Es un cliente nuevo?{" "}
              <Link href="/app/clientes/nuevo" className="font-medium text-[var(--accent)]">
                Créalo primero
              </Link>
            </p>
          ) : null}
        </Card>
      )}
    </div>
  );
}

import type { Metadata } from "next";
import Link from "next/link";

import { ReadOnlyNotice } from "@/components/app/read-only-notice";
import { InstallationForm } from "@/components/pci/forms";
import { PageHeader, uuidOrUndefined } from "@/components/pci/page-parts";
import { Card } from "@/components/ui/feedback";
import { param } from "@/lib/pagination";
import { capabilities } from "@/server/auth/capabilities";
import { requireOrgPage } from "@/server/auth/guards";
import { getCustomer, listCustomers } from "@/server/modules/customers/service";

export const metadata: Metadata = { title: "Nueva instalación · RevisaYa" };

export default async function NewInstallationPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const ctx = await requireOrgPage("/app/instalaciones/nueva");
  const sp = await searchParams;
  const caps = capabilities(ctx);
  const customerId = uuidOrUndefined(param(sp.cliente, 40));
  const customer = customerId ? await getCustomer(ctx, customerId) : null;
  const customers = customer
    ? undefined
    : (await listCustomers(ctx, { page: 1, pageSize: 500, sort: "name" })).rows.map((c) => ({ id: c.id, label: `${c.firstName} ${c.lastName}`.trim() }));

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <PageHeader
        title="Nueva instalación"
        subtitle={customer ? `Cliente: ${`${customer.firstName} ${customer.lastName}`.trim()}` : "Elige el cliente al que pertenece."}
        back={customer ? { href: `/app/clientes/${customer.id}`, label: "Volver al cliente" } : { href: "/app/instalaciones", label: "Instalaciones" }}
      />
      {!caps.installationsWrite ? (
        caps.readOnly ? <ReadOnlyNotice /> : <p className="text-sm text-[var(--muted)]">No tienes permiso para crear instalaciones.</p>
      ) : customers && customers.length === 0 ? (
        <Card>
          <p className="text-sm">
            Antes necesitas un cliente.{" "}
            <Link href="/app/clientes/nuevo" className="font-medium text-[var(--accent)]">
              Crear cliente
            </Link>
          </p>
        </Card>
      ) : (
        <Card>
          <InstallationForm values={customer ? { customerId: customer.id } : {}} customers={customers} />
        </Card>
      )}
    </div>
  );
}

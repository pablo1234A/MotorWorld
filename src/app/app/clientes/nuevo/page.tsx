import type { Metadata } from "next";
import Link from "next/link";

import { Alert, Card } from "@/components/ui/feedback";
import { CreateCustomerForm } from "@/components/workshop/customer-forms";
import { capabilities } from "@/server/auth/capabilities";
import { requireOrgPage } from "@/server/auth/guards";
import { listAccessibleBranches } from "@/server/modules/branches/service";

export const metadata: Metadata = { title: "Nuevo cliente · RevisaYa" };

export default async function NewCustomerPage() {
  const ctx = await requireOrgPage("/app/clientes/nuevo");
  const caps = capabilities(ctx);
  const branches = await listAccessibleBranches(ctx);
  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <div>
        <Link href="/app/clientes" className="text-sm text-[var(--accent)]">
          ← Clientes
        </Link>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">Nuevo cliente</h1>
      </div>
      {!caps.customersWrite ? (
        <Alert tone="error" title="No puedes crear clientes">
          {caps.readOnly ? "Tu taller no tiene un plan activo." : "Tu usuario no tiene permiso para crear clientes."}
        </Alert>
      ) : (
        <Card>
          <CreateCustomerForm branches={branches} />
        </Card>
      )}
    </div>
  );
}

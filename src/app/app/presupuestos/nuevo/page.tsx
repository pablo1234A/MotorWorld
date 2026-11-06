import type { Metadata } from "next";
import Link from "next/link";

import { QuoteEditor } from "@/components/quotes/quote-editor";
import { buttonClass } from "@/components/ui/button-styles";
import { Alert, Card } from "@/components/ui/feedback";
import { CustomerPicker } from "@/components/workshop/customer-picker";
import { addDays, todayIn } from "@/lib/dates";
import { param } from "@/lib/pagination";
import { can } from "@/server/auth/context";
import { requireOrgPage } from "@/server/auth/guards";
import { customerWithVehicles } from "@/server/modules/quotes/lookup";

export const metadata: Metadata = { title: "Nuevo presupuesto · RevisaYa" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function NewQuotePage({ searchParams }: { searchParams: SearchParams }) {
  const ctx = await requireOrgPage("/app/presupuestos/nuevo");
  if (!can(ctx, "quotes.manage") || !ctx.subscription.active) {
    return <Alert tone="error" title="No disponible">Necesitas un plan activo y permiso para gestionar presupuestos.</Alert>;
  }
  const sp = await searchParams;
  const customerId = param(sp.cliente, 40);
  const customer = customerId ? await customerWithVehicles(ctx, customerId) : null;
  const today = todayIn();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href="/app/presupuestos" className="text-sm text-[var(--accent)]">
          ← Presupuestos
        </Link>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">Nuevo presupuesto</h1>
      </div>
      {customer ? (
        <QuoteEditor
          customer={customer}
          vehicles={customer.vehicles}
          initial={{ vehicleId: param(sp.vehiculo, 40) ?? customer.vehicles[0]?.id ?? null, issueDate: today, validUntil: addDays(today, 30), notes: null, items: [] }}
        />
      ) : (
        <Card>
          <form method="get" className="flex flex-col gap-4">
            <CustomerPicker name="cliente" label="Buscar cliente" />
            <div>
              <button type="submit" className={buttonClass("primary")}>
                Continuar
              </button>
            </div>
          </form>
        </Card>
      )}
    </div>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { sql } from "kysely";

import { ManualAppointmentForm } from "@/components/appointments/appointment-forms";
import { buttonClass } from "@/components/ui/button-styles";
import { Alert, Card } from "@/components/ui/feedback";
import { CustomerPicker } from "@/components/workshop/customer-picker";
import { addDays, todayIn } from "@/lib/dates";
import { param } from "@/lib/pagination";
import { can } from "@/server/auth/context";
import { requireOrgPage } from "@/server/auth/guards";
import { withRls } from "@/server/db/client";

export const metadata: Metadata = { title: "Nueva visita · RevisaYa" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function NewAppointmentPage({ searchParams }: { searchParams: SearchParams }) {
  const ctx = await requireOrgPage("/app/citas/nueva");
  if (!can(ctx, "appointments.manage") || !ctx.subscription.active) {
    return <Alert tone="error" title="No disponible">Necesitas un plan activo y permiso para gestionar citas.</Alert>;
  }
  const sp = await searchParams;
  const customerId = param(sp.cliente, 40);
  const vehicleId = param(sp.vehiculo, 40);

  const customer =
    customerId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(customerId)
      ? await withRls(ctx.auth, async (tx) => {
          const c = await tx
            .selectFrom("customers as c")
            .innerJoin("branches as b", "b.id", "c.branch_id")
            .innerJoin("organizations as o", "o.id", "c.organization_id")
            .innerJoin("branch_settings as bs", "bs.branch_id", "c.branch_id")
            .select([
              "c.id",
              sql<string>`trim(c.first_name || ' ' || c.last_name)`.as("name"),
              sql<string | null>`c.email::text`.as("email"),
              sql<string>`coalesce(b.timezone, o.timezone)`.as("tz"),
              "bs.slot_minutes as slotMinutes",
            ])
            .where("c.organization_id", "=", ctx.membership.organizationId)
            .where("c.id", "=", customerId)
            .where("c.deleted_at", "is", null)
            .executeTakeFirst();
          if (!c) return null;
          const vehicles = await tx
            .selectFrom("vehicles")
            .select(["id", sql<string>`plate || coalesce(' · ' || nullif(trim(coalesce(make, '') || ' ' || coalesce(model, '')), ''), '')`.as("label")])
            .where("customer_id", "=", c.id)
            .where("deleted_at", "is", null)
            .orderBy("created_at")
            .execute();
          return { ...c, vehicles };
        })
      : null;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href="/app/citas" className="text-sm text-[var(--accent)]">
          ← Citas
        </Link>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">Nueva visita</h1>
        <p className="text-sm text-[var(--muted)]">Para citas que te piden por teléfono o en persona. Nacen confirmadas.</p>
      </div>
      <Card className="flex flex-col gap-4">
        {customer ? (
          <>
            <p className="text-sm">
              Cliente: <strong>{customer.name}</strong>{" "}
              <Link href="/app/citas/nueva" className="text-[var(--accent)]">
                (cambiar)
              </Link>
            </p>
            <ManualAppointmentForm
              customerId={customer.id}
              vehicles={customer.vehicles}
              defaultVehicleId={vehicleId ?? null}
              date={addDays(todayIn(customer.tz), 1)}
              duration={customer.slotMinutes}
              hasEmail={Boolean(customer.email)}
            />
          </>
        ) : (
          <form method="get" className="flex flex-col gap-4">
            <CustomerPicker name="cliente" label="Buscar cliente" />
            <div>
              <button type="submit" className={buttonClass("primary")}>
                Continuar
              </button>
            </div>
            <p className="text-sm text-[var(--muted)]">
              ¿Cliente nuevo?{" "}
              <Link href="/app/clientes/nuevo" className="text-[var(--accent)]">
                Dale de alta primero
              </Link>
              .
            </p>
          </form>
        )}
      </Card>
    </div>
  );
}

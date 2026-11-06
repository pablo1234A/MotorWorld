import type { Metadata } from "next";
import Link from "next/link";

import { AvailabilityRules, BookingSettingsForm } from "@/components/appointments/appointment-forms";
import { buttonClass } from "@/components/ui/button-styles";
import { Alert, Card } from "@/components/ui/feedback";
import { param } from "@/lib/pagination";
import { isAdmin } from "@/server/auth/context";
import { requireOrgPage } from "@/server/auth/guards";
import { getBookingSettings } from "@/server/modules/appointments/settings";
import { listAccessibleBranches } from "@/server/modules/branches/service";

export const metadata: Metadata = { title: "Configuración de citas · RevisaYa" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function BookingSettingsPage({ searchParams }: { searchParams: SearchParams }) {
  const ctx = await requireOrgPage("/app/configuracion/citas");
  if (!isAdmin(ctx)) {
    return <Alert tone="error" title="Sin permiso">Solo los administradores del taller pueden configurar las citas.</Alert>;
  }
  const sp = await searchParams;
  const branches = await listAccessibleBranches(ctx);
  const branch = branches.find((b) => b.id === param(sp.taller, 40)) ?? branches[0];
  if (!branch) return <Alert tone="error">No hay ningún taller activo.</Alert>;
  const settings = await getBookingSettings(ctx, branch.id);
  if (!settings) return <Alert tone="error">No se ha encontrado la configuración de este taller.</Alert>;
  const readOnly = !ctx.subscription.active;
  const publicUrl = new URL(`/t/${ctx.membership.organizationSlug}/cita`, process.env.APP_URL ?? "http://localhost:3000").toString();

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Citas</h1>
          <p className="text-sm text-[var(--muted)]">Cómo piden cita tus clientes desde los avisos o desde tu propio enlace.</p>
        </div>
        <Link href="/app/citas" className={buttonClass("secondary")}>
          Ver las citas
        </Link>
      </div>
      {readOnly ? <Alert tone="warning">Tu suscripción no está activa: la configuración está en solo lectura y la página de citas está cerrada.</Alert> : null}
      {branches.length > 1 ? (
        <form method="get" className="flex flex-wrap items-center gap-2">
          <label htmlFor="taller" className="text-sm font-medium">
            Taller
          </label>
          <select id="taller" name="taller" defaultValue={branch.id} className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2 py-2 text-sm">
            {branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
          <button type="submit" className={buttonClass("secondary")}>
            Ver
          </button>
        </form>
      ) : null}
      <Card className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold">Tu enlace para pedir cita</h2>
        <p className="text-sm text-[var(--muted)]">Ponlo en tu web, en Google o en WhatsApp. Las solicitudes llegan a «Citas».</p>
        <a href={publicUrl} target="_blank" rel="noreferrer" className="break-all font-mono text-sm text-[var(--accent)]">
          {publicUrl}
        </a>
      </Card>
      <BookingSettingsForm key={settings.branchId} branchId={settings.branchId} values={settings} readOnly={readOnly} />
      <AvailabilityRules branchId={settings.branchId} rules={settings.rules} readOnly={readOnly} />
    </div>
  );
}

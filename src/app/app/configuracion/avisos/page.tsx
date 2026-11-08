import type { Metadata } from "next";

import { BlackoutManager, ReminderSettingsForm, RemindersLink } from "@/components/reminders/reminder-settings-form";
import { buttonClass } from "@/components/ui/button-styles";
import { Alert } from "@/components/ui/feedback";
import { todayIn } from "@/lib/dates";
import { param } from "@/lib/pagination";
import { isAdmin } from "@/server/auth/context";
import { requireOrgPage } from "@/server/auth/guards";
import { listAccessibleBranches } from "@/server/modules/branches/service";
import { getReminderSettings } from "@/server/modules/reminders/service";

export const metadata: Metadata = { title: "Configuración de avisos · RevisaYa" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function ReminderSettingsPage({ searchParams }: { searchParams: SearchParams }) {
  const ctx = await requireOrgPage("/app/configuracion/avisos");
  if (!isAdmin(ctx)) {
    return <Alert tone="error" title="Sin permiso">Solo los administradores de la empresa pueden configurar los avisos.</Alert>;
  }
  const sp = await searchParams;
  const branches = await listAccessibleBranches(ctx);
  const requested = param(sp.taller, 40);
  const branch = branches.find((b) => b.id === requested) ?? branches[0];
  if (!branch) return <Alert tone="error">No hay ninguna delegación activa.</Alert>;

  const settings = await getReminderSettings(ctx, branch.id);
  if (!settings) return <Alert tone="error">No se ha encontrado la configuración de esta delegación.</Alert>;
  const readOnly = !ctx.subscription.active;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Configuración de avisos</h1>
          <p className="text-sm text-[var(--muted)]">Cuándo y cómo se avisa a los clientes de los próximos vencimientos de sus instalaciones.</p>
        </div>
        <RemindersLink />
      </div>

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

      {readOnly ? <Alert tone="warning">Tu suscripción no está activa: la configuración está en solo lectura y no se envían avisos.</Alert> : null}
      {!settings.remindersEnabled && !readOnly ? (
        <Alert tone="info" title="Los avisos están desactivados">
          Actívalos abajo para que RevisaYa empiece a avisar a tus clientes antes de cada revisión.
        </Alert>
      ) : null}

      <ReminderSettingsForm key={settings.branchId} values={settings} readOnly={readOnly} />
      <BlackoutManager branchId={settings.branchId} blackouts={settings.blackouts} readOnly={readOnly} today={todayIn(settings.timezone)} />
    </div>
  );
}

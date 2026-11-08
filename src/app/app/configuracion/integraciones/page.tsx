import type { Metadata } from "next";
import Link from "next/link";

import { ConnectGoogleButton, DisconnectGoogleButton } from "@/components/integrations/google-calendar-buttons";
import { Alert, Card } from "@/components/ui/feedback";
import { formatDateTime } from "@/lib/dates";
import { param } from "@/lib/pagination";
import { isAdmin } from "@/server/auth/context";
import { requireOrgPage } from "@/server/auth/guards";
import { getCalendarStatus } from "@/server/modules/integrations/calendar";

export const metadata: Metadata = { title: "Integraciones · RevisaYa" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const RESULT: Record<string, { tone: "success" | "error" | "info"; text: string }> = {
  conectado: { tone: "success", text: "Google Calendar conectado. Las citas aparecerán en tu agenda en unos segundos." },
  desconectado: { tone: "success", text: "Google Calendar desconectado. Hemos retirado el permiso en tu cuenta de Google." },
  cancelado: { tone: "info", text: "Has cancelado la conexión con Google. No se ha cambiado nada." },
  permisos: { tone: "error", text: "Para conectar hay que marcar el permiso «Ver y editar eventos en todos tus calendarios». Vuelve a intentarlo." },
  caducado: { tone: "error", text: "La conexión ha caducado o se abrió en otra pestaña. Vuelve a pulsar «Conectar»." },
  sin_permiso: { tone: "error", text: "Solo el administrador que empezó la conexión puede terminarla." },
  plan: { tone: "error", text: "Google Calendar está incluido a partir del plan Max." },
  no_configurado: { tone: "error", text: "Google Calendar no está configurado en esta instalación." },
  error: { tone: "error", text: "Google no ha permitido la conexión. Inténtalo de nuevo en unos minutos." },
};

export default async function IntegrationsPage({ searchParams }: { searchParams: SearchParams }) {
  const ctx = await requireOrgPage("/app/configuracion/integraciones");
  if (!isAdmin(ctx)) return <Alert tone="error" title="Sin permiso">Solo los administradores de la empresa pueden gestionar las integraciones.</Alert>;
  const sp = await searchParams;
  const status = await getCalendarStatus(ctx);
  const result = RESULT[param(sp.google) ?? ""];
  const i = status.integration;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Integraciones</h1>
        <p className="text-sm text-[var(--muted)]">Conecta RevisaYa con otras herramientas de la empresa.</p>
      </div>
      {result ? <Alert tone={result.tone}>{result.text}</Alert> : null}

      <Card className="flex flex-col gap-4">
        <div>
          <h2 className="text-lg font-semibold">Google Calendar</h2>
          <p className="text-sm text-[var(--muted)]">
            Las citas aparecen en la agenda de Google de la empresa: las solicitudes como «sin confirmar» y las confirmadas con su día y hora. Al rechazar o
            cancelar una cita se quita de la agenda. RevisaYa solo crea y cambia sus propios eventos; no lee el resto de tu calendario.
          </p>
        </div>

        {!status.available ? (
          <Alert tone="info" title="Incluido en los planes Max y Excelencia">
            <Link href="/app/facturacion" className="underline">
              Cambiar de plan
            </Link>
          </Alert>
        ) : !status.configured ? (
          <Alert tone="info" title="No configurado">
            Esta instalación de RevisaYa todavía no tiene las credenciales de Google. Las citas siguen funcionando con normalidad.
          </Alert>
        ) : i?.status === "connected" ? (
          <div className="flex flex-col gap-3">
            <dl className="grid gap-2 text-sm sm:grid-cols-[auto_1fr] sm:gap-x-6">
              <dt className="text-[var(--muted)]">Cuenta</dt>
              <dd className="min-w-0 break-words font-medium">{i.email ?? "Cuenta de Google"}</dd>
              <dt className="text-[var(--muted)]">Conectado</dt>
              <dd>{i.connectedAt ? formatDateTime(i.connectedAt) : "—"}</dd>
              <dt className="text-[var(--muted)]">Última sincronización</dt>
              <dd>{i.lastSyncAt ? formatDateTime(i.lastSyncAt) : "Todavía ninguna"}</dd>
            </dl>
            <DisconnectGoogleButton />
          </div>
        ) : i?.status === "error" ? (
          <div className="flex flex-col gap-3">
            <Alert tone="warning" title="Hay que volver a conectar">
              Google ha retirado el permiso{i.email ? ` de ${i.email}` : ""} (por ejemplo, porque se cambió la contraseña o se quitó el acceso). Las citas nuevas se
              guardan en RevisaYa y se pasarán a la agenda en cuanto vuelvas a conectar.
            </Alert>
            <ConnectGoogleButton reconnect />
            <DisconnectGoogleButton />
          </div>
        ) : (
          <ConnectGoogleButton />
        )}
      </Card>
    </div>
  );
}

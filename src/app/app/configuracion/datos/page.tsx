import type { Metadata } from "next";

import { buttonClass } from "@/components/ui/button-styles";
import { Alert, Card } from "@/components/ui/feedback";
import { formatDateTime } from "@/lib/dates";
import { isAdmin } from "@/server/auth/context";
import { requireOrgPage } from "@/server/auth/guards";
import { listDataRequests } from "@/server/modules/privacy/service";

export const metadata: Metadata = { title: "Datos de la empresa · RevisaYa" };

const TYPE: Record<string, string> = {
  access: "Acceso",
  rectification: "Rectificación",
  erasure: "Supresión",
  restriction: "Limitación",
  portability: "Portabilidad / exportación",
  objection: "Oposición",
};

export default async function DataPage() {
  const ctx = await requireOrgPage("/app/configuracion/datos");
  if (!isAdmin(ctx)) return <Alert tone="error" title="Sin permiso">Solo los administradores de la empresa pueden exportar los datos.</Alert>;
  const requests = await listDataRequests(ctx);
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Datos de la empresa</h1>
        <p className="text-sm text-[var(--muted)]">Tus datos son tuyos: descárgalos cuando quieras, también si cancelas la suscripción.</p>
      </div>
      <Card className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Descargar todos los datos</h2>
        <p className="text-sm text-[var(--muted)]">Un Excel con clientes, vehículos, historial (con piezas), citas y presupuestos. Incluye lo que está en la papelera.</p>
        <a href="/api/app/export" className={buttonClass("secondary", "self-start")} download>
          Descargar Excel
        </a>
      </Card>
      <Card className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Solicitudes de protección de datos</h2>
        <p className="text-sm text-[var(--muted)]">
          Registro de lo que se ha hecho a petición de tus clientes o al exportar (exportar o borrar un cliente se hace desde su ficha). Tienes un mes para
          responder a cada solicitud.
        </p>
        {requests.length === 0 ? (
          <p className="text-sm">Todavía no hay ninguna.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-[var(--border)] text-sm">
            {requests.map((r, i) => (
              <li key={i} className="flex flex-wrap justify-between gap-2 py-2">
                <span>
                  <span className="font-medium">{TYPE[r.type] ?? r.type}</span> · {r.notes}
                </span>
                <span className="text-[var(--muted)]">{formatDateTime(r.completedAt ?? r.createdAt)}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

"use client";
import Link from "next/link";
import { useState } from "react";
import clsx from "clsx";
import { BarChart3, Download, Info, Lock } from "lucide-react";
import { useApi } from "@/lib/useApi";
import { fmtNum } from "@/lib/format";
import { SOURCE_LABEL } from "@/lib/status";
import { Alert, Card, CardHeader, EmptyState, PageHeader, Progress, Stat } from "@/components/ui/Display";
import { ButtonLink } from "@/components/ui/Button";
import { PageLoader } from "@/components/ui/Spinner";
import { ActivityChart } from "@/components/app/ActivityChart";
import type { StatsResult } from "@/server/modules/stats";

export default function StatsPage() {
  const [days, setDays] = useState(30);
  const st = useApi<StatsResult>(`/api/v1/stats?days=${days}`);
  if (st.loading && !st.data) return <PageLoader />;
  if (st.error) return <Alert tone="bad">{st.error.message}</Alert>;
  const s = st.data!;
  const ranges = s.advanced ? [7, 30, 90, 365] : [7, 30];
  const empty = s.totals.sent + s.totals.pending + s.totals.failed === 0;

  return (
    <>
      <PageHeader
        title="Estadísticas"
        description="Datos reales de tu cuenta. Sin estimaciones."
        actions={
          <>
            <div className="flex rounded-lg border border-ink-200 bg-white p-0.5" role="group" aria-label="Periodo">
              {ranges.map((r) => <button key={r} onClick={() => setDays(r)} aria-pressed={days === r} className={clsx("rounded-md px-3 py-1.5 text-sm", days === r ? "bg-ink-800 text-white" : "text-ink-600")}>{r === 365 ? "1 año" : `${r} días`}</button>)}
            </div>
            {s.full ? <a href="/api/v1/stats/export" className="inline-flex h-10 items-center gap-2 rounded-lg border border-ink-200 bg-white px-3 text-sm font-medium"><Download className="h-4 w-4" />Exportar CSV</a> : null}
          </>
        }
      />
      {empty ? (
        <Card><EmptyState icon={<BarChart3 className="h-5 w-5" />} title="Aún no hay datos" action={<ButtonLink href="/app/clientes?nuevo=1">Añadir un cliente</ButtonLink>}>Las estadísticas aparecerán cuando se envíen las primeras solicitudes de reseña.</EmptyState></Card>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
            <Stat label="Total enviados" value={fmtNum(s.totals.sent)} hint="Aceptados por Gmail/Outlook (histórico)" />
            <Stat label="Pendientes" value={fmtNum(s.totals.pending)} hint={s.totals.onHold ? `${s.totals.onHold} en espera de autorización` : "Programados o en cola"} />
            <Stat label="Fallidos" value={fmtNum(s.totals.failed)} hint={`${s.totals.bounced} rechazados por dirección no válida`} />
            <Stat label="Bloqueados" value={fmtNum(s.totals.blocked)} hint="Por límite, baja o suscripción" />
          </div>
          <div className="mt-4 grid gap-4 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader title="Evolución de los envíos" description={`Últimos ${s.days} días`} />
              <ActivityChart data={s.series} showClicks={s.trackClicks} />
            </Card>
            <div className="space-y-4">
              <Card>
                <CardHeader title="Consumo mensual" />
                {s.usage ? (
                  <>
                    <p className="font-display text-2xl font-semibold tabular-nums">{s.usage.sent} <span className="text-base font-normal text-ink-500">/ {s.usage.limit}</span></p>
                    <div className="mt-3"><Progress value={s.usage.percentUsed} tone={s.usage.percentUsed >= 100 ? "bad" : s.usage.percentUsed >= 80 ? "warn" : "ink"} /></div>
                    <p className="mt-2 text-xs text-ink-500">{s.usage.available} disponibles · {s.usage.pending} pendientes</p>
                  </>
                ) : <p className="text-sm text-ink-500">Sin suscripción activa.</p>}
              </Card>
              <Card>
                <CardHeader title="Clics en el enlace de reseña" description={`Enviados en los últimos ${s.days} días`} />
                {s.trackClicks ? (
                  <>
                    <p className="font-display text-2xl font-semibold tabular-nums">{s.range.clickRate === null ? "—" : `${s.range.clickRate.toLocaleString("es-ES")} %`}</p>
                    <p className="mt-1 text-xs text-ink-500">{s.range.clicked} de {s.range.sent} correos con al menos un clic</p>
                  </>
                ) : <p className="text-sm text-ink-500">La medición de clics está desactivada en <Link href="/app/negocio" className="underline">Configuración del negocio</Link>.</p>}
              </Card>
            </div>
          </div>

          <Card className="mt-4">
            <CardHeader title="Rendimiento de las automatizaciones" description={s.advanced ? `Últimos ${s.days} días` : undefined} />
            {s.advanced ? (
              s.byRule.length ? (
                <div className="-mx-5 overflow-x-auto sm:-mx-6">
                  <table className="w-full min-w-[520px] text-sm">
                    <thead className="text-left text-xs uppercase tracking-wide text-ink-500"><tr className="border-b border-ink-100"><th className="px-5 py-2 sm:px-6">Automatización</th><th className="px-3 py-2 text-right">Enviados</th><th className="px-3 py-2 text-right">Pendientes</th><th className="px-3 py-2 text-right">Fallidos</th><th className="px-5 py-2 text-right sm:px-6">Con clic</th></tr></thead>
                    <tbody className="divide-y divide-ink-100">
                      {s.byRule.map((r) => <tr key={r.ruleId ?? r.name}><td className="px-5 py-2.5 font-medium sm:px-6">{r.name}</td><td className="px-3 py-2.5 text-right tabular-nums">{r.sent}</td><td className="px-3 py-2.5 text-right tabular-nums">{r.pending}</td><td className="px-3 py-2.5 text-right tabular-nums">{r.failed}</td><td className="px-5 py-2.5 text-right tabular-nums sm:px-6">{r.clicked}</td></tr>)}
                    </tbody>
                  </table>
                </div>
              ) : <p className="text-sm text-ink-500">Sin actividad en este periodo.</p>
            ) : (
              <div className="flex flex-col items-start gap-3 rounded-lg bg-cream-200/70 p-4 text-sm sm:flex-row sm:items-center sm:justify-between">
                <span className="inline-flex items-center gap-2"><Lock className="h-4 w-4 text-star-800" />El desglose por automatización y por origen está disponible a partir del plan Pro.</span>
                <ButtonLink href="/app/facturacion" size="sm" variant="secondary">Ver planes</ButtonLink>
              </div>
            )}
            {s.advanced && s.bySource.length ? (
              <div className="mt-5 flex flex-wrap gap-2 text-sm">
                {s.bySource.map((b) => <span key={b.source} className="rounded-full bg-ink-100 px-3 py-1">{SOURCE_LABEL[b.source]}: <strong>{b.count}</strong> eventos</span>)}
              </div>
            ) : null}
          </Card>
        </>
      )}
      <p className="mt-6 flex gap-2 text-xs text-ink-500"><Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />Gmail y Microsoft Graph confirman la aceptación del mensaje, no su entrega en el buzón. Reseñalo no puede saber si un cliente ha publicado la reseña: ninguna plataforma lo comunica sin una integración específica, por lo que no mostramos ese dato.</p>
    </>
  );
}

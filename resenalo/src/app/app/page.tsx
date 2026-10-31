"use client";
import Link from "next/link";
import { AlertTriangle, ArrowRight, CheckCircle2, FileSpreadsheet, FileText, Mail, PauseCircle, PlayCircle, Send, UserPlus } from "lucide-react";
import { useState } from "react";
import { api, ApiError } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import { fmtDate, fmtNum, relTime } from "@/lib/format";
import { JOB_STATUS, LOG_EVENT_LABEL } from "@/lib/status";
import { Alert, Badge, Card, CardHeader, EmptyState, PageHeader, Progress, Stat } from "@/components/ui/Display";
import { Button, ButtonLink } from "@/components/ui/Button";
import { PageLoader } from "@/components/ui/Spinner";
import { useToast } from "@/components/ui/Toast";
import { ActivityChart } from "@/components/app/ActivityChart";
import type { StatsResult } from "@/server/modules/stats";

type Job = { id: string; toName: string; toEmail: string; status: string; reasonText: string | null; sentAt: string | null; scheduledFor: string; createdAt: string; lastError: string | null };
type ConnInfo = { connection: { emailAddress: string; status: string; provider: string } | null };
type Rules = { rules: { id: string; active: boolean }[]; paused: boolean };

export default function Dashboard() {
  const stats = useApi<StatsResult>("/api/v1/stats?days=30");
  const recent = useApi<{ items: Job[] }>("/api/v1/emails?pageSize=6");
  const failed = useApi<{ items: Job[]; total: number }>("/api/v1/emails?group=failed&pageSize=4");
  const conn = useApi<ConnInfo>("/api/v1/email-connection");
  const rules = useApi<Rules>("/api/v1/automations");
  const toast = useToast();
  const [toggling, setToggling] = useState(false);

  if (stats.loading && !stats.data) return <PageLoader />;
  if (stats.error) return <Alert tone="bad">{stats.error.message}</Alert>;
  const s = stats.data!;
  const u = s.usage;
  const activeRules = rules.data?.rules.filter((r) => r.active).length ?? 0;
  const paused = rules.data?.paused ?? false;
  const connected = conn.data?.connection?.status === "ACTIVE";
  const automationOn = !paused && activeRules > 0 && connected && Boolean(u);
  const hasActivity = s.totals.sent + s.totals.pending + s.totals.failed + s.totals.blocked > 0;

  const togglePause = async () => {
    setToggling(true);
    try {
      await api("/api/v1/business/automation", { body: { paused: !paused } });
      await rules.reload();
      toast("ok", paused ? "Automatización reanudada" : "Automatización en pausa");
    } catch (e) {
      toast("bad", (e as ApiError).message);
    }
    setToggling(false);
  };

  return (
    <>
      <PageHeader
        title="Inicio"
        description="Resumen de la actividad de tu periodo de facturación actual."
        actions={
          <>
            <ButtonLink href="/app/clientes?nuevo=1" icon={<UserPlus className="h-4 w-4" />}>Añadir cliente</ButtonLink>
            <ButtonLink href="/app/clientes?importar=1" variant="secondary" icon={<FileSpreadsheet className="h-4 w-4" />}>Importar CSV</ButtonLink>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <Stat label="Correos enviados" value={u ? fmtNum(u.sent) : "—"} hint={u ? `de ${u.limit} del plan este periodo` : "Sin suscripción activa"} icon={<Send className="h-4 w-4" />} />
        <Stat label="Correos disponibles" value={u ? fmtNum(u.available) : "—"} hint={u ? `${u.pending} comprometidos en envíos pendientes` : undefined} icon={<Mail className="h-4 w-4" />} />
        <Stat label="Pendientes" value={fmtNum(s.totals.pending)} hint={s.totals.onHold ? `${s.totals.onHold} en espera de autorización` : "Programados o en cola"} />
        <Stat label="Fallidos" value={fmtNum(s.totals.failed)} hint={s.totals.bounced ? `${s.totals.bounced} direcciones rechazadas` : "Desde el inicio"} />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Consumo mensual" description={u ? `Periodo del ${fmtDate(u.periodStart)} al ${fmtDate(u.periodEnd)}. Se reinicia en cada renovación.` : "Contrata un plan para empezar a enviar."} action={<Link href="/app/facturacion" className="text-sm font-medium underline-offset-2 hover:underline">Ver plan</Link>} />
          {u ? (
            <>
              <div className="flex items-baseline justify-between">
                <p className="font-display text-3xl font-semibold tabular-nums">{u.percentUsed}%</p>
                <p className="text-sm tabular-nums text-ink-500">{u.sent} / {u.limit} correos</p>
              </div>
              <div className="mt-3"><Progress value={u.percentUsed} tone={u.percentUsed >= 100 ? "bad" : u.percentUsed >= 80 ? "warn" : "ink"} label="Consumo del plan" /></div>
              {u.available === 0 ? <Alert tone="warn" className="mt-4" title="Has agotado los correos de este periodo">Las nuevas solicitudes se bloquearán hasta la renovación. Puedes mejorar tu plan para ampliar el límite.</Alert> : null}
            </>
          ) : (
            <ButtonLink href="/app/facturacion" variant="secondary">Elegir plan</ButtonLink>
          )}
        </Card>

        <Card>
          <CardHeader title="Estado de la automatización" />
          <div className="flex items-center gap-3">
            {automationOn ? <CheckCircle2 className="h-6 w-6 text-ok-600" /> : <AlertTriangle className="h-6 w-6 text-warn-600" />}
            <div>
              <p className="font-semibold">{automationOn ? "Activa" : paused ? "En pausa" : "No operativa"}</p>
              <p className="text-xs text-ink-500">{activeRules} regla{activeRules === 1 ? "" : "s"} activa{activeRules === 1 ? "" : "s"}</p>
            </div>
          </div>
          <ul className="mt-4 space-y-2 text-sm">
            <li className="flex items-center justify-between gap-2">
              <span className="text-ink-600">Correo</span>
              {conn.data?.connection ? (
                <Badge tone={connected ? "ok" : "bad"} dot>{connected ? conn.data.connection.emailAddress : "Requiere reconexión"}</Badge>
              ) : (
                <Link href="/app/conexion-correo" className="text-sm font-medium underline">Conectar</Link>
              )}
            </li>
            <li className="flex items-center justify-between gap-2">
              <span className="text-ink-600">Suscripción</span>
              <Badge tone={u ? "ok" : "warn"} dot>{u ? "Activa" : "Inactiva"}</Badge>
            </li>
          </ul>
          <Button variant="secondary" className="mt-5 w-full" loading={toggling} onClick={togglePause} icon={paused ? <PlayCircle className="h-4 w-4" /> : <PauseCircle className="h-4 w-4" />}>
            {paused ? "Reanudar envíos automáticos" : "Pausar envíos automáticos"}
          </Button>
        </Card>
      </div>

      {!hasActivity ? (
        <Card className="mt-4">
          <EmptyState icon={<Send className="h-5 w-5" />} title="Todavía no hay envíos" action={<ButtonLink href="/app/clientes?nuevo=1">Añadir mi primer cliente</ButtonLink>}>
            <ol className="mx-auto mt-2 max-w-sm list-decimal space-y-1 pl-5 text-left">
              <li>Comprueba que tu <Link className="underline" href="/app/conexion-correo">correo está conectado</Link>.</li>
              <li>Revisa tu <Link className="underline" href="/app/plantillas">plantilla</Link> y la <Link className="underline" href="/app/automatizaciones">automatización</Link>.</li>
              <li>Añade un cliente o importa un CSV: la solicitud se generará automáticamente.</li>
            </ol>
          </EmptyState>
        </Card>
      ) : (
        <>
          <Card className="mt-4">
            <CardHeader title="Actividad de los últimos 30 días" action={<Link href="/app/estadisticas" className="inline-flex items-center gap-1 text-sm font-medium hover:underline">Estadísticas <ArrowRight className="h-3.5 w-3.5" /></Link>} />
            <ActivityChart data={s.series} showClicks={s.trackClicks} />
          </Card>

          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <Card padded={false}>
              <div className="flex items-center justify-between px-5 pt-5 sm:px-6"><h2 className="text-base font-semibold">Últimos envíos</h2><Link href="/app/envios" className="text-sm font-medium hover:underline">Ver todos</Link></div>
              <ul className="mt-3 divide-y divide-ink-100">
                {recent.data?.items.map((j) => (
                  <li key={j.id} className="flex items-center justify-between gap-3 px-5 py-3 sm:px-6">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{j.toName || j.toEmail}</p>
                      <p className="truncate text-xs text-ink-500">{j.sentAt ? `Enviado ${relTime(j.sentAt)}` : j.status === "SCHEDULED" ? `Programado: ${fmtDate(j.scheduledFor, true)}` : j.reasonText ?? relTime(j.createdAt)}</p>
                    </div>
                    <Badge tone={JOB_STATUS[j.status]?.tone}>{JOB_STATUS[j.status]?.label ?? j.status}</Badge>
                  </li>
                ))}
              </ul>
            </Card>
            <Card padded={false}>
              <div className="flex items-center justify-between px-5 pt-5 sm:px-6"><h2 className="text-base font-semibold">Correos fallidos</h2><Link href="/app/envios?grupo=failed" className="text-sm font-medium hover:underline">Revisar</Link></div>
              {failed.data && failed.data.items.length ? (
                <ul className="mt-3 divide-y divide-ink-100">
                  {failed.data.items.map((j) => (
                    <li key={j.id} className="px-5 py-3 sm:px-6">
                      <div className="flex items-center justify-between gap-3">
                        <p className="truncate text-sm font-medium">{j.toName || j.toEmail}</p>
                        <Badge tone="bad">{JOB_STATUS[j.status]?.label}</Badge>
                      </div>
                      <p className="mt-0.5 line-clamp-2 text-xs text-ink-500">{j.reasonText ?? j.lastError}</p>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="px-5 py-8 text-center text-sm text-ink-500 sm:px-6">No hay correos fallidos. 👍</p>
              )}
            </Card>
          </div>

          <Card className="mt-4">
            <CardHeader title="Actividad reciente" />
            <ul className="space-y-3">
              {s.recent.map((r) => (
                <li key={r.id} className="flex gap-3 text-sm">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-ink-300" />
                  <div className="min-w-0">
                    <p><span className="font-medium">{LOG_EVENT_LABEL[r.event] ?? r.event}</span> · {r.to}</p>
                    <p className="text-xs text-ink-500">{r.message} · {relTime(r.createdAt)}</p>
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        </>
      )}

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        {[
          { href: "/app/plantillas", icon: FileText, t: "Editar plantilla", d: "Personaliza el mensaje" },
          { href: "/app/automatizaciones", icon: Send, t: "Automatizaciones", d: "Retardo y reglas de envío" },
          { href: "/app/conexion-correo", icon: Mail, t: "Conexión de correo", d: "Comprueba que funciona" },
        ].map((q) => (
          <Link key={q.href} href={q.href} className="card flex items-center gap-3 p-4 transition-colors hover:border-ink-300">
            <q.icon className="h-5 w-5 text-ink-500" />
            <div>
              <p className="text-sm font-semibold">{q.t}</p>
              <p className="text-xs text-ink-500">{q.d}</p>
            </div>
          </Link>
        ))}
      </div>
    </>
  );
}

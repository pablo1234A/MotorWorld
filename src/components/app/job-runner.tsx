"use client";

import { AlertTriangle, CheckCircle2, Download, Loader2, RotateCcw } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, Notice, ProgressBar } from "@/components/ui/primitives";
import { api, errorMessage } from "@/lib/api-client";
import { formatDateTime, formatNumber } from "@/lib/utils";
import { JobStatusBadge } from "./job-status";
import { downloadFromApi } from "./listings-view";

export type JobState = {
  id: string;
  status: string;
  source_filename: string | null;
  total_items: number;
  processed_items: number;
  successful_items: number;
  failed_items: number;
  retry_count: number;
  created_at: string;
  completed_at: string | null;
};
export type FailedItem = { id: string; row: number; name: string; error: string; systemError: boolean };

const ACTIVE = new Set(["pending", "processing"]);

/**
 * Conduce el procesamiento por lotes: cada petición procesa un lote pequeño y devuelve
 * el progreso. Si se cierra la pestaña, el trabajo puede retomarse aquí o lo continúa
 * la tarea programada del servidor.
 */
export function JobRunner({ initialJob, initialFailed }: { initialJob: JobState; initialFailed: FailedItem[] }) {
  const router = useRouter();
  const [job, setJob] = useState(initialJob);
  const [failed, setFailed] = useState(initialFailed);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);
  const [exporting, setExporting] = useState(false);
  const cancelled = useRef(false);
  const loop = useRef(false);

  const run = useCallback(async () => {
    if (loop.current) return;
    loop.current = true;
    setRunning(true);
    setError(null);
    let failures = 0;
    let current = job;
    while (!cancelled.current && ACTIVE.has(current.status)) {
      try {
        current = await api<JobState>(`/api/jobs/${job.id}/process`, { method: "POST" });
        setJob(current);
        failures = 0;
      } catch (cause) {
        failures += 1;
        // Reintentos controlados con espera creciente ante fallos de red o del servidor.
        if (failures >= 4) {
          setError(`${errorMessage(cause)} El trabajo se ha pausado; puedes reanudarlo.`);
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 1500 * failures));
      }
    }
    loop.current = false;
    setRunning(false);
    if (!ACTIVE.has(current.status)) {
      try {
        const detail = await api<{ job: JobState; failedItems: FailedItem[] }>(`/api/jobs/${job.id}`);
        setJob(detail.job);
        setFailed(detail.failedItems);
      } catch {
        /* el estado principal ya está actualizado */
      }
      router.refresh();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [job.id]);

  useEffect(() => {
    cancelled.current = false;
    const timer = ACTIVE.has(initialJob.status) ? setTimeout(() => void run(), 0) : undefined;
    return () => {
      cancelled.current = true;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function retry() {
    setRetrying(true);
    try {
      const result = await api<{ retried: number }>(`/api/jobs/${job.id}/retry`, { method: "POST" });
      toast.success(`Reintentando ${result.retried} elementos`);
      setFailed([]);
      const next = { ...job, status: "pending" };
      setJob(next);
      loop.current = false;
      const detail = await api<{ job: JobState }>(`/api/jobs/${job.id}`);
      setJob(detail.job);
      void run();
    } catch (cause) {
      toast.error(errorMessage(cause));
    } finally {
      setRetrying(false);
    }
  }

  async function exportResults() {
    setExporting(true);
    try {
      await downloadFromApi(`/api/jobs/${job.id}/export`);
    } catch (cause) {
      toast.error(errorMessage(cause));
    } finally {
      setExporting(false);
    }
  }

  const active = ACTIVE.has(job.status);
  const percent = job.total_items > 0 ? (job.processed_items / job.total_items) * 100 : 0;

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader
          title={job.source_filename ?? "Importación"}
          description={`Creado el ${formatDateTime(job.created_at)}${job.completed_at ? ` · Terminado el ${formatDateTime(job.completed_at)}` : ""}${job.retry_count ? ` · ${job.retry_count} reintento(s)` : ""}`}
          action={<JobStatusBadge status={job.status} />}
        />
        <div className="p-5">
          <div className="flex items-baseline justify-between text-sm">
            <span className="flex items-center gap-2 font-medium" role="status" aria-live="polite">
              {active && running ? <Loader2 className="size-4 animate-spin text-brand" aria-hidden /> : null}
              {active ? (running ? "Generando anuncios…" : "En pausa") : job.status === "completed" ? "Todos los anuncios se han generado" : "Procesamiento terminado"}
            </span>
            <span className="tabular-nums text-muted">
              {formatNumber(job.processed_items)} / {formatNumber(job.total_items)}
            </span>
          </div>
          <ProgressBar value={percent} tone={job.status === "failed" ? "danger" : job.status === "completed" ? "success" : "brand"} label="Progreso del trabajo" className="mt-3 h-2.5" />

          <dl className="mt-5 grid grid-cols-3 gap-3">
            {[
              ["Correctos", job.successful_items, "text-success"],
              ["Fallidos", job.failed_items, job.failed_items ? "text-danger" : "text-ink"],
              ["Pendientes", job.total_items - job.processed_items, "text-ink"],
            ].map(([label, value, color]) => (
              <div key={label as string} className="rounded-xl border border-line bg-paper px-4 py-3">
                <dt className="text-xs text-muted">{label}</dt>
                <dd className={`mt-1 font-display text-2xl font-semibold tabular-nums ${color}`}>{formatNumber(value as number)}</dd>
              </div>
            ))}
          </dl>

          {error ? (
            <Notice tone="danger" className="mt-4">
              <span role="alert">{error}</span>
            </Notice>
          ) : null}
          {active ? <p className="mt-4 text-[13px] text-muted">Puedes salir de esta página: los anuncios ya generados están guardados y el trabajo puede reanudarse más tarde.</p> : null}

          <div className="mt-5 flex flex-wrap gap-2">
            {active && !running ? <Button onClick={run}>Reanudar procesamiento</Button> : null}
            <Button variant={active ? "secondary" : "primary"} onClick={exportResults} loading={exporting} disabled={job.processed_items === 0}>
              <Download aria-hidden /> Descargar resultados (CSV)
            </Button>
            {!active && job.failed_items > 0 ? (
              <Button variant="secondary" onClick={retry} loading={retrying}>
                <RotateCcw aria-hidden /> Reintentar fallidos ({job.failed_items})
              </Button>
            ) : null}
            {job.successful_items > 0 ? (
              <Link href="/app/anuncios" className="inline-flex h-10 items-center px-3 text-sm font-medium text-brand-strong hover:underline">
                Ver anuncios generados
              </Link>
            ) : null}
          </div>
        </div>
      </Card>

      {!active && job.status === "completed" ? (
        <Notice tone="success">
          <span className="flex items-center gap-2">
            <CheckCircle2 className="size-4" aria-hidden /> Los {formatNumber(job.successful_items)} anuncios están guardados como borradores en «Mis anuncios».
          </span>
        </Notice>
      ) : null}

      {failed.length > 0 ? (
        <Card>
          <CardHeader title="Elementos fallidos" description="Los fallos por errores internos del sistema no consumen generaciones de tu plan. Al reintentar se vuelven a descontar los elementos que se procesen." />
          <ul className="divide-y divide-line">
            {failed.map((item) => (
              <li key={item.id} className="flex items-start gap-3 px-5 py-3 text-sm">
                <AlertTriangle className="mt-0.5 size-4 shrink-0 text-danger" aria-hidden />
                <span className="w-16 shrink-0 font-medium tabular-nums">Fila {item.row}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{item.name || "Sin nombre"}</span>
                  <span className="block text-[13px] text-muted">
                    {item.error}
                    {item.systemError ? " (error del sistema: no descontado)" : ""}
                  </span>
                </span>
              </li>
            ))}
          </ul>
          {job.failed_items > failed.length ? <p className="border-t border-line px-5 py-3 text-xs text-muted">Se muestran los primeros {failed.length}. Descarga el CSV de resultados para verlos todos.</p> : null}
        </Card>
      ) : null}
    </div>
  );
}

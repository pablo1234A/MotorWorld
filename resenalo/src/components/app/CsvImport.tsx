"use client";
import { useState } from "react";
import { FileUp } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { Button } from "@/components/ui/Button";
import { Checkbox } from "@/components/ui/Field";
import { Alert } from "@/components/ui/Display";

type Report = { totalRows: number; created: number; updated: number; duplicatesInFile: number; invalid: { row: number; reason: string }[]; requests?: { created: number; skipped: number; rejected: number; reasons: Record<string, number> } };
const REASONS: Record<string, string> = { LIMIT_REACHED: "límite del plan", COOLDOWN: "solicitud reciente", DUPLICATE: "duplicado", COMPLETION_TOO_OLD: "servicio de hace más de 90 días", NO_EMAIL_CONNECTION: "correo sin conectar", SUBSCRIPTION_INACTIVE: "suscripción inactiva", UNSUBSCRIBED: "baja", NO_MATCHING_RULE: "sin automatización aplicable", AUTOMATION_PAUSED: "automatización en pausa", NO_REVIEW_URL: "falta enlace de reseñas", INVALID_EMAIL: "email no válido", BOUNCED: "email rechazado antes" };

export function CsvImport({ onDone }: { onDone: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [createRequests, setCreateRequests] = useState(true);
  const [legal, setLegal] = useState(false);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [report, setReport] = useState<Report | null>(null);

  if (report)
    return (
      <div className="space-y-4">
        <Alert tone="ok" title="Importación completada">{report.totalRows} filas procesadas.</Alert>
        <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          {[["Nuevos", report.created], ["Actualizados", report.updated], ["Duplicados en el archivo", report.duplicatesInFile], ["Filas con errores", report.invalid.length]].map(([l, n]) => (
            <div key={l as string} className="rounded-lg border border-ink-200 p-3"><dt className="text-xs text-ink-500">{l}</dt><dd className="mt-1 font-display text-xl font-semibold">{n}</dd></div>
          ))}
        </dl>
        {report.requests ? (
          <div className="rounded-lg bg-cream-200/70 p-4 text-sm">
            <p><strong>{report.requests.created}</strong> solicitudes creadas · {report.requests.skipped} omitidas · {report.requests.rejected} rechazadas</p>
            {Object.keys(report.requests.reasons).length ? (
              <p className="mt-1 text-xs text-ink-600">Motivos: {Object.entries(report.requests.reasons).map(([k, n]) => `${REASONS[k] ?? k} (${n})`).join(", ")}</p>
            ) : null}
          </div>
        ) : null}
        {report.invalid.length ? (
          <div className="max-h-48 overflow-y-auto rounded-lg border border-ink-200">
            <table className="w-full text-sm"><tbody>{report.invalid.map((i) => <tr key={i.row} className="border-b border-ink-100"><td className="px-3 py-2 text-ink-500">Fila {i.row}</td><td className="px-3 py-2">{i.reason}</td></tr>)}</tbody></table>
          </div>
        ) : null}
        <div className="flex justify-end"><Button onClick={onDone}>Cerrar</Button></div>
      </div>
    );

  return (
    <div className="space-y-4">
      <p className="text-sm text-ink-600">Columnas reconocidas: <code>nombre</code>, <code>email</code> (obligatorias), <code>servicio</code>, <code>fecha</code> (AAAA-MM-DD o DD/MM/AAAA), <code>telefono</code>, <code>notas</code>, <code>etiquetas</code>, <code>id</code>. Separador coma o punto y coma. Máx. 2.000 filas.</p>
      <a className="text-sm font-medium underline" href={`data:text/csv;charset=utf-8,${encodeURIComponent("nombre;email;servicio;fecha\nLaura Martín;laura@ejemplo.es;Limpieza dental;2026-10-30\n")}`} download="plantilla-clientes.csv">Descargar plantilla CSV</a>
      <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-ink-300 bg-cream-50 px-4 py-8 text-center text-sm hover:border-ink-500">
        <FileUp className="h-6 w-6 text-ink-400" />
        <span className="font-medium">{file ? file.name : "Selecciona un archivo .csv"}</span>
        {file ? <span className="text-xs text-ink-500">{(file.size / 1024).toFixed(1)} KB</span> : null}
        <input type="file" accept=".csv,text/csv" className="sr-only" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
      </label>
      <Checkbox checked={createRequests} onChange={(e) => setCreateRequests(e.target.checked)} label="Generar solicitudes de reseña para los clientes importados (según la automatización)" />
      <Checkbox checked={legal} onChange={(e) => setLegal(e.target.checked)} label="Confirmo que estas personas son clientes míos y tengo base legal para contactarles (art. 21.2 LSSI-CE y RGPD)." />
      {err ? <Alert tone="bad">{err}</Alert> : null}
      <div className="flex justify-end">
        <Button
          loading={loading}
          disabled={!file || !legal}
          onClick={async () => {
            if (!file) return;
            if (file.size > 2_000_000) return setErr("El archivo supera 2 MB.");
            setLoading(true);
            setErr(null);
            try {
              const csv = await file.text();
              const r = await api<{ report: Report }>("/api/v1/customers/import", { body: { csv, createRequests, legalBasisConfirmed: true } });
              setReport(r.report);
            } catch (e) {
              setErr((e as ApiError).message);
            }
            setLoading(false);
          }}
        >
          Importar
        </Button>
      </div>
    </div>
  );
}

"use client";

import { AlertCircle, ArrowLeft, ArrowRight, CheckCircle2, Download, FileSpreadsheet, UploadCloud } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Button, buttonClass } from "@/components/ui/button";
import { Field, Select } from "@/components/ui/form";
import { Card, CardHeader, Notice } from "@/components/ui/primitives";
import { IMPORT_FIELDS, attributeKeyFromHeader, type ColumnMapping } from "@/domain/csv/import";
import { MARKETPLACE_OPTIONS, platformName } from "@/domain/marketplaces/profiles";
import { QUOTA_MESSAGES } from "@/domain/plans";
import { CONDITION_OPTIONS, CURRENCIES, TONES, TONE_LABELS } from "@/domain/product";
import { api, errorMessage } from "@/lib/api-client";
import { cn, formatBytes, formatNumber } from "@/lib/utils";
import type { TemplateOption } from "./listing-editor";

type Quota = { allowed: true } | { allowed: false; reason: string };
type Analysis = {
  importId: string;
  filename: string;
  headers: string[];
  totalRows: number;
  suggestedMapping: ColumnMapping;
  preview: Record<string, string>[];
  quota: Quota;
  limits: { maxRows: number; bulkRemaining: number; remaining: number };
};
type Issue = { row: number; field: string; message: string };
type Validation = { totalRows: number; validRows: number; invalidRows: number; duplicateRows: number; errors: Issue[]; warnings: Issue[]; truncated: boolean; quota: Quota };

const STEPS = ["Subir CSV", "Asignar columnas", "Revisar y confirmar"];

export function ImportWizard({ templates }: { templates: TemplateOption[] }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [mapping, setMapping] = useState<ColumnMapping>({});
  const [defaults, setDefaults] = useState({ condition: "good", currency: "EUR" });
  const [validation, setValidation] = useState<Validation | null>(null);
  const [target, setTarget] = useState("p:generic");
  const [tone, setTone] = useState("");

  async function upload(file: File | undefined) {
    if (!file) return;
    setError(null);
    if (!/\.(csv|txt)$/i.test(file.name)) return void setError("Selecciona un archivo con extensión .csv.");
    if (file.size > 5 * 1024 * 1024) return void setError(`El archivo pesa ${formatBytes(file.size)}. El máximo es 5 MB.`);
    setBusy(true);
    try {
      const formData = new FormData();
      formData.set("file", file);
      const result = await api<Analysis>("/api/imports", { formData });
      setAnalysis(result);
      setMapping(result.suggestedMapping);
      setValidation(null);
      setStep(1);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  // Si el usuario eligió un archivo antes de que la página terminara de cargar (hidratación),
  // el evento change se habría perdido: se procesa aquí.
  useEffect(() => {
    const pending = input.current?.files?.[0];
    if (!pending) return;
    const timer = setTimeout(() => void upload(pending), 0);
    return () => clearTimeout(timer);
  }, []);

  async function validate() {
    if (!analysis) return;
    setError(null);
    if (!Object.values(mapping).includes("name")) return void setError("Asigna una columna al campo «Nombre del producto» (es el único obligatorio).");
    setBusy(true);
    try {
      setValidation(await api<Validation>("/api/imports/validate", { body: { importId: analysis.importId, mapping, defaults } }));
      setStep(2);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  }

  async function confirm() {
    if (!analysis) return;
    setBusy(true);
    setError(null);
    const [kind, value] = [target.slice(0, 1), target.slice(2)];
    const template = kind === "t" ? templates.find((item) => item.id === value) : null;
    try {
      const result = await api<{ jobId: string }>("/api/jobs", {
        body: { importId: analysis.importId, mapping, defaults, filename: analysis.filename, options: { platform: template ? template.platform : value, templateId: template ? template.id : null, tone: tone || undefined } },
      });
      router.push(`/app/masivo/${result.jobId}?iniciar=1`);
    } catch (cause) {
      setError(errorMessage(cause));
      setBusy(false);
    }
  }

  /** Cada campo solo puede asignarse a una columna: al elegirlo se libera de la anterior. */
  function assign(header: string, value: string) {
    setMapping((current) => {
      const next = { ...current };
      if (value && !value.startsWith("attr:")) {
        for (const key of Object.keys(next)) if (next[key] === value) next[key] = "";
      }
      next[header] = value;
      return next;
    });
  }

  const quotaProblem = (quota: Quota | undefined) => (quota && !quota.allowed ? (QUOTA_MESSAGES[quota.reason] ?? "No hay cuota suficiente.") : null);

  return (
    <Card>
      <div className="border-b border-line px-5 py-4">
        <ol className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
          {STEPS.map((label, index) => (
            <li key={label} className={cn("flex items-center gap-2 font-medium", index === step ? "text-ink" : "text-muted")} aria-current={index === step ? "step" : undefined}>
              {index < step ? <CheckCircle2 className="size-5 text-success" aria-hidden /> : <span className={cn("flex size-5 items-center justify-center rounded-full text-[11px] font-bold", index === step ? "bg-ink text-white" : "bg-sunken")}>{index + 1}</span>}
              {label}
              {index < STEPS.length - 1 ? <span className="ml-2 hidden h-px w-8 bg-line-strong sm:block" aria-hidden /> : null}
            </li>
          ))}
        </ol>
      </div>

      <div className="p-5">
        {error ? (
          <Notice tone="danger" className="mb-4">
            <span role="alert">{error}</span>
          </Notice>
        ) : null}

        {step === 0 ? (
          <>
            <div
              onDragOver={(event) => {
                event.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(event) => {
                event.preventDefault();
                setDragging(false);
                void upload(event.dataTransfer.files[0]);
              }}
              className={cn("flex flex-col items-center rounded-2xl border-2 border-dashed px-6 py-12 text-center transition-colors", dragging ? "border-brand bg-brand-soft/50" : "border-line-strong bg-paper")}
            >
              <UploadCloud className="size-9 text-muted" aria-hidden />
              <p className="mt-4 text-base font-semibold">Arrastra aquí tu archivo CSV</p>
              <p className="mt-1 text-sm text-muted">o selecciónalo desde tu equipo · máximo 5 MB · una fila de cabeceras</p>
              <div className="mt-5 flex flex-wrap justify-center gap-2">
                <Button onClick={() => input.current?.click()} loading={busy}>
                  <FileSpreadsheet aria-hidden /> Seleccionar archivo
                </Button>
                <a href="/api/imports/template" className={buttonClass({ variant: "secondary" })} download>
                  <Download aria-hidden /> Descargar plantilla CSV
                </a>
              </div>
              <input ref={input} type="file" accept=".csv,text/csv,text/plain" hidden onChange={(event) => upload(event.target.files?.[0])} aria-label="Archivo CSV" />
            </div>
            <ul className="mt-5 grid gap-2 text-[13px] text-muted sm:grid-cols-3">
              <li>· Solo el nombre del producto es obligatorio.</li>
              <li>· Se detecta el separador (coma o punto y coma) automáticamente.</li>
              <li>· Las columnas extra pueden importarse como atributos.</li>
            </ul>
          </>
        ) : null}

        {step === 1 && analysis ? (
          <>
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm">
                <strong>{analysis.filename}</strong> · {formatNumber(analysis.totalRows)} filas · {analysis.headers.length} columnas
              </p>
              <p className="text-[13px] text-muted">Límite por archivo de tu plan: {formatNumber(analysis.limits.maxRows)} filas</p>
            </div>
            {quotaProblem(analysis.quota) ? (
              <Notice tone="warning" className="mb-4">
                {quotaProblem(analysis.quota)} Puedes revisar el archivo, pero no podrás lanzar la generación con todas sus filas.
              </Notice>
            ) : null}

            <div className="overflow-x-auto rounded-xl border border-line">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead className="border-b border-line bg-paper text-[12px] uppercase tracking-wider text-faint">
                  <tr>
                    <th className="px-4 py-2.5 font-semibold">Columna del CSV</th>
                    <th className="px-4 py-2.5 font-semibold">Ejemplo</th>
                    <th className="w-72 px-4 py-2.5 font-semibold">Se importa como</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {analysis.headers.map((header) => (
                    <tr key={header}>
                      <td className="px-4 py-2.5 font-medium">{header}</td>
                      <td className="max-w-56 truncate px-4 py-2.5 text-muted">{analysis.preview.map((row) => row[header]).find((value) => value?.trim()) ?? "—"}</td>
                      <td className="px-4 py-2">
                        <Select aria-label={`Destino de la columna ${header}`} value={mapping[header] ?? ""} onChange={(event) => assign(header, event.target.value)} className="h-9">
                          <option value="">No importar</option>
                          <optgroup label="Campos del producto">
                            {IMPORT_FIELDS.map((field) => (
                              <option key={field.key} value={field.key}>
                                {field.label}
                                {field.required ? " *" : ""}
                              </option>
                            ))}
                          </optgroup>
                          <optgroup label="Otros">
                            <option value={`attr:${attributeKeyFromHeader(header)}`}>Atributo «{header}»</option>
                          </optgroup>
                        </Select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:max-w-xl">
              <Field label="Estado para filas sin estado" htmlFor="import-condition" hint="Se aplica solo si la fila no indica un estado.">
                <Select id="import-condition" value={defaults.condition} onChange={(event) => setDefaults({ ...defaults, condition: event.target.value })}>
                  {CONDITION_OPTIONS.filter((option) => option.value !== "custom").map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Moneda por defecto" htmlFor="import-currency">
                <Select id="import-currency" value={defaults.currency} onChange={(event) => setDefaults({ ...defaults, currency: event.target.value })}>
                  {CURRENCIES.map((code) => (
                    <option key={code} value={code}>
                      {code}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>

            <details className="mt-5 rounded-xl border border-line bg-paper px-4 py-3">
              <summary className="text-sm font-medium">Vista previa de las primeras filas</summary>
              <div className="mt-3 overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="text-faint">
                    <tr>
                      {analysis.headers.map((header) => (
                        <th key={header} className="whitespace-nowrap px-2 py-1.5 font-semibold">
                          {header}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {analysis.preview.map((row, index) => (
                      <tr key={index}>
                        {analysis.headers.map((header) => (
                          <td key={header} className="max-w-48 truncate px-2 py-1.5 text-ink-soft">
                            {row[header] ?? ""}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>

            <div className="mt-6 flex justify-between gap-2">
              <Button variant="secondary" onClick={() => setStep(0)} disabled={busy}>
                <ArrowLeft aria-hidden /> Cambiar archivo
              </Button>
              <Button onClick={validate} loading={busy}>
                Validar filas <ArrowRight aria-hidden />
              </Button>
            </div>
          </>
        ) : null}

        {step === 2 && analysis && validation ? (
          <>
            <div className="grid gap-3 sm:grid-cols-4">
              {[
                ["Filas en el archivo", validation.totalRows, "text-ink"],
                ["Válidas", validation.validRows, "text-success"],
                ["Con errores", validation.invalidRows, validation.invalidRows ? "text-danger" : "text-ink"],
                ["Duplicadas", validation.duplicateRows, validation.duplicateRows ? "text-warning" : "text-ink"],
              ].map(([label, value, color]) => (
                <div key={label as string} className="rounded-xl border border-line bg-paper px-4 py-3">
                  <p className="text-xs text-muted">{label}</p>
                  <p className={cn("mt-1 font-display text-2xl font-semibold tabular-nums", color as string)}>{formatNumber(value as number)}</p>
                </div>
              ))}
            </div>

            {validation.errors.length > 0 ? (
              <div className="mt-5">
                <h3 className="flex items-center gap-2 font-sans text-sm font-semibold tracking-normal">
                  <AlertCircle className="size-4 text-danger" aria-hidden /> Filas que no se importarán
                </h3>
                <ul className="mt-2 max-h-56 divide-y divide-line overflow-y-auto rounded-xl border border-line text-[13px]">
                  {validation.errors.map((issue, index) => (
                    <li key={`${issue.row}-${issue.field}-${index}`} className="flex gap-3 px-3.5 py-2">
                      <span className="w-16 shrink-0 font-medium tabular-nums">Fila {issue.row}</span>
                      <span className="text-ink-soft">{issue.message}</span>
                    </li>
                  ))}
                </ul>
                {validation.truncated ? <p className="mt-1.5 text-xs text-muted">Se muestran los primeros 200 avisos.</p> : null}
              </div>
            ) : null}

            {validation.warnings.length > 0 ? (
              <details className="mt-4 rounded-xl border border-warning/25 bg-warning-soft px-4 py-3 text-[13px] text-warning">
                <summary className="font-medium">{validation.warnings.length} avisos (no impiden la importación)</summary>
                <ul className="mt-2 space-y-1">
                  {validation.warnings.map((issue, index) => (
                    <li key={`${issue.row}-${index}`}>
                      Fila {issue.row}: {issue.message}
                    </li>
                  ))}
                </ul>
              </details>
            ) : null}

            {validation.validRows > 0 ? (
              <>
                <h3 className="mt-6 font-sans text-sm font-semibold tracking-normal">Opciones de generación</h3>
                <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:max-w-xl">
                  <Field label="Plataforma o plantilla" htmlFor="import-target">
                    <Select id="import-target" value={target} onChange={(event) => setTarget(event.target.value)}>
                      <optgroup label="Perfiles de marketplace">
                        {MARKETPLACE_OPTIONS.map((option) => (
                          <option key={option.value} value={`p:${option.value}`}>
                            {option.label}
                          </option>
                        ))}
                      </optgroup>
                      {templates.length > 0 ? (
                        <optgroup label="Mis plantillas">
                          {templates.map((template) => (
                            <option key={template.id} value={`t:${template.id}`}>
                              {template.name} ({platformName(template.platform)})
                            </option>
                          ))}
                        </optgroup>
                      ) : null}
                    </Select>
                  </Field>
                  <Field label="Tono" htmlFor="import-tone">
                    <Select id="import-tone" value={tone} onChange={(event) => setTone(event.target.value)}>
                      <option value="">El habitual de la plataforma</option>
                      {TONES.map((value) => (
                        <option key={value} value={value}>
                          {TONE_LABELS[value]}
                        </option>
                      ))}
                    </Select>
                  </Field>
                </div>
              </>
            ) : null}

            {quotaProblem(validation.quota) ? (
              <Notice tone="danger" className="mt-5">
                {quotaProblem(validation.quota)}
              </Notice>
            ) : validation.validRows > 0 ? (
              <Notice tone="info" className="mt-5">
                Se crearán {formatNumber(validation.validRows)} productos con su anuncio y se consumirán <strong>{formatNumber(validation.validRows)} generaciones</strong> de tu plan. Los productos cuyo SKU ya exista en tu catálogo se reutilizan en lugar de duplicarse.
              </Notice>
            ) : (
              <Notice tone="danger" className="mt-5">
                No hay ninguna fila válida. Corrige el archivo o el mapeo de columnas.
              </Notice>
            )}

            <div className="mt-6 flex justify-between gap-2">
              <Button variant="secondary" onClick={() => setStep(1)} disabled={busy}>
                <ArrowLeft aria-hidden /> Volver al mapeo
              </Button>
              <Button variant="brand" onClick={confirm} loading={busy} disabled={validation.validRows === 0 || !validation.quota.allowed}>
                Confirmar y generar {formatNumber(validation.validRows)} anuncios
              </Button>
            </div>
          </>
        ) : null}
      </div>
    </Card>
  );
}

export function PlanRequired({ planName }: { planName: string }) {
  return (
    <Card>
      <CardHeader title="Generación masiva no incluida en tu plan" description={`Tu plan actual es ${planName}.`} />
      <div className="space-y-3 p-5 text-sm leading-relaxed text-ink-soft">
        <p>La importación de CSV y la generación de anuncios por lotes están disponibles a partir del plan Pro.</p>
        <p className="text-muted">Mientras tanto puedes descargar la plantilla CSV para ir preparando tu inventario y seguir creando anuncios uno a uno.</p>
        <div className="flex flex-wrap gap-2 pt-1">
          <a href="/app/cuenta#plan" className={buttonClass({ variant: "primary" })}>
            Ver planes
          </a>
          <a href="/api/imports/template" className={buttonClass({ variant: "secondary" })} download>
            <Download aria-hidden /> Descargar plantilla CSV
          </a>
        </div>
      </div>
    </Card>
  );
}


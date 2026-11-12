"use client";

import { AlertTriangle, ChevronDown, Download, Heart, History, Info, Minus, Plus, RefreshCw, Repeat2, Save, Sparkles, Trash2, Type, Wand2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { CopyButton, copyText } from "@/components/ui/copy-button";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { ConfirmDialog, Dialog, Menu, MenuContent, MenuItem, MenuTrigger, Tooltip } from "@/components/ui/overlays";
import { Badge, Card, CardHeader, Notice } from "@/components/ui/primitives";
import { MARKETPLACE_OPTIONS, platformName } from "@/domain/marketplaces/profiles";
import type { UsageState } from "@/domain/plans";
import { LENGTHS, LENGTH_LABELS, LISTING_STATUS_LABELS, TONES, TONE_LABELS, type Language, type Length, type ListingStatus, type Tone } from "@/domain/product";
import { htmlToPlain, looksLikeHtml } from "@/domain/text";
import { ApiClientError, api, errorMessage, newIdempotencyKey } from "@/lib/api-client";
import { cn, formatDateTime, formatNumber } from "@/lib/utils";

export type EditorContent = {
  title: string;
  description: string;
  shortDescription: string;
  highlights: string[];
  sellingPoints: string[];
  keywords: string[];
  conditionInfo: string;
  cta: string;
};

export type EditorOptions = { platform: string; templateId: string | null; tone: Tone; length: Length; language: Language; titleVariant: number };
export type TemplateOption = { id: string; name: string; platform: string };
export type ProfileInfo = { name: string; titleMaxLength: number; descriptionMaxLength: number; rules: string[] };
type Version = { id: string; version_number: number; title: string; description: string; platform: string; generation_method: string; created_at: string };

type GenerateResponse = {
  listing: EditorContent & { missingInfo: string[]; warnings: string[]; method: "template" | "ai" };
  options: EditorOptions;
  usage: UsageState;
  profile: ProfileInfo;
};

type Props = {
  product: { id: string; name: string };
  templates: TemplateOption[];
  usage: { used: number; limit: number; remaining: number };
  providerLabel: string;
  initialOptions: EditorOptions;
  /** Anuncio ya guardado (modo edición). Sin él, el editor trabaja sobre un borrador nuevo. */
  saved?: { id: string; content: EditorContent; status: ListingStatus; isFavorite: boolean; method: string; version: number; updatedAt: string; profile: ProfileInfo };
  /** Lanza la primera generación automáticamente al montar (flujo "Guardar y generar"). */
  autoGenerate?: boolean;
};

const EMPTY: EditorContent = { title: "", description: "", shortDescription: "", highlights: [], sellingPoints: [], keywords: [], conditionInfo: "", cta: "" };
const METHOD_LABEL: Record<string, string> = { template: "Plantillas", ai: "IA", manual: "Manual" };

function Counter({ value, max }: { value: number; max?: number }) {
  const over = max !== undefined && value > max;
  return (
    <span className={cn("text-xs tabular-nums", over ? "font-semibold text-danger" : "text-faint")}>
      {formatNumber(value)}
      {max !== undefined ? ` / ${formatNumber(max)}` : ""}
    </span>
  );
}

const lines = (value: string) => value.split("\n").map((line) => line.trim()).filter(Boolean);

export function ListingEditor({ product, templates, usage: initialUsage, providerLabel, initialOptions, saved, autoGenerate }: Props) {
  const router = useRouter();
  const [content, setContent] = useState<EditorContent>(saved?.content ?? EMPTY);
  const [options, setOptions] = useState<EditorOptions>(initialOptions);
  const [profile, setProfile] = useState<ProfileInfo | null>(saved?.profile ?? null);
  const [usage, setUsage] = useState(initialUsage);
  const [missingInfo, setMissingInfo] = useState<string[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [method, setMethod] = useState<string>(saved?.method ?? "template");
  const [generated, setGenerated] = useState(Boolean(saved));
  const [dirty, setDirty] = useState(false);
  const [edited, setEdited] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<ListingStatus>(saved?.status ?? "draft");
  const [favorite, setFavorite] = useState(saved?.isFavorite ?? false);
  const [confirm, setConfirm] = useState<{ operation: string; next: Partial<EditorOptions> } | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [versionsOpen, setVersionsOpen] = useState(false);
  const [versions, setVersions] = useState<Version[] | null>(null);
  const [adaptOpen, setAdaptOpen] = useState(false);
  const [adaptTarget, setAdaptTarget] = useState(`${initialOptions.templateId ? `t:${initialOptions.templateId}` : `p:${initialOptions.platform}`}`);

  const outOfQuota = usage.remaining <= 0;
  const plainDescription = looksLikeHtml(content.description) ? htmlToPlain(content.description) : content.description;

  function patch(changes: Partial<EditorContent>) {
    setContent((current) => ({ ...current, ...changes }));
    setDirty(true);
    setEdited(true);
  }

  async function generate(operation: string, next: Partial<EditorOptions> = {}) {
    const requestOptions = { ...options, ...next };
    setBusy(operation);
    setError(null);
    try {
      const result = await api<GenerateResponse>("/api/generate", {
        body: {
          productId: product.id,
          operation,
          options: { platform: requestOptions.platform, templateId: requestOptions.templateId, tone: requestOptions.tone, length: requestOptions.length, language: requestOptions.language, titleVariant: requestOptions.titleVariant },
          idempotencyKey: newIdempotencyKey(),
        },
      });
      const { missingInfo: missing, warnings: warns, method: usedMethod, ...listing } = result.listing;
      // "Mejorar el título" solo sustituye el título y conserva el resto del texto.
      setContent((current) => (operation === "improve_title" ? { ...current, title: listing.title } : listing));
      setOptions({ ...requestOptions, tone: result.options.tone, length: result.options.length, language: result.options.language, platform: result.options.platform, templateId: result.options.templateId });
      setProfile(result.profile);
      setMissingInfo(missing);
      setWarnings(warns);
      setMethod(usedMethod);
      setUsage({ used: result.usage.used, limit: result.usage.monthlyListingLimit, remaining: result.usage.remaining });
      setGenerated(true);
      setDirty(true);
      setEdited(false);
      router.refresh(); // actualiza el contador de consumo del menú lateral
    } catch (cause) {
      if (cause instanceof ApiClientError && cause.code === "limit_reached") setUsage((current) => ({ ...current, remaining: 0 }));
      setError(errorMessage(cause));
    } finally {
      setBusy(null);
    }
  }

  /** Si hay cambios manuales, pide confirmación antes de sobrescribirlos. */
  function request(operation: string, next: Partial<EditorOptions> = {}) {
    if (edited && operation !== "improve_title") setConfirm({ operation, next });
    else void generate(operation, next);
  }

  useEffect(() => {
    if (!autoGenerate || saved) return;
    // Diferido y cancelable: en modo estricto (desarrollo) el efecto se monta dos veces
    // y así se evita lanzar —y descontar— dos generaciones.
    const timer = setTimeout(() => void generate("generate"), 0);
    return () => clearTimeout(timer);
    // Solo en el montaje inicial.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!dirty) return;
    const handler = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);

  async function save(nextStatus: ListingStatus = status) {
    if (!content.title.trim()) return void setError("El título es obligatorio.");
    setBusy("save");
    setError(null);
    try {
      if (saved) {
        await api(`/api/listings/${saved.id}`, { method: "PATCH", body: { ...content, status: nextStatus, tone: options.tone, language: options.language, generationMethod: edited ? "manual" : method } });
        setStatus(nextStatus);
        setDirty(false);
        toast.success("Anuncio guardado");
        router.refresh();
      } else {
        const created = await api<{ id: string }>("/api/listings", {
          body: { ...content, productId: product.id, platform: options.platform, templateId: options.templateId, tone: options.tone, language: options.language, status: nextStatus, generationMethod: method },
        });
        setDirty(false);
        toast.success("Anuncio guardado");
        router.push(`/app/anuncios/${created.id}`);
      }
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(null);
    }
  }

  function fullText() {
    return [content.title, "", plainDescription, content.keywords.length ? `\nPalabras clave: ${content.keywords.join(", ")}` : ""].filter((part) => part !== "").join("\n");
  }

  function download() {
    const blob = new Blob([fullText()], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${product.name.replace(/[^\p{L}\p{N}]+/gu, "-").slice(0, 60) || "anuncio"}.txt`;
    link.click();
    URL.revokeObjectURL(url);
  }

  async function toggleFavorite() {
    if (!saved) return;
    const next = !favorite;
    setFavorite(next);
    try {
      await api(`/api/listings/${saved.id}/favorite`, { method: next ? "PUT" : "DELETE" });
    } catch (cause) {
      setFavorite(!next);
      toast.error(errorMessage(cause));
    }
  }

  async function openVersions() {
    if (!saved) return;
    setVersionsOpen(true);
    setVersions(null);
    try {
      setVersions(await api<Version[]>(`/api/listings/${saved.id}/versions`));
    } catch (cause) {
      toast.error(errorMessage(cause));
      setVersionsOpen(false);
    }
  }

  async function restore(versionNumber: number) {
    if (!saved) return;
    try {
      await api(`/api/listings/${saved.id}/versions`, { body: { versionNumber } });
      toast.success(`Versión ${versionNumber} restaurada`);
      setDirty(false);
      window.location.reload();
    } catch (cause) {
      toast.error(errorMessage(cause));
    }
  }

  async function adapt() {
    if (!saved) return;
    const [kind, value] = [adaptTarget.slice(0, 1), adaptTarget.slice(2)];
    const template = kind === "t" ? templates.find((item) => item.id === value) : null;
    setBusy("adapt");
    try {
      const result = await api<{ warnings: string[]; profileName: string }>(`/api/listings/${saved.id}/adapt`, { body: { platform: template ? template.platform : value, templateId: template ? template.id : null } });
      toast.success(`Anuncio adaptado a ${result.profileName}`, { description: result.warnings.join(" ") || undefined });
      setDirty(false);
      window.location.reload();
    } catch (cause) {
      toast.error(errorMessage(cause));
    } finally {
      setBusy(null);
    }
  }

  async function duplicate() {
    if (!saved) return;
    try {
      const copy = await api<{ id: string }>(`/api/listings/${saved.id}/duplicate`, { method: "POST" });
      toast.success("Anuncio duplicado");
      router.push(`/app/anuncios/${copy.id}`);
    } catch (cause) {
      toast.error(errorMessage(cause));
    }
  }

  const lengthIndex = LENGTHS.indexOf(options.length);
  const working = busy !== null;
  const targetValue = options.templateId ? `t:${options.templateId}` : `p:${options.platform}`;

  const targetOptions = (
    <>
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
    </>
  );

  return (
    <div className="space-y-5">
      {/* Opciones de generación */}
      <Card>
        <CardHeader
          title={saved ? "Volver a generar" : "Opciones de generación"}
          description={
            <>
              Motor: {providerLabel}. Te quedan <strong className="text-ink">{formatNumber(usage.remaining)}</strong> de {formatNumber(usage.limit)} generaciones este mes.
            </>
          }
        />
        <div className="grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_0.8fr_auto] lg:items-end">
          <Field label="Plataforma o plantilla" htmlFor="option-target">
            <Select
              id="option-target"
              value={targetValue}
              disabled={working || Boolean(saved)}
              onChange={(event) => {
                const [kind, value] = [event.target.value.slice(0, 1), event.target.value.slice(2)];
                const template = kind === "t" ? templates.find((item) => item.id === value) : null;
                setOptions((current) => ({ ...current, platform: template ? template.platform : value, templateId: template ? template.id : null }));
              }}
            >
              {targetOptions}
            </Select>
          </Field>
          <Field label="Tono" htmlFor="option-tone">
            <Select id="option-tone" value={options.tone} disabled={working} onChange={(event) => setOptions((current) => ({ ...current, tone: event.target.value as Tone }))}>
              {TONES.map((tone) => (
                <option key={tone} value={tone}>
                  {TONE_LABELS[tone]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Extensión" htmlFor="option-length">
            <Select id="option-length" value={options.length} disabled={working} onChange={(event) => setOptions((current) => ({ ...current, length: event.target.value as Length }))}>
              {LENGTHS.map((length) => (
                <option key={length} value={length}>
                  {LENGTH_LABELS[length]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Idioma" htmlFor="option-language">
            <Select id="option-language" value={options.language} disabled={working} onChange={(event) => setOptions((current) => ({ ...current, language: event.target.value as Language }))}>
              <option value="es">Español</option>
              <option value="en">Inglés</option>
            </Select>
          </Field>
          <Button variant="brand" onClick={() => request(generated ? "regenerate" : "generate")} loading={busy === "generate" || busy === "regenerate"} disabled={working || outOfQuota}>
            {generated ? <RefreshCw aria-hidden /> : <Sparkles aria-hidden />}
            {generated ? "Volver a generar" : "Generar anuncio"}
          </Button>
        </div>
        {saved ? (
          <p className="border-t border-line px-5 py-3 text-[13px] text-muted">
            Para llevar este anuncio a otra plataforma sin regenerarlo usa{" "}
            <button type="button" className="font-medium text-brand-strong hover:underline" onClick={() => setAdaptOpen(true)}>
              Cambiar plantilla
            </button>
            .
          </p>
        ) : null}
      </Card>

      {outOfQuota ? (
        <Notice tone="danger" title="Has alcanzado el límite mensual de generaciones">
          Puedes seguir editando, guardando, copiando y exportando tus anuncios. <Link href="/app/cuenta#plan">Ver mi plan y fecha de renovación</Link>
        </Notice>
      ) : null}
      {error ? (
        <Notice tone="danger">
          <span role="alert">{error}</span>
        </Notice>
      ) : null}

      {!generated && working ? (
        <Card className="p-6" aria-busy="true">
          <p className="flex items-center gap-2 text-sm font-medium" role="status">
            <Sparkles className="size-4 animate-pulse text-brand" aria-hidden /> Generando el anuncio…
          </p>
          <div className="mt-5 space-y-3">
            <div className="skeleton h-9 w-3/4" />
            <div className="skeleton h-40" />
            <div className="skeleton h-16" />
          </div>
        </Card>
      ) : null}

      {generated ? (
        <>
          {missingInfo.length > 0 ? (
            <Notice tone="warning" title="Información que mejoraría este anuncio">
              <ul className="mt-1 list-inside list-disc space-y-0.5">
                {missingInfo.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
              <p className="mt-2">
                El generador no inventa datos: lo que falta se ha omitido.{" "}
                <Link href={`/app/productos/${product.id}`}>Completar el producto</Link>
              </p>
            </Notice>
          ) : null}
          {warnings.length > 0 ? (
            <Notice tone="info">
              <span className="flex gap-2">
                <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
                <span>{warnings.join(" ")}</span>
              </span>
            </Notice>
          ) : null}

          <Card className={cn("transition-opacity", working && busy !== "save" && "opacity-60")} aria-busy={working}>
            <CardHeader
              title="Resultado"
              description={
                <span className="flex flex-wrap items-center gap-2">
                  <Badge>{profile?.name ?? platformName(options.platform)}</Badge>
                  <Badge tone={edited ? "neutral" : method === "ai" ? "info" : "neutral"}>{edited ? "Editado a mano" : `Generado con ${METHOD_LABEL[method] ?? method}`}</Badge>
                  {saved ? <span className="text-xs">Versión {saved.version} · {formatDateTime(saved.updatedAt)}</span> : null}
                  {dirty ? <span className="text-xs font-medium text-warning">Cambios sin guardar</span> : null}
                </span>
              }
              action={
                <div className="flex flex-wrap gap-1.5">
                  <Tooltip content="Propone otra estructura de título. Consume 1 generación.">
                    <span>
                      <Button size="sm" variant="secondary" disabled={working || outOfQuota} loading={busy === "improve_title"} onClick={() => request("improve_title", { titleVariant: options.titleVariant + 1 })}>
                        <Type aria-hidden /> Mejorar título
                      </Button>
                    </span>
                  </Tooltip>
                  <Button size="sm" variant="secondary" disabled={working || outOfQuota || lengthIndex <= 0} loading={busy === "shorten"} onClick={() => request("shorten", { length: LENGTHS[lengthIndex - 1] })}>
                    <Minus aria-hidden /> Acortar
                  </Button>
                  <Button size="sm" variant="secondary" disabled={working || outOfQuota || lengthIndex >= LENGTHS.length - 1} loading={busy === "expand"} onClick={() => request("expand", { length: LENGTHS[lengthIndex + 1] })}>
                    <Plus aria-hidden /> Ampliar
                  </Button>
                  <Menu>
                    <MenuTrigger asChild>
                      <Button size="sm" variant="secondary" disabled={working || outOfQuota} loading={busy === "tone"}>
                        <Wand2 aria-hidden /> Cambiar tono <ChevronDown aria-hidden />
                      </Button>
                    </MenuTrigger>
                    <MenuContent>
                      {TONES.map((tone) => (
                        <MenuItem key={tone} disabled={tone === options.tone} onSelect={() => request("tone", { tone })}>
                          {TONE_LABELS[tone]}
                          {tone === options.tone ? " (actual)" : ""}
                        </MenuItem>
                      ))}
                    </MenuContent>
                  </Menu>
                </div>
              }
            />
            <div className="space-y-5 p-5">
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label htmlFor="listing-title" className="text-[13px] font-medium text-ink-soft">
                    Título comercial
                  </label>
                  <Counter value={content.title.length} max={profile?.titleMaxLength} />
                </div>
                <Input id="listing-title" value={content.title} onChange={(event) => patch({ title: event.target.value })} maxLength={300} className="h-11 text-base font-medium" />
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label htmlFor="listing-description" className="text-[13px] font-medium text-ink-soft">
                    Descripción completa
                  </label>
                  <Counter value={content.description.length} max={profile?.descriptionMaxLength} />
                </div>
                <Textarea id="listing-description" value={content.description} onChange={(event) => patch({ description: event.target.value })} rows={14} maxLength={20000} className="font-[450]" />
                {looksLikeHtml(content.description) ? <p className="text-xs text-muted">Este perfil usa HTML sencillo. Al copiar la descripción se copia tal cual, lista para pegar en el editor HTML de la plataforma.</p> : null}
              </div>

              <div className="grid gap-5 lg:grid-cols-2">
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label htmlFor="listing-short" className="text-[13px] font-medium text-ink-soft">
                      Descripción breve
                    </label>
                    <Counter value={content.shortDescription.length} max={600} />
                  </div>
                  <Textarea id="listing-short" value={content.shortDescription} onChange={(event) => patch({ shortDescription: event.target.value })} rows={3} maxLength={600} />
                </div>
                <Field label="Información del estado" htmlFor="listing-condition">
                  <Textarea id="listing-condition" value={content.conditionInfo} onChange={(event) => patch({ conditionInfo: event.target.value })} rows={3} maxLength={2000} />
                </Field>
                <Field label="Características destacadas" htmlFor="listing-highlights" hint="Una por línea.">
                  <Textarea id="listing-highlights" value={content.highlights.join("\n")} onChange={(event) => patch({ highlights: lines(event.target.value).slice(0, 30) })} rows={5} />
                </Field>
                <Field label="Puntos de venta" htmlFor="listing-points" hint="Uno por línea.">
                  <Textarea id="listing-points" value={content.sellingPoints.join("\n")} onChange={(event) => patch({ sellingPoints: lines(event.target.value).slice(0, 10) })} rows={5} />
                </Field>
                <Field label="Palabras clave" htmlFor="listing-keywords" hint="Separadas por comas.">
                  <Input id="listing-keywords" defaultValue={content.keywords.join(", ")} key={content.keywords.join("|")} onBlur={(event) => patch({ keywords: event.target.value.split(",").map((keyword) => keyword.trim().slice(0, 60)).filter(Boolean).slice(0, 30) })} />
                </Field>
                <Field label="Llamada a la acción" htmlFor="listing-cta" optional>
                  <Input id="listing-cta" value={content.cta} onChange={(event) => patch({ cta: event.target.value })} maxLength={300} />
                </Field>
              </div>

              {profile && profile.rules.length > 0 ? (
                <details className="rounded-xl border border-line bg-paper px-4 py-3 text-[13px] text-muted">
                  <summary className="font-medium text-ink-soft">Reglas de presentación de {profile.name}</summary>
                  <ul className="mt-2 list-inside list-disc space-y-1">
                    {profile.rules.map((rule) => (
                      <li key={rule}>{rule}</li>
                    ))}
                  </ul>
                  <p className="mt-2 flex gap-1.5">
                    <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                    Los límites son orientativos y AnunciaPro no tiene integración oficial con esta plataforma: revisa el anuncio al publicarlo.
                  </p>
                </details>
              ) : null}
            </div>
          </Card>

          <div className="sticky bottom-0 z-10 -mx-4 flex flex-wrap items-center gap-2 border-t border-line bg-paper/90 px-4 py-3 backdrop-blur-md sm:-mx-6 sm:px-6">
            <CopyButton label="Copiar título" text={() => content.title} />
            <CopyButton label="Copiar descripción" text={() => content.description} />
            <Button size="sm" variant="secondary" onClick={() => copyText(fullText(), "Anuncio completo copiado")}>
              Copiar todo
            </Button>
            <Button size="sm" variant="secondary" onClick={download}>
              <Download aria-hidden /> Descargar
            </Button>
            {saved ? (
              <>
                <Button size="sm" variant="ghost" onClick={openVersions}>
                  <History aria-hidden /> Versiones
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setAdaptOpen(true)}>
                  <Repeat2 aria-hidden /> Cambiar plantilla
                </Button>
                <Button size="sm" variant="ghost" onClick={duplicate}>
                  Duplicar
                </Button>
                <Button size="sm" variant="ghost" onClick={toggleFavorite} aria-pressed={favorite}>
                  <Heart className={cn(favorite && "fill-brand text-brand")} aria-hidden /> {favorite ? "En favoritos" : "Favorito"}
                </Button>
                <Button size="sm" variant="danger-ghost" onClick={() => setDeleting(true)}>
                  <Trash2 aria-hidden /> Eliminar
                </Button>
              </>
            ) : null}
            <div className="ml-auto flex items-center gap-2">
              <Select aria-label="Estado del anuncio" value={status} onChange={(event) => (saved ? void save(event.target.value as ListingStatus) : setStatus(event.target.value as ListingStatus))} className="h-10 w-36">
                {(Object.keys(LISTING_STATUS_LABELS) as ListingStatus[]).map((value) => (
                  <option key={value} value={value}>
                    {LISTING_STATUS_LABELS[value]}
                  </option>
                ))}
              </Select>
              <Button variant="brand" onClick={() => save()} loading={busy === "save"} disabled={working || (Boolean(saved) && !dirty)}>
                <Save aria-hidden /> {saved ? "Guardar cambios" : "Guardar anuncio"}
              </Button>
            </div>
          </div>
        </>
      ) : null}

      <ConfirmDialog
        open={confirm !== null}
        onOpenChange={(open) => !open && setConfirm(null)}
        title="¿Sustituir el texto actual?"
        description="Has editado el anuncio a mano. Al generar de nuevo se reemplazará el contenido actual por el nuevo resultado."
        confirmLabel="Sustituir"
        variant="primary"
        onConfirm={async () => {
          if (confirm) await generate(confirm.operation, confirm.next);
        }}
      />

      {saved ? (
        <>
          <ConfirmDialog
            open={deleting}
            onOpenChange={setDeleting}
            title="¿Eliminar este anuncio?"
            description="Se eliminará el anuncio y todo su historial de versiones. El producto no se borra. Esta acción no se puede deshacer."
            confirmLabel="Eliminar anuncio"
            onConfirm={async () => {
              try {
                await api(`/api/listings/${saved.id}`, { method: "DELETE" });
                setDirty(false);
                toast.success("Anuncio eliminado");
                router.push("/app/anuncios");
                router.refresh();
              } catch (cause) {
                toast.error(errorMessage(cause));
              }
            }}
          />

          <Dialog open={versionsOpen} onOpenChange={setVersionsOpen} title="Historial de versiones" description="Cada cambio guardado crea una versión. Restaurar una versión no borra las posteriores." size="lg">
            {versions === null ? (
              <div className="space-y-2">
                <div className="skeleton h-16" />
                <div className="skeleton h-16" />
              </div>
            ) : (
              <ul className="divide-y divide-line">
                {versions.map((version) => (
                  <li key={version.id} className="flex items-start gap-3 py-3">
                    <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-sunken text-xs font-semibold tabular-nums">v{version.version_number}</span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{version.title}</p>
                      <p className="mt-0.5 line-clamp-2 text-xs text-muted">{looksLikeHtml(version.description) ? htmlToPlain(version.description) : version.description}</p>
                      <p className="mt-1 text-[11px] text-faint">
                        {formatDateTime(version.created_at)} · {platformName(version.platform)} · {METHOD_LABEL[version.generation_method] ?? version.generation_method}
                      </p>
                    </div>
                    {version.version_number === saved.version ? (
                      <Badge tone="success">Actual</Badge>
                    ) : (
                      <Button size="sm" variant="secondary" onClick={() => restore(version.version_number)}>
                        Restaurar
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Dialog>

          <Dialog
            open={adaptOpen}
            onOpenChange={setAdaptOpen}
            title="Cambiar plantilla"
            description="Adapta el contenido actual a las reglas de otra plataforma (longitud, formato y palabras clave). No consume generaciones y crea una versión nueva."
            size="sm"
            footer={
              <>
                <Button variant="secondary" onClick={() => setAdaptOpen(false)}>
                  Cancelar
                </Button>
                <Button onClick={adapt} loading={busy === "adapt"} disabled={dirty}>
                  Adaptar anuncio
                </Button>
              </>
            }
          >
            <Field label="Plataforma o plantilla de destino" htmlFor="adapt-target" hint={dirty ? "Guarda primero los cambios pendientes." : undefined}>
              <Select id="adapt-target" value={adaptTarget} onChange={(event) => setAdaptTarget(event.target.value)}>
                {targetOptions}
              </Select>
            </Field>
          </Dialog>
        </>
      ) : null}
    </div>
  );
}

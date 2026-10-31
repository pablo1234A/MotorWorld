"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import clsx from "clsx";
import { Monitor, Plus, Send, Smartphone, Star, Trash2 } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import { useEntitlements } from "@/lib/useEntitlements";
import { DEFAULT_TEMPLATE, detectIncentiveLanguage, findUnknownVariables, renderTemplate, TEMPLATE_VARIABLES, templateHasReviewLink, type TemplateFields } from "@/lib/template";
import { footerPreview } from "@/lib/footer-preview";
import { Alert, Badge, Card, PageHeader } from "@/components/ui/Display";
import { Button } from "@/components/ui/Button";
import { Input, Textarea } from "@/components/ui/Field";
import { Modal } from "@/components/ui/Modal";
import { PageLoader } from "@/components/ui/Spinner";
import { useToast } from "@/components/ui/Toast";

type T = TemplateFields & { id: string; name: string; isDefault: boolean; updatedAt: string };
type Biz = { business: { name: string; reviewUrl: string | null; legalName: string | null; addressLine: string | null; postalCode: string | null; city: string | null } };

const FIELDS: { k: keyof TemplateFields; label: string; rows?: number; help?: string }[] = [
  { k: "subject", label: "Asunto del correo" },
  { k: "greeting", label: "Saludo" },
  { k: "body", label: "Mensaje principal", rows: 7, help: "Debe incluir {{enlace_resena}}. Una línea que solo contenga la variable se mostrará como botón." },
  { k: "closing", label: "Despedida", rows: 2 },
  { k: "signature", label: "Firma", rows: 2 },
  { k: "buttonLabel", label: "Texto del botón" },
];

export default function TemplatesPage() {
  const list = useApi<{ templates: T[] }>("/api/v1/templates");
  const biz = useApi<Biz>("/api/v1/business");
  const ent = useEntitlements();
  const toast = useToast();
  const [selected, setSelected] = useState<string | null>(null);
  const [draft, setDraft] = useState<(TemplateFields & { name: string }) | null>(null);
  const [focused, setFocused] = useState<keyof TemplateFields>("body");
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<{ msg?: string; fields?: Record<string, string> }>({});
  const [device, setDevice] = useState<"desktop" | "mobile">("desktop");
  const [sample, setSample] = useState({ customerName: "Laura", serviceName: "limpieza dental" });
  const [testOpen, setTestOpen] = useState(false);
  const refs = useRef<Partial<Record<keyof TemplateFields, HTMLInputElement | HTMLTextAreaElement | null>>>({});

  const current = list.data?.templates.find((t) => t.id === selected) ?? null;
  useEffect(() => {
    if (!list.data?.templates.length || selected) return;
    const d = list.data.templates.find((t) => t.isDefault) ?? list.data.templates[0];
    setSelected(d.id);
  }, [list.data, selected]);
  useEffect(() => {
    if (current) setDraft({ name: current.name, subject: current.subject, greeting: current.greeting, body: current.body, closing: current.closing, signature: current.signature, buttonLabel: current.buttonLabel });
  }, [current]);

  const b = biz.data?.business;
  const preview = useMemo(() => {
    if (!draft) return null;
    try {
      return renderTemplate(draft, {
        customerName: sample.customerName,
        serviceName: sample.serviceName,
        businessName: b?.name ?? "Tu negocio",
        reviewUrl: b?.reviewUrl || "https://g.page/r/tu-negocio/review",
        unsubscribeUrl: "https://resenalo/baja/ejemplo",
        footerLines: b ? footerPreview(b) : [],
      });
    } catch {
      return null;
    }
  }, [draft, sample, b]);

  if (list.loading && !list.data) return <PageLoader />;
  if (list.error) return <Alert tone="bad">{list.error.message}</Alert>;

  const unknown = draft ? findUnknownVariables(draft) : [];
  const incentives = draft ? detectIncentiveLanguage(draft) : [];
  const missingLink = draft ? !templateHasReviewLink(draft) : false;
  const dirty = Boolean(current && draft && (Object.keys(draft) as (keyof typeof draft)[]).some((k) => draft[k] !== current[k]));
  const canCreate = ent.data && (ent.data.maxTemplates === null || (list.data?.templates.length ?? 0) < (ent.data.maxTemplates ?? 1));

  const insertVar = (key: string) => {
    if (!draft) return;
    const el = refs.current[focused];
    const token = `{{${key}}}`;
    const val = draft[focused];
    const start = el?.selectionStart ?? val.length;
    const end = el?.selectionEnd ?? val.length;
    const next = val.slice(0, start) + token + val.slice(end);
    setDraft({ ...draft, [focused]: next });
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(start + token.length, start + token.length);
    });
  };

  const save = async () => {
    if (!draft || !current) return;
    setSaving(true);
    setErrors({});
    try {
      await api(`/api/v1/templates/${current.id}`, { method: "PUT", body: draft });
      await list.reload();
      toast("ok", "Plantilla guardada");
    } catch (e) {
      const x = e as ApiError;
      setErrors({ msg: x.message, fields: x.fields });
    }
    setSaving(false);
  };

  const create = async () => {
    try {
      const r = await api<{ template: T }>("/api/v1/templates", { body: { ...DEFAULT_TEMPLATE, name: `Plantilla ${(list.data?.templates.length ?? 0) + 1}` } });
      await list.reload();
      setSelected(r.template.id);
      toast("ok", "Plantilla creada");
    } catch (e) {
      toast("bad", (e as ApiError).message);
    }
  };

  return (
    <>
      <PageHeader
        title="Plantillas de correo"
        description="Personaliza el mensaje que recibirán tus clientes. La vista previa muestra exactamente lo que se enviará."
        actions={<Button variant="secondary" icon={<Plus className="h-4 w-4" />} onClick={create} disabled={!canCreate} title={!canCreate ? "Tu plan no permite más plantillas" : undefined}>Nueva plantilla</Button>}
      />
      {!canCreate && ent.data?.maxTemplates === 1 ? <p className="-mt-4 mb-6 text-xs text-ink-500">Tu plan incluye 1 plantilla. Con Pro puedes crear hasta 10 plantillas personalizadas.</p> : null}

      {(list.data?.templates.length ?? 0) > 1 ? (
        <div className="mb-4 flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label="Plantillas">
          {list.data!.templates.map((t) => (
            <button key={t.id} role="tab" aria-selected={t.id === selected} onClick={() => setSelected(t.id)} className={clsx("inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-sm", t.id === selected ? "border-ink-800 bg-ink-800 text-white" : "border-ink-200 bg-white text-ink-700 hover:border-ink-300")}>
              {t.isDefault ? <Star className="h-3.5 w-3.5" /> : null}
              {t.name}
            </button>
          ))}
        </div>
      ) : null}

      {draft && current ? (
        <div className="grid gap-4 xl:grid-cols-[1fr_1fr]">
          <Card>
            <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
              <Input wrapperClassName="min-w-[200px] flex-1" label="Nombre interno" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
              <div className="flex gap-1">
                {current.isDefault ? <Badge tone="star">Por defecto</Badge> : (
                  <>
                    <Button size="sm" variant="ghost" onClick={async () => { await api(`/api/v1/templates/${current.id}/default`, { method: "POST", body: {} }); await list.reload(); toast("ok", "Marcada como plantilla por defecto"); }}>Usar por defecto</Button>
                    <Button size="sm" variant="ghost" aria-label="Eliminar plantilla" icon={<Trash2 className="h-4 w-4" />} onClick={async () => {
                      try { await api(`/api/v1/templates/${current.id}`, { method: "DELETE" }); setSelected(null); await list.reload(); toast("ok", "Plantilla eliminada"); } catch (e) { toast("bad", (e as ApiError).message); }
                    }} />
                  </>
                )}
              </div>
            </div>

            <div className="mb-4">
              <p className="label">Insertar variable en «{FIELDS.find((f) => f.k === focused)?.label}»</p>
              <div className="flex flex-wrap gap-1.5">
                {TEMPLATE_VARIABLES.map((v) => (
                  <button key={v.key} type="button" onClick={() => insertVar(v.key)} className="rounded-md border border-ink-200 bg-cream-50 px-2 py-1 font-mono text-xs text-ink-700 hover:border-ink-400" title={v.label}>
                    {`{{${v.key}}}`}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-4">
              {FIELDS.map((f) =>
                f.rows ? (
                  <Textarea key={f.k} ref={(el) => { refs.current[f.k] = el; }} label={f.label} rows={f.rows} value={draft[f.k]} onFocus={() => setFocused(f.k)} onChange={(e) => setDraft({ ...draft, [f.k]: e.target.value })} help={f.help} error={errors.fields?.[f.k]} />
                ) : (
                  <Input key={f.k} ref={(el) => { refs.current[f.k] = el; }} label={f.label} value={draft[f.k]} onFocus={() => setFocused(f.k)} onChange={(e) => setDraft({ ...draft, [f.k]: e.target.value })} error={errors.fields?.[f.k]} />
                ),
              )}
            </div>

            <div className="mt-5 space-y-2">
              {unknown.length ? <Alert tone="bad">Variables desconocidas: {unknown.map((u) => `{{${u}}}`).join(", ")}</Alert> : null}
              {missingLink ? <Alert tone="bad">El mensaje principal debe incluir {"{{enlace_resena}}"}.</Alert> : null}
              {incentives.length ? <Alert tone="bad" title="Solicitud no neutral">No se pueden ofrecer incentivos ni condicionar la reseña (detectado: «{incentives.join("», «")}»). Pide la opinión a todos por igual.</Alert> : null}
              {errors.msg ? <Alert tone="bad">{errors.msg}</Alert> : null}
              <p className="text-xs text-ink-500">Al pie se añaden siempre la identificación de tu negocio y un enlace de baja (obligatorio por la LSSI-CE).</p>
            </div>

            <div className="mt-6 flex flex-wrap justify-end gap-2">
              <Button variant="ghost" disabled={!dirty} onClick={() => current && setDraft({ name: current.name, subject: current.subject, greeting: current.greeting, body: current.body, closing: current.closing, signature: current.signature, buttonLabel: current.buttonLabel })}>Descartar</Button>
              <Button variant="secondary" icon={<Send className="h-4 w-4" />} onClick={() => setTestOpen(true)} disabled={dirty}>Enviarme una prueba</Button>
              <Button loading={saving} disabled={!dirty || unknown.length > 0 || missingLink || incentives.length > 0} onClick={save}>Guardar plantilla</Button>
            </div>
          </Card>

          <div className="xl:sticky xl:top-6 xl:self-start">
            <Card padded={false}>
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-ink-100 px-4 py-3">
                <p className="text-sm font-semibold">Vista previa</p>
                <div className="flex rounded-lg border border-ink-200 p-0.5">
                  <button className={clsx("rounded-md p-1.5", device === "desktop" && "bg-ink-100")} onClick={() => setDevice("desktop")} aria-label="Vista escritorio" aria-pressed={device === "desktop"}><Monitor className="h-4 w-4" /></button>
                  <button className={clsx("rounded-md p-1.5", device === "mobile" && "bg-ink-100")} onClick={() => setDevice("mobile")} aria-label="Vista móvil" aria-pressed={device === "mobile"}><Smartphone className="h-4 w-4" /></button>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2 border-b border-ink-100 bg-cream-50 px-4 py-3">
                <Input aria-label="Nombre de ejemplo" value={sample.customerName} onChange={(e) => setSample({ ...sample, customerName: e.target.value })} className="py-1.5 text-sm" placeholder="Nombre de ejemplo" />
                <Input aria-label="Servicio de ejemplo" value={sample.serviceName} onChange={(e) => setSample({ ...sample, serviceName: e.target.value })} className="py-1.5 text-sm" placeholder="Servicio de ejemplo" />
              </div>
              {preview ? (
                <div className="bg-cream-200/50 p-3 sm:p-4">
                  <div className="mb-2 rounded-lg bg-white px-3 py-2 text-xs">
                    <p className="text-ink-500">De: <span className="text-ink-800">{b?.name ?? "Tu negocio"}</span></p>
                    <p className="mt-0.5 text-ink-500">Asunto: <span className="font-semibold text-ink-900">{preview.subject}</span></p>
                  </div>
                  <iframe title="Vista previa del correo" sandbox="" srcDoc={preview.html} className={clsx("mx-auto block h-[560px] rounded-lg border border-ink-200 bg-white transition-[width]", device === "mobile" ? "w-[360px] max-w-full" : "w-full")} />
                </div>
              ) : <p className="p-6 text-sm text-ink-500">Configura un enlace de reseñas válido para ver la vista previa.</p>}
              {!b?.reviewUrl ? <p className="border-t border-ink-100 px-4 py-3 text-xs text-warn-700">Aún no has configurado el enlace de reseñas de tu negocio; la vista previa usa un enlace de ejemplo.</p> : null}
            </Card>
          </div>
        </div>
      ) : null}

      <TestSendModal open={testOpen} onClose={() => setTestOpen(false)} templateId={current?.id} />
    </>
  );
}

function TestSendModal({ open, onClose, templateId }: { open: boolean; onClose: () => void; templateId?: string }) {
  const me = useApi<{ user: { email: string } }>(open ? "/api/v1/auth/me" : null);
  const conn = useApi<{ connection: { emailAddress: string; status: string } | null }>(open ? "/api/v1/email-connection" : null);
  const [to, setTo] = useState("");
  const [state, setState] = useState<{ loading?: boolean; ok?: string; err?: string }>({});
  useEffect(() => {
    if (me.data) setTo(me.data.user.email);
  }, [me.data]);
  const options = [me.data?.user.email, conn.data?.connection?.emailAddress].filter((x, i, a) => x && a.indexOf(x) === i) as string[];
  return (
    <Modal open={open} onClose={() => { setState({}); onClose(); }} title="Enviar correo de prueba" footer={<Button loading={state.loading} disabled={!conn.data?.connection || conn.data.connection.status !== "ACTIVE"} onClick={async () => {
      setState({ loading: true });
      try { await api("/api/v1/email-connection/test", { body: { to, templateId } }); setState({ ok: `Enviado a ${to} desde tu cuenta conectada. Revisa tu bandeja de entrada.` }); } catch (e) { setState({ err: (e as ApiError).message }); }
    }}>Enviar prueba</Button>}>
      <div className="space-y-4">
        <p className="text-sm text-ink-600">Se envía un correo real con tu cuenta conectada, con datos de ejemplo. No consume correos de tu plan.</p>
        {conn.data && (!conn.data.connection || conn.data.connection.status !== "ACTIVE") ? <Alert tone="warn">Conecta tu cuenta de correo para poder enviar pruebas.</Alert> : null}
        <div className="space-y-2">
          {options.map((o) => (
            <label key={o} className="flex items-center gap-2 text-sm"><input type="radio" name="to" checked={to === o} onChange={() => setTo(o)} className="accent-ink-800" />{o}</label>
          ))}
        </div>
        {state.ok ? <Alert tone="ok">{state.ok}</Alert> : null}
        {state.err ? <Alert tone="bad">{state.err}</Alert> : null}
      </div>
    </Modal>
  );
}

"use client";
import Link from "next/link";
import { useState } from "react";
import { Clock, Lock, Pencil, Plus, Trash2, Workflow } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import { useEntitlements } from "@/lib/useEntitlements";
import { SOURCE_LABEL } from "@/lib/status";
import { Alert, Badge, Card, EmptyState, PageHeader } from "@/components/ui/Display";
import { Button } from "@/components/ui/Button";
import { Checkbox, Input, Select, Toggle } from "@/components/ui/Field";
import { Modal } from "@/components/ui/Modal";
import { PageLoader } from "@/components/ui/Spinner";
import { useToast } from "@/components/ui/Toast";

type Rule = { id: string; name: string; active: boolean; templateId: string; delayMinutes: number; serviceFilter: string | null; sources: string[]; sendWindowStart: number | null; sendWindowEnd: number | null; priority: number; template: { name: string } };
type Form = Omit<Rule, "id" | "template">;
const DELAYS = [
  [0, "Inmediatamente"], [60, "1 hora después"], [120, "2 horas después"], [240, "4 horas después"], [1440, "1 día después"], [2880, "2 días después"], [4320, "3 días después"], [10080, "1 semana después"],
] as const;
const SOURCES = ["MANUAL", "CSV", "API", "WEBHOOK"];
const delayLabel = (m: number) => DELAYS.find((d) => d[0] === m)?.[1] ?? (m >= 1440 ? `${Math.round(m / 1440)} días después` : `${Math.round(m / 60)} h después`);
const empty = (templateId: string): Form => ({ name: "", active: true, templateId, delayMinutes: 120, serviceFilter: null, sources: [...SOURCES], sendWindowStart: null, sendWindowEnd: null, priority: 0 });

export default function AutomationsPage() {
  const rules = useApi<{ rules: Rule[]; paused: boolean }>("/api/v1/automations");
  const tpls = useApi<{ templates: { id: string; name: string; isDefault: boolean }[] }>("/api/v1/templates");
  const ent = useEntitlements();
  const toast = useToast();
  const [editing, setEditing] = useState<{ id?: string; form: Form } | null>(null);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<{ msg?: string; fields?: Record<string, string> }>({});

  if (rules.loading && !rules.data) return <PageLoader />;
  if (rules.error) return <Alert tone="bad">{rules.error.message}</Alert>;
  const f = ent.data?.features ?? {};
  const max = ent.data?.maxAutomationRules ?? 1;
  const count = rules.data?.rules.length ?? 0;
  const defaultTpl = tpls.data?.templates.find((t) => t.isDefault)?.id ?? tpls.data?.templates[0]?.id ?? "";

  const save = async () => {
    if (!editing) return;
    setSaving(true);
    setErr({});
    try {
      const body = { ...editing.form, serviceFilter: editing.form.serviceFilter || null };
      if (editing.id) await api(`/api/v1/automations/${editing.id}`, { method: "PUT", body });
      else await api("/api/v1/automations", { body });
      setEditing(null);
      await rules.reload();
      toast("ok", "Automatización guardada");
    } catch (e) {
      const x = e as ApiError;
      setErr({ msg: x.message, fields: x.fields });
    }
    setSaving(false);
  };
  const toggleRule = async (r: Rule) => {
    try {
      const { id: _id, template: _t, ...form } = r;
      void _id; void _t;
      await api(`/api/v1/automations/${r.id}`, { method: "PUT", body: { ...form, active: !r.active } });
      await rules.reload();
    } catch (e) {
      toast("bad", (e as ApiError).message);
    }
  };

  return (
    <>
      <PageHeader
        title="Automatizaciones"
        description="Cuándo y con qué plantilla se envía la solicitud tras registrarse un servicio finalizado."
        actions={<Button icon={<Plus className="h-4 w-4" />} disabled={count >= max || !defaultTpl} onClick={() => { setErr({}); setEditing({ form: empty(defaultTpl) }); }}>Nueva automatización</Button>}
      />
      {rules.data?.paused ? <Alert tone="warn" className="mb-4" title="Automatización en pausa">Los eventos automáticos (CSV, API, webhook) no generan envíos. Puedes reanudarla desde Inicio.</Alert> : null}
      {count >= max ? <p className="-mt-3 mb-5 text-xs text-ink-500">Tu plan permite {max} automatización{max > 1 ? "es" : ""}. {max < 20 ? "Mejora tu plan para crear más." : ""}</p> : null}

      <Card className="mb-4">
        <h2 className="text-sm font-semibold">Cómo funciona</h2>
        <ol className="mt-3 grid gap-3 text-sm text-ink-600 sm:grid-cols-4">
          {["Se registra un servicio finalizado (manual, CSV, API o webhook).", "Se aplica la primera regla activa que coincide (por prioridad).", "Se comprueban plan, cupo, conexión, email y duplicados.", "Se envía tras el retardo configurado desde tu correo."].map((t, i) => (
            <li key={t} className="flex gap-2"><span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-ink-800 text-[11px] font-semibold text-white">{i + 1}</span>{t}</li>
          ))}
        </ol>
      </Card>

      {count === 0 ? (
        <Card><EmptyState icon={<Workflow className="h-5 w-5" />} title="Sin automatizaciones" action={<Button onClick={() => setEditing({ form: empty(defaultTpl) })}>Crear automatización</Button>}>Sin una automatización activa, los eventos automáticos no generarán solicitudes.</EmptyState></Card>
      ) : (
        <div className="space-y-3">
          {rules.data!.rules.map((r) => (
            <Card key={r.id}>
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-semibold">{r.name}</h3>
                    <Badge tone={r.active ? "ok" : "neutral"} dot>{r.active ? "Activa" : "Desactivada"}</Badge>
                    {r.priority ? <Badge>Prioridad {r.priority}</Badge> : null}
                  </div>
                  <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-sm text-ink-600">
                    <span className="inline-flex items-center gap-1.5"><Clock className="h-3.5 w-3.5" />{delayLabel(r.delayMinutes)}</span>
                    <span>Plantilla: <strong className="font-medium text-ink-800">{r.template.name}</strong></span>
                    {r.serviceFilter ? <span>Servicio contiene «{r.serviceFilter}»</span> : null}
                    {r.sendWindowStart != null ? <span>Solo de {r.sendWindowStart}:00 a {r.sendWindowEnd}:00</span> : null}
                  </div>
                  <p className="mt-1 text-xs text-ink-500">Orígenes: {r.sources.map((s) => SOURCE_LABEL[s]).join(", ")}</p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Toggle label="Activa" checked={r.active} onChange={() => toggleRule(r)} />
                  <Button size="sm" variant="ghost" icon={<Pencil className="h-4 w-4" />} aria-label="Editar" onClick={() => { const { id, template: _t, ...form } = r; void _t; setErr({}); setEditing({ id, form }); }} />
                  <Button size="sm" variant="ghost" icon={<Trash2 className="h-4 w-4" />} aria-label="Eliminar" onClick={async () => { try { await api(`/api/v1/automations/${r.id}`, { method: "DELETE" }); await rules.reload(); toast("ok", "Eliminada"); } catch (e) { toast("bad", (e as ApiError).message); } }} />
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      <p className="mt-6 text-sm text-ink-500">¿Quieres que tu CRM o agenda genere los eventos automáticamente? Consulta <Link href="/app/integraciones" className="font-medium underline">API e integraciones</Link>.</p>

      <Modal open={Boolean(editing)} onClose={() => setEditing(null)} title={editing?.id ? "Editar automatización" : "Nueva automatización"} wide footer={<><Button variant="ghost" onClick={() => setEditing(null)}>Cancelar</Button><Button loading={saving} onClick={save}>Guardar</Button></>}>
        {editing ? (
          <div className="space-y-5">
            {err.msg ? <Alert tone="bad">{err.msg}</Alert> : null}
            <div className="grid gap-4 sm:grid-cols-2">
              <Input label="Nombre" value={editing.form.name} onChange={(e) => setEditing({ ...editing, form: { ...editing.form, name: e.target.value } })} error={err.fields?.name} />
              <Select label="Plantilla" value={editing.form.templateId} onChange={(e) => setEditing({ ...editing, form: { ...editing.form, templateId: e.target.value } })}>
                {tpls.data?.templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </Select>
              <Select label="Cuándo enviar" value={editing.form.delayMinutes} onChange={(e) => setEditing({ ...editing, form: { ...editing.form, delayMinutes: Number(e.target.value) } })} help="Tiempo desde la fecha de finalización del servicio.">
                {DELAYS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </Select>
              <Input label="Prioridad" type="number" min={0} max={100} value={editing.form.priority} onChange={(e) => setEditing({ ...editing, form: { ...editing.form, priority: Number(e.target.value) } })} help="Si varias reglas coinciden, gana la de mayor prioridad." />
            </div>
            <fieldset>
              <legend className="label">Orígenes de los eventos</legend>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {SOURCES.map((s) => (
                  <Checkbox key={s} label={SOURCE_LABEL[s]} checked={editing.form.sources.includes(s)} onChange={(e) => setEditing({ ...editing, form: { ...editing.form, sources: e.target.checked ? [...editing.form.sources, s] : editing.form.sources.filter((x) => x !== s) } })} />
                ))}
              </div>
              {err.fields?.sources ? <p className="mt-1 text-xs text-bad-600">{err.fields.sources}</p> : null}
            </fieldset>
            <Locked locked={!f.serviceFilters} label="Disponible a partir del plan Pro">
              <Input label="Aplicar solo si el servicio contiene" placeholder="Ej. tinte" disabled={!f.serviceFilters} value={editing.form.serviceFilter ?? ""} onChange={(e) => setEditing({ ...editing, form: { ...editing.form, serviceFilter: e.target.value } })} help="Déjalo vacío para todos los servicios." />
            </Locked>
            <Locked locked={!f.sendWindow} label="Disponible en el plan Business">
              <div className="grid gap-4 sm:grid-cols-2">
                <Select label="Enviar solo desde" disabled={!f.sendWindow} value={editing.form.sendWindowStart ?? ""} onChange={(e) => { const v = e.target.value === "" ? null : Number(e.target.value); setEditing({ ...editing, form: { ...editing.form, sendWindowStart: v, sendWindowEnd: v == null ? null : editing.form.sendWindowEnd ?? 20 } }); }}>
                  <option value="">Cualquier hora</option>
                  {Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{h}:00</option>)}
                </Select>
                <Select label="Hasta" disabled={!f.sendWindow || editing.form.sendWindowStart == null} value={editing.form.sendWindowEnd ?? ""} onChange={(e) => setEditing({ ...editing, form: { ...editing.form, sendWindowEnd: Number(e.target.value) } })} error={err.fields?.sendWindowEnd}>
                  <option value="" disabled>—</option>
                  {Array.from({ length: 24 }, (_, h) => h + 1).map((h) => <option key={h} value={h}>{h}:00</option>)}
                </Select>
              </div>
            </Locked>
            <Toggle label="Automatización activa" checked={editing.form.active} onChange={(v) => setEditing({ ...editing, form: { ...editing.form, active: v } })} />
          </div>
        ) : null}
      </Modal>
    </>
  );
}

function Locked({ locked, label, children }: { locked: boolean; label: string; children: React.ReactNode }) {
  return (
    <div className="relative">
      {children}
      {locked ? <p className="mt-1.5 inline-flex items-center gap-1 text-xs text-star-800"><Lock className="h-3 w-3" />{label}</p> : null}
    </div>
  );
}

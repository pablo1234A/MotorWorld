"use client";
import { useEffect, useRef, useState } from "react";
import { ArrowDown, ArrowUp, Image as ImageIcon, Monitor, Plus, Smartphone, Tablet, Trash2, AlertTriangle } from "lucide-react";
import type { Cta, FormField, Item, Section, StyleId, Theme } from "@/engine/schema";
import { ANIMATION_PRESETS } from "@/engine/schema";
import { STYLES } from "@/engine/styles";
import { uid } from "@/engine/util";
import { SECTION_LABELS, VARIANTS } from "@/engine/variants";
import { ICON_NAMES } from "@/render/icons";
import { Badge, Button, cn, Field, Input, Segmented, Select, Switch, Tabs, TabsContent, TabsList, TabsTrigger, Textarea } from "../ui";
import { patchSection, useCurrentPage, useEditor, useSelectedSection } from "./store";

type ItemKey = "title" | "text" | "meta" | "price" | "badge" | "icon" | "href" | "features" | "value" | "image" | "paymentLink" | "priceId";

/** Which item fields make sense for each section type, with human labels. */
const ITEM_FIELDS: Partial<Record<Section["type"], { noun: string; fields: Array<[ItemKey, string]> }>> = {
  navbar: { noun: "enlace", fields: [["title", "Texto"], ["href", "Enlace"]] },
  footer: { noun: "enlace", fields: [["title", "Texto"], ["href", "Enlace"]] },
  logos: { noun: "logo", fields: [["title", "Nombre"]] },
  marquee: { noun: "palabra", fields: [["title", "Texto"]] },
  features: { noun: "característica", fields: [["title", "Título"], ["text", "Descripción"], ["icon", "Icono"]] },
  steps: { noun: "paso", fields: [["title", "Título"], ["text", "Descripción"]] },
  stats: { noun: "cifra", fields: [["title", "Valor mostrado"], ["text", "Etiqueta"], ["value", "Número para el contador"]] },
  gallery: { noun: "imagen", fields: [["image", "Imagen"], ["title", "Título"], ["meta", "Año / detalle"], ["href", "Enlace"]] },
  testimonials: { noun: "testimonio", fields: [["text", "Cita"], ["title", "Nombre"], ["meta", "Cargo o detalle"]] },
  pricing: { noun: "plan", fields: [["title", "Nombre"], ["price", "Precio"], ["meta", "Periodo"], ["text", "Descripción"], ["badge", "Destacado (etiqueta)"], ["features", "Incluye (una por línea)"], ["href", "Enlace del botón / Payment Link"]] },
  products: { noun: "producto", fields: [["image", "Imagen"], ["title", "Nombre"], ["text", "Descripción"], ["price", "Precio"], ["meta", "Detalle (año, nivel…)"], ["badge", "Etiqueta"], ["features", "Especificaciones (una por línea)"], ["paymentLink", "Stripe Payment Link"], ["priceId", "Stripe Price ID"]] },
  menu: { noun: "plato", fields: [["title", "Plato"], ["text", "Descripción"], ["price", "Precio"], ["meta", "Categoría"]] },
  team: { noun: "persona", fields: [["image", "Foto"], ["title", "Nombre"], ["meta", "Cargo"], ["text", "Bio"]] },
  timeline: { noun: "hito", fields: [["meta", "Fecha"], ["title", "Título"], ["text", "Descripción"]] },
  faq: { noun: "pregunta", fields: [["title", "Pregunta"], ["text", "Respuesta"]] },
  contact: { noun: "dato", fields: [["title", "Etiqueta"], ["text", "Valor"], ["href", "Enlace (mailto:, tel:)"], ["icon", "Icono"]] },
  dashboard: { noun: "KPI", fields: [["title", "Valor"], ["text", "Etiqueta"]] },
};

const TEXT_FIELDS: Partial<Record<Section["type"], Array<[keyof Section["content"], string, "input" | "textarea"]>>> = {
  navbar: [["heading", "Nombre / logo", "input"]],
  footer: [["heading", "Marca", "input"], ["body", "Descripción", "textarea"], ["note", "Texto legal", "input"]],
  menu: [["eyebrow", "Antetítulo", "input"], ["heading", "Título", "input"], ["subheading", "Subtítulo", "textarea"], ["note", "Nota al pie", "input"]],
  dashboard: [["eyebrow", "Antetítulo", "input"], ["heading", "Título", "input"], ["subheading", "Subtítulo", "textarea"], ["body", "Serie del gráfico (números separados por comas)", "input"]],
  custom: [],
  marquee: [],
};
const DEFAULT_TEXT: Array<[keyof Section["content"], string, "input" | "textarea"]> = [
  ["eyebrow", "Antetítulo", "input"],
  ["heading", "Título", "textarea"],
  ["subheading", "Subtítulo", "textarea"],
  ["body", "Texto", "textarea"],
];
const HAS_CTAS: Section["type"][] = ["hero", "showcase", "cta", "navbar", "scene3d", "richtext"];
const HAS_IMAGE: Section["type"][] = ["hero", "showcase"];

function useFocusRef(field: string, itemId?: string) {
  const ref = useRef<HTMLInputElement & HTMLTextAreaElement>(null);
  const focus = useEditor((s) => s.focusField);
  useEffect(() => {
    if (focus && focus.field === field && focus.itemId === itemId) {
      ref.current?.focus();
      ref.current?.scrollIntoView({ block: "center", behavior: "smooth" });
    }
  }, [focus, field, itemId]);
  return ref;
}

function TextField({ s, k, label, kind }: { s: Section; k: keyof Section["content"]; label: string; kind: "input" | "textarea" }) {
  const ref = useFocusRef(String(k));
  const value = (s.content[k] as string | undefined) ?? "";
  const onChange = (v: string) => patchSection(s.id, { content: { [k]: v === "" ? null : v } }, String(k));
  return (
    <Field label={label} hint={value.length > 60 ? `${value.length}` : undefined}>
      {kind === "textarea" ? <Textarea ref={ref} rows={k === "heading" ? 2 : 3} value={value} onChange={(e) => onChange(e.target.value)} className="min-h-0" /> : <Input ref={ref} value={value} onChange={(e) => onChange(e.target.value)} />}
    </Field>
  );
}

export function ImageField({ s, label = "Imagen", onPick }: { s: Section; label?: string; onPick: (t: { sectionId: string; field: string; itemId?: string }) => void }) {
  const img = s.content.image;
  return (
    <Field label={label}>
      <div className="flex gap-2">
        <button type="button" onClick={() => onPick({ sectionId: s.id, field: "image" })} className="press relative grid aspect-[4/3] w-24 shrink-0 place-items-center overflow-hidden rounded-md border border-line bg-bg hover:border-line-strong" aria-label="Cambiar imagen">
          {img?.src ? <img src={img.src} alt="" className="size-full object-cover" /> : <ImageIcon className="size-4 text-faint" />}
        </button>
        <div className="min-w-0 flex-1 space-y-1.5">
          <Input value={img?.alt ?? ""} placeholder="Texto alternativo (accesibilidad)" onChange={(e) => img && patchSection(s.id, { content: { image: { ...img, alt: e.target.value } } }, "image.alt")} disabled={!img} />
          <div className="flex gap-1.5">
            <Button size="xs" onClick={() => onPick({ sectionId: s.id, field: "image" })}>
              Cambiar
            </Button>
            {img ? (
              <Button size="xs" variant="ghost" onClick={() => patchSection(s.id, { content: { image: null } })}>
                Quitar
              </Button>
            ) : null}
            {img?.kind === "generated" ? <Badge className="ml-auto">Generativa</Badge> : null}
          </div>
        </div>
      </div>
    </Field>
  );
}

function ItemsEditor({ s, onPick }: { s: Section; onPick: (t: { sectionId: string; field: string; itemId?: string }) => void }) {
  const cfg = ITEM_FIELDS[s.type];
  const items = s.content.items ?? [];
  const focus = useEditor((st) => st.focusField);
  const [open, setOpen] = useState<string | null>(items[0]?.id ?? null);
  useEffect(() => {
    if (focus?.itemId) setOpen(focus.itemId);
  }, [focus]);
  if (!cfg) return null;
  const setItems = (next: Item[], key?: string) => patchSection(s.id, { content: { items: next } }, key);
  const update = (id: string, patch: Partial<Item>, key: string) => setItems(items.map((it) => (it.id === id ? { ...it, ...patch } : it)), `${id}.${key}`);

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <p className="text-[11px] font-medium text-muted">
          {items.length} {cfg.noun}
          {items.length === 1 ? "" : "s"}
        </p>
        <Button
          size="xs"
          onClick={() => {
            const base: Item = items.at(-1) ? { ...items.at(-1)!, id: uid("it") } : { id: uid("it"), title: "Nuevo", text: "" };
            setItems([...items, base]);
            setOpen(base.id);
          }}
        >
          <Plus className="size-3" /> Añadir
        </Button>
      </div>
      <ul className="space-y-1.5">
        {items.map((it, idx) => (
          <li key={it.id} className="rounded-lg border border-line bg-bg/60">
            <div className="flex items-center gap-1 px-2">
              <button type="button" onClick={() => setOpen(open === it.id ? null : it.id)} className="flex h-8 min-w-0 flex-1 items-center gap-2 text-left text-xs" aria-expanded={open === it.id}>
                <span className="font-mono text-[10px] text-faint">{idx + 1}</span>
                <span className="truncate">{it.title || it.text || `${cfg.noun} sin título`}</span>
              </button>
              <Button size="icon-sm" variant="ghost" aria-label="Subir" disabled={idx === 0} onClick={() => setItems(items.map((x, i) => (i === idx - 1 ? items[idx] : i === idx ? items[idx - 1] : x)))}>
                <ArrowUp className="size-3" />
              </Button>
              <Button size="icon-sm" variant="ghost" aria-label="Bajar" disabled={idx === items.length - 1} onClick={() => setItems(items.map((x, i) => (i === idx + 1 ? items[idx] : i === idx ? items[idx + 1] : x)))}>
                <ArrowDown className="size-3" />
              </Button>
              <Button size="icon-sm" variant="ghost" aria-label="Eliminar" onClick={() => setItems(items.filter((x) => x.id !== it.id))}>
                <Trash2 className="size-3" />
              </Button>
            </div>
            {open === it.id ? (
              <div className="space-y-2.5 border-t border-line p-2.5">
                {cfg.fields.map(([k, label]) => {
                  if (k === "image")
                    return (
                      <Field key={k} label={label}>
                        <div className="flex items-center gap-2">
                          <button type="button" onClick={() => onPick({ sectionId: s.id, field: "image", itemId: it.id })} className="press grid aspect-[4/3] w-16 place-items-center overflow-hidden rounded border border-line bg-bg" aria-label="Cambiar imagen">
                            {it.image?.src ? <img src={it.image.src} alt="" className="size-full object-cover" /> : <ImageIcon className="size-3.5 text-faint" />}
                          </button>
                          <Input value={it.image?.alt ?? ""} placeholder="Texto alternativo" disabled={!it.image} onChange={(e) => it.image && update(it.id, { image: { ...it.image, alt: e.target.value } }, "alt")} />
                        </div>
                      </Field>
                    );
                  if (k === "icon")
                    return (
                      <Field key={k} label={label}>
                        <Select value={it.icon ?? ""} onChange={(e) => update(it.id, { icon: e.target.value || undefined }, k)}>
                          <option value="">Sin icono</option>
                          {ICON_NAMES.map((n) => (
                            <option key={n} value={n}>
                              {n}
                            </option>
                          ))}
                        </Select>
                      </Field>
                    );
                  if (k === "features")
                    return (
                      <Field key={k} label={label}>
                        <Textarea rows={3} value={(it.features ?? []).join("\n")} onChange={(e) => update(it.id, { features: e.target.value.split("\n").filter((l, i, a) => l.trim() || i === a.length - 1).slice(0, 20) }, k)} />
                      </Field>
                    );
                  if (k === "value")
                    return (
                      <Field key={k} label={label} hint="Opcional">
                        <Input type="number" value={it.value ?? ""} onChange={(e) => update(it.id, { value: e.target.value === "" ? undefined : Number(e.target.value) }, k)} />
                      </Field>
                    );
                  if (k === "paymentLink" || k === "priceId")
                    return (
                      <Field key={k} label={label} hint="Opcional">
                        <Input value={(k === "paymentLink" ? it.checkout?.paymentLink : it.checkout?.priceId) ?? ""} placeholder={k === "paymentLink" ? "https://buy.stripe.com/…" : "price_…"} onChange={(e) => update(it.id, { checkout: { ...it.checkout, [k]: e.target.value || undefined } }, k)} />
                      </Field>
                    );
                  const value = (it[k as "title"] as string | undefined) ?? "";
                  const long = k === "text";
                  return (
                    <Field key={k} label={label}>
                      {long ? <Textarea rows={3} value={value} onChange={(e) => update(it.id, { [k]: e.target.value }, k)} /> : <Input value={value} onChange={(e) => update(it.id, { [k]: e.target.value === "" && k !== "title" ? undefined : e.target.value }, k)} placeholder={k === "href" ? "/contacto, /#precios o https://…" : undefined} />}
                    </Field>
                  );
                })}
              </div>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

function LinkInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const doc = useEditor((s) => s.doc);
  const options = doc.pages.flatMap((p) => [{ v: p.path, l: p.name }, ...p.sections.filter((s) => s.style.anchor).map((s) => ({ v: `${p.path === "/" ? "/" : p.path}#${s.style.anchor}`, l: `${p.name} › ${SECTION_LABELS[s.type]}` }))]);
  const isInternal = options.some((o) => o.v === value);
  return (
    <div className="flex gap-1.5">
      <Select value={isInternal ? value : "__custom"} onChange={(e) => e.target.value !== "__custom" && onChange(e.target.value)} className="w-1/2">
        {options.map((o) => (
          <option key={o.v} value={o.v}>
            {o.l}
          </option>
        ))}
        <option value="__custom">URL externa…</option>
      </Select>
      <Input value={value} onChange={(e) => onChange(e.target.value)} className="w-1/2 font-mono text-[11px]" aria-label="Enlace" />
    </div>
  );
}

function CtasEditor({ s }: { s: Section }) {
  const ctas = s.content.ctas ?? [];
  const set = (next: Cta[], key?: string) => patchSection(s.id, { content: { ctas: next } }, key);
  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <p className="text-[11px] font-medium text-muted">Botones</p>
        {ctas.length < (s.type === "navbar" ? 1 : 3) ? (
          <Button size="xs" onClick={() => set([...ctas, { label: "Saber más", href: "/", style: ctas.length ? "secondary" : "primary" }])}>
            <Plus className="size-3" /> Añadir
          </Button>
        ) : null}
      </div>
      <ul className="space-y-2">
        {ctas.map((c, i) => (
          <li key={i} className="space-y-1.5 rounded-lg border border-line bg-bg/60 p-2.5">
            <div className="flex gap-1.5">
              <Input value={c.label} onChange={(e) => set(ctas.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)), `cta${i}.label`)} aria-label="Texto del botón" />
              <Select value={c.style} onChange={(e) => set(ctas.map((x, j) => (j === i ? { ...x, style: e.target.value as Cta["style"] } : x)))} className="w-28" aria-label="Estilo">
                <option value="primary">Principal</option>
                <option value="secondary">Secundario</option>
                <option value="ghost">Texto</option>
                <option value="link">Enlace</option>
              </Select>
              <Button size="icon" variant="ghost" aria-label="Eliminar botón" onClick={() => set(ctas.filter((_, j) => j !== i))}>
                <Trash2 className="size-3.5" />
              </Button>
            </div>
            <LinkInput value={c.href} onChange={(v) => set(ctas.map((x, j) => (j === i ? { ...x, href: v } : x)), `cta${i}.href`)} />
          </li>
        ))}
      </ul>
    </div>
  );
}

function FormEditor({ s }: { s: Section }) {
  const form = s.content.form;
  if (!form) return null;
  const set = (patch: Partial<typeof form>, key?: string) => patchSection(s.id, { content: { form: { ...form, ...patch } } }, key);
  const setField = (i: number, patch: Partial<FormField>, key: string) => set({ fields: form.fields.map((f, j) => (j === i ? { ...f, ...patch } : f)) }, `f${i}.${key}`);
  return (
    <div className="space-y-3">
      <p className="text-[11px] font-medium text-muted">Formulario</p>
      <ul className="space-y-1.5">
        {form.fields.map((f, i) => (
          <li key={i} className="space-y-1.5 rounded-lg border border-line bg-bg/60 p-2.5">
            <div className="flex gap-1.5">
              <Input value={f.label} onChange={(e) => setField(i, { label: e.target.value }, "label")} aria-label="Etiqueta" />
              <Select value={f.type} onChange={(e) => setField(i, { type: e.target.value as FormField["type"] }, "type")} className="w-28" aria-label="Tipo">
                {["text", "email", "tel", "textarea", "select", "date", "number", "checkbox"].map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </Select>
              <Button size="icon" variant="ghost" aria-label="Eliminar campo" disabled={form.fields.length === 1} onClick={() => set({ fields: form.fields.filter((_, j) => j !== i) })}>
                <Trash2 className="size-3.5" />
              </Button>
            </div>
            {f.type === "select" ? <Input value={(f.options ?? []).join(", ")} placeholder="Opciones separadas por comas" onChange={(e) => setField(i, { options: e.target.value.split(",").map((o) => o.trim()).filter(Boolean) }, "options")} /> : null}
            <label className="flex items-center gap-2 text-[11px] text-muted">
              <Switch checked={f.required} onCheckedChange={(v) => setField(i, { required: v }, "required")} label="Obligatorio" /> Obligatorio
              <span className="ml-auto font-mono text-faint">{f.name}</span>
            </label>
          </li>
        ))}
      </ul>
      <Button
        size="xs"
        onClick={() => {
          const n = form.fields.length + 1;
          set({ fields: [...form.fields, { name: `campo_${n}`, label: `Campo ${n}`, type: "text", required: false }] });
        }}
      >
        <Plus className="size-3" /> Añadir campo
      </Button>
      <Field label="Texto del botón">
        <Input value={form.submitLabel} onChange={(e) => set({ submitLabel: e.target.value || "Enviar" }, "submit")} />
      </Field>
      <Field label="Mensaje de confirmación">
        <Input value={form.successMessage} onChange={(e) => set({ successMessage: e.target.value }, "success")} />
      </Field>
      <p className="text-[11px] text-faint">Los envíos se guardan en el proyecto (menú Formularios) y se notifican por email si configuras el aviso en «Sitio».</p>
    </div>
  );
}

function ContentTab({ s, onPick }: { s: Section; onPick: (t: { sectionId: string; field: string; itemId?: string }) => void }) {
  const fields = TEXT_FIELDS[s.type] ?? DEFAULT_TEXT;
  return (
    <div className="space-y-4 p-3">
      {s.sample ? (
        <div className="flex gap-2 rounded-lg border border-warn/30 bg-warn/10 p-2.5 text-[12px] text-warn">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
          <div>
            Contiene datos de ejemplo (opiniones, cifras, precios o contacto). Sustitúyelos por los reales.
            <button type="button" className="mt-1 block underline underline-offset-2" onClick={() => patchSection(s.id, { sample: false })}>
              Ya he puesto los datos reales
            </button>
          </div>
        </div>
      ) : null}
      {fields.map(([k, label, kind]) => (
        <TextField key={String(k)} s={s} k={k} label={label} kind={kind} />
      ))}
      {HAS_IMAGE.includes(s.type) ? <ImageField s={s} onPick={onPick} /> : null}
      {s.type === "custom" ? (
        <Field label="HTML" hint="Sin scripts">
          <Textarea rows={12} className="font-mono text-[11px]" value={s.content.html ?? ""} onChange={(e) => patchSection(s.id, { content: { html: e.target.value } }, "html")} />
        </Field>
      ) : null}
      {HAS_CTAS.includes(s.type) ? <CtasEditor s={s} /> : null}
      {s.content.form ? <FormEditor s={s} /> : null}
      <ItemsEditor s={s} onPick={onPick} />
    </div>
  );
}

function DesignTab({ s }: { s: Section }) {
  const set = (patch: Parameters<typeof patchSection>[1], key?: string) => patchSection(s.id, patch, key);
  return (
    <div className="space-y-4 p-3">
      <Field label="Layout">
        <div className="grid grid-cols-2 gap-1.5">
          {VARIANTS[s.type].map((v) => (
            <button key={v.id} type="button" onClick={() => set({ variant: v.id })} aria-pressed={s.variant === v.id} className={cn("press h-8 truncate rounded-md border px-2 text-xs", s.variant === v.id ? "border-accent bg-accent-soft text-fg" : "border-line text-muted hover:text-fg")}>
              {v.label}
            </button>
          ))}
        </div>
      </Field>
      {s.type !== "navbar" ? (
        <Field label="Fondo">
          <Select value={s.style.background} onChange={(e) => set({ style: { background: e.target.value as Section["style"]["background"] } })}>
            <option value="default">Fondo del sitio</option>
            <option value="surface">Superficie</option>
            <option value="primary">Color principal</option>
            <option value="accent">Color de acento</option>
            <option value="inverse">Invertido</option>
          </Select>
        </Field>
      ) : null}
      <div className="grid grid-cols-2 gap-3">
        <Field label="Espaciado">
          <Select value={s.style.padding} onChange={(e) => set({ style: { padding: e.target.value as Section["style"]["padding"] } })}>
            <option value="none">Ninguno</option>
            <option value="sm">Pequeño</option>
            <option value="md">Medio</option>
            <option value="lg">Grande</option>
            <option value="xl">Muy grande</option>
          </Select>
        </Field>
        <Field label="Ancho">
          <Select value={s.style.width} onChange={(e) => set({ style: { width: e.target.value as Section["style"]["width"] } })}>
            <option value="narrow">Estrecho</option>
            <option value="default">Normal</option>
            <option value="wide">Amplio</option>
            <option value="full">Completo</option>
          </Select>
        </Field>
      </div>
      <Field label="Alineación">
        <Segmented value={s.style.align} onChange={(v) => set({ style: { align: v } })} options={[{ value: "start", label: "Izquierda" }, { value: "center", label: "Centro" }]} />
      </Field>
      {s.type === "hero" && s.variant === "fullbleed" ? (
        <Field label="Oscurecer imagen" hint={`${Math.round((s.style.overlay ?? 0.25) * 100)} %`}>
          <input type="range" min={0} max={0.9} step={0.05} value={s.style.overlay ?? 0.25} onChange={(e) => set({ style: { overlay: Number(e.target.value) } }, "overlay")} className="w-full" />
        </Field>
      ) : null}
      <Field label="Ancla (ID)" hint="para enlaces /#ancla">
        <Input value={s.style.anchor ?? ""} onChange={(e) => set({ style: { anchor: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 40) || undefined } }, "anchor")} className="font-mono text-[11px]" />
      </Field>
      <div className="border-t border-line pt-4">
        <p className="mb-2 text-[11px] font-medium text-muted">Animación de entrada</p>
        <div className="grid grid-cols-2 gap-3">
          <Select value={s.animation.preset} onChange={(e) => set({ animation: { preset: e.target.value as Section["animation"]["preset"] } })} aria-label="Animación">
            {ANIMATION_PRESETS.map((p) => (
              <option key={p} value={p}>
                {({ none: "Ninguna", "fade-up": "Aparecer y subir", fade: "Fundido", reveal: "Revelado", stagger: "Escalonada", scale: "Escala", parallax: "Parallax", cinematic: "Cinemática (GSAP)" } as Record<string, string>)[p]}
              </option>
            ))}
          </Select>
          <Input type="number" min={0} max={2} step={0.1} value={s.animation.delay} onChange={(e) => set({ animation: { delay: Math.min(2, Math.max(0, Number(e.target.value))) } }, "delay")} aria-label="Retardo (s)" />
        </div>
        <p className="mt-1.5 text-[11px] text-faint">Se desactivan automáticamente si el visitante pide reducir el movimiento.</p>
      </div>
      <div className="border-t border-line pt-4">
        <p className="mb-2 text-[11px] font-medium text-muted">Visible en</p>
        <div className="space-y-2">
          {([["desktop", "Escritorio", Monitor], ["tablet", "Tablet", Tablet], ["mobile", "Móvil", Smartphone]] as const).map(([k, label, Icon]) => (
            <label key={k} className="flex items-center justify-between text-[13px]">
              <span className="flex items-center gap-2 text-muted">
                <Icon className="size-3.5" /> {label}
              </span>
              <Switch checked={!s.hidden?.[k]} onCheckedChange={(v) => set({ hidden: { [k]: !v } })} label={label} />
            </label>
          ))}
        </div>
      </div>
    </div>
  );
}

const FONT_CHOICES = Array.from(new Set(Object.values(STYLES).flatMap((s) => s.fonts.flatMap((f) => [f.display, f.body])))).sort();

function ThemeTab() {
  const theme = useEditor((s) => s.doc.theme);
  const apply = useEditor((s) => s.apply);
  const upd = (patch: Parameters<typeof apply>[0][number] extends infer O ? (O extends { op: "update_theme"; patch: infer P } ? P : never) : never, key?: string) => apply([{ op: "update_theme", patch }], key ? `theme:${key}` : undefined);
  const [keepBrand, setKeepBrand] = useState(true);
  const colorLabels: Array<[keyof Theme["colors"], string]> = [["primary", "Principal"], ["accent", "Acento"], ["bg", "Fondo"], ["surface", "Superficie"], ["text", "Texto"], ["muted", "Texto secundario"], ["border", "Bordes"]];
  return (
    <div className="space-y-4 p-3">
      <Field label="Dirección de arte">
        <Select value={theme.style} onChange={(e) => apply([{ op: "restyle", style: e.target.value as StyleId, mode: theme.mode, keepBrandColor: keepBrand }])}>
          {Object.values(STYLES).map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </Select>
        <label className="mt-1.5 flex items-center gap-2 text-[11px] text-muted">
          <Switch checked={keepBrand} onCheckedChange={setKeepBrand} label="Conservar color de marca" /> Conservar color de marca
        </label>
      </Field>
      <Field label="Modo">
        <Segmented value={theme.mode} onChange={(v) => upd({ mode: v })} options={[{ value: "light", label: "Claro" }, { value: "dark", label: "Oscuro" }]} />
      </Field>
      <div>
        <p className="mb-2 text-[11px] font-medium text-muted">Colores</p>
        <div className="space-y-1.5">
          {colorLabels.map(([k, label]) => (
            <label key={k} className="flex items-center gap-2 text-[13px]">
              <input type="color" value={theme.colors[k]} onChange={(e) => upd({ colors: { [k]: e.target.value } }, k)} className="size-6 cursor-pointer rounded" aria-label={label} />
              <span className="flex-1 text-muted">{label}</span>
              <span className="font-mono text-[11px] text-faint uppercase">{theme.colors[k]}</span>
            </label>
          ))}
        </div>
        <p className="mt-1.5 text-[11px] text-faint">El contraste se ajusta solo para cumplir WCAG AA.</p>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Tipografía titulares">
          <Select value={theme.fonts.display} onChange={(e) => upd({ fonts: { display: e.target.value } })}>
            {[theme.fonts.display, ...FONT_CHOICES.filter((f) => f !== theme.fonts.display)].map((f) => (
              <option key={f}>{f}</option>
            ))}
          </Select>
        </Field>
        <Field label="Tipografía texto">
          <Select value={theme.fonts.body} onChange={(e) => upd({ fonts: { body: e.target.value } })}>
            {[theme.fonts.body, ...FONT_CHOICES.filter((f) => f !== theme.fonts.body)].map((f) => (
              <option key={f}>{f}</option>
            ))}
          </Select>
        </Field>
      </div>
      <Field label="Escala tipográfica" hint={theme.scale.toFixed(2)}>
        <input type="range" min={1.15} max={1.55} step={0.01} value={theme.scale} onChange={(e) => upd({ scale: Number(e.target.value) }, "scale")} className="w-full" />
      </Field>
      <Field label="Radio de esquinas" hint={`${theme.radius}px`}>
        <input type="range" min={0} max={28} step={1} value={theme.radius} onChange={(e) => upd({ radius: Number(e.target.value) }, "radius")} className="w-full" />
      </Field>
      <Field label="Densidad">
        <Segmented value={theme.density} onChange={(v) => upd({ density: v })} options={[{ value: "compact", label: "Compacta" }, { value: "comfortable", label: "Normal" }, { value: "airy", label: "Amplia" }]} />
      </Field>
      <Field label="Movimiento">
        <Select value={theme.motion} onChange={(e) => upd({ motion: e.target.value as Theme["motion"] })}>
          <option value="none">Sin animaciones</option>
          <option value="subtle">Sutil</option>
          <option value="expressive">Expresivo</option>
          <option value="cinematic">Cinemático (GSAP)</option>
        </Select>
      </Field>
      <Field label="Titulares">
        <Segmented value={theme.headingCase} onChange={(v) => upd({ headingCase: v })} options={[{ value: "normal", label: "Normal" }, { value: "upper", label: "MAYÚSCULAS" }]} />
      </Field>
    </div>
  );
}

function PageTab() {
  const page = useCurrentPage();
  const doc = useEditor((s) => s.doc);
  const apply = useEditor((s) => s.apply);
  const upd = (p: { name?: string; path?: string; seo?: Record<string, unknown> }, key: string) => apply([{ op: "update_page", pageId: page.id, ...p } as never], `page:${page.id}:${key}`);
  const t = page.seo.title;
  const d = page.seo.description;
  return (
    <div className="space-y-4 p-3">
      <Field label="Nombre">
        <Input value={page.name} onChange={(e) => e.target.value && upd({ name: e.target.value }, "name")} />
      </Field>
      <Field label="Ruta">
        <Input value={page.path} disabled={page.path === "/"} onChange={(e) => upd({ path: e.target.value }, "path")} className="font-mono text-[12px]" />
      </Field>
      <div className="border-t border-line pt-4">
        <p className="mb-2 text-[11px] font-medium text-muted">SEO</p>
        <div className="space-y-3">
          <Field label="Título" hint={<span className={t.length > 60 ? "text-warn" : ""}>{t.length}/60</span>}>
            <Input value={t} onChange={(e) => upd({ seo: { title: e.target.value } }, "seo.title")} />
          </Field>
          <Field label="Meta descripción" hint={<span className={d.length > 160 || d.length < 50 ? "text-warn" : ""}>{d.length}/160</span>}>
            <Textarea rows={3} value={d} onChange={(e) => upd({ seo: { description: e.target.value } }, "seo.desc")} />
          </Field>
          <Field label="Imagen para redes (URL)" hint="1200×630">
            <Input value={page.seo.ogImage ?? ""} onChange={(e) => upd({ seo: { ogImage: e.target.value } }, "seo.og")} placeholder="https://…" />
          </Field>
          <label className="flex items-center justify-between text-[13px] text-muted">
            Ocultar a buscadores (noindex)
            <Switch checked={page.seo.noindex} onCheckedChange={(v) => upd({ seo: { noindex: v } }, "seo.noindex")} label="noindex" />
          </label>
        </div>
        <div className="mt-4 rounded-lg border border-line bg-white p-3" aria-label="Vista previa en Google">
          <p className="truncate text-[11px] text-[#4d5156]">{doc.settings.siteName.toLowerCase().replace(/\s+/g, "")}.com{page.path === "/" ? "" : ` › ${page.path.slice(1)}`}</p>
          <p className="truncate text-[15px] text-[#1a0dab]">{t || page.name}</p>
          <p className="line-clamp-2 text-[12px] text-[#4d5156]">{d || "Añade una meta descripción para controlar este texto."}</p>
        </div>
      </div>
    </div>
  );
}

function SiteTab() {
  const settings = useEditor((s) => s.doc.settings);
  const apply = useEditor((s) => s.apply);
  const upd = (patch: Record<string, string>, key: string) => apply([{ op: "update_settings", patch }], `settings:${key}`);
  return (
    <div className="space-y-4 p-3">
      <Field label="Nombre del sitio">
        <Input value={settings.siteName} onChange={(e) => e.target.value && upd({ siteName: e.target.value }, "name")} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Idioma">
          <Select value={settings.lang} onChange={(e) => upd({ lang: e.target.value }, "lang")}>
            {[["es", "Español"], ["en", "English"], ["fr", "Français"], ["de", "Deutsch"], ["it", "Italiano"], ["pt", "Português"]].map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Moneda">
          <Select value={settings.currency} onChange={(e) => upd({ currency: e.target.value }, "currency")}>
            {["EUR", "USD", "GBP", "MXN", "ARS", "COP", "CLP"].map((c) => (
              <option key={c}>{c}</option>
            ))}
          </Select>
        </Field>
      </div>
      <Field label="Email para avisos de formularios" hint="requiere Resend">
        <Input type="email" value={settings.notifyEmail ?? ""} onChange={(e) => upd({ notifyEmail: e.target.value }, "notify")} placeholder="tu@empresa.com" />
      </Field>
      <Field label="Webhook de formularios (Make, Zapier, n8n)">
        <Input value={settings.formWebhook ?? ""} onChange={(e) => upd({ formWebhook: e.target.value }, "webhook")} placeholder="https://hook.eu1.make.com/…" className="font-mono text-[11px]" />
      </Field>
      <p className="text-[11px] text-faint">Cada envío se guarda en el proyecto y, si los configuras, se avisa por email y se reenvía al webhook.</p>
    </div>
  );
}

export function RightPanel({ onPick }: { onPick: (t: { sectionId: string; field: string; itemId?: string }) => void }) {
  const s = useSelectedSection();
  const [tab, setTab] = useState("content");
  const scope = s ? "section" : "global";
  useEffect(() => {
    if (s && (tab === "theme" || tab === "page" || tab === "site")) setTab("content");
    if (!s && (tab === "content" || tab === "design")) setTab("theme");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope]);
  return (
    <Tabs value={tab} onValueChange={setTab} className="flex min-h-0 flex-1 flex-col">
      <TabsList>
        {s ? (
          <>
            <TabsTrigger value="content">Contenido</TabsTrigger>
            <TabsTrigger value="design">Diseño</TabsTrigger>
          </>
        ) : null}
        <TabsTrigger value="theme">Tema</TabsTrigger>
        <TabsTrigger value="page">Página</TabsTrigger>
        <TabsTrigger value="site">Sitio</TabsTrigger>
      </TabsList>
      {s ? (
        <div className="flex items-center justify-between border-b border-line px-3 py-2">
          <p className="text-[13px] font-medium">{SECTION_LABELS[s.type]}</p>
          <Button size="xs" variant="ghost" onClick={() => useEditor.getState().select(null)}>
            Deseleccionar
          </Button>
        </div>
      ) : null}
      <div className="scroll-thin min-h-0 flex-1 overflow-y-auto">
        {s ? (
          <>
            <TabsContent value="content">
              <ContentTab s={s} onPick={onPick} />
            </TabsContent>
            <TabsContent value="design">
              <DesignTab s={s} />
            </TabsContent>
          </>
        ) : null}
        <TabsContent value="theme">
          <ThemeTab />
        </TabsContent>
        <TabsContent value="page">
          <PageTab />
        </TabsContent>
        <TabsContent value="site">
          <SiteTab />
        </TabsContent>
      </div>
    </Tabs>
  );
}

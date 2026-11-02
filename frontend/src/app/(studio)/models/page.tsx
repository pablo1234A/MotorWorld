"use client";

import { Activity, ExternalLink, KeyRound, RefreshCw } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useMemo, useState } from "react";
import { priceLabel, ProviderPills } from "@/components/models";
import { Badge, Button, Card, cx, Input, PageHeader, Tabs } from "@/components/ui";
import { useModels, useProviders } from "@/lib/hooks";

const FILTERS = [
  { id: "all", label: "Todos" }, { id: "image", label: "Imágenes" }, { id: "video", label: "Vídeos" }, { id: "audio", label: "Audio" },
  { id: "edit", label: "Edición" }, { id: "free", label: "Gratuitos" }, { id: "paid", label: "De pago" }, { id: "local", label: "Locales" }, { id: "ready", label: "Listos para usar" },
];
const COMMERCIAL = { yes: ["ok", "Uso comercial"], no: ["err", "No comercial"], depends: ["warn", "Revisar licencia"] } as const;

function Catalog() {
  const { data } = useModels();
  const [f, setF] = useState("all");
  const [q, setQ] = useState("");
  const items = useMemo(() => (data?.items || []).filter((m) => {
    if (q && !`${m.name} ${m.family} ${m.description}`.toLowerCase().includes(q.toLowerCase())) return false;
    if (["image", "video", "audio", "edit"].includes(f)) return m.category === f || (f === "edit" && m.tasks.some((t) => ["image_edit", "inpaint", "video_to_video"].includes(t)));
    if (f === "free") return m.is_free_option || m.open_weights;
    if (f === "paid") return m.routes.some((r) => r.price && r.price.usd !== 0);
    if (f === "local") return m.has_local_route;
    if (f === "ready") return m.available;
    return true;
  }), [data, f, q]);
  return (
    <>
      <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-center">
        <div className="flex flex-wrap gap-1.5">
          {FILTERS.map((x) => (
            <button key={x.id} onClick={() => setF(x.id)} className={cx("rounded-full border px-3 py-1.5 text-[12.5px]", f === x.id ? "border-accent/60 bg-accent/10" : "border-line-2 text-muted hover:text-text")}>{x.label}</button>
          ))}
        </div>
        <Input className="md:ml-auto md:w-64" placeholder="Buscar modelo…" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
        {items.map((m) => {
          const [tone, label] = COMMERCIAL[m.commercial_use];
          return (
            <Card key={m.id} className="flex flex-col p-5" data-testid="model-card">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-mono text-[10.5px] tracking-wider text-dim uppercase">{m.family} · {m.category}</p>
                  <h3 className="mt-1 text-[16px] font-semibold">{m.name}</h3>
                </div>
                {m.available ? <Badge tone="ok">disponible</Badge> : <Badge tone="warn">sin configurar</Badge>}
              </div>
              <p className="mt-2 text-[13px] leading-relaxed text-muted">{m.description}</p>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {Object.values(m.task_labels).map((t) => <Badge key={t}>{t}</Badge>)}
              </div>
              <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 text-[12px]">
                {m.resolutions.length > 0 && (<><dt className="text-dim">Resoluciones</dt><dd>{m.resolutions.join(", ")}</dd></>)}
                {m.durations.length > 0 && (<><dt className="text-dim">Duraciones</dt><dd>{m.durations.join(" / ")} s</dd></>)}
                {m.aspect_ratios.length > 0 && (<><dt className="text-dim">Formatos</dt><dd className="truncate">{m.aspect_ratios.slice(0, 6).join(" ")}</dd></>)}
                <dt className="text-dim">Coste</dt><dd className="font-mono">{priceLabel(m, m.tasks[0])}</dd>
                <dt className="text-dim">Licencia</dt>
                <dd>{m.license_url ? <a href={m.license_url} target="_blank" rel="noreferrer" className="underline decoration-dim underline-offset-2">{m.license}</a> : m.license}</dd>
              </dl>
              <div className="mt-3 flex flex-wrap gap-1.5">
                <Badge tone={tone as any}>{label}</Badge>
                {m.open_weights && <Badge tone="info">pesos abiertos</Badge>}
                {m.has_local_route && <Badge>ejecutable en local</Badge>}
              </div>
              {m.limitations && <p className="mt-3 text-[12px] text-dim">⚠ {m.limitations}</p>}
              <div className="mt-auto pt-4">
                <p className="mb-1.5 font-mono text-[10px] text-dim uppercase">Proveedores (requisitos)</p>
                <ProviderPills m={m} />
              </div>
            </Card>
          );
        })}
      </div>
    </>
  );
}

function ProvidersPanel() {
  const [live, setLive] = useState(false);
  const { data, isFetching, refetch } = useProviders(live);
  const groups = [["cloud", "Proveedores en la nube"], ["local", "Ejecución local"], ["llm", "Modelos de lenguaje (guion)"], ["stock", "Recursos gratuitos"]] as const;
  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="outline" onClick={() => { setLive(true); refetch(); }} loading={isFetching}><Activity className="h-4 w-4" /> Comprobar conexión en vivo</Button>
        <span className="text-[12px] text-dim">La comprobación usa endpoints de cuenta/estado (sin coste de generación).</span>
        <Link href="/settings?tab=keys" className="ml-auto inline-flex items-center gap-1.5 text-[13px] text-muted hover:text-text"><KeyRound className="h-4 w-4" /> Gestionar mis claves</Link>
      </div>
      {groups.map(([kind, title]) => (
        <div key={kind}>
          <h2 className="mb-3 text-[13px] font-semibold tracking-[0.12em] text-muted uppercase">{title}</h2>
          <div className="grid gap-3 lg:grid-cols-2">
            {data?.items.filter((p) => p.kind === kind).map((p) => (
              <Card key={p.id} className="p-5" data-testid={`provider-${p.id}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    <span className={cx("h-2.5 w-2.5 rounded-full", p.configured ? (p.health ? (p.health.ok ? "bg-ok" : "bg-err") : "bg-ok") : "bg-line-2")} />
                    <h3 className="font-semibold">{p.name}</h3>
                  </div>
                  <div className="flex gap-1.5">
                    {p.configured ? <Badge tone="ok">activo{p.key_source ? ` · clave de ${p.key_source}` : ""}</Badge> : p.requires_key ? <Badge tone="warn">necesita API key</Badge> : <Badge>no configurado</Badge>}
                  </div>
                </div>
                {p.health && <p className={cx("mt-2 font-mono text-[11.5px]", p.health.ok ? "text-ok" : "text-err")}>{p.health.ok ? "✓" : "✕"} {p.health.message}</p>}
                <p className="mt-3 text-[13px] text-muted"><span className="text-text">Nivel gratuito: </span>{p.free_tier}</p>
                <p className="mt-1.5 text-[12.5px] text-dim">{p.commercial_note}</p>
                {!p.configured && <p className="mt-3 rounded-lg bg-panel-2 px-3 py-2 text-[12px] text-muted">{p.setup_hint}{p.key_env ? <> · variable <code className="font-mono text-text">{p.key_env}</code></> : null}</p>}
                <div className="mt-3 flex flex-wrap items-center gap-3 text-[12px]">
                  {p.signup_url && <a href={p.signup_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-muted hover:text-text">Obtener clave <ExternalLink className="h-3 w-3" /></a>}
                  {p.docs_url && <a href={p.docs_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-muted hover:text-text">Documentación <ExternalLink className="h-3 w-3" /></a>}
                  {p.models.length > 0 && <span className="text-dim">{p.models.length} modelos</span>}
                </div>
              </Card>
            ))}
          </div>
        </div>
      ))}
      <p className="flex items-center gap-1.5 text-[12px] text-dim"><RefreshCw className="h-3 w-3" /> Si un proveedor falla, cada generación prueba automáticamente el siguiente proveedor configurado para el mismo modelo.</p>
    </div>
  );
}

function ModelsHub() {
  const sp = useSearchParams();
  const router = useRouter();
  const tab = (sp.get("tab") as "catalog" | "providers") || "catalog";
  return (
    <div>
      <PageHeader eyebrow="Centro de modelos" title={<>Modelos <em className="text-muted">y proveedores</em></>}>
        Todos los motores disponibles, sus capacidades, licencias y costes, y qué proveedores están activos o necesitan una API key.
      </PageHeader>
      <Tabs value={tab} onChange={(t) => router.replace(`/models?tab=${t}`)} className="mb-6" items={[{ id: "catalog", label: "Catálogo de modelos" }, { id: "providers", label: "Panel de proveedores" }]} />
      {tab === "catalog" ? <Catalog /> : <ProvidersPanel />}
    </div>
  );
}

export default function ModelsPage() {
  return <Suspense><ModelsHub /></Suspense>;
}

"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, KeyRound, ShieldCheck, Trash2 } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { toast } from "sonner";
import { Badge, Button, Card, Input, Label, Notice, PageHeader, Tabs, Toggle } from "@/components/ui";
import { api, errMsg, fmtDate } from "@/lib/api";
import { useMe, useProviders } from "@/lib/hooks";

const PROVIDER_NAMES: Record<string, string> = {
  replicate: "Replicate", fal: "fal.ai", huggingface: "Hugging Face", bfl: "Black Forest Labs", elevenlabs: "ElevenLabs",
  anthropic: "Anthropic (Claude)", openai_compat: "LLM compatible OpenAI", pexels: "Pexels", pixabay: "Pixabay", unsplash: "Unsplash",
};

function Keys() {
  const qc = useQueryClient();
  const keys = useQuery<{ enabled: boolean; keys: { provider: string; configured: boolean; hint: string | null; updated_at: string | null }[] }>({ queryKey: ["keys"], queryFn: () => api("/api/me/keys") });
  const [values, setValues] = useState<Record<string, string>>({});
  const save = async (p: string) => {
    try {
      await api(`/api/me/keys/${p}`, { method: "PUT", json: { value: values[p] } });
      setValues({ ...values, [p]: "" });
      qc.invalidateQueries({ queryKey: ["keys"] });
      qc.invalidateQueries({ queryKey: ["models"] });
      qc.invalidateQueries({ queryKey: ["providers"] });
      toast.success("Clave guardada cifrada");
    } catch (e) {
      toast.error(errMsg(e));
    }
  };
  const del = async (p: string) => {
    await api(`/api/me/keys/${p}`, { method: "DELETE" });
    qc.invalidateQueries();
    toast.success("Clave eliminada");
  };
  if (keys.data && !keys.data.enabled) return <Notice>El administrador ha desactivado las claves propias: los proveedores se configuran en el servidor.</Notice>;
  return (
    <div className="space-y-4">
      <Notice tone="info">
        <span className="flex items-start gap-2"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" /> Las claves se cifran en el servidor (Fernet/AES) y nunca se devuelven al navegador: solo verás sus 4 últimos caracteres. Tienen prioridad sobre las claves del servidor y su coste se factura en tu cuenta del proveedor.</span>
      </Notice>
      <div className="grid gap-3 lg:grid-cols-2">
        {keys.data?.keys.map((k) => (
          <Card key={k.provider} className="p-4">
            <div className="mb-3 flex items-center justify-between">
              <span className="flex items-center gap-2 font-medium"><KeyRound className="h-4 w-4 text-accent" /> {PROVIDER_NAMES[k.provider] || k.provider}</span>
              {k.configured ? <Badge tone="ok">guardada {k.hint}</Badge> : <Badge>sin clave</Badge>}
            </div>
            <div className="flex gap-2">
              <Input type="password" autoComplete="off" placeholder={k.configured ? "Reemplazar clave…" : "Pega tu API key"} value={values[k.provider] || ""} onChange={(e) => setValues({ ...values, [k.provider]: e.target.value })} />
              <Button onClick={() => save(k.provider)} disabled={(values[k.provider] || "").length < 8}>Guardar</Button>
              {k.configured && <Button variant="ghost" size="icon" onClick={() => del(k.provider)} aria-label="Eliminar clave"><Trash2 className="h-4 w-4" /></Button>}
            </div>
            {k.updated_at && <p className="mt-2 font-mono text-[10.5px] text-dim">actualizada {fmtDate(k.updated_at)}</p>}
          </Card>
        ))}
      </div>
    </div>
  );
}

function Preferences() {
  const me = useMe();
  const qc = useQueryClient();
  const providers = useProviders();
  const [order, setOrder] = useState<string[]>([]);
  const [showCosts, setShowCosts] = useState(true);
  useEffect(() => {
    if (!me.data || !providers.data) return;
    const all = providers.data.items.filter((p) => ["cloud", "local"].includes(p.kind)).map((p) => p.id);
    const saved: string[] = me.data.preferences.provider_order || [];
    setOrder([...saved.filter((x) => all.includes(x)), ...all.filter((x) => !saved.includes(x))]);
    setShowCosts(me.data.preferences.show_costs ?? true);
  }, [me.data, providers.data]);
  const move = (i: number, d: number) => {
    const o = [...order];
    const j = i + d;
    if (j < 0 || j >= o.length) return;
    [o[i], o[j]] = [o[j], o[i]];
    setOrder(o);
  };
  const save = async () => {
    try {
      await api("/api/me", { method: "PATCH", json: { preferences: { provider_order: order, show_costs: showCosts } } });
      qc.invalidateQueries({ queryKey: ["me"] });
      toast.success("Preferencias guardadas");
    } catch (e) {
      toast.error(errMsg(e));
    }
  };
  return (
    <Card className="max-w-2xl space-y-5 p-5">
      <div>
        <Label>Prioridad de proveedores</Label>
        <p className="mb-3 text-[12.5px] text-muted">Cuando un modelo está disponible en varios proveedores se usa el primero configurado de esta lista; si falla, se prueba el siguiente automáticamente. Pon arriba los locales o gratuitos para priorizarlos.</p>
        <ol className="space-y-1.5">
          {order.map((p, i) => (
            <li key={p} className="flex items-center gap-2 rounded-lg border border-line bg-panel-2 px-3 py-2 text-[13px]">
              <span className="w-5 font-mono text-[11px] text-dim">{i + 1}</span>
              <span className="flex-1">{providers.data?.items.find((x) => x.id === p)?.name || p}</span>
              <Button size="icon" variant="ghost" onClick={() => move(i, -1)} aria-label="Subir"><ArrowUp className="h-3.5 w-3.5" /></Button>
              <Button size="icon" variant="ghost" onClick={() => move(i, 1)} aria-label="Bajar"><ArrowDown className="h-3.5 w-3.5" /></Button>
            </li>
          ))}
        </ol>
      </div>
      <Toggle checked={showCosts} onChange={setShowCosts} label="Mostrar costes estimados" />
      <Button variant="primary" onClick={save}>Guardar preferencias</Button>
    </Card>
  );
}

function Profile() {
  const me = useMe();
  const qc = useQueryClient();
  const router = useRouter();
  const [name, setName] = useState("");
  const [pw, setPw] = useState({ current_password: "", new_password: "" });
  const [del, setDel] = useState({ email: "", password: "" });
  const sessions = useQuery<any[]>({ queryKey: ["sessions"], queryFn: () => api("/api/me/sessions") });
  useEffect(() => setName(me.data?.display_name || ""), [me.data]);
  const run = async (fn: () => Promise<unknown>, ok: string) => {
    try { await fn(); toast.success(ok); qc.invalidateQueries({ queryKey: ["me"] }); } catch (e) { toast.error(errMsg(e)); }
  };
  return (
    <div className="grid max-w-4xl gap-5 lg:grid-cols-2">
      <Card className="space-y-4 p-5">
        <Label>Perfil</Label>
        <div><span className="text-[11px] text-dim">Email</span><Input value={me.data?.email || ""} disabled /></div>
        <div><span className="text-[11px] text-dim">Nombre visible</span><Input value={name} onChange={(e) => setName(e.target.value)} /></div>
        <Button onClick={() => run(() => api("/api/me", { method: "PATCH", json: { display_name: name } }), "Perfil actualizado")}>Guardar</Button>
      </Card>
      <Card className="space-y-4 p-5">
        <Label>Cambiar contraseña</Label>
        <Input type="password" placeholder="Contraseña actual" value={pw.current_password} onChange={(e) => setPw({ ...pw, current_password: e.target.value })} autoComplete="current-password" />
        <Input type="password" placeholder="Nueva contraseña (10+, Aa, 1-9)" value={pw.new_password} onChange={(e) => setPw({ ...pw, new_password: e.target.value })} autoComplete="new-password" />
        <Button onClick={() => run(async () => { await api("/api/me/password", { method: "POST", json: pw }); setPw({ current_password: "", new_password: "" }); }, "Contraseña cambiada")}>Cambiar</Button>
      </Card>
      <Card className="space-y-3 p-5">
        <Label>Sesiones activas</Label>
        {sessions.data?.map((s) => <p key={s.id} className="truncate font-mono text-[11.5px] text-muted">{fmtDate(s.created_at)} · {s.ip} · {s.user_agent}</p>)}
        <Button variant="outline" onClick={() => run(async () => { await api("/api/me/sessions/revoke-all", { method: "POST" }); router.push("/login"); }, "Sesiones cerradas")}>Cerrar todas las sesiones</Button>
      </Card>
      <Card className="space-y-3 border-err/30 p-5">
        <Label>Eliminar cuenta</Label>
        <p className="text-[12.5px] text-muted">Borra tu cuenta, proyectos y todos tus archivos de forma permanente.</p>
        <Input placeholder="Tu email" value={del.email} onChange={(e) => setDel({ ...del, email: e.target.value })} />
        <Input type="password" placeholder="Tu contraseña" value={del.password} onChange={(e) => setDel({ ...del, password: e.target.value })} />
        <Button variant="danger" disabled={!del.email || !del.password} onClick={() => confirm("Esta acción no se puede deshacer. ¿Eliminar la cuenta?") && run(async () => { await api("/api/me", { method: "DELETE", json: del }); window.location.href = "/register"; }, "Cuenta eliminada")}>Eliminar definitivamente</Button>
      </Card>
    </div>
  );
}

function Settings() {
  const sp = useSearchParams();
  const router = useRouter();
  const tab = (sp.get("tab") as "profile" | "keys" | "prefs") || "profile";
  return (
    <div>
      <PageHeader eyebrow="Configuración" title={<>Configuración</>}>Perfil, seguridad, claves de proveedores y preferencias de generación.</PageHeader>
      <Tabs value={tab} onChange={(t) => router.replace(`/settings?tab=${t}`)} className="mb-6" items={[{ id: "profile", label: "Perfil y seguridad" }, { id: "keys", label: "Claves API" }, { id: "prefs", label: "Preferencias" }]} />
      {tab === "profile" && <Profile />}
      {tab === "keys" && <Keys />}
      {tab === "prefs" && <Preferences />}
    </div>
  );
}

export default function SettingsPage() {
  return <Suspense><Settings /></Suspense>;
}

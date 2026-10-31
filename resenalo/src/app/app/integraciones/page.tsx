"use client";
import { useState } from "react";
import { Copy, KeyRound, Lock, Plus, RefreshCw } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import { fmtDate } from "@/lib/format";
import { Alert, Badge, Card, CardHeader, EmptyState, PageHeader } from "@/components/ui/Display";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Input } from "@/components/ui/Field";
import { Modal } from "@/components/ui/Modal";
import { PageLoader } from "@/components/ui/Spinner";
import { useToast } from "@/components/ui/Toast";

type I = { available: boolean; apiKeys?: { id: string; name: string; prefix: string; lastUsedAt: string | null; revokedAt: string | null; createdAt: string }[]; apiEndpoint?: string; webhook?: { url: string; secret: string } };

export default function IntegrationsPage() {
  const d = useApi<I>("/api/v1/integrations");
  const toast = useToast();
  const [newKey, setNewKey] = useState<{ open: boolean; name: string; secret?: string }>({ open: false, name: "" });
  const [showSecret, setShowSecret] = useState(false);
  const copy = (t: string) => navigator.clipboard.writeText(t).then(() => toast("ok", "Copiado"));
  if (d.loading && !d.data) return <PageLoader />;
  if (d.error) return <Alert tone="bad">{d.error.message}</Alert>;
  if (!d.data?.available)
    return (
      <>
        <PageHeader title="API e integraciones" />
        <Card><EmptyState icon={<Lock className="h-5 w-5" />} title="Disponible a partir del plan Pro" action={<ButtonLink href="/app/facturacion">Ver planes</ButtonLink>}>Conecta tu CRM, agenda o tienda para que comunique a Reseñalo cada servicio finalizado mediante API REST o webhook firmado.</EmptyState></Card>
      </>
    );
  const x = d.data;
  const example = `curl -X POST ${x.apiEndpoint} \\
  -H "Authorization: Bearer rsn_live_…" \\
  -H "Content-Type: application/json" \\
  -d '{
    "externalId": "cita-1234",
    "customer": { "name": "Laura Martín", "email": "laura@ejemplo.es" },
    "serviceName": "Limpieza dental",
    "completedAt": "2026-10-31T10:30:00Z"
  }'`;
  return (
    <>
      <PageHeader title="API e integraciones" description="Permite que otros programas avisen a Reseñalo cuando finaliza un servicio." />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Claves de API" description="Autenticación Bearer para la API REST." action={<Button size="sm" icon={<Plus className="h-4 w-4" />} onClick={() => setNewKey({ open: true, name: "" })}>Nueva clave</Button>} />
          {x.apiKeys?.length ? (
            <ul className="divide-y divide-ink-100">
              {x.apiKeys.map((k) => (
                <li key={k.id} className="flex items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium"><KeyRound className="mr-1.5 inline h-3.5 w-3.5 text-ink-400" />{k.name} {k.revokedAt ? <Badge className="ml-1">Revocada</Badge> : null}</p>
                    <p className="text-xs text-ink-500"><code>{k.prefix}…</code> · creada {fmtDate(k.createdAt)} · {k.lastUsedAt ? `último uso ${fmtDate(k.lastUsedAt, true)}` : "sin uso"}</p>
                  </div>
                  {!k.revokedAt ? <Button size="sm" variant="ghost" onClick={async () => { await api(`/api/v1/integrations/api-keys/${k.id}`, { method: "DELETE" }); toast("ok", "Clave revocada"); await d.reload(); }}>Revocar</Button> : null}
                </li>
              ))}
            </ul>
          ) : <p className="text-sm text-ink-500">Aún no has creado ninguna clave.</p>}
        </Card>
        <Card>
          <CardHeader title="Webhook entrante" description="Para programas que envían webhooks firmados (HMAC-SHA256)." />
          <div className="space-y-3">
            <div>
              <p className="label">URL</p>
              <div className="flex gap-2"><code className="input truncate py-2 text-xs">{x.webhook?.url}</code><Button variant="secondary" size="md" icon={<Copy className="h-4 w-4" />} aria-label="Copiar URL" onClick={() => copy(x.webhook!.url)} /></div>
            </div>
            <div>
              <p className="label">Secreto de firma</p>
              <div className="flex gap-2">
                <code className="input truncate py-2 text-xs">{showSecret ? x.webhook?.secret : "whsec_••••••••••••••••"}</code>
                <Button variant="secondary" onClick={() => setShowSecret((s) => !s)}>{showSecret ? "Ocultar" : "Mostrar"}</Button>
              </div>
            </div>
            <p className="text-xs text-ink-500">Cabecera <code>X-Resenalo-Signature: t=&lt;unix&gt;,v1=&lt;hex&gt;</code>, donde v1 = HMAC_SHA256(secreto, <code>t + &quot;.&quot; + cuerpo</code>). Tolerancia: 5 minutos.</p>
            <Button size="sm" variant="ghost" icon={<RefreshCw className="h-4 w-4" />} onClick={async () => { await api("/api/v1/integrations/webhook/rotate", { method: "POST", body: {} }); toast("ok", "Secreto regenerado"); await d.reload(); }}>Regenerar secreto</Button>
          </div>
        </Card>
      </div>
      <Card className="mt-4">
        <CardHeader title="Ejemplo: registrar un servicio finalizado" description="El mismo cuerpo JSON sirve para la API y para el webhook. externalId garantiza que no se dupliquen solicitudes." />
        <pre className="overflow-x-auto rounded-lg bg-ink-900 p-4 text-xs leading-relaxed text-cream-100"><code>{example}</code></pre>
        <p className="mt-3 text-sm text-ink-600">Respuesta: <code>201</code> con <code>{`{ "status": "CREATED", "jobId": "…", "scheduledFor": "…" }`}</code>, o <code>200</code> con <code>DUPLICATE</code> / <code>SKIPPED</code> / <code>REJECTED</code> y el motivo (p. ej. <code>LIMIT_REACHED</code>). Límite: 120 peticiones/minuto.</p>
      </Card>
      <Modal open={newKey.open} onClose={() => setNewKey({ open: false, name: "" })} title="Nueva clave de API" footer={newKey.secret ? <Button onClick={() => { setNewKey({ open: false, name: "" }); void d.reload(); }}>Hecho</Button> : <Button disabled={!newKey.name} onClick={async () => { try { const r = await api<{ secret: string }>("/api/v1/integrations/api-keys", { body: { name: newKey.name } }); setNewKey({ ...newKey, secret: r.secret }); } catch (e) { toast("bad", (e as ApiError).message); } }}>Crear clave</Button>}>
        {newKey.secret ? (
          <div className="space-y-3">
            <Alert tone="warn">Copia la clave ahora: por seguridad no volverá a mostrarse.</Alert>
            <div className="flex gap-2"><code className="input break-all py-2 text-xs">{newKey.secret}</code><Button variant="secondary" icon={<Copy className="h-4 w-4" />} aria-label="Copiar" onClick={() => copy(newKey.secret!)} /></div>
          </div>
        ) : <Input label="Nombre" placeholder="CRM, agenda, tienda…" value={newKey.name} onChange={(e) => setNewKey({ ...newKey, name: e.target.value })} />}
      </Modal>
    </>
  );
}

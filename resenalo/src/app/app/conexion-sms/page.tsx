"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { CheckCircle2, Lock, RefreshCw, Send, Smartphone, Unplug } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import { fmtDate, relTime } from "@/lib/format";
import { Alert, Badge, Card, CardHeader, EmptyState, PageHeader } from "@/components/ui/Display";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Input } from "@/components/ui/Field";
import { Modal } from "@/components/ui/Modal";
import { PageLoader } from "@/components/ui/Spinner";
import { useToast } from "@/components/ui/Toast";

type Dev = { status: string; deviceId: string | null; deviceName: string | null; phoneNumber: string | null; usesCloud: boolean; apiBaseUrl: string; lastSeenAt: string | null; lastCheckedAt: string | null; lastError: string | null; connectedAt: string; needsDevice: boolean };
type D = { device: Dev | null; onHold: number; smsIncluded: boolean; suggestedPhone: string | null };
type GDev = { id: string; name: string; lastSeen: string | null };

export default function SmsDevicePage() {
  const d = useApi<D>("/api/v1/sms-device");
  const toast = useToast();
  const [form, setForm] = useState({ login: "", password: "", phoneNumber: "", apiBaseUrl: "" });
  const [advanced, setAdvanced] = useState(false);
  const [err, setErr] = useState<{ msg?: string; fields?: Record<string, string> }>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [choices, setChoices] = useState<GDev[] | null>(null);
  const [confirm, setConfirm] = useState(false);
  useEffect(() => {
    if (d.data?.suggestedPhone && !form.phoneNumber) setForm((f) => ({ ...f, phoneNumber: d.data!.suggestedPhone! }));
  }, [d.data, form.phoneNumber]);

  if (d.loading && !d.data) return <PageLoader />;
  if (d.error) return <Alert tone="bad">{d.error.message}</Alert>;
  const x = d.data!;
  const dev = x.device;
  const offlineLong = dev?.lastSeenAt ? Date.now() - new Date(dev.lastSeenAt).getTime() > 6 * 3600_000 : false;

  if (!x.smsIncluded)
    return (
      <>
        <PageHeader title="Móvil para SMS" />
        <Card><EmptyState icon={<Lock className="h-5 w-5" />} title="Los SMS están disponibles a partir del plan Pro" action={<ButtonLink href="/app/facturacion">Ver planes</ButtonLink>}>Envía las solicitudes por SMS desde tu propio móvil Android, con tu número y tu tarifa.</EmptyState></Card>
      </>
    );

  const connect = async () => {
    setBusy("connect");
    setErr({});
    try {
      const r = await api<{ device: Dev; devices: GDev[] }>("/api/v1/sms-device/connect", { body: { ...form, apiBaseUrl: advanced && form.apiBaseUrl ? form.apiBaseUrl : null } });
      if (r.device.needsDevice) setChoices(r.devices);
      else toast("ok", "Móvil vinculado correctamente");
      await d.reload();
    } catch (e) {
      const a = e as ApiError;
      setErr({ msg: a.message, fields: a.fields });
    }
    setBusy(null);
  };

  return (
    <>
      <PageHeader title="Móvil para SMS" description="Los SMS de reseña salen de tu propio móvil Android: con tu número, tu nombre en la agenda de tus clientes y tu tarifa de SMS." />

      {!dev ? (
        <div className="grid gap-4 lg:grid-cols-[1.1fr_1fr]">
          <Card>
            <CardHeader title="Cómo vincular tu móvil" description="Unos 3 minutos. Solo hace falta hacerlo una vez." />
            <ol className="space-y-4 text-sm text-ink-700">
              <li className="flex gap-3"><Step n={1} /><span>En tu móvil <strong>Android</strong>, instala la app gratuita y de código abierto <strong>SMS Gate</strong> (Google Play o <a className="underline" href="https://github.com/capcom6/android-sms-gateway/releases" target="_blank" rel="noopener noreferrer">GitHub</a>).</span></li>
              <li className="flex gap-3"><Step n={2} /><span>Ábrela, concede el permiso para enviar SMS y activa <strong>«Servidor en la nube»</strong> (Cloud server). Pulsa <strong>«Online»</strong>.</span></li>
              <li className="flex gap-3"><Step n={3} /><span>La app te mostrará un <strong>usuario</strong> y una <strong>contraseña</strong>. Cópialos aquí.</span></li>
              <li className="flex gap-3"><Step n={4} /><span>Deja el móvil con batería y conexión a internet. En los ajustes de batería de Android, marca SMS Gate como «sin restricciones» para que no se duerma.</span></li>
            </ol>
            <Alert tone="info" className="mt-5">Con iPhone no es posible: Apple no permite que ninguna app envíe SMS automáticamente.</Alert>
          </Card>
          <Card>
            <CardHeader title="Datos de la app SMS Gate" />
            <div className="space-y-4">
              {err.msg ? <Alert tone="bad">{err.msg}</Alert> : null}
              <Input label="Usuario" autoComplete="off" value={form.login} onChange={(e) => setForm({ ...form, login: e.target.value })} error={err.fields?.login} />
              <Input label="Contraseña" type="password" autoComplete="new-password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} error={err.fields?.password} />
              <Input label="Número de este móvil" type="tel" placeholder="+34 600 000 000" value={form.phoneNumber} onChange={(e) => setForm({ ...form, phoneNumber: e.target.value })} help="Para identificarlo y enviarte la prueba. Por defecto, el de tu registro." />
              <button type="button" className="text-xs text-ink-500 underline" onClick={() => setAdvanced((a) => !a)}>{advanced ? "Usar el servidor en la nube (recomendado)" : "Uso mi propio servidor SMS Gate (avanzado)"}</button>
              {advanced ? <Input label="Dirección de tu servidor" placeholder="https://sms.tudominio.es/3rdparty/v1" value={form.apiBaseUrl} onChange={(e) => setForm({ ...form, apiBaseUrl: e.target.value })} /> : null}
              <Button className="w-full" loading={busy === "connect"} disabled={!form.login || !form.password} onClick={connect} icon={<Smartphone className="h-4 w-4" />}>Vincular mi móvil</Button>
              <p className="text-xs text-ink-500">Guardamos la contraseña cifrada. Puedes desvincular el móvil cuando quieras, aquí o desde la propia app.</p>
            </div>
          </Card>
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <div className="flex items-start gap-4">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-cream-200"><Smartphone className="h-5 w-5 text-ink-600" /></div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-semibold">{dev.deviceName ?? "Móvil sin elegir"}</p>
                  {dev.status !== "ACTIVE" ? <Badge tone="bad" dot>Hay que volver a vincularlo</Badge> : dev.needsDevice ? <Badge tone="warn" dot>Elige el móvil</Badge> : offlineLong ? <Badge tone="warn" dot>Sin conexión</Badge> : <Badge tone="ok" dot>Vinculado</Badge>}
                </div>
                <p className="mt-0.5 text-sm text-ink-500">{dev.phoneNumber ?? "Número no indicado"} · {dev.usesCloud ? "Servidor en la nube de SMS Gate" : dev.apiBaseUrl}</p>
                <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
                  <div><dt className="text-ink-500">Última conexión del móvil</dt><dd className="font-medium">{dev.lastSeenAt ? relTime(dev.lastSeenAt) : "—"}</dd></div>
                  <div><dt className="text-ink-500">Vinculado el</dt><dd className="font-medium">{fmtDate(dev.connectedAt, true)}</dd></div>
                </dl>
              </div>
            </div>
            {offlineLong && dev.status === "ACTIVE" ? <Alert tone="warn" className="mt-5">Tu móvil no se conecta desde {fmtDate(dev.lastSeenAt, true)}. Los SMS esperan hasta 24 horas a que vuelva a estar encendido y con internet; después se marcan como fallidos.</Alert> : null}
            {dev.lastError ? <Alert tone={dev.status === "ACTIVE" ? "warn" : "bad"} className="mt-5">{dev.lastError}{x.onHold ? ` · ${x.onHold} SMS en espera.` : ""}</Alert> : null}
            {dev.needsDevice ? (
              <Button className="mt-5" variant="secondary" onClick={async () => setChoices((await api<{ devices: GDev[] }>("/api/v1/sms-device/devices")).devices)}>Elegir el móvil</Button>
            ) : null}
            <div className="mt-6 flex flex-wrap gap-2">
              <Button variant="secondary" icon={<RefreshCw className="h-4 w-4" />} loading={busy === "check"} onClick={async () => {
                setBusy("check");
                try { const r = await api<{ ok: boolean; error: string | null }>("/api/v1/sms-device/check", { method: "POST", body: {} }); toast(r.ok ? "ok" : "bad", r.ok ? "El móvil responde correctamente." : r.error ?? "No responde"); await d.reload(); } catch (e) { toast("bad", (e as ApiError).message); }
                setBusy(null);
              }}>Comprobar móvil</Button>
              <Button variant="secondary" icon={<Send className="h-4 w-4" />} loading={busy === "test"} disabled={dev.needsDevice || dev.status !== "ACTIVE" || !(dev.phoneNumber || x.suggestedPhone)} onClick={async () => {
                setBusy("test");
                try { await api("/api/v1/sms-device/test", { body: { to: dev.phoneNumber ?? x.suggestedPhone } }); toast("ok", "SMS de prueba enviado a tu móvil. Debería llegarte en unos segundos."); } catch (e) { toast("bad", (e as ApiError).message); }
                setBusy(null);
              }}>Enviarme un SMS de prueba</Button>
              <Button variant="ghost" icon={<Unplug className="h-4 w-4" />} onClick={() => setConfirm(true)}>Desvincular</Button>
            </div>
          </Card>
          <Card>
            <CardHeader title="Bueno saber" />
            <ul className="space-y-3 text-sm text-ink-700">
              <li className="flex gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-ok-600" />Los SMS salen con tu número: tus clientes te reconocen y pueden responderte.</li>
              <li className="flex gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-ok-600" />Cuentan como SMS de tu tarifa móvil. Revisa que tu tarifa los incluya.</li>
              <li className="flex gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-ok-600" />Verás en el historial cuándo el móvil lo envió y cuándo el operador lo entregó.</li>
            </ul>
            <p className="mt-4 text-xs text-ink-500">Las automatizaciones por SMS se activan en <Link href="/app/automatizaciones" className="underline">Automatizaciones</Link>.</p>
          </Card>
        </div>
      )}

      <Modal open={Boolean(choices)} onClose={() => setChoices(null)} title="¿Desde qué móvil se envían los SMS?">
        <ul className="space-y-2">
          {choices?.map((c) => (
            <li key={c.id} className="flex items-center justify-between gap-3 rounded-lg border border-ink-200 p-3">
              <div><p className="text-sm font-medium">{c.name}</p><p className="text-xs text-ink-500">{c.lastSeen ? `Conectado ${relTime(c.lastSeen)}` : "Sin conexión reciente"}</p></div>
              <Button size="sm" onClick={async () => { await api("/api/v1/sms-device/select", { body: { deviceId: c.id } }); setChoices(null); toast("ok", "Móvil seleccionado"); await d.reload(); }}>Usar este</Button>
            </li>
          ))}
        </ul>
      </Modal>
      <Modal open={confirm} onClose={() => setConfirm(false)} title="Desvincular el móvil" footer={<>
        <Button variant="ghost" onClick={() => setConfirm(false)}>Cancelar</Button>
        <Button variant="danger" onClick={async () => { await api("/api/v1/sms-device", { method: "DELETE" }); setConfirm(false); toast("ok", "Móvil desvinculado"); await d.reload(); }}>Desvincular</Button>
      </>}>
        <p className="text-sm text-ink-600">Los SMS pendientes quedarán en espera hasta que vincules otro móvil.</p>
      </Modal>
    </>
  );
}

function Step({ n }: { n: number }) {
  return <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-ink-800 text-xs font-semibold text-white">{n}</span>;
}

"use client";
import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { CheckCircle2, Mail, RefreshCw, Send, Unplug, XCircle } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import { fmtDate } from "@/lib/format";
import { Alert, Badge, Card, CardHeader, PageHeader } from "@/components/ui/Display";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { PageLoader } from "@/components/ui/Spinner";
import { useToast } from "@/components/ui/Toast";
import { EmailConnectButtons } from "@/components/app/EmailConnect";

type C = { connection: { provider: string; emailAddress: string; displayName: string | null; status: string; lastCheckedAt: string | null; lastError: string | null; lastErrorAt: string | null; connectedAt: string } | null; onHold: number; providers: { google: boolean; microsoft: boolean } };

function ConnectionPage() {
  const sp = useSearchParams();
  const toast = useToast();
  const d = useApi<C>("/api/v1/email-connection");
  const me = useApi<{ user: { email: string } }>("/api/v1/auth/me");
  const [busy, setBusy] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);
  if (d.loading && !d.data) return <PageLoader />;
  if (d.error) return <Alert tone="bad">{d.error.message}</Alert>;
  const c = d.data!.connection;
  const active = c?.status === "ACTIVE";
  const needsReauth = c?.status === "NEEDS_REAUTH";
  const provider = c?.provider === "GOOGLE" ? "Gmail / Google Workspace" : "Outlook / Microsoft 365";

  const check = async () => {
    setBusy("check");
    try {
      const r = await api<{ ok: boolean; error: string | null }>("/api/v1/email-connection/check", { method: "POST", body: {} });
      toast(r.ok ? "ok" : "bad", r.ok ? "La autorización es válida." : `La conexión no funciona: ${r.error}`);
      await d.reload();
    } catch (e) { toast("bad", (e as ApiError).message); }
    setBusy(null);
  };
  const test = async () => {
    setBusy("test");
    try {
      await api("/api/v1/email-connection/test", { body: { to: me.data?.user.email } });
      toast("ok", `Correo de prueba enviado a ${me.data?.user.email}. Revisa tu bandeja.`);
      await d.reload();
    } catch (e) { toast("bad", (e as ApiError).message); await d.reload(); }
    setBusy(null);
  };

  return (
    <>
      <PageHeader title="Conexión de correo" description="La cuenta desde la que se envían las solicitudes de reseña a tus clientes." />
      {sp.get("connected") ? <Alert tone="ok" className="mb-4" title="Cuenta conectada correctamente">El proveedor ha confirmado la autorización de envío.</Alert> : null}
      {sp.get("error") ? <Alert tone="bad" className="mb-4" title="No se pudo conectar">{sp.get("error")}</Alert> : null}

      {!c || c.status === "DISCONNECTED" ? (
        <Card>
          <CardHeader title="Conecta tu cuenta" description="Elige el proveedor de tu correo profesional. Te redirigiremos a su página oficial para autorizar el envío." />
          {c?.status === "DISCONNECTED" ? <Alert tone="info" className="mb-4">Desconectaste {c.emailAddress}. {d.data!.onHold ? `Hay ${d.data!.onHold} envíos en espera que se reanudarán al conectar.` : ""}</Alert> : null}
          <EmailConnectButtons providers={d.data!.providers} />
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <div className="flex items-start gap-4">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-cream-200"><Mail className="h-5 w-5 text-ink-600" /></div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="truncate font-semibold">{c.emailAddress}</p>
                  <Badge tone={active ? "ok" : "bad"} dot>{active ? "Conectada" : "Requiere reconexión"}</Badge>
                </div>
                <p className="mt-0.5 text-sm text-ink-500">{provider}{c.displayName ? ` · ${c.displayName}` : ""}</p>
                <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
                  <div><dt className="text-ink-500">Conectada el</dt><dd className="font-medium">{fmtDate(c.connectedAt, true)}</dd></div>
                  <div><dt className="text-ink-500">Última comprobación</dt><dd className="font-medium">{fmtDate(c.lastCheckedAt, true)}</dd></div>
                </dl>
              </div>
            </div>
            {needsReauth ? (
              <Alert tone="bad" className="mt-5" title="Autorización perdida">
                {c.lastError}. {d.data!.onHold ? `${d.data!.onHold} envíos están en espera y se reanudarán al reconectar.` : ""}
              </Alert>
            ) : c.lastError ? <Alert tone="warn" className="mt-5">Último error ({fmtDate(c.lastErrorAt, true)}): {c.lastError}</Alert> : null}
            <div className="mt-6 flex flex-wrap gap-2">
              {active ? (
                <>
                  <Button variant="secondary" icon={<RefreshCw className="h-4 w-4" />} loading={busy === "check"} onClick={check}>Comprobar conexión</Button>
                  <Button variant="secondary" icon={<Send className="h-4 w-4" />} loading={busy === "test"} onClick={test}>Enviarme un correo de prueba</Button>
                </>
              ) : null}
              <Button variant="ghost" icon={<Unplug className="h-4 w-4" />} onClick={() => setConfirm(true)}>Desconectar</Button>
            </div>
            {needsReauth || active ? (
              <div className="mt-6 border-t border-ink-100 pt-5">
                <p className="mb-3 text-sm font-medium">{needsReauth ? "Vuelve a autorizar la cuenta" : "Cambiar o volver a conectar la cuenta"}</p>
                <EmailConnectButtons providers={d.data!.providers} label={needsReauth ? "Reconectar" : "Conectar otra cuenta de"} />
              </div>
            ) : null}
          </Card>
          <Card>
            <CardHeader title="Qué puede hacer Reseñalo" />
            <ul className="space-y-3 text-sm">
              <li className="flex gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-ok-600" />Enviar correos en tu nombre a los clientes que registres.</li>
              <li className="flex gap-2"><XCircle className="mt-0.5 h-4 w-4 shrink-0 text-ink-400" />Leer, borrar o modificar tus correos.</li>
              <li className="flex gap-2"><XCircle className="mt-0.5 h-4 w-4 shrink-0 text-ink-400" />Conocer tu contraseña.</li>
            </ul>
            <p className="mt-4 text-xs text-ink-500">Tokens cifrados con AES-256-GCM. Puedes retirar el permiso también desde la configuración de seguridad de tu cuenta de Google o Microsoft. Se respetan los límites de envío de tu proveedor.</p>
          </Card>
        </div>
      )}

      <Modal open={confirm} onClose={() => setConfirm(false)} title="Desconectar cuenta de correo" footer={<>
        <Button variant="ghost" onClick={() => setConfirm(false)}>Cancelar</Button>
        <Button variant="danger" loading={busy === "disc"} onClick={async () => { setBusy("disc"); try { await api("/api/v1/email-connection", { method: "DELETE" }); toast("ok", "Cuenta desconectada y permisos revocados"); setConfirm(false); await d.reload(); } catch (e) { toast("bad", (e as ApiError).message); } setBusy(null); }}>Desconectar</Button>
      </>}>
        <p className="text-sm text-ink-600">Revocaremos el permiso y eliminaremos los tokens. Los envíos pendientes quedarán en espera hasta que conectes una cuenta.</p>
      </Modal>
    </>
  );
}

export default function Page() {
  return <Suspense fallback={<PageLoader />}><ConnectionPage /></Suspense>;
}

"use client";
import { useEffect, useState } from "react";
import { Download, Laptop, LogOut, Trash2 } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import { fmtDate } from "@/lib/format";
import { Alert, Badge, Card, CardHeader, PageHeader } from "@/components/ui/Display";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Field";
import { Modal } from "@/components/ui/Modal";
import { PageLoader } from "@/components/ui/Spinner";
import { useToast } from "@/components/ui/Toast";

type S = { id: string; ip: string | null; userAgent: string | null; createdAt: string; lastSeenAt: string; current: boolean };
const device = (ua: string | null) => {
  if (!ua) return "Dispositivo desconocido";
  const os = /iPhone|iPad/.test(ua) ? "iOS" : /Android/.test(ua) ? "Android" : /Mac OS X/.test(ua) ? "macOS" : /Windows/.test(ua) ? "Windows" : /Linux/.test(ua) ? "Linux" : "";
  const br = /Edg\//.test(ua) ? "Edge" : /Chrome\//.test(ua) ? "Chrome" : /Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : "Navegador";
  return `${br}${os ? ` en ${os}` : ""}`;
};

export default function ProfilePage() {
  const me = useApi<{ user: { name: string; email: string } }>("/api/v1/auth/me");
  const sessions = useApi<{ sessions: S[] }>("/api/v1/account/sessions");
  const toast = useToast();
  const [name, setName] = useState("");
  const [pw, setPw] = useState({ currentPassword: "", newPassword: "", confirm: "" });
  const [pwErr, setPwErr] = useState<{ msg?: string; fields?: Record<string, string> }>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [del, setDel] = useState({ open: false, password: "", confirm: "", err: "" });
  useEffect(() => { if (me.data) setName(me.data.user.name); }, [me.data]);
  if (me.loading && !me.data) return <PageLoader />;

  return (
    <>
      <PageHeader title="Perfil y seguridad" description="Tus datos de acceso, sesiones abiertas y privacidad." />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Perfil" />
          <form className="space-y-4" onSubmit={async (e) => { e.preventDefault(); setBusy("name"); try { await api("/api/v1/account/profile", { method: "PATCH", body: { name } }); toast("ok", "Perfil actualizado"); } catch (er) { toast("bad", (er as ApiError).message); } setBusy(null); }}>
            <Input label="Nombre" value={name} onChange={(e) => setName(e.target.value)} />
            <Input label="Correo de acceso" value={me.data?.user.email ?? ""} disabled help="Para cambiarlo, contacta con soporte." />
            <div className="flex justify-end"><Button type="submit" variant="secondary" loading={busy === "name"}>Guardar</Button></div>
          </form>
        </Card>
        <Card>
          <CardHeader title="Cambiar contraseña" description="Se cerrarán las demás sesiones abiertas." />
          <form className="space-y-4" onSubmit={async (e) => {
            e.preventDefault();
            if (pw.newPassword !== pw.confirm) return setPwErr({ fields: { confirm: "No coincide" } });
            setBusy("pw"); setPwErr({});
            try { await api("/api/v1/account/password", { body: { currentPassword: pw.currentPassword, newPassword: pw.newPassword } }); toast("ok", "Contraseña actualizada"); setPw({ currentPassword: "", newPassword: "", confirm: "" }); await sessions.reload(); }
            catch (er) { const x = er as ApiError; setPwErr({ msg: x.fields ? undefined : x.message, fields: x.fields }); }
            setBusy(null);
          }}>
            {pwErr.msg ? <Alert tone="bad">{pwErr.msg}</Alert> : null}
            <Input label="Contraseña actual" type="password" autoComplete="current-password" value={pw.currentPassword} onChange={(e) => setPw({ ...pw, currentPassword: e.target.value })} error={pwErr.fields?.currentPassword} />
            <Input label="Nueva contraseña" type="password" autoComplete="new-password" value={pw.newPassword} onChange={(e) => setPw({ ...pw, newPassword: e.target.value })} error={pwErr.fields?.newPassword} help="Mínimo 10 caracteres, con letras y números." />
            <Input label="Repite la nueva contraseña" type="password" autoComplete="new-password" value={pw.confirm} onChange={(e) => setPw({ ...pw, confirm: e.target.value })} error={pwErr.fields?.confirm} />
            <div className="flex justify-end"><Button type="submit" variant="secondary" loading={busy === "pw"} disabled={!pw.currentPassword || !pw.newPassword}>Cambiar contraseña</Button></div>
          </form>
        </Card>
      </div>

      <Card className="mt-4">
        <CardHeader title="Sesiones abiertas" action={<Button size="sm" variant="ghost" icon={<LogOut className="h-4 w-4" />} onClick={async () => { await api("/api/v1/account/sessions/revoke-others", { method: "POST", body: {} }); toast("ok", "Se han cerrado las demás sesiones"); await sessions.reload(); }}>Cerrar las demás</Button>} />
        <ul className="divide-y divide-ink-100">
          {sessions.data?.sessions.map((s) => (
            <li key={s.id} className="flex items-center justify-between gap-3 py-3">
              <div className="flex min-w-0 items-center gap-3">
                <Laptop className="h-4 w-4 shrink-0 text-ink-400" />
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{device(s.userAgent)} {s.current ? <Badge tone="ok" className="ml-1">Esta sesión</Badge> : null}</p>
                  <p className="text-xs text-ink-500">Última actividad {fmtDate(s.lastSeenAt, true)}{s.ip ? ` · IP ${s.ip}` : ""}</p>
                </div>
              </div>
              {!s.current ? <Button size="sm" variant="ghost" onClick={async () => { await api(`/api/v1/account/sessions/${s.id}`, { method: "DELETE" }); await sessions.reload(); }}>Cerrar</Button> : null}
            </li>
          ))}
        </ul>
      </Card>

      <Card className="mt-4">
        <CardHeader title="Privacidad y datos" description="Derechos de portabilidad y supresión (RGPD)." />
        <div className="flex flex-col gap-3 sm:flex-row">
          <a href="/api/v1/account/export" className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-ink-200 bg-white px-4 text-sm font-medium hover:bg-cream-50"><Download className="h-4 w-4" />Descargar mis datos (JSON)</a>
          <Button variant="ghost" className="text-bad-700 hover:bg-bad-50" icon={<Trash2 className="h-4 w-4" />} onClick={() => setDel({ open: true, password: "", confirm: "", err: "" })}>Eliminar mi cuenta</Button>
        </div>
      </Card>

      <Modal open={del.open} onClose={() => setDel({ ...del, open: false })} title="Eliminar cuenta" footer={<>
        <Button variant="ghost" onClick={() => setDel({ ...del, open: false })}>Cancelar</Button>
        <Button variant="danger" loading={busy === "del"} disabled={del.confirm !== "ELIMINAR" || !del.password} onClick={async () => {
          setBusy("del");
          try { await api("/api/v1/account/delete", { body: { password: del.password, confirm: del.confirm } }); window.location.href = "/?cuenta=eliminada"; }
          catch (e) { setDel({ ...del, err: (e as ApiError).message }); setBusy(null); }
        }}>Eliminar definitivamente</Button>
      </>}>
        <div className="space-y-4">
          <Alert tone="bad">Se cancelará tu suscripción, se revocará el acceso a tu correo y se borrarán clientes, plantillas, envíos y estadísticas. Las facturas se conservan el tiempo exigido por la ley. No se puede deshacer.</Alert>
          {del.err ? <Alert tone="bad">{del.err}</Alert> : null}
          <Input label="Tu contraseña" type="password" autoComplete="current-password" value={del.password} onChange={(e) => setDel({ ...del, password: e.target.value })} />
          <Input label="Escribe ELIMINAR para confirmar" value={del.confirm} onChange={(e) => setDel({ ...del, confirm: e.target.value })} />
        </div>
      </Modal>
    </>
  );
}

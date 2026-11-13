"use client";

import { Check, Link2, Trash2, UserPlus, Users, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { copyText } from "@/components/ui/copy-button";
import { Field, Input, Select } from "@/components/ui/form";
import { ConfirmDialog } from "@/components/ui/overlays";
import { Badge } from "@/components/ui/primitives";
import { api, errorMessage } from "@/lib/api-client";
import { formatDate } from "@/lib/utils";

type Member = { userId: string; name: string; email: string; role: string; joinedAt: string; isYou: boolean };
type Invitation = { id: string; email: string; role: string; link: string; expiresAt: string };

const ROLE_LABEL: Record<string, string> = { owner: "Propietario", admin: "Administrador", editor: "Editor", viewer: "Solo lectura" };
const ROLE_HELP: Record<string, string> = {
  admin: "Gestiona el equipo y la facturación, además de todo el contenido.",
  editor: "Crea y edita productos y anuncios, y genera contenido.",
  viewer: "Consulta el catálogo y los anuncios, sin modificarlos.",
};

export function TeamManager({ members, invitations, canManage, isOwner, maxMembers, planName }: { members: Member[]; invitations: Invitation[]; canManage: boolean; isOwner: boolean; maxMembers: number; planName: string }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("editor");
  const [busy, setBusy] = useState(false);
  const [removing, setRemoving] = useState<Member | null>(null);
  const seats = members.length + invitations.length;
  const full = seats >= maxMembers;

  async function invite() {
    setBusy(true);
    try {
      const invitation = await api<Invitation>("/api/team/invitations", { body: { email, role } });
      setEmail("");
      await copyText(invitation.link, "Invitación creada: enlace copiado");
      router.refresh();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function call(path: string, method: "PATCH" | "DELETE", body: unknown, success: string) {
    try {
      await api(path, { method, body });
      toast.success(success);
      router.refresh();
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }

  const roleOptions = (["admin", "editor", "viewer"] as const).filter((value) => value !== "admin" || isOwner);

  return (
    <div>
      <ul className="divide-y divide-line rounded-xl border border-line">
        {members.map((member) => {
          const editable = canManage && member.role !== "owner" && !member.isYou && (isOwner || member.role !== "admin");
          return (
            <li key={member.userId} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-ink text-xs font-semibold text-white">{(member.name || member.email).slice(0, 2).toUpperCase()}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">
                  {member.name || member.email} {member.isYou ? <span className="font-normal text-muted">(tú)</span> : null}
                </span>
                <span className="block truncate text-xs text-muted">
                  {member.email} · desde el {formatDate(member.joinedAt)}
                </span>
              </span>
              {editable ? (
                <Select aria-label={`Rol de ${member.name || member.email}`} value={member.role} onChange={(event) => call(`/api/team/members/${member.userId}`, "PATCH", { role: event.target.value }, "Rol actualizado")} className="h-9 w-40">
                  {roleOptions.map((value) => (
                    <option key={value} value={value}>
                      {ROLE_LABEL[value]}
                    </option>
                  ))}
                </Select>
              ) : (
                <Badge tone={member.role === "owner" ? "brand" : "neutral"}>{ROLE_LABEL[member.role] ?? member.role}</Badge>
              )}
              {editable || (member.isYou && member.role !== "owner") ? (
                <Button size="sm" variant="danger-ghost" onClick={() => setRemoving(member)}>
                  {member.isYou ? "Abandonar" : <Trash2 aria-label={`Quitar a ${member.name || member.email}`} />}
                </Button>
              ) : null}
            </li>
          );
        })}
        {invitations.map((invitation) => (
          <li key={invitation.id} className="flex flex-wrap items-center gap-3 bg-paper/60 px-4 py-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-full border border-dashed border-line-strong text-muted">
              <UserPlus className="size-4" aria-hidden />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">{invitation.email}</span>
              <span className="block text-xs text-muted">
                Invitación pendiente · {ROLE_LABEL[invitation.role]} · caduca el {formatDate(invitation.expiresAt)}
              </span>
            </span>
            <Button size="sm" variant="secondary" onClick={() => copyText(invitation.link, "Enlace de invitación copiado")}>
              <Link2 aria-hidden /> Copiar enlace
            </Button>
            <Button size="sm" variant="danger-ghost" onClick={() => call(`/api/team/invitations/${invitation.id}`, "DELETE", undefined, "Invitación anulada")} aria-label={`Anular la invitación de ${invitation.email}`}>
              <X aria-hidden />
            </Button>
          </li>
        ))}
      </ul>

      <p className="mt-3 text-[13px] text-muted">
        {seats} de {maxMembers} {maxMembers === 1 ? "plaza" : "plazas"} en el plan {planName}.
        {maxMembers === 1 ? " Los equipos están disponibles a partir del plan Pro." : ""}
      </p>

      {canManage && maxMembers > 1 ? (
        <form
          className="mt-5 grid gap-3 border-t border-line pt-5 sm:grid-cols-[1fr_12rem_auto] sm:items-end"
          onSubmit={(event) => {
            event.preventDefault();
            void invite();
          }}
        >
          <Field label="Invitar por correo" htmlFor="invite-email">
            <Input id="invite-email" type="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="persona@empresa.com" disabled={full} />
          </Field>
          <Field label="Rol" htmlFor="invite-role">
            <Select id="invite-role" value={role} onChange={(event) => setRole(event.target.value)} disabled={full}>
              {roleOptions.map((value) => (
                <option key={value} value={value}>
                  {ROLE_LABEL[value]}
                </option>
              ))}
            </Select>
          </Field>
          <Button type="submit" loading={busy} disabled={full || !email}>
            <Users aria-hidden /> Invitar
          </Button>
          <p className="text-[13px] leading-relaxed text-muted sm:col-span-3">
            {full
              ? "No quedan plazas libres en tu plan. Quita un miembro o una invitación para invitar a otra persona."
              : `${ROLE_HELP[role]} Se crea un enlace personal que debes enviarle: solo funciona con una cuenta registrada con ese correo, y también lo verá en su panel al iniciar sesión.`}
          </p>
        </form>
      ) : null}

      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(open) => !open && setRemoving(null)}
        title={removing?.isYou ? "¿Abandonar este espacio de trabajo?" : `¿Quitar a ${removing?.name || removing?.email} del equipo?`}
        description={removing?.isYou ? "Dejarás de ver sus productos y anuncios. Tu espacio personal no se ve afectado." : "Perderá el acceso de inmediato. Los productos y anuncios que haya creado se conservan en el espacio."}
        confirmLabel={removing?.isYou ? "Abandonar" : "Quitar del equipo"}
        onConfirm={async () => {
          if (!removing) return;
          try {
            await api(`/api/team/members/${removing.userId}`, { method: "DELETE" });
            if (removing.isYou) window.location.assign("/app");
            else {
              toast.success("Miembro eliminado del equipo");
              router.refresh();
            }
          } catch (error) {
            toast.error(errorMessage(error));
          }
        }}
      />
    </div>
  );
}

export function InvitationActions({ token, workspaceName, compact }: { token: string; workspaceName: string; compact?: boolean }) {
  const [busy, setBusy] = useState<string | null>(null);
  async function act(action: "accept" | "decline") {
    setBusy(action);
    try {
      await api(`/api/invitations/${token}`, { body: { action } });
      if (action === "accept") toast.success(`Ahora formas parte de «${workspaceName}»`);
      window.location.assign("/app");
    } catch (error) {
      toast.error(errorMessage(error));
      setBusy(null);
    }
  }
  return (
    <span className="flex shrink-0 gap-2">
      <Button size={compact ? "sm" : "md"} variant="brand" loading={busy === "accept"} disabled={busy !== null} onClick={() => act("accept")}>
        <Check aria-hidden /> Aceptar
      </Button>
      <Button size={compact ? "sm" : "md"} variant="secondary" loading={busy === "decline"} disabled={busy !== null} onClick={() => act("decline")}>
        Rechazar
      </Button>
    </span>
  );
}

"use client";

import { useActionState, useState } from "react";

import { Button, SubmitButton } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Alert } from "@/components/ui/feedback";
import {
  DEFAULT_OPERATOR_PERMISSIONS,
  OPERATOR_PERMISSIONS,
  type OperatorPermission,
  PERMISSION_LABELS,
  ROLE_LABELS,
  type Role,
} from "@/lib/permissions";
import type { ActionState } from "@/server/actions/result";
import {
  inviteMemberAction,
  removeMemberAction,
  renewInvitationAction,
  revokeInvitationAction,
  setMemberStatusAction,
  updateMemberAction,
} from "@/server/modules/members/actions";
import type { BranchOption, InvitationRow, MemberRow } from "@/server/modules/members/service";

type LinkState = ActionState<{ url: string; email: string; emailed: boolean }>;
const idle: ActionState = { status: "idle" };
const idleLink: LinkState = { status: "idle" };

const dateFmt = new Intl.DateTimeFormat("es-ES", { dateStyle: "medium", timeZone: "Europe/Madrid" });

function StateMessage({ state }: { state: ActionState<unknown> }) {
  if (state.status === "error") return <Alert tone="error">{state.message}</Alert>;
  if (state.status === "success" && state.message) return <Alert tone="success">{state.message}</Alert>;
  return null;
}

function InvitationLink({ state }: { state: LinkState }) {
  const [copied, setCopied] = useState(false);
  if (state.status !== "success" || !state.data) return null;
  const { url, email, emailed } = state.data;
  return (
    <Alert tone="success" title={state.message}>
      <p className="mb-2">
        {emailed ? (
          <>
            Le ha llegado un correo a <strong>{email}</strong> con el enlace. Si no lo encuentra, puedes enviárselo tú.
          </>
        ) : (
          <>
            Envía este enlace a <strong>{email}</strong>.
          </>
        )}{" "}
        Caduca en 7 días y solo sirve una vez. Por seguridad no lo volveremos a mostrar.
      </p>
      <div className="flex flex-col gap-2 sm:flex-row">
        <input readOnly value={url} aria-label="Enlace de invitación" className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 font-mono text-xs" onFocus={(e) => e.currentTarget.select()} />
        <Button
          type="button"
          variant="secondary"
          onClick={async () => {
            await navigator.clipboard.writeText(url);
            setCopied(true);
          }}
        >
          {copied ? "Copiado" : "Copiar"}
        </Button>
      </div>
    </Alert>
  );
}

/** Rol, permisos y alcance por sucursal: compartido por invitar y editar. */
function AccessFields({
  branches,
  role: initialRole,
  permissions: initialPermissions,
  branchScope: initialScope,
  branchIds,
  disabled,
}: {
  branches: BranchOption[];
  role: Role;
  permissions: readonly OperatorPermission[];
  branchScope: "all" | "selected";
  branchIds: string[];
  disabled?: boolean;
}) {
  const [role, setRole] = useState<Role>(initialRole);
  const [scope, setScope] = useState(initialScope);
  return (
    <fieldset disabled={disabled} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">Rol</span>
        <div className="flex flex-wrap gap-4 text-sm">
          {(["operator", "admin"] as const).map((r) => (
            <label key={r} className="flex items-center gap-2">
              <input type="radio" name="role" value={r} checked={role === r} onChange={() => setRole(r)} />
              {ROLE_LABELS[r]}
            </label>
          ))}
        </div>
        {role === "admin" ? (
          <p className="text-sm text-[var(--muted)]">Control completo: configuración, usuarios, facturación e integraciones.</p>
        ) : null}
      </div>

      {role === "operator" ? (
        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">Permisos</span>
          <p className="text-sm text-[var(--muted)]">Todos los operarios pueden consultar clientes, vehículos e historial.</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {OPERATOR_PERMISSIONS.map((p) => (
              <label key={p} className="flex items-start gap-2 text-sm">
                <input type="checkbox" name="permissions" value={p} defaultChecked={initialPermissions.includes(p)} className="mt-0.5" />
                {PERMISSION_LABELS[p]}
              </label>
            ))}
          </div>
        </div>
      ) : null}

      {branches.length > 1 ? (
        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">Delegaciones a las que accede</span>
          <div className="flex flex-wrap gap-4 text-sm">
            <label className="flex items-center gap-2">
              <input type="radio" name="branchScope" value="all" checked={scope === "all"} onChange={() => setScope("all")} />
              Todos
            </label>
            <label className="flex items-center gap-2">
              <input type="radio" name="branchScope" value="selected" checked={scope === "selected"} onChange={() => setScope("selected")} />
              Solo algunos
            </label>
          </div>
          {scope === "selected" ? (
            <div className="grid gap-2 sm:grid-cols-2">
              {branches.map((b) => (
                <label key={b.id} className="flex items-center gap-2 text-sm">
                  <input type="checkbox" name="branchIds" value={b.id} defaultChecked={branchIds.includes(b.id)} />
                  {b.name}
                </label>
              ))}
            </div>
          ) : null}
        </div>
      ) : (
        <input type="hidden" name="branchScope" value="all" />
      )}
    </fieldset>
  );
}

function InviteForm({ branches }: { branches: BranchOption[] }) {
  const [state, action] = useActionState(inviteMemberAction, idleLink);
  return (
    <form action={action} className="flex flex-col gap-4" key={state.status === "success" ? state.data?.url : "form"}>
      {state.status === "error" ? <Alert tone="error">{state.message}</Alert> : null}
      <InvitationLink state={state} />
      <Field
        label="Correo electrónico"
        name="email"
        type="email"
        required
        autoComplete="off"
        errors={state.status === "error" ? state.fieldErrors?.email : undefined}
      />
      <AccessFields branches={branches} role="operator" permissions={DEFAULT_OPERATOR_PERMISSIONS} branchScope="all" branchIds={[]} />
      {state.status === "error" && state.fieldErrors?.branchIds ? <p className="text-sm text-[var(--danger)]">{state.fieldErrors.branchIds[0]}</p> : null}
      <div>
        <SubmitButton pendingLabel="Creando invitación…">Crear invitación</SubmitButton>
      </div>
    </form>
  );
}

function ConfirmButton({ label, confirmText, variant = "secondary" }: { label: string; confirmText: string; variant?: "secondary" | "danger" }) {
  return (
    <SubmitButton
      variant={variant}
      pendingLabel="…"
      onClick={(e) => {
        if (!window.confirm(confirmText)) e.preventDefault();
      }}
    >
      {label}
    </SubmitButton>
  );
}

function MemberItem({ member, branches, isSelf }: { member: MemberRow; branches: BranchOption[]; isSelf: boolean }) {
  const [editing, setEditing] = useState(false);
  const [updateState, update] = useActionState(updateMemberAction, idle);
  const [statusState, setStatus] = useActionState(setMemberStatusAction, idle);
  const [removeState, remove] = useActionState(removeMemberAction, idle);
  const name = `${member.firstName} ${member.lastName}`.trim() || member.email;
  const branchNames = member.branchScope === "all" ? "Todas las delegaciones" : branches.filter((b) => member.branchIds.includes(b.id)).map((b) => b.name).join(", ");

  return (
    <li className="flex flex-col gap-3 py-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-medium">
            {name} {isSelf ? <span className="text-sm text-[var(--muted)]">(tú)</span> : null}
          </p>
          <p className="text-sm text-[var(--muted)]">{member.email}</p>
          <p className="mt-1 text-sm">
            {ROLE_LABELS[member.role]}
            {member.isOwner ? " · propietario" : ""}
            {member.status === "suspended" ? <span className="text-[var(--danger)]"> · suspendido</span> : null}
            {branches.length > 1 ? <span className="text-[var(--muted)]"> · {branchNames}</span> : null}
          </p>
          {member.role === "operator" ? (
            <p className="mt-1 text-xs text-[var(--muted)]">
              {member.permissions.length ? member.permissions.map((p) => PERMISSION_LABELS[p]).join(" · ") : "Solo consulta"}
            </p>
          ) : null}
        </div>
        {!member.isOwner && !isSelf ? (
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="secondary" onClick={() => setEditing((v) => !v)}>
              {editing ? "Cerrar" : "Editar permisos"}
            </Button>
            <form action={setStatus}>
              <input type="hidden" name="id" value={member.memberId} />
              <input type="hidden" name="status" value={member.status === "active" ? "suspended" : "active"} />
              <ConfirmButton
                label={member.status === "active" ? "Suspender" : "Reactivar"}
                confirmText={member.status === "active" ? `¿Suspender el acceso de ${name}?` : `¿Reactivar el acceso de ${name}?`}
              />
            </form>
            <form action={remove}>
              <input type="hidden" name="id" value={member.memberId} />
              <ConfirmButton label="Eliminar" variant="danger" confirmText={`¿Eliminar a ${name} de la empresa? Perderá el acceso inmediatamente.`} />
            </form>
          </div>
        ) : null}
      </div>
      <StateMessage state={statusState} />
      <StateMessage state={removeState} />
      {editing ? (
        <form action={update} className="flex flex-col gap-4 rounded-lg border border-[var(--border)] p-4">
          <input type="hidden" name="memberId" value={member.memberId} />
          <StateMessage state={updateState} />
          <AccessFields branches={branches} role={member.role} permissions={member.permissions} branchScope={member.branchScope} branchIds={member.branchIds} />
          <div>
            <SubmitButton>Guardar cambios</SubmitButton>
          </div>
        </form>
      ) : null}
    </li>
  );
}

function InvitationItem({ invitation }: { invitation: InvitationRow }) {
  const [revokeState, revoke] = useActionState(revokeInvitationAction, idle);
  const [renewState, renew] = useActionState(renewInvitationAction, idleLink);
  return (
    <li className="flex flex-col gap-3 py-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-medium">{invitation.email}</p>
          <p className="text-sm text-[var(--muted)]">
            {ROLE_LABELS[invitation.role]} ·{" "}
            {invitation.expired ? <span className="text-[var(--danger)]">caducada</span> : `caduca el ${dateFmt.format(invitation.expiresAt)}`}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <form action={renew}>
            <input type="hidden" name="id" value={invitation.id} />
            <input type="hidden" name="email" value={invitation.email} />
            <SubmitButton variant="secondary" pendingLabel="Generando…">
              Nuevo enlace
            </SubmitButton>
          </form>
          <form action={revoke}>
            <input type="hidden" name="id" value={invitation.id} />
            <ConfirmButton label="Anular" variant="danger" confirmText={`¿Anular la invitación de ${invitation.email}?`} />
          </form>
        </div>
      </div>
      {renewState.status === "error" ? <Alert tone="error">{renewState.message}</Alert> : <InvitationLink state={renewState} />}
      <StateMessage state={revokeState} />
    </li>
  );
}

export function MembersManager({
  members,
  invitations,
  branches,
  selfMemberId,
  canInvite,
  limitNote,
}: {
  members: MemberRow[];
  invitations: InvitationRow[];
  branches: BranchOption[];
  selfMemberId: string;
  canInvite: boolean;
  limitNote?: string;
}) {
  return (
    <div className="flex flex-col gap-8">
      <section className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-6">
        <h2 className="mb-1 text-lg font-semibold">Invitar a alguien</h2>
        <p className="mb-4 text-sm text-[var(--muted)]">{limitNote}</p>
        {canInvite ? <InviteForm branches={branches} /> : <Alert tone="info">Con el plan actual no puedes añadir más usuarios.</Alert>}
      </section>

      {invitations.length ? (
        <section className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-6 pt-4">
          <h2 className="text-lg font-semibold">Invitaciones pendientes</h2>
          <ul className="divide-y divide-[var(--border)]">
            {invitations.map((i) => (
              <InvitationItem key={i.id} invitation={i} />
            ))}
          </ul>
        </section>
      ) : null}

      <section className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-6 pt-4">
        <h2 className="text-lg font-semibold">Usuarios de la empresa</h2>
        <ul className="divide-y divide-[var(--border)]">
          {members.map((m) => (
            <MemberItem key={m.memberId} member={m} branches={branches} isSelf={m.memberId === selfMemberId} />
          ))}
        </ul>
      </section>
    </div>
  );
}

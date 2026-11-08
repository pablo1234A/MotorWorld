"use client";

import { useActionState, useState } from "react";

import { SubmitButton } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { fieldErrors, FormMessage } from "@/components/ui/form-state";
import type { ActionState } from "@/server/actions/result";
import { createApiKeyAction, revokeApiKeyAction } from "@/server/api/actions";

const idle = { status: "idle" } as const;

export function CreateApiKeyForm({ scopes, branches }: { scopes: { value: string; label: string }[]; branches: { id: string; name: string }[] }) {
  const [state, action] = useActionState<ActionState<{ key: string }>, FormData>(createApiKeyAction, idle);
  const [copied, setCopied] = useState(false);
  const key = state.status === "success" ? state.data?.key : undefined;
  return (
    <div className="flex flex-col gap-4">
      {key ? (
        <div role="status" className="flex flex-col gap-2 rounded-lg border border-[var(--success)]/30 bg-[var(--success-soft)] p-4 text-sm">
          <p className="font-semibold">Clave creada. Cópiala ahora: por seguridad no se volverá a mostrar.</p>
          <code className="block break-all rounded bg-[var(--surface)] px-3 py-2 font-mono text-[13px]" data-testid="api-key">
            {key}
          </code>
          <button
            type="button"
            className="self-start rounded-lg px-3 py-1.5 font-medium text-[var(--accent)] hover:bg-[var(--surface)]"
            onClick={() => {
              void navigator.clipboard?.writeText(key).then(() => setCopied(true));
            }}
          >
            {copied ? "Copiada" : "Copiar"}
          </button>
        </div>
      ) : (
        <FormMessage state={state} />
      )}
      <form action={action} className="flex flex-col gap-4">
        <Field label="Nombre" name="name" required maxLength={80} placeholder="Programa de gestión del taller" errors={fieldErrors(state, "name")} />
        <fieldset className="flex flex-col gap-2">
          <legend className="text-sm font-medium">Permisos</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {scopes.map((s) => (
              <label key={s.value} className="flex items-start gap-2 text-sm">
                <input type="checkbox" name="scopes" value={s.value} defaultChecked={s.value.endsWith(":read")} className="mt-1" />
                <span>
                  {s.label} <span className="font-mono text-xs text-[var(--muted)]">{s.value}</span>
                </span>
              </label>
            ))}
          </div>
          {fieldErrors(state, "scopes")?.[0] ? <p className="text-sm text-[var(--danger)]">{fieldErrors(state, "scopes")![0]}</p> : null}
        </fieldset>
        {branches.length > 1 ? (
          <fieldset className="flex flex-col gap-2">
            <legend className="text-sm font-medium">Talleres (si no marcas ninguno, todos)</legend>
            {branches.map((b) => (
              <label key={b.id} className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="branchIds" value={b.id} />
                {b.name}
              </label>
            ))}
          </fieldset>
        ) : null}
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          Caducidad
          <select name="expiresInDays" defaultValue="" className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5 font-normal">
            <option value="">Sin caducidad (revócala cuando no la uses)</option>
            <option value="30">30 días</option>
            <option value="90">90 días</option>
            <option value="365">1 año</option>
          </select>
        </label>
        <SubmitButton pendingLabel="Creando…" className="self-start">
          Crear clave
        </SubmitButton>
      </form>
    </div>
  );
}

export function RevokeApiKeyButton({ id, name }: { id: string; name: string }) {
  const [state, action] = useActionState(revokeApiKeyAction, idle);
  return (
    <form
      action={action}
      className="flex flex-col gap-1"
      onSubmit={(e) => {
        if (!window.confirm(`¿Revocar la clave «${name}»? Lo que la use dejará de funcionar al momento.`)) e.preventDefault();
      }}
    >
      <input type="hidden" name="id" value={id} />
      <SubmitButton variant="ghost" pendingLabel="Revocando…" aria-label={`Revocar ${name}`}>
        Revocar
      </SubmitButton>
      {state.status === "error" ? <FormMessage state={state} /> : null}
    </form>
  );
}

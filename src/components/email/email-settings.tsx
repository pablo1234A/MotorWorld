"use client";

import { useActionState, useState } from "react";

import { SubmitButton } from "@/components/ui/button";
import { Field, SelectField } from "@/components/ui/field";
import { Card } from "@/components/ui/feedback";
import { fieldErrors, FormMessage } from "@/components/ui/form-state";
import { DIGEST_LABELS, DOMAIN_STATUS_LABELS, SUPPRESSION_REASON_LABELS } from "@/lib/validation/email";
import type { ActionState } from "@/server/actions/result";
import {
  addDomainAction,
  addSuppressionAction,
  checkDomainAction,
  removeDomainAction,
  removeSuppressionAction,
  updateSenderSettingsAction,
} from "@/server/modules/email/actions";

const idle: ActionState = { status: "idle" };

const BADGE = "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium";
const STATUS_TONE: Record<string, string> = {
  verified: "bg-[var(--success-soft)] text-[var(--success-strong)]",
  failed: "bg-[var(--danger-soft)] text-[var(--danger-strong)]",
};

interface DomainView {
  id: string;
  domain: string;
  fromLocalPart: string;
  status: string;
  records: Array<{ record: string; type: string; name: string; value: string; priority: number | null; status: string | null }>;
}

export function SenderForm({
  branchId,
  senderMode,
  sendingDomainId,
  digestFrequency,
  sharedFrom,
  replyTo,
  verifiedDomains,
  readOnly,
}: {
  branchId: string;
  senderMode: "shared" | "custom_domain";
  sendingDomainId: string | null;
  digestFrequency: "off" | "daily" | "weekly";
  sharedFrom: string;
  replyTo: string | null;
  verifiedDomains: Array<{ id: string; address: string }>;
  readOnly: boolean;
}) {
  const [state, action] = useActionState(updateSenderSettingsAction, idle);
  const [mode, setMode] = useState(senderMode);
  return (
    <Card>
      <form action={action} className="flex flex-col gap-4">
        <h2 className="text-lg font-semibold">Remitente de los avisos</h2>
        <FormMessage state={state} />
        <input type="hidden" name="branchId" value={branchId} />
        <fieldset className="flex flex-col gap-3">
          <legend className="sr-only">Remitente</legend>
          <label className="flex items-start gap-3 text-[15px]">
            <input type="radio" name="senderMode" value="shared" checked={mode === "shared"} onChange={() => setMode("shared")} disabled={readOnly} className="mt-1" />
            <span>
              <span className="font-medium">Remitente de RevisaYa con el nombre de tu taller</span>
              <span className="block break-all font-mono text-sm text-[var(--muted)]">{sharedFrom}</span>
              <span className="block text-sm text-[var(--muted)]">
                {replyTo ? `Las respuestas llegan a ${replyTo}.` : "Configura la dirección «Responder a» en Avisos para recibir las respuestas."}
              </span>
            </span>
          </label>
          <label className="flex items-start gap-3 text-[15px]">
            <input
              type="radio"
              name="senderMode"
              value="custom_domain"
              checked={mode === "custom_domain"}
              onChange={() => setMode("custom_domain")}
              disabled={readOnly || verifiedDomains.length === 0}
              className="mt-1"
            />
            <span>
              <span className="font-medium">Tu propio dominio</span>
              <span className="block text-sm text-[var(--muted)]">
                {verifiedDomains.length ? "Los avisos salen desde tu dominio verificado." : "Añade y verifica un dominio abajo para poder elegirlo."}
              </span>
            </span>
          </label>
          {mode === "custom_domain" && verifiedDomains.length ? (
            <SelectField label="Dirección de envío" name="sendingDomainId" defaultValue={sendingDomainId ?? verifiedDomains[0].id} disabled={readOnly}>
              {verifiedDomains.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.address}
                </option>
              ))}
            </SelectField>
          ) : null}
        </fieldset>
        <SelectField
          label="Resumen para el taller"
          name="digestFrequency"
          defaultValue={digestFrequency}
          hint="Avisos enviados, problemas de entrega y próximas revisiones, a los administradores."
          disabled={readOnly}
        >
          {Object.entries(DIGEST_LABELS).map(([k, label]) => (
            <option key={k} value={k}>
              {label}
            </option>
          ))}
        </SelectField>
        {readOnly ? null : (
          <div>
            <SubmitButton>Guardar</SubmitButton>
          </div>
        )}
      </form>
    </Card>
  );
}

export function DomainsManager({ domains, configured, readOnly }: { domains: DomainView[]; configured: boolean; readOnly: boolean }) {
  const [state, action] = useActionState(addDomainAction, idle);
  return (
    <Card className="flex flex-col gap-5">
      <div>
        <h2 className="text-lg font-semibold">Dominio propio</h2>
        <p className="text-sm text-[var(--muted)]">
          Para enviar desde tu dominio (por ejemplo avisos@tallersur.es) hay que demostrar que es tuyo añadiendo unos registros DNS donde lo
          tengas contratado. No funciona con Gmail, Hotmail ni otros correos gratuitos.
        </p>
      </div>
      {domains.map((d) => (
        <DomainItem key={d.id} domain={d} configured={configured} readOnly={readOnly} />
      ))}
      {configured ? <DnsGuide /> : null}
      {!configured ? (
        <p className="rounded-lg bg-[var(--surface-2)] px-4 py-3 text-sm">
          La verificación de dominios propios no está disponible todavía en esta instalación de RevisaYa. Mientras tanto, tus avisos salen con
          el remitente de RevisaYa y el nombre de tu taller.
        </p>
      ) : readOnly ? null : (
        <form action={action} className="flex flex-col gap-3">
          <FormMessage state={state} />
          <div className="grid gap-3 sm:grid-cols-[1fr_12rem_auto] sm:items-end">
            <Field label="Dominio" name="domain" placeholder="tallersur.es" required errors={fieldErrors(state, "domain")} autoComplete="off" />
            <Field label="Dirección de envío" name="fromLocalPart" defaultValue="avisos" errors={fieldErrors(state, "fromLocalPart")} />
            <SubmitButton variant="secondary" pendingLabel="Añadiendo…">
              Añadir dominio
            </SubmitButton>
          </div>
        </form>
      )}
    </Card>
  );
}

function DomainItem({ domain, configured, readOnly }: { domain: DomainView; configured: boolean; readOnly: boolean }) {
  const [checkState, check] = useActionState(checkDomainAction, idle);
  const [removeState, remove] = useActionState(removeDomainAction, idle);
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-[var(--border)] p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-medium">{domain.domain}</p>
          <p className="font-mono text-sm text-[var(--muted)]">
            {domain.fromLocalPart}@{domain.domain}
          </p>
        </div>
        <span className={`${BADGE} ${STATUS_TONE[domain.status] ?? "bg-[var(--warning-soft)] text-[var(--foreground)]"}`}>
          {DOMAIN_STATUS_LABELS[domain.status] ?? domain.status}
        </span>
      </div>
      <FormMessage state={checkState} />
      <FormMessage state={removeState} />
      {domain.status !== "verified" && domain.records.length ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <caption className="mb-2 text-left text-sm text-[var(--muted)]">Registros DNS que tienes que crear:</caption>
            <thead className="text-xs uppercase tracking-wide text-[var(--muted)]">
              <tr>
                <th className="py-2 pr-3 font-medium">Tipo</th>
                <th className="py-2 pr-3 font-medium">Nombre</th>
                <th className="py-2 pr-3 font-medium">Valor</th>
                <th className="py-2 pr-3 font-medium">Prioridad</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]">
              {domain.records.map((r, i) => (
                <tr key={`${r.type}-${r.name}-${i}`} className="align-top">
                  <td className="py-2 pr-3 font-mono">{r.type}</td>
                  <td className="break-all py-2 pr-3 font-mono">{r.name}</td>
                  <td className="break-all py-2 pr-3 font-mono text-xs">{r.value}</td>
                  <td className="py-2 pr-3">{r.priority ?? ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      {readOnly ? null : (
        <div className="flex flex-wrap gap-3">
          {configured && domain.status !== "verified" ? (
            <form action={check}>
              <input type="hidden" name="id" value={domain.id} />
              <SubmitButton variant="secondary" pendingLabel="Comprobando…">
                Comprobar ahora
              </SubmitButton>
            </form>
          ) : null}
          <form
            action={remove}
            onSubmit={(e) => {
              if (!window.confirm(`¿Eliminar ${domain.domain}? Los avisos saldrán con el remitente de RevisaYa.`)) e.preventDefault();
            }}
          >
            <input type="hidden" name="id" value={domain.id} />
            <SubmitButton variant="ghost" pendingLabel="Eliminando…">
              Eliminar
            </SubmitButton>
          </form>
        </div>
      )}
    </div>
  );
}

export function SuppressionsManager({
  rows,
  readOnly,
}: {
  rows: Array<{ email: string; reason: string; createdAt: string }>;
  readOnly: boolean;
}) {
  const [state, action] = useActionState(addSuppressionAction, idle);
  return (
    <Card className="flex flex-col gap-4">
      <div>
        <h2 className="text-lg font-semibold">Direcciones bloqueadas</h2>
        <p className="text-sm text-[var(--muted)]">
          No se envía ningún correo a estas direcciones. Los rebotes, quejas y bajas se añaden solos; si un cliente tenía mal el correo, cámbialo
          en su ficha.
        </p>
      </div>
      {rows.length ? (
        <ul className="divide-y divide-[var(--border)] rounded-lg border border-[var(--border)]">
          {rows.map((r) => (
            <SuppressionItem key={r.email} row={r} readOnly={readOnly} />
          ))}
        </ul>
      ) : (
        <p className="text-sm text-[var(--muted)]">No hay direcciones bloqueadas.</p>
      )}
      {readOnly ? null : (
        <form action={action} className="flex flex-col gap-3">
          <FormMessage state={state} />
          <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
            <Field label="Bloquear una dirección" name="email" type="email" required errors={fieldErrors(state, "email")} />
            <SubmitButton variant="secondary" pendingLabel="Bloqueando…">
              Bloquear
            </SubmitButton>
          </div>
        </form>
      )}
    </Card>
  );
}

function SuppressionItem({ row, readOnly }: { row: { email: string; reason: string; createdAt: string }; readOnly: boolean }) {
  const [state, action] = useActionState(removeSuppressionAction, idle);
  return (
    <li className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 text-sm">
      <span>
        <span className="break-all font-medium">{row.email}</span>
        <span className="block text-xs text-[var(--muted)]">
          {SUPPRESSION_REASON_LABELS[row.reason] ?? row.reason} · {row.createdAt}
        </span>
      </span>
      {row.reason === "manual" && !readOnly ? (
        <form action={action} className="flex items-center gap-2">
          <input type="hidden" name="email" value={row.email} />
          {state.status === "error" ? <span className="text-[var(--danger)]">{state.message}</span> : null}
          <SubmitButton variant="ghost" pendingLabel="Desbloqueando…" aria-label={`Desbloquear ${row.email}`}>
            Desbloquear
          </SubmitButton>
        </form>
      ) : null}
    </li>
  );
}

/** Guía paso a paso (PDF §5). Misma información que docs/GUIA-DOMINIO-PROPIO.md. */
function DnsGuide() {
  return (
    <details className="rounded-lg border border-[var(--border)] px-4 py-3 text-sm">
      <summary className="cursor-pointer font-medium">Cómo añadir los registros DNS, paso a paso</summary>
      <ol className="mt-3 flex list-decimal flex-col gap-2 pl-5 leading-6">
        <li>Añade tu dominio aquí. Te mostraremos una tabla de registros DNS (tipo, nombre, valor y, a veces, prioridad).</li>
        <li>
          Entra en el panel donde tienes contratado el dominio y busca la sección de DNS (suele llamarse «Zona DNS», «Gestionar DNS» o «Registros
          DNS»).
        </li>
        <li>
          Crea un registro por cada fila con el mismo tipo, nombre y valor. Si tu panel añade el dominio al final del nombre, escribe solo la primera
          parte (por ejemplo <code>resend._domainkey</code>).
        </li>
        <li>
          Recomendado: si no tienes un registro <code>_dmarc</code>, crea uno TXT con el valor <code>v=DMARC1; p=none; rua=mailto:tu-correo@tudominio.es</code>.
        </li>
        <li>Pulsa «Comprobar ahora». Los cambios pueden tardar hasta 72 horas; lo comprobamos solos cada 30 minutos.</li>
        <li>Cuando esté verificado, elígelo arriba como remitente y envíate una prueba desde Plantillas.</li>
      </ol>
      <p className="mt-3 text-[var(--muted)]">
        Si ya tenías un registro SPF (TXT que empieza por <code>v=spf1</code>) con el mismo nombre, no crees otro: solo puede haber uno y hay que
        combinarlos. Ante la duda, pide ayuda a quien gestione tu dominio.
      </p>
    </details>
  );
}

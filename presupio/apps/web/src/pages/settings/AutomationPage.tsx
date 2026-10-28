import { useMutation, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, CircleAlert, History, Pencil, Power, PowerOff, Send } from 'lucide-react';
import { useRef, useState } from 'react';
import { Link } from 'react-router';
import { api } from '../../api/client';
import { keys, useAutomation, useCompany, useSettings, useTemplates, useTemplateVersions } from '../../api/queries';
import type { AutomationStatus, CompanySettings, MessageTemplate, TemplatePreview } from '../../api/types';
import { useSession } from '../../auth/session';
import { Dialog } from '../../components/Dialog';
import { useToast } from '../../components/Toasts';
import { Alert, Button, ErrorAlert, Field, Skeleton } from '../../components/ui';
import { formatDate, formatDateTime, formatNumber } from '../../lib/format';
import { useFormErrors } from '../../lib/forms';
import { usePageTitle } from '../../lib/usePageTitle';
import { compact, validateEmail } from '../../lib/validation';
import { ReadOnlyNotice } from './SettingsPages';

const PROVIDER_LABEL: Record<string, string> = {
  mailgun: 'Mailgun (región UE)',
  smtp: 'Servidor SMTP',
  disabled: 'Ninguno',
};

const MIN_LEGAL_NOTE = 20;

function useRefreshAutomation() {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: keys.automation });
    void queryClient.invalidateQueries({ queryKey: keys.settings });
    void queryClient.invalidateQueries({ queryKey: ['follow-ups'] });
    void queryClient.invalidateQueries({ queryKey: ['quotes'] });
  };
}

// ---------------------------------------------------------------------------
// Estado y activación
// ---------------------------------------------------------------------------

function Requirement({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  return (
    <li className={`req ${ok ? 'req--ok' : 'req--missing'}`}>
      {ok ? <CheckCircle2 aria-hidden="true" /> : <CircleAlert aria-hidden="true" />}
      <span>
        <span className="visually-hidden">{ok ? 'Cumplido: ' : 'Pendiente: '}</span>
        {children}
      </span>
    </li>
  );
}

function EnableDialog({ status, onClose }: { status: AutomationStatus; onClose: () => void }) {
  const refresh = useRefreshAutomation();
  const toast = useToast();
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mutation = useMutation({
    mutationFn: () => api('/automation/enable', { method: 'POST', body: { confirmLegalBasis: true } }),
    onSuccess: () => {
      refresh();
      toast.success('Envío automático activado.');
      onClose();
    },
  });
  const days = status.automation.schedule.join(', ');
  return (
    <Dialog
      open
      onClose={onClose}
      title="Activar el envío automático"
      onSubmit={() => {
        if (!confirmed) {
          setError('Marca la casilla para confirmar la base jurídica.');
          return;
        }
        mutation.mutate();
      }}
      submitLabel="Activar"
      submitting={mutation.isPending}
    >
      <div className="stack">
        {mutation.isError && <ErrorAlert error={mutation.error} />}
        <ul className="plain-list">
          <li>
            Presupio programará un email para cada presupuesto enviado y sin respuesta, a los <strong>{days} días</strong> del envío, en los días y
            horas que has permitido.
          </li>
          <li>Si un presupuesto ya pasó algún paso, no se envían los atrasados: se empieza por el que toca ahora.</li>
          <li>
            {status.automation.requireApproval
              ? 'Con la revisión obligatoria activada, ningún email saldrá sin que alguien de tu equipo lo apruebe.'
              : 'La revisión humana está desactivada: los emails saldrán solos en su fecha.'}
          </li>
          <li>Se detienen en cuanto registras la respuesta del cliente, o si este se da de baja, o si desactivas el envío.</li>
        </ul>
        <label className="check">
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(e) => {
              setConfirmed(e.target.checked);
              setError(null);
            }}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? 'confirm-error' : undefined}
          />
          <span>
            Confirmo que mi empresa tiene una base jurídica para escribir a estos clientes (pidieron un presupuesto) y que no se usarán listas compradas
            ni contactos que no lo solicitaron.
          </span>
        </label>
        {error && (
          <p className="field__error" id="confirm-error">
            {error}
          </p>
        )}
      </div>
    </Dialog>
  );
}

function DisableDialog({ status, onClose }: { status: AutomationStatus; onClose: () => void }) {
  const refresh = useRefreshAutomation();
  const toast = useToast();
  const pending = status.counts.scheduled + status.counts.awaitingApproval;
  const mutation = useMutation({
    mutationFn: () => api<{ cancelledFollowUps: number }>('/automation/disable', { method: 'POST' }),
    onSuccess: (res) => {
      refresh();
      toast.success(`Envío automático desactivado.${res.cancelledFollowUps ? ` ${res.cancelledFollowUps} email(s) pendiente(s) cancelado(s).` : ''}`);
      onClose();
    },
  });
  return (
    <Dialog
      open
      onClose={onClose}
      title="Desactivar el envío automático"
      description={
        pending > 0
          ? `Se cancelarán ${pending} email(s) pendiente(s) y no se programarán más. Lo ya enviado queda en el historial.`
          : 'No se programarán más emails. Lo ya enviado queda en el historial.'
      }
      onSubmit={() => mutation.mutate()}
      submitLabel="Desactivar"
      submitVariant="danger"
      submitting={mutation.isPending}
    >
      {mutation.isError ? <ErrorAlert error={mutation.error} /> : undefined}
    </Dialog>
  );
}

function StatusPanel({ status, canEdit }: { status: AutomationStatus; canEdit: boolean }) {
  const [dialog, setDialog] = useState<'enable' | 'disable' | null>(null);
  const { automation: a, provider, counts, worker } = status;
  const r = a.requirements;
  const ready = r.providerConfigured && r.replyToEmail && r.legalBasisNote && r.activePlan;
  const lastRun = worker.lastRuns.find((run) => run.job === 'dispatcher');

  return (
    <section className="panel" aria-labelledby="auto-status-title">
      <div className="panel__header">
        <div>
          <h2 id="auto-status-title" className="cluster" style={{ gap: 'var(--s-2)' }}>
            Envío automático de emails
            <span className={`pill ${a.enabled ? 'pill--accepted' : 'pill--neutral'}`}>{a.enabled ? 'Activo' : 'Desactivado'}</span>
          </h2>
          <p>
            Presupio escribe por email a los clientes que no han respondido, según tus{' '}
            <Link to="/configuracion/seguimiento">reglas de seguimiento</Link> ({a.schedule.join(', ')} días). Las respuestas llegan a tu correo.
          </p>
        </div>
      </div>
      <div className="panel__body stack">
        {!provider.configured && (
          <Alert tone="warning" title="No hay proveedor de email configurado en el servidor">
            Mientras falte, Presupio no enviará ningún email. La persona que administra el servidor debe configurar FOLLOWUP_EMAIL_PROVIDER (ver la
            documentación de automatización).
          </Alert>
        )}
        {a.enabled && a.enabledAt && (
          <p className="small muted">
            Activado el {formatDate(a.enabledAt)}
            {a.enabledBy ? ` por ${a.enabledBy}` : ''}. {a.requireApproval ? 'Cada email necesita aprobación.' : 'Los emails salen sin revisión previa.'}
          </p>
        )}
        {!a.enabled && (
          <div>
            <h3 className="section-title">Para activarlo necesitas</h3>
            <ul className="reqs">
              <Requirement ok={r.providerConfigured}>Un proveedor de email configurado en el servidor</Requirement>
              <Requirement ok={r.replyToEmail}>Una dirección donde recibir las respuestas (más abajo)</Requirement>
              <Requirement ok={r.legalBasisNote}>La base legal para contactar, documentada (más abajo)</Requirement>
              <Requirement ok={r.activePlan}>Un plan activo o el periodo de prueba</Requirement>
            </ul>
          </div>
        )}
        {(a.enabled || counts.sent30d + counts.failed > 0) && (
          <dl className="ledger ledger--compact">
            <div className="ledger__cell">
              <dt>
                <Link to="/seguimientos?estado=aprobar">Por aprobar</Link>
              </dt>
              <dd className="ledger__value">{formatNumber(counts.awaitingApproval)}</dd>
            </div>
            <div className="ledger__cell">
              <dt>
                <Link to="/seguimientos">Programados</Link>
              </dt>
              <dd className="ledger__value">{formatNumber(counts.scheduled)}</dd>
            </div>
            <div className="ledger__cell">
              <dt>
                <Link to="/seguimientos?estado=sent">Enviados (30 días)</Link>
              </dt>
              <dd className="ledger__value">{formatNumber(counts.sent30d)}</dd>
              {provider.tracksDelivery && <dd className="ledger__note">{formatNumber(counts.delivered30d)} entregados</dd>}
            </div>
            <div className="ledger__cell">
              <dt>
                <Link to="/seguimientos?estado=failed">Fallidos</Link>
              </dt>
              <dd className="ledger__value">{formatNumber(counts.failed)}</dd>
            </div>
          </dl>
        )}
        <dl className="kv">
          <dt>Proveedor</dt>
          <dd>
            {PROVIDER_LABEL[provider.name] ?? provider.name}
            {provider.fromDomain && <span className="cell-sub">Envía desde el dominio {provider.fromDomain}</span>}
          </dd>
          <dt>Confirmación de entrega</dt>
          <dd>{provider.tracksDelivery ? 'Sí (webhooks firmados del proveedor)' : 'No: solo se sabe si el proveedor aceptó el envío'}</dd>
          <dt>Proceso de envío</dt>
          <dd>
            {lastRun ? (
              <>
                {worker.healthy ? 'Funcionando' : 'Sin actividad reciente'}
                <span className="cell-sub">Última ejecución: {formatDateTime(lastRun.startedAt)}</span>
              </>
            ) : (
              'Todavía no se ha ejecutado'
            )}
          </dd>
        </dl>
        {a.enabled && !worker.healthy && (
          <Alert tone="warning">
            El proceso que envía los emails no se ha ejecutado recientemente. Los emails programados esperarán hasta que vuelva a funcionar (no se pierden).
          </Alert>
        )}
      </div>
      {canEdit && (
        <div className="panel__footer">
          <span className="small muted">{a.enabled ? 'Puedes desactivarlo en cualquier momento.' : ready ? 'Todo listo para activarlo.' : 'Completa los requisitos para activarlo.'}</span>
          {a.enabled ? (
            <Button variant="quiet-danger" icon={PowerOff} onClick={() => setDialog('disable')}>
              Desactivar
            </Button>
          ) : (
            <Button variant="primary" icon={Power} disabled={!ready} onClick={() => setDialog('enable')}>
              Activar envío automático
            </Button>
          )}
        </div>
      )}
      {dialog === 'enable' && <EnableDialog status={status} onClose={() => setDialog(null)} />}
      {dialog === 'disable' && <DisableDialog status={status} onClose={() => setDialog(null)} />}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Remitente, revisión y base legal
// ---------------------------------------------------------------------------

function SenderForm({ settings, status, companyName, canEdit }: { settings: CompanySettings; status: AutomationStatus; companyName: string; canEdit: boolean }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [f, setF] = useState({
    senderName: settings.senderName ?? '',
    replyToEmail: settings.replyToEmail ?? '',
    requireManualApproval: settings.requireManualApproval,
    legalBasisNote: settings.legalBasisNote ?? '',
  });
  const { errors, setErrors, formError, setFormError, handleError, clearField, formRef } = useFormErrors();
  const mutation = useMutation({
    mutationFn: (body: object) => api<{ settings: CompanySettings }>('/company/settings', { method: 'PATCH', body }),
    onSuccess: (res) => {
      queryClient.setQueryData(keys.settings, res);
      void queryClient.invalidateQueries({ queryKey: keys.automation });
      toast.success('Datos de envío guardados.');
    },
    onError: (e) => handleError(e),
  });
  const set = (k: 'senderName' | 'replyToEmail' | 'legalBasisNote') => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setF((p) => ({ ...p, [k]: e.target.value }));
    clearField(k);
  };
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    const note = f.legalBasisNote.trim();
    const errs = compact({
      replyToEmail: f.replyToEmail.trim()
        ? validateEmail(f.replyToEmail)
        : settings.automationEnabled
          ? 'Obligatoria mientras el envío automático esté activo'
          : undefined,
      legalBasisNote:
        note && note.length < MIN_LEGAL_NOTE
          ? `Explícala un poco más (mínimo ${MIN_LEGAL_NOTE} caracteres)`
          : !note && settings.automationEnabled
            ? 'Obligatoria mientras el envío automático esté activo'
            : undefined,
    });
    setErrors(errs);
    if (Object.keys(errs).length) return;
    mutation.mutate({
      senderName: f.senderName.trim(),
      replyToEmail: f.replyToEmail.trim() || null,
      requireManualApproval: f.requireManualApproval,
      legalBasisNote: note,
    });
  };
  const fromName = f.senderName.trim() || companyName;

  return (
    <form ref={formRef} className="panel" onSubmit={submit} noValidate aria-labelledby="sender-title">
      <div className="panel__header">
        <div>
          <h2 id="sender-title">Remitente y revisión</h2>
          <p>Quién firma los emails, adónde llegan las respuestas y cómo se revisan antes de salir.</p>
        </div>
      </div>
      <fieldset className="panel__body form" disabled={!canEdit} style={{ border: 0, margin: 0, minWidth: 0 }}>
        {!canEdit && <ReadOnlyNotice />}
        {formError != null && <ErrorAlert error={formError} />}
        <div className="form-row">
          <Field label="Nombre del remitente" error={errors.senderName} optional hint="Por ejemplo, la persona que hizo el presupuesto. Si lo dejas vacío, el de tu empresa.">
            <input className="input" value={f.senderName} onChange={set('senderName')} maxLength={80} placeholder={companyName} />
          </Field>
          <Field label="Las respuestas llegan a" error={errors.replyToEmail} hint="Tu buzón habitual. Cuando un cliente responda, registra la respuesta en Presupio.">
            <input className="input" type="email" value={f.replyToEmail} onChange={set('replyToEmail')} maxLength={254} placeholder="oficina@tuempresa.es" />
          </Field>
        </div>
        <p className="small muted">
          El cliente verá: <span className="strong">{fromName}</span> &lt;…@{status.provider.fromDomain ?? 'dominio del servidor'}&gt;
        </p>
        <label className="check">
          <input type="checkbox" checked={f.requireManualApproval} onChange={(e) => setF((p) => ({ ...p, requireManualApproval: e.target.checked }))} />
          <span>
            <span className="strong">Revisión humana obligatoria</span>
            <span className="cell-sub">
              Ningún email saldrá sin que alguien de tu equipo lo apruebe. Si no se aprueba en 72 horas desde su fecha prevista, se cancela.
            </span>
          </span>
        </label>
        <Field
          label="Base legal para contactar"
          error={errors.legalBasisNote}
          hint="Documenta por qué puedes escribir a tus clientes tras enviarles un presupuesto (RGPD y LSSI). Queda registrada en tu cuenta."
        >
          <textarea
            className="textarea"
            rows={3}
            maxLength={2000}
            value={f.legalBasisNote}
            onChange={set('legalBasisNote')}
            placeholder="Ej.: Escribimos solo a clientes que nos han pedido un presupuesto, para saber si tienen dudas (interés legítimo y relación precontractual)."
          />
        </Field>
      </fieldset>
      {canEdit && (
        <div className="panel__footer">
          <span className="small muted">Todos los emails incluyen los datos de tu empresa y un enlace para darse de baja.</span>
          <Button type="submit" variant="primary" loading={mutation.isPending}>
            Guardar
          </Button>
        </div>
      )}
    </form>
  );
}

// ---------------------------------------------------------------------------
// Plantillas
// ---------------------------------------------------------------------------

function TemplateDialog({ template, variables, onClose }: { template: MessageTemplate; variables: Record<string, string>; onClose: () => void }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [f, setF] = useState({ subject: template.subject, body: template.body });
  const [showHistory, setShowHistory] = useState(false);
  const versions = useTemplateVersions(template.step, showHistory);
  const lastFocused = useRef<'subject' | 'body'>('body');
  const subjectRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const { errors, setErrors, formError, setFormError, handleError, clearField } = useFormErrors();

  const preview = useMutation({
    mutationFn: () => api<{ preview: TemplatePreview }>('/automation/templates/preview', { method: 'POST', body: f }),
    onError: (e) => handleError(e),
  });
  const save = useMutation({
    mutationFn: () => api<{ template: { version: number } }>(`/automation/templates/${template.step}`, { method: 'PUT', body: f }),
    onSuccess: (res) => {
      void queryClient.invalidateQueries({ queryKey: keys.templates });
      toast.success(
        res.template.version === template.version
          ? 'Sin cambios en la plantilla.'
          : `Plantilla guardada (versión ${res.template.version}). Los emails ya aprobados no cambian.`,
      );
      onClose();
    },
    onError: (e) => handleError(e),
  });

  const insert = (name: string) => {
    const token = `{{${name}}}`;
    const key = lastFocused.current;
    const el = key === 'subject' ? subjectRef.current : bodyRef.current;
    const value = f[key];
    const start = el?.selectionStart ?? value.length;
    const end = el?.selectionEnd ?? value.length;
    setF((p) => ({ ...p, [key]: value.slice(0, start) + token + value.slice(end) }));
    clearField(key);
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(start + token.length, start + token.length);
    });
  };

  const submit = () => {
    setFormError(null);
    const errs = compact({
      subject: f.subject.trim() ? undefined : 'El asunto es obligatorio',
      body: f.body.trim() ? undefined : 'El mensaje es obligatorio',
    });
    setErrors(errs);
    if (!Object.keys(errs).length) save.mutate();
  };

  return (
    <Dialog
      open
      size="lg"
      onClose={onClose}
      title={`Email ${template.step} · a los ${template.offsetDays} días`}
      description="Breve y cordial. Sin precios, descuentos ni promesas: el objetivo es abrir una conversación."
      onSubmit={submit}
      submitLabel="Guardar versión nueva"
      submitting={save.isPending}
      footerExtra={
        <Button variant="ghost" onClick={() => preview.mutate()} loading={preview.isPending}>
          Vista previa
        </Button>
      }
    >
      <div className="form">
        {formError != null && <ErrorAlert error={formError} />}
        <Field label="Asunto" error={errors.subject}>
          <input
            ref={subjectRef}
            className="input"
            value={f.subject}
            maxLength={200}
            onFocus={() => (lastFocused.current = 'subject')}
            onChange={(e) => {
              setF((p) => ({ ...p, subject: e.target.value }));
              clearField('subject');
            }}
          />
        </Field>
        <Field label="Mensaje" error={errors.body}>
          <textarea
            ref={bodyRef}
            className="textarea"
            rows={10}
            maxLength={5000}
            value={f.body}
            onFocus={() => (lastFocused.current = 'body')}
            onChange={(e) => {
              setF((p) => ({ ...p, body: e.target.value }));
              clearField('body');
            }}
          />
        </Field>
        <div>
          <p className="field__label" id="vars-label">
            Insertar dato
          </p>
          <div className="var-chips" role="group" aria-labelledby="vars-label">
            {Object.entries(variables).map(([name, label]) => (
              <button key={name} type="button" className="var-chip" onClick={() => insert(name)} title={`{{${name}}}`}>
                {label}
              </button>
            ))}
          </div>
          <p className="field__hint">Se insertan donde esté el cursor. Al final se añade siempre un pie con los datos de tu empresa y el enlace de baja.</p>
        </div>
        {preview.isSuccess && (
          <section className="email-preview" aria-label="Vista previa con datos de ejemplo">
            <p className="small muted">Vista previa con datos de ejemplo (no se envía nada):</p>
            <p className="strong">{preview.data.preview.subject}</p>
            <pre className="email-text">{preview.data.preview.text}</pre>
          </section>
        )}
        <details className="history" onToggle={(e) => setShowHistory((e.target as HTMLDetailsElement).open)}>
          <summary>
            <History aria-hidden="true" className="inline-icon" /> Versiones anteriores (actual: {template.version})
          </summary>
          {versions.isPending ? (
            <Skeleton height="4rem" />
          ) : versions.isError ? (
            <ErrorAlert error={versions.error} />
          ) : (
            <ol className="history__list">
              {versions.data.items.map((v) => (
                <li key={v.id}>
                  <div>
                    <span className="strong">Versión {v.version}</span>{' '}
                    <span className="small muted">
                      {formatDateTime(v.createdAt)}
                      {v.createdBy ? ` · ${v.createdBy}` : ' · plantilla inicial'}
                    </span>
                    <p className="small truncate">{v.subject}</p>
                  </div>
                  {v.version !== template.version && (
                    <Button size="sm" variant="ghost" onClick={() => setF({ subject: v.subject, body: v.body })}>
                      Cargar
                    </Button>
                  )}
                </li>
              ))}
            </ol>
          )}
        </details>
      </div>
    </Dialog>
  );
}

/** Muestra el texto de una plantilla con cada {{variable}} como un dato legible. */
function TemplateText({ text, variables }: { text: string; variables: Record<string, string> }) {
  const parts = text.split(/(\{\{\s*[a-zA-Z_]+\s*\}\})/g);
  return (
    <>
      {parts.map((part, i) => {
        const name = /^\{\{\s*([a-zA-Z_]+)\s*\}\}$/.exec(part)?.[1];
        return name ? (
          <span key={i} className="var-token" title={`{{${name}}}`}>
            {(variables[name] ?? name).split(' (')[0]!.toLowerCase()}
          </span>
        ) : (
          part
        );
      })}
    </>
  );
}

function TemplatesPanel({ canEdit }: { canEdit: boolean }) {
  const templates = useTemplates();
  const [editing, setEditing] = useState<MessageTemplate | null>(null);
  return (
    <section className="panel" aria-labelledby="templates-title">
      <div className="panel__header">
        <div>
          <h2 id="templates-title">Mensajes</h2>
          <p>Un email por cada seguimiento. Cada cambio crea una versión nueva; los emails ya aprobados se envían tal y como se aprobaron.</p>
        </div>
      </div>
      {templates.isPending ? (
        <div className="panel__body">
          <Skeleton height="8rem" />
        </div>
      ) : templates.isError ? (
        <div className="panel__body">
          <ErrorAlert error={templates.error} onRetry={() => void templates.refetch()} />
        </div>
      ) : (
        <ol className="templates">
          {templates.data.items.map((t) => (
            <li key={t.step} className="template">
              <span className="template__step" aria-hidden="true">
                {t.step}
              </span>
              <div className="template__main">
                <p className="strong">
                  <span className="visually-hidden">Email {t.step}: </span>
                  <TemplateText text={t.subject} variables={templates.data.variables} />
                </p>
                <p className="small muted">
                  A los {t.offsetDays} días · versión {t.version}
                  {t.version > 1 ? ` · editada el ${formatDate(t.updatedAt)}` : ' · texto inicial'}
                </p>
                <p className="template__excerpt">
                  <TemplateText
                    text={t.body.split('\n').find((line) => line.trim() && !line.includes('{{nombre_cliente}}')) ?? t.body}
                    variables={templates.data.variables}
                  />
                </p>
              </div>
              <Button size="sm" icon={Pencil} onClick={() => setEditing(t)} aria-label={canEdit ? `Editar el email ${t.step}` : `Ver el email ${t.step}`}>
                {canEdit ? 'Editar' : 'Ver'}
              </Button>
            </li>
          ))}
        </ol>
      )}
      {editing && templates.data && <TemplateDialog template={editing} variables={templates.data.variables} onClose={() => setEditing(null)} />}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Email de prueba
// ---------------------------------------------------------------------------

function TestEmailPanel({ status }: { status: AutomationStatus }) {
  const session = useSession();
  const test = useMutation({
    mutationFn: () =>
      api<{ delivery: 'sent'; to: string; providerMessageId: string | null } | { delivery: 'failed'; error: { code: string; detail: string } }>(
        '/automation/test-email',
        { method: 'POST' },
      ),
  });
  return (
    <section className="panel" aria-labelledby="test-title">
      <div className="panel__header">
        <div>
          <h2 id="test-title">Email de prueba</h2>
          <p>Te envía el primer email, con datos de ejemplo, a tu propia dirección ({session.user.email}). Nunca a un cliente.</p>
        </div>
        <Button icon={Send} onClick={() => test.mutate()} loading={test.isPending} disabled={!status.provider.configured}>
          Enviarme una prueba
        </Button>
      </div>
      {(test.isError || test.isSuccess) && (
        <div className="panel__body">
          {test.isError ? (
            <ErrorAlert error={test.error} />
          ) : test.data.delivery === 'sent' ? (
            <Alert tone="success" title="El proveedor ha aceptado el email">
              Revisa la bandeja de {test.data.to} (y la de correo no deseado). Si no llega en unos minutos, revisa la configuración del dominio.
            </Alert>
          ) : (
            <Alert tone="error" title="El proveedor no ha aceptado el email">
              {test.data.error.detail || test.data.error.code}
            </Alert>
          )}
        </div>
      )}
    </section>
  );
}

export function AutomationPage() {
  usePageTitle('Envío automático');
  const session = useSession();
  const status = useAutomation();
  const settings = useSettings();
  const company = useCompany();
  const canEdit = session.can('settings:update');
  if (status.isPending || settings.isPending || company.isPending) return <Skeleton height="24rem" />;
  const error = status.error ?? settings.error ?? company.error;
  if (error || !status.data || !settings.data || !company.data)
    return <ErrorAlert error={error} onRetry={() => void Promise.all([status.refetch(), settings.refetch(), company.refetch()])} />;
  return (
    <div className="stack stack--lg">
      <StatusPanel status={status.data} canEdit={canEdit} />
      <SenderForm
        key={settings.data.settings.updatedAt}
        settings={settings.data.settings}
        status={status.data}
        companyName={company.data.company.name}
        canEdit={canEdit}
      />
      <TemplatesPanel canEdit={canEdit} />
      {canEdit && <TestEmailPanel status={status.data} />}
    </div>
  );
}

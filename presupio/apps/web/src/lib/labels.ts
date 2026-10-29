import type {
  ActivityEntry,
  ContactChannel,
  DeliveryStatus,
  ExclusionReason,
  FollowUpChannel,
  FollowUpOutcome,
  FollowUpStatus,
  QuoteStatus,
  AttemptEvent,
  Role,
  SubscriptionStatus,
} from '../api/types';

export const QUOTE_STATUS_LABEL: Record<QuoteStatus, string> = {
  draft: 'Borrador',
  sent: 'Pendiente de respuesta',
  responded: 'Respondido',
  accepted: 'Aceptado',
  rejected: 'Rechazado',
};

/** Etiqueta corta para filtros y chips. */
export const QUOTE_STATUS_SHORT: Record<QuoteStatus, string> = {
  draft: 'Borradores',
  sent: 'Pendientes',
  responded: 'Respondidos',
  accepted: 'Aceptados',
  rejected: 'Rechazados',
};

/** Verbo de la acción que lleva a cada estado. */
export const QUOTE_TRANSITION_LABEL: Record<QuoteStatus, string> = {
  draft: 'Volver a borrador',
  sent: 'Marcar como enviado',
  responded: 'Registrar respuesta del cliente',
  accepted: 'Confirmar venta',
  rejected: 'Marcar como rechazado',
};

export const FOLLOW_UP_CHANNEL_LABEL: Record<FollowUpChannel, string> = {
  task: 'Tarea interna',
  phone: 'Llamada',
  email: 'Email',
  whatsapp: 'WhatsApp',
  sms: 'SMS',
  in_person: 'Visita',
};

export const CONTACT_CHANNEL_LABEL: Record<ContactChannel, string> = {
  email: 'Email',
  phone: 'Teléfono',
  whatsapp: 'WhatsApp',
  sms: 'SMS',
};

export const OUTCOME_LABEL: Record<FollowUpOutcome, string> = {
  no_answer: 'No contestó',
  left_message: 'Dejamos mensaje',
  contacted: 'Hablamos con el cliente',
  responded: 'El cliente respondió',
  wrong_contact: 'Datos de contacto erróneos',
  other: 'Otro resultado',
};

export const ROLE_LABEL: Record<Role, string> = {
  owner: 'Propietario',
  admin: 'Administrador',
  member: 'Comercial',
  viewer: 'Solo lectura',
};

export const ROLE_DESCRIPTION: Record<Role, string> = {
  owner: 'Control total, incluida la gestión de propietarios.',
  admin: 'Gestiona la empresa, las reglas y el equipo.',
  member: 'Trabaja con presupuestos, contactos y seguimientos.',
  viewer: 'Puede consultar, pero no modificar.',
};

export const EXCLUSION_REASON_LABEL: Record<ExclusionReason, string> = {
  opt_out_request: 'Pidió no recibir más mensajes',
  rejected: 'Rechazó el presupuesto',
  legal: 'Motivo legal',
  bounced: 'Datos de contacto erróneos',
  manual: 'Decisión interna',
};

export const SUBSCRIPTION_STATUS_LABEL: Record<SubscriptionStatus, string> = {
  none: 'Sin suscripción',
  trialing: 'Periodo de prueba',
  active: 'Activa',
  past_due: 'Pago pendiente',
  canceled: 'Cancelada',
  unpaid: 'Impagada',
  incomplete: 'Incompleta',
};

export const WEEKDAYS: Array<{ value: number; short: string; long: string }> = [
  { value: 1, short: 'L', long: 'Lunes' },
  { value: 2, short: 'M', long: 'Martes' },
  { value: 3, short: 'X', long: 'Miércoles' },
  { value: 4, short: 'J', long: 'Jueves' },
  { value: 5, short: 'V', long: 'Viernes' },
  { value: 6, short: 'S', long: 'Sábado' },
  { value: 7, short: 'D', long: 'Domingo' },
];

export const FOLLOW_UP_STATUS_LABEL: Record<FollowUpStatus, string> = {
  pending: 'Pendiente',
  sending: 'Enviándose',
  sent: 'Enviado',
  completed: 'Realizado',
  failed: 'No se pudo enviar',
  cancelled: 'Cancelado',
  unknown: 'Por revisar',
};

/** Estado de cada intento de envío. Solo «Entregado» lo confirma el proveedor de email. */
export const DELIVERY_STATUS_LABEL: Record<DeliveryStatus, string> = {
  sending: 'Enviándose',
  sent: 'Aceptado por el proveedor',
  delivered: 'Entregado al servidor del cliente',
  failed: 'Fallido',
  unknown: 'Resultado desconocido',
};

export const ATTEMPT_STATUS_LABEL: Record<AttemptEvent['status'], string> = {
  counted: 'Enviado (cuenta)',
  reserved: 'Enviándose',
};

const CANCEL_REASON_LABEL: Record<string, string> = {
  quote_responded: 'el cliente respondió',
  quote_accepted: 'el presupuesto se aceptó',
  quote_rejected: 'el presupuesto se rechazó',
  quote_archived: 'el presupuesto se archivó',
  quote_draft: 'el presupuesto volvió a borrador',
  contact_excluded: 'el contacto está en la lista de exclusión',
  contact_without_email: 'el contacto no tiene email',
  manual: 'cancelado a mano',
  automation_disabled: 'se desactivó el envío automático',
  quote_auto_disabled: 'se desactivaron los emails automáticos de este presupuesto',
  rules_changed: 'cambiaron las reglas de seguimiento',
  quote_resent: 'cambió la fecha de envío del presupuesto',
  approval_expired: 'nadie lo aprobó a tiempo (72 h)',
  expired: 'no pudo enviarse a tiempo',
  plan_limit_reached: 'se agotaron los intentos de seguimiento del plan',
  no_active_plan: 'la cuenta no tiene un plan activo',
};

export function cancelReasonLabel(reason: string | null): string {
  if (!reason) return 'cancelado';
  return CANCEL_REASON_LABEL[reason] ?? reason;
}

/** Motivo de un envío fallido, en lenguaje claro (los códigos vienen del proveedor o del motor). */
export function failureReasonLabel(code: string | null): string {
  if (!code) return 'motivo no indicado';
  if (code === 'unknown_outcome') return 'el envío se interrumpió y no se sabe si salió; no se reintenta para no duplicarlo';
  if (code === 'interrupted_before_send') return 'el envío se interrumpió antes de llamar al proveedor (no salió); se volvió a programar';
  if (code === 'not_sent_confirmed') return 'se confirmó que el email no llegó a salir';
  if (code === 'bounced') return 'la dirección rechazó el correo (rebote permanente)';
  if (code === 'provider_auth') return 'el proveedor de email rechazó las credenciales del servidor';
  if (code === 'provider_not_configured') return 'no hay proveedor de email configurado';
  if (code === 'rate_limited') return 'el proveedor limitó temporalmente los envíos';
  if (code === 'network_error' || code === 'provider_exception') return 'no se pudo conectar con el proveedor de email';
  if (code === 'recipient_rejected' || /^smtp_5/.test(code)) return 'el servidor de correo rechazó la dirección';
  if (/^rejected_4/.test(code)) return 'el proveedor rechazó el mensaje';
  if (/^(provider|smtp)_\d+$/.test(code)) return 'error temporal del proveedor de email';
  return code;
}

function statusName(value: unknown): string {
  return typeof value === 'string' && value in QUOTE_STATUS_LABEL ? QUOTE_STATUS_LABEL[value as QuoteStatus].toLowerCase() : 'otro estado';
}

function channelName(value: unknown): string {
  return typeof value === 'string' && value in FOLLOW_UP_CHANNEL_LABEL
    ? FOLLOW_UP_CHANNEL_LABEL[value as FollowUpChannel].toLowerCase()
    : 'otro canal';
}

/** Frase en español que describe una entrada del historial (sin el autor). */
export function describeActivity(entry: ActivityEntry): string {
  const m = entry.metadata;
  switch (entry.action) {
    case 'quote.created':
      return 'registró el presupuesto';
    case 'quote.updated':
      return 'editó los datos del presupuesto';
    case 'quote.status_changed': {
      const base = m.correction
        ? `corrigió el estado de ${statusName(m.from)} a ${statusName(m.to)}`
        : `cambió el estado a ${statusName(m.to)}`;
      return m.reactivated ? `${base} · oportunidad reactivada` : base;
    }
    case 'quote.archived':
      return 'archivó el presupuesto';
    case 'quote.unarchived':
      return 'recuperó el presupuesto del archivo';
    case 'follow_up.created':
      return m.channel === 'task' ? 'programó una tarea interna' : `programó un seguimiento (${channelName(m.channel)})`;
    case 'follow_up.logged':
      return m.channel === 'task' ? 'registró una tarea realizada' : `registró un contacto realizado (${channelName(m.channel)})`;
    case 'follow_up.completed':
      return m.channel === 'task' ? 'completó una tarea' : `marcó como realizado un seguimiento (${channelName(m.channel)})`;
    case 'follow_up.cancelled':
      return m.automatic ? `canceló un email automático: ${cancelReasonLabel(typeof m.reason === 'string' ? m.reason : null)}` : 'canceló un seguimiento';
    case 'follow_up.scheduled':
      return `programó el email automático ${typeof m.step === 'number' ? m.step : ''}`.trimEnd();
    case 'follow_up.approved':
      return `aprobó el email automático ${typeof m.step === 'number' ? m.step : ''}`.trimEnd();
    case 'follow_up.sent':
      return `envió el email automático ${typeof m.step === 'number' ? m.step : ''}`.trimEnd();
    case 'follow_up.failed':
      return `no pudo enviar un email automático (${failureReasonLabel(typeof m.reason === 'string' ? m.reason : null)})`;
    case 'follow_up.bounced':
      return 'recibió un rebote del email automático: la dirección no existe o lo rechaza';
    case 'automation.enabled':
      return 'activó el envío automático de emails';
    case 'automation.disabled':
      return 'desactivó el envío automático de emails';
    case 'automation.test_email':
      return 'envió un email de prueba';
    case 'recovery.registered':
      // Antes de la fase 5 las recuperaciones consumían el plan; desde entonces son solo un resultado.
      return m.status === 'counted' && typeof m.used === 'number' && typeof m.limit === 'number'
        ? `registró una recuperación (${m.used} de ${m.limit} del plan, regla anterior)`
        : 'registró una recuperación (cliente que respondió tras un seguimiento)';
    case 'recovery.not_counted':
      return m.reason === 'response_dated_before_follow_up'
        ? 'registró una respuesta con fecha anterior al seguimiento: no cuenta como recuperación'
        : 'registró una respuesta más de 30 días después del último seguimiento: no cuenta como recuperación';
    case 'usage.limit_reached':
      return m.unit === 'attempts'
        ? 'agotó los intentos de seguimiento del plan: el envío automático queda en pausa hasta el próximo periodo'
        : 'alcanzó el límite del plan (regla anterior, por recuperaciones)';
    case 'company.exported':
      return 'exportó los datos de la empresa';
    case 'subscription.changed':
      return m.by === 'stripe' ? 'actualizó la suscripción con la confirmación de Stripe' : 'cambió el plan de la cuenta';
    case 'subscription.checkout_started':
      return 'abrió el pago de una suscripción';
    case 'subscription.change_requested':
      return 'pidió un cambio de plan (pendiente de confirmar el pago)';
    case 'subscription.cancel_requested':
      return 'pidió cancelar la suscripción al final del periodo';
    case 'subscription.resume_requested':
      return 'anuló la cancelación de la suscripción';
    case 'template.updated':
      return `editó la plantilla del email ${typeof m.step === 'number' ? m.step : ''}`.trimEnd();
    case 'follow_up.updated':
      return 'modificó un seguimiento';
    case 'contact.created':
      return 'añadió un contacto';
    case 'contact.updated':
      return 'actualizó un contacto';
    case 'exclusion.created':
      if (m.via === 'unsubscribe_link') return 'registró la baja del cliente desde el enlace del email';
      if (m.via === 'provider_webhook') return 'registró una exclusión comunicada por el proveedor de email';
      return 'registró una exclusión de contacto';
    case 'exclusion.lifted':
      return 'levantó una exclusión de contacto';
    case 'company.created':
      return 'creó la cuenta de la empresa';
    case 'company.updated':
      return 'actualizó los datos de la empresa';
    case 'settings.updated':
      return 'cambió las reglas de seguimiento';
    case 'member.joined':
      return 'se unió al equipo';
    case 'member.role_changed':
      return 'cambió el rol de un miembro';
    case 'member.removed':
      return 'retiró a un miembro del equipo';
    case 'invitation.created':
      return 'invitó a una persona al equipo';
    case 'invitation.revoked':
      return 'anuló una invitación';
    case 'auth.login':
      return 'inició sesión';
    default:
      return 'realizó una acción';
  }
}

import type {
  ActivityEntry,
  ContactChannel,
  ExclusionReason,
  FollowUpChannel,
  FollowUpOutcome,
  QuoteStatus,
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

const CANCEL_REASON_LABEL: Record<string, string> = {
  quote_responded: 'el cliente respondió',
  quote_accepted: 'el presupuesto se aceptó',
  quote_rejected: 'el presupuesto se rechazó',
  quote_archived: 'el presupuesto se archivó',
  contact_excluded: 'el contacto está en la lista de exclusión',
  manual: 'cancelado a mano',
};

export function cancelReasonLabel(reason: string | null): string {
  if (!reason) return 'cancelado';
  return CANCEL_REASON_LABEL[reason] ?? reason;
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
      return 'canceló un seguimiento';
    case 'follow_up.updated':
      return 'modificó un seguimiento';
    case 'contact.created':
      return 'añadió un contacto';
    case 'contact.updated':
      return 'actualizó un contacto';
    case 'exclusion.created':
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

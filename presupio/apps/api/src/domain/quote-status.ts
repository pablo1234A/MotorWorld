import type { QuoteStatus } from '../db/types.js';

/**
 * Estados de un presupuesto:
 *  - draft:     preparado, todavía no enviado al cliente.
 *  - sent:      enviado y pendiente de respuesta (candidato a seguimiento).
 *  - responded: el cliente ha respondido. No implica compra.
 *  - accepted:  venta confirmada por la empresa con evidencia documentada.
 *  - rejected:  el cliente lo ha rechazado.
 */
export const QUOTE_STATUSES = ['draft', 'sent', 'responded', 'accepted', 'rejected'] as const satisfies readonly QuoteStatus[];

const TRANSITIONS: Record<QuoteStatus, readonly QuoteStatus[]> = {
  draft: ['sent'],
  sent: ['responded', 'accepted', 'rejected'],
  // "sent" desde respondido: el cliente contestó pero vuelve a quedar sin respuesta.
  responded: ['sent', 'accepted', 'rejected'],
  accepted: [],
  rejected: [],
};

// Correcciones de estados finales: solo propietario o administrador.
const CORRECTIONS: Record<QuoteStatus, readonly QuoteStatus[]> = {
  draft: [],
  sent: [],
  responded: [],
  accepted: ['responded'],
  rejected: ['responded', 'sent'],
};

export type TransitionKind = 'normal' | 'correction';

export function transitionKind(from: QuoteStatus, to: QuoteStatus): TransitionKind | null {
  if (TRANSITIONS[from].includes(to)) return 'normal';
  if (CORRECTIONS[from].includes(to)) return 'correction';
  return null;
}

export function allowedTransitions(from: QuoteStatus, canCorrect: boolean): QuoteStatus[] {
  return [...TRANSITIONS[from], ...(canCorrect ? CORRECTIONS[from] : [])];
}

/** Estados en los que el cliente ya ha contestado: los seguimientos pendientes se detienen. */
export const RESPONSE_STATUSES: readonly QuoteStatus[] = ['responded', 'accepted', 'rejected'];

/** Estados en los que tiene sentido registrar un seguimiento o tarea. */
export const FOLLOW_UP_ALLOWED_STATUSES: readonly QuoteStatus[] = ['draft', 'sent', 'responded'];

/** Contactos con el cliente (no tareas internas): solo con el presupuesto ya enviado. */
export const CONTACT_FOLLOW_UP_STATUSES: readonly QuoteStatus[] = ['sent', 'responded'];

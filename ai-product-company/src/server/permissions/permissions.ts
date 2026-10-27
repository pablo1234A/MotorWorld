import { PermissionDeniedError } from '../core/errors.js';

/**
 * PERMISSION SYSTEM.
 * Agents never get unlimited permissions. Every tool call is checked against
 * the agent's explicit grants. Some actions are "critical": even an agent that
 * holds the grant can only *request* them — the owner approves in the Approval Center.
 */
export const ACTIONS = ['READ', 'CREATE', 'EDIT', 'DELETE', 'EXECUTE', 'APPROVE', 'PUBLISH'] as const;
export type Action = (typeof ACTIONS)[number];

export const RESOURCES = [
  'product',
  'memory',
  'task',
  'objective',
  'campaign',
  'hooks',
  'blueprint',
  'video',
  'delivery',
  'store',
  'store_change',
  'analytics',
  'report',
  'approval',
  'message',
  'integration',
] as const;
export type Resource = (typeof RESOURCES)[number];

export type Grant = `${Action}:${Resource}`;

export interface RiskPolicy {
  /** Requires owner approval regardless of grants. */
  critical: boolean;
  reason?: string;
}

/** Actions that ALWAYS require human approval. */
const CRITICAL: Partial<Record<Grant, string>> = {
  'PUBLISH:video': 'Publicar contenido fuera de la empresa es irreversible',
  'PUBLISH:store_change': 'Publicar cambios en la tienda afecta a clientes reales',
  'DELETE:product': 'Eliminar productos es irreversible',
  'DELETE:delivery': 'Eliminar entregas es irreversible',
  'EXECUTE:integration': 'Ejecutar acciones en servicios externos',
};

export function riskOf(action: Action, resource: Resource): RiskPolicy {
  const reason = CRITICAL[`${action}:${resource}`];
  return reason ? { critical: true, reason } : { critical: false };
}

export class PermissionChecker {
  constructor(
    private grantsFor: (agentId: string) => Grant[],
    private onDenied?: (agentId: string, grant: Grant, why: string) => void,
  ) {}

  can(agentId: string, action: Action, resource: Resource): boolean {
    return this.grantsFor(agentId).includes(`${action}:${resource}`);
  }

  /** Throws PermissionDeniedError (and records it) if the agent lacks the grant. */
  authorize(agentId: string, action: Action, resource: Resource, why = '') {
    if (!this.can(agentId, action, resource)) {
      const grant = `${action}:${resource}` as Grant;
      this.onDenied?.(agentId, grant, why);
      throw new PermissionDeniedError(`${agentId} lacks permission ${grant}${why ? ` (${why})` : ''}`);
    }
  }
}

/** Build a grants list concisely: g('READ', ['product', 'memory']). */
export function g(action: Action, resources: Resource[]): Grant[] {
  return resources.map((r) => `${action}:${r}` as Grant);
}

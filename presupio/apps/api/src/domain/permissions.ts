import type { MembershipRole } from '../db/types.js';

export const ROLES = ['owner', 'admin', 'member', 'viewer'] as const satisfies readonly MembershipRole[];

export type Permission =
  | 'company:read'
  | 'company:update'
  | 'settings:update'
  | 'subscription:read'
  | 'members:read'
  | 'members:manage'
  | 'quotes:read'
  | 'quotes:write'
  | 'quotes:reopen'
  | 'contacts:read'
  | 'contacts:write'
  | 'follow_ups:write'
  | 'exclusions:create'
  | 'exclusions:lift'
  | 'activity:read';

const READ: Permission[] = [
  'company:read',
  'subscription:read',
  'members:read',
  'quotes:read',
  'contacts:read',
  'activity:read',
];

// Cualquier usuario que trabaje con clientes puede registrar una exclusión (cumplimiento):
// anotar que alguien no quiere más mensajes nunca debe depender de un administrador.
const WORK: Permission[] = [...READ, 'quotes:write', 'contacts:write', 'follow_ups:write', 'exclusions:create'];

const MANAGE: Permission[] = [
  ...WORK,
  'company:update',
  'settings:update',
  'members:manage',
  'quotes:reopen',
  'exclusions:lift',
];

export const ROLE_PERMISSIONS: Record<MembershipRole, ReadonlySet<Permission>> = {
  owner: new Set(MANAGE),
  admin: new Set(MANAGE),
  member: new Set(WORK),
  viewer: new Set(READ),
};

export function can(role: MembershipRole, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].has(permission);
}

export function permissionsOf(role: MembershipRole): Permission[] {
  return [...ROLE_PERMISSIONS[role]].sort();
}

/**
 * Reglas de gestión de miembros:
 *  - Solo un propietario puede asignar o retirar el rol de propietario.
 *  - Un administrador no puede modificar a un propietario.
 */
export function canManageRole(actor: MembershipRole, targetCurrent: MembershipRole, targetNext?: MembershipRole): boolean {
  if (actor === 'owner') return true;
  if (actor !== 'admin') return false;
  if (targetCurrent === 'owner') return false;
  if (targetNext === 'owner') return false;
  return true;
}

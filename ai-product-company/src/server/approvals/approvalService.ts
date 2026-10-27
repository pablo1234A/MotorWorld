import { z } from 'zod';
import type { Database, Row } from '../db.js';
import { parseJson } from '../db.js';
import type { EventBus } from '../core/events.js';
import type { ActivityLog } from '../core/activity.js';
import { newId, now } from '../core/ids.js';
import { NotFoundError, ValidationError } from '../core/errors.js';

export const APPROVAL_KINDS = ['store_change', 'video_max_revisions', 'strategic_objective', 'integration_action'] as const;
export type ApprovalKind = (typeof APPROVAL_KINDS)[number];
export type ApprovalStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'CHANGES_REQUESTED';
export type Decision = 'APPROVE' | 'REJECT' | 'REQUEST_CHANGES';

export const DecisionSchema = z.object({
  decision: z.enum(['APPROVE', 'REJECT', 'REQUEST_CHANGES']),
  note: z.string().trim().max(2000).default(''),
  /** For video revisions requested by the owner: who should fix it. */
  target: z.enum(['NEO', 'REX', 'MAX']).optional(),
});

export interface Approval {
  id: string;
  kind: ApprovalKind;
  title: string;
  description: string;
  risk: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  payload: Record<string, unknown>;
  requestedBy: string;
  status: ApprovalStatus;
  ownerNote: string | null;
  relatedType: string | null;
  relatedId: string | null;
  createdAt: string;
  resolvedAt: string | null;
}

export type ApprovalHandler = (approval: Approval, decision: z.infer<typeof DecisionSchema>) => Promise<void> | void;

/** APPROVAL CENTER — "REQUIRES YOUR APPROVAL". Nothing critical happens without the owner. */
export class ApprovalService {
  private handlers = new Map<ApprovalKind, ApprovalHandler>();

  constructor(private db: Database, private events: EventBus, private activity: ActivityLog) {}

  onResolve(kind: ApprovalKind, handler: ApprovalHandler) {
    this.handlers.set(kind, handler);
  }

  request(input: {
    kind: ApprovalKind;
    title: string;
    description: string;
    risk: Approval['risk'];
    payload: Record<string, unknown>;
    requestedBy: string;
    relatedType?: string;
    relatedId?: string;
  }): Approval {
    const id = newId('apr');
    this.db.insert('approvals', {
      id,
      kind: input.kind,
      title: input.title,
      description: input.description,
      risk: input.risk,
      payload: input.payload,
      requested_by: input.requestedBy,
      status: 'PENDING',
      related_type: input.relatedType ?? null,
      related_id: input.relatedId ?? null,
      created_at: now(),
    });
    this.activity.record({ agentId: input.requestedBy, kind: 'decision', action: `Solicita aprobación del propietario: ${input.title}`, result: input.risk });
    this.events.emit('APPROVAL_REQUIRED', { approvalId: id, kind: input.kind, title: input.title, risk: input.risk, requestedBy: input.requestedBy });
    return this.get(id);
  }

  get(id: string): Approval {
    const r = this.db.get('SELECT * FROM approvals WHERE id = ?', id);
    if (!r) throw new NotFoundError('Approval');
    return toApproval(r);
  }

  list(status?: ApprovalStatus): Approval[] {
    const rows = status
      ? this.db.all('SELECT * FROM approvals WHERE status = ? ORDER BY created_at DESC', status)
      : this.db.all('SELECT * FROM approvals ORDER BY created_at DESC LIMIT 200');
    return rows.map(toApproval);
  }

  pendingCount(requestedBy?: string): number {
    const r = requestedBy
      ? this.db.get<{ n: number }>("SELECT COUNT(*) AS n FROM approvals WHERE status = 'PENDING' AND requested_by = ?", requestedBy)
      : this.db.get<{ n: number }>("SELECT COUNT(*) AS n FROM approvals WHERE status = 'PENDING'");
    return Number(r?.n ?? 0);
  }

  async resolve(id: string, input: unknown): Promise<Approval> {
    const decision = DecisionSchema.parse(input);
    const approval = this.get(id);
    if (approval.status !== 'PENDING') throw new ValidationError('Approval already resolved');
    const status: ApprovalStatus = decision.decision === 'APPROVE' ? 'APPROVED' : decision.decision === 'REJECT' ? 'REJECTED' : 'CHANGES_REQUESTED';
    this.db.update('approvals', id, { status, owner_note: decision.note || null, resolved_at: now() });
    const resolved = this.get(id);
    this.activity.record({ agentId: null, kind: 'owner', action: `Propietario: ${status} — ${approval.title}`, result: decision.note || null });
    this.events.emit('APPROVAL_RESOLVED', { approvalId: id, kind: approval.kind, status, requestedBy: approval.requestedBy });
    await this.handlers.get(approval.kind)?.(resolved, decision);
    return resolved;
  }
}

function toApproval(r: Row): Approval {
  return {
    id: String(r.id),
    kind: r.kind as ApprovalKind,
    title: String(r.title),
    description: String(r.description),
    risk: r.risk as Approval['risk'],
    payload: parseJson(r.payload, {}),
    requestedBy: String(r.requested_by),
    status: r.status as ApprovalStatus,
    ownerNote: (r.owner_note as string) ?? null,
    relatedType: (r.related_type as string) ?? null,
    relatedId: (r.related_id as string) ?? null,
    createdAt: String(r.created_at),
    resolvedAt: (r.resolved_at as string) ?? null,
  };
}

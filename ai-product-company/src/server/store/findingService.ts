import type { Database, Row } from '../db.js';
import type { EventBus } from '../core/events.js';
import { newId, now } from '../core/ids.js';
import { NotFoundError } from '../core/errors.js';

export type FindingRisk = 'LOW' | 'MEDIUM' | 'HIGH';
/**
 * PROPOSED            EVA found it, NOAH has not reviewed it yet
 * READY_TO_APPLY      NOAH approved (LOW/MEDIUM) — waiting for a store write connector
 * AWAITING_APPROVAL   HIGH RISK — in the owner's Approval Center
 * APPROVED            owner approved — waiting for a store write connector
 * APPLIED             applied to the store (needs a write connector)
 * REJECTED            rejected by NOAH or by the owner
 * CHANGES_REQUESTED   owner asked EVA to rework it
 */
export type FindingStatus = 'PROPOSED' | 'READY_TO_APPLY' | 'AWAITING_APPROVAL' | 'APPROVED' | 'APPLIED' | 'REJECTED' | 'CHANGES_REQUESTED';

export interface StoreFinding {
  id: string;
  productId: string;
  workflowRunId: string | null;
  category: string;
  problem: string;
  whyItMatters: string;
  expectedImpact: string;
  recommendedAction: string;
  risk: FindingRisk | null;
  riskRationale: string | null;
  status: FindingStatus;
  approvalId: string | null;
  createdBy: string;
  reviewedBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export class FindingService {
  constructor(private db: Database, private events: EventBus) {}

  create(input: Pick<StoreFinding, 'productId' | 'workflowRunId' | 'category' | 'problem' | 'whyItMatters' | 'expectedImpact' | 'recommendedAction' | 'createdBy'>): StoreFinding {
    const id = newId('fnd');
    const ts = now();
    this.db.insert('store_findings', {
      id,
      product_id: input.productId,
      workflow_run_id: input.workflowRunId,
      category: input.category,
      problem: input.problem,
      why_it_matters: input.whyItMatters,
      expected_impact: input.expectedImpact,
      recommended_action: input.recommendedAction,
      status: 'PROPOSED',
      created_by: input.createdBy,
      created_at: ts,
      updated_at: ts,
    });
    this.events.emit('STORE_PROBLEM_FOUND', { findingId: id, problem: input.problem, category: input.category, by: input.createdBy });
    return this.get(id);
  }

  classify(id: string, risk: FindingRisk, rationale: string, status: FindingStatus, reviewer: string) {
    this.db.update('store_findings', id, { risk, risk_rationale: rationale, status, reviewed_by: reviewer, updated_at: now() });
    this.events.emit('STORE_FINDING_REVIEWED', { findingId: id, risk, status, reviewer });
  }

  setStatus(id: string, status: FindingStatus, approvalId?: string) {
    const patch: Record<string, unknown> = { status, updated_at: now() };
    if (approvalId) patch.approval_id = approvalId;
    this.db.update('store_findings', id, patch);
  }

  get(id: string): StoreFinding {
    const r = this.db.get('SELECT * FROM store_findings WHERE id = ?', id);
    if (!r) throw new NotFoundError('Store finding');
    return toFinding(r);
  }

  list(filter: { productId?: string; workflowRunId?: string } = {}): StoreFinding[] {
    if (filter.workflowRunId) return this.db.all('SELECT * FROM store_findings WHERE workflow_run_id = ? ORDER BY created_at', filter.workflowRunId).map(toFinding);
    if (filter.productId) return this.db.all('SELECT * FROM store_findings WHERE product_id = ? ORDER BY created_at DESC', filter.productId).map(toFinding);
    return this.db.all('SELECT * FROM store_findings ORDER BY created_at DESC LIMIT 300').map(toFinding);
  }
}

function toFinding(r: Row): StoreFinding {
  return {
    id: String(r.id),
    productId: String(r.product_id),
    workflowRunId: (r.workflow_run_id as string) ?? null,
    category: String(r.category),
    problem: String(r.problem),
    whyItMatters: String(r.why_it_matters),
    expectedImpact: String(r.expected_impact),
    recommendedAction: String(r.recommended_action),
    risk: (r.risk as FindingRisk) ?? null,
    riskRationale: (r.risk_rationale as string) ?? null,
    status: r.status as FindingStatus,
    approvalId: (r.approval_id as string) ?? null,
    createdBy: String(r.created_by),
    reviewedBy: (r.reviewed_by as string) ?? null,
    createdAt: String(r.created_at),
    updatedAt: String(r.updated_at),
  };
}

import type { Database, Row } from '../db.js';
import { parseJson } from '../db.js';
import type { EventBus } from '../core/events.js';
import { newId, now } from '../core/ids.js';

export type WorkflowType = 'strategy' | 'video_pipeline' | 'store_audit' | 'analytics_review' | 'daily_report';
export type Priority = 'critical' | 'high' | 'normal' | 'low';

export interface Campaign {
  id: string;
  productId: string;
  name: string;
  objective: string;
  status: string;
  createdBy: string;
  createdAt: string;
}

export interface Objective {
  id: string;
  campaignId: string | null;
  productId: string | null;
  title: string;
  rationale: string;
  workflow: WorkflowType;
  priority: Priority;
  params: Record<string, unknown>;
  status: 'PROPOSED' | 'AWAITING_APPROVAL' | 'IN_PROGRESS' | 'DONE' | 'FAILED' | 'REJECTED';
  source: string;
  createdAt: string;
}

/** Campaigns group the work done for one owner goal; objectives are ATLAS's decisions. */
export class CampaignService {
  constructor(private db: Database, private events: EventBus) {}

  createCampaign(input: { productId: string; name: string; objective: string; createdBy: string }): Campaign {
    const id = newId('cmp');
    const ts = now();
    this.db.insert('campaigns', { id, product_id: input.productId, name: input.name, objective: input.objective, status: 'ACTIVE', created_by: input.createdBy, created_at: ts, updated_at: ts });
    this.events.emit('CAMPAIGN_CREATED', { campaignId: id, name: input.name, productId: input.productId });
    return this.getCampaign(id)!;
  }

  setCampaignStatus(id: string, status: string) {
    this.db.update('campaigns', id, { status, updated_at: now() });
  }

  getCampaign(id: string | null | undefined): Campaign | null {
    if (!id) return null;
    const r = this.db.get('SELECT * FROM campaigns WHERE id = ?', id);
    return r ? toCampaign(r) : null;
  }

  campaigns(): Campaign[] {
    return this.db.all('SELECT * FROM campaigns ORDER BY created_at DESC').map(toCampaign);
  }

  createObjective(input: Omit<Objective, 'id' | 'createdAt'>): Objective {
    const id = newId('obj');
    const ts = now();
    this.db.insert('objectives', {
      id,
      campaign_id: input.campaignId,
      product_id: input.productId,
      title: input.title,
      rationale: input.rationale,
      workflow: input.workflow,
      priority: input.priority,
      params: input.params,
      status: input.status,
      source: input.source,
      created_at: ts,
      updated_at: ts,
    });
    this.events.emit('OBJECTIVE_CREATED', { objectiveId: id, title: input.title, workflow: input.workflow, source: input.source });
    return this.getObjective(id)!;
  }

  setObjectiveStatus(id: string, status: Objective['status']) {
    this.db.update('objectives', id, { status, updated_at: now() });
  }

  getObjective(id: string | null | undefined): Objective | null {
    if (!id) return null;
    const r = this.db.get('SELECT * FROM objectives WHERE id = ?', id);
    return r ? toObjective(r) : null;
  }

  objectives(filter: { campaignId?: string } = {}): Objective[] {
    const rows = filter.campaignId
      ? this.db.all('SELECT * FROM objectives WHERE campaign_id = ? ORDER BY created_at', filter.campaignId)
      : this.db.all('SELECT * FROM objectives ORDER BY created_at DESC LIMIT 200');
    return rows.map(toObjective);
  }
}

function toCampaign(r: Row): Campaign {
  return { id: String(r.id), productId: String(r.product_id), name: String(r.name), objective: String(r.objective), status: String(r.status), createdBy: String(r.created_by), createdAt: String(r.created_at) };
}

function toObjective(r: Row): Objective {
  return {
    id: String(r.id),
    campaignId: (r.campaign_id as string) ?? null,
    productId: (r.product_id as string) ?? null,
    title: String(r.title),
    rationale: String(r.rationale),
    workflow: r.workflow as WorkflowType,
    priority: r.priority as Priority,
    params: parseJson(r.params, {}),
    status: r.status as Objective['status'],
    source: String(r.source),
    createdAt: String(r.created_at),
  };
}

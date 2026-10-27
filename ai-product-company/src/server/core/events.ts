import type { Database } from '../db.js';
import { now } from './ids.js';

/**
 * Internal event system. Every important state change is emitted here,
 * persisted (so automations and audits can replay it) and pushed to listeners
 * (SSE stream for the UI, internal automations).
 */
export const EVENT_TYPES = [
  'PRODUCT_CREATED',
  'PRODUCT_UPDATED',
  'PRODUCT_ACTIVATED',
  'PRODUCT_DEACTIVATED',
  'OBJECTIVE_CREATED',
  'CAMPAIGN_CREATED',
  'WORKFLOW_STARTED',
  'WORKFLOW_STEP',
  'WORKFLOW_COMPLETED',
  'WORKFLOW_FAILED',
  'TASK_CREATED',
  'TASK_ASSIGNED',
  'TASK_STARTED',
  'TASK_SUBMITTED_REVIEW',
  'TASK_REVISION_REQUIRED',
  'TASK_APPROVED',
  'TASK_COMPLETED',
  'TASK_RETRY',
  'TASK_FAILED',
  'TASK_BLOCKED',
  'TASK_OVERDUE',
  'AGENT_STATUS',
  'MESSAGE_SENT',
  'CHAT_MESSAGE',
  'MEMORY_WRITTEN',
  'HOOKS_CREATED',
  'BLUEPRINT_CREATED',
  'VIDEO_CREATED',
  'VIDEO_EDITED',
  'VIDEO_SUBMITTED_QA',
  'VIDEO_APPROVED',
  'VIDEO_REJECTED',
  'VIDEO_REVISION_REQUIRED',
  'STORE_PROBLEM_FOUND',
  'STORE_FINDING_REVIEWED',
  'APPROVAL_REQUIRED',
  'APPROVAL_RESOLVED',
  'DELIVERY_CREATED',
  'DELIVERY_UPDATED',
  'DAILY_REPORT_GENERATED',
  'ERROR_ESCALATED',
  'SETTINGS_UPDATED',
  'PERMISSION_DENIED',
] as const;

export type EventType = (typeof EVENT_TYPES)[number];

export interface CompanyEvent {
  id: number;
  type: EventType;
  payload: Record<string, unknown>;
  createdAt: string;
}

type Listener = (event: CompanyEvent) => void;

export class EventBus {
  private listeners = new Set<Listener>();
  private typed = new Map<EventType, Set<Listener>>();

  constructor(private db: Database) {}

  emit(type: EventType, payload: Record<string, unknown> = {}): CompanyEvent {
    const createdAt = now();
    const res = this.db.run('INSERT INTO events (type, payload, created_at) VALUES (?, ?, ?)', type, JSON.stringify(payload), createdAt);
    const event: CompanyEvent = { id: Number(res.lastInsertRowid), type, payload, createdAt };
    for (const l of this.typed.get(type) ?? []) this.safe(l, event);
    for (const l of this.listeners) this.safe(l, event);
    return event;
  }

  /** Subscribe to every event. Returns an unsubscribe function. */
  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  on(type: EventType, listener: Listener): () => void {
    if (!this.typed.has(type)) this.typed.set(type, new Set());
    this.typed.get(type)!.add(listener);
    return () => this.typed.get(type)!.delete(listener);
  }

  recent(limit = 100, type?: string): CompanyEvent[] {
    const rows = type
      ? this.db.all('SELECT * FROM events WHERE type = ? ORDER BY id DESC LIMIT ?', type, limit)
      : this.db.all('SELECT * FROM events ORDER BY id DESC LIMIT ?', limit);
    return rows.map((r) => ({
      id: Number(r.id),
      type: r.type as EventType,
      payload: JSON.parse(String(r.payload)),
      createdAt: String(r.created_at),
    }));
  }

  private safe(listener: Listener, event: CompanyEvent) {
    try {
      listener(event);
    } catch (err) {
      console.error('[events] listener failed for', event.type, err);
    }
  }
}

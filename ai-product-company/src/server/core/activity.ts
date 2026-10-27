import type { Database } from '../db.js';
import { now } from './ids.js';

export type ActivityKind = 'action' | 'communication' | 'decision' | 'error' | 'system' | 'owner';

export interface ActivityEntry {
  id: number;
  agentId: string | null;
  kind: ActivityKind;
  action: string;
  taskId: string | null;
  result: string | null;
  error: string | null;
  details: unknown;
  createdAt: string;
}

/** ACTIVITY LOG + AGENT LOG (the agent log is the activity log filtered by agent). */
export class ActivityLog {
  constructor(private db: Database, private onWrite?: (e: ActivityEntry) => void) {}

  record(entry: { agentId?: string | null; kind: ActivityKind; action: string; taskId?: string | null; result?: string | null; error?: string | null; details?: unknown }) {
    const createdAt = now();
    const res = this.db.run(
      'INSERT INTO activity_log (agent_id, kind, action, task_id, result, error, details, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      entry.agentId ?? null,
      entry.kind,
      entry.action,
      entry.taskId ?? null,
      entry.result ?? null,
      entry.error ?? null,
      entry.details === undefined ? null : JSON.stringify(entry.details),
      createdAt,
    );
    const full: ActivityEntry = {
      id: Number(res.lastInsertRowid),
      agentId: entry.agentId ?? null,
      kind: entry.kind,
      action: entry.action,
      taskId: entry.taskId ?? null,
      result: entry.result ?? null,
      error: entry.error ?? null,
      details: entry.details ?? null,
      createdAt,
    };
    this.onWrite?.(full);
    return full;
  }

  list(opts: { agentId?: string; kind?: string; limit?: number } = {}): ActivityEntry[] {
    const where: string[] = [];
    const params: (string | number)[] = [];
    if (opts.agentId) {
      where.push('agent_id = ?');
      params.push(opts.agentId);
    }
    if (opts.kind) {
      where.push('kind = ?');
      params.push(opts.kind);
    }
    params.push(opts.limit ?? 200);
    const rows = this.db.all(
      `SELECT * FROM activity_log ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY id DESC LIMIT ?`,
      ...params,
    );
    return rows.map((r) => ({
      id: Number(r.id),
      agentId: (r.agent_id as string) ?? null,
      kind: r.kind as ActivityKind,
      action: String(r.action),
      taskId: (r.task_id as string) ?? null,
      result: (r.result as string) ?? null,
      error: (r.error as string) ?? null,
      details: r.details ? JSON.parse(String(r.details)) : null,
      createdAt: String(r.created_at),
    }));
  }
}

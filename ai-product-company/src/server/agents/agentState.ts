import type { Database, Row } from '../db.js';
import type { EventBus } from '../core/events.js';
import { now } from '../core/ids.js';
import { AGENTS } from './definitions.js';
import type { AgentStatus } from './types.js';

export interface AgentRuntimeState {
  agentId: string;
  status: AgentStatus;
  currentTaskId: string | null;
  statusNote: string | null;
  lastActiveAt: string | null;
  tasksCompleted: number;
  tasksFailed: number;
  avgScore: number | null;
}

/** Live visual state of every agent (WORKING, WAITING, REVIEWING, ERROR, IDLE, APPROVAL_REQUIRED). */
export class AgentStateService {
  constructor(private db: Database, private events: EventBus) {
    for (const a of AGENTS) {
      this.db.run("INSERT OR IGNORE INTO agent_state (agent_id, status) VALUES (?, 'IDLE')", a.id);
    }
    // After a restart nobody is mid-task: running tasks get re-queued by the task engine.
    this.db.run("UPDATE agent_state SET status = 'IDLE', current_task_id = NULL, status_note = NULL WHERE status IN ('WORKING', 'REVIEWING')");
  }

  set(agentId: string, status: AgentStatus, opts: { taskId?: string | null; note?: string | null } = {}) {
    const prev = this.get(agentId);
    const taskId = opts.taskId === undefined ? prev.currentTaskId : opts.taskId;
    const note = opts.note === undefined ? prev.statusNote : opts.note;
    if (prev.status === status && prev.currentTaskId === taskId && prev.statusNote === note) return;
    this.db.run(
      'UPDATE agent_state SET status = ?, current_task_id = ?, status_note = ?, last_active_at = ? WHERE agent_id = ?',
      status,
      taskId,
      note,
      now(),
      agentId,
    );
    this.events.emit('AGENT_STATUS', { agentId, status, taskId, note, previous: prev.status });
  }

  recordOutcome(agentId: string, outcome: 'completed' | 'failed', score?: number | null) {
    if (outcome === 'completed') this.db.run('UPDATE agent_state SET tasks_completed = tasks_completed + 1 WHERE agent_id = ?', agentId);
    else this.db.run('UPDATE agent_state SET tasks_failed = tasks_failed + 1 WHERE agent_id = ?', agentId);
    if (score != null && Number.isFinite(score)) {
      this.db.run('UPDATE agent_state SET score_sum = score_sum + ?, score_count = score_count + 1 WHERE agent_id = ?', score, agentId);
    }
  }

  /** Quality score earned by an agent's work (e.g. LUNA's QA score of a video it worked on). */
  recordScore(agentId: string, score: number) {
    if (!Number.isFinite(score)) return;
    this.db.run('UPDATE agent_state SET score_sum = score_sum + ?, score_count = score_count + 1 WHERE agent_id = ?', score, agentId);
  }

  get(agentId: string): AgentRuntimeState {
    const r = this.db.get('SELECT * FROM agent_state WHERE agent_id = ?', agentId);
    if (!r) throw new Error(`Unknown agent ${agentId}`);
    return toState(r);
  }

  all(): AgentRuntimeState[] {
    return this.db.all('SELECT * FROM agent_state').map(toState);
  }
}

function toState(r: Row): AgentRuntimeState {
  const count = Number(r.score_count);
  return {
    agentId: String(r.agent_id),
    status: r.status as AgentStatus,
    currentTaskId: (r.current_task_id as string) ?? null,
    statusNote: (r.status_note as string) ?? null,
    lastActiveAt: (r.last_active_at as string) ?? null,
    tasksCompleted: Number(r.tasks_completed),
    tasksFailed: Number(r.tasks_failed),
    avgScore: count ? Math.round((Number(r.score_sum) / count) * 10) / 10 : null,
  };
}

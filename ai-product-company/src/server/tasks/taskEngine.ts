import type { Database, Row } from '../db.js';
import { parseJson } from '../db.js';
import type { EventBus, EventType } from '../core/events.js';
import type { ActivityLog } from '../core/activity.js';
import { addHours, newId, now } from '../core/ids.js';
import { NotFoundError, ValidationError } from '../core/errors.js';
import type { Priority } from '../campaigns/campaignService.js';

export const TASK_STATUSES = [
  'PENDING',
  'ASSIGNED',
  'RUNNING',
  'WAITING_REVIEW',
  'REVISION_REQUIRED',
  'APPROVED',
  'COMPLETED',
  'BLOCKED',
  'FAILED',
] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

/** The only legal moves of the state machine. */
const TRANSITIONS: Record<TaskStatus, TaskStatus[]> = {
  PENDING: ['ASSIGNED', 'BLOCKED', 'FAILED'],
  ASSIGNED: ['RUNNING', 'PENDING', 'FAILED'],
  RUNNING: ['WAITING_REVIEW', 'PENDING', 'FAILED', 'BLOCKED', 'COMPLETED'],
  WAITING_REVIEW: ['APPROVED', 'REVISION_REQUIRED', 'FAILED', 'BLOCKED', 'PENDING'],
  REVISION_REQUIRED: ['PENDING', 'FAILED'],
  APPROVED: ['COMPLETED', 'FAILED', 'BLOCKED', 'PENDING'],
  COMPLETED: [],
  BLOCKED: ['PENDING', 'FAILED'],
  FAILED: ['PENDING'],
};

export const PRIORITY_RANK: Record<Priority, number> = { critical: 0, high: 1, normal: 2, low: 3 };

export interface TaskReview {
  reviewer: string;
  passed: boolean;
  issues: string[];
  at: string;
}

export interface Task {
  id: string;
  title: string;
  description: string;
  type: string;
  agentId: string;
  supervisorId: string | null;
  priority: Priority;
  productId: string | null;
  campaignId: string | null;
  workflowRunId: string | null;
  stepKey: string | null;
  deadline: string | null;
  dependsOn: string[];
  status: TaskStatus;
  input: Record<string, unknown>;
  result: Record<string, unknown> | null;
  review: TaskReview[];
  error: string | null;
  attempts: number;
  maxAttempts: number;
  revision: number;
  nextAttemptAt: string | null;
  overdueNotified: boolean;
  engine: string | null;
  createdBy: string;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  updatedAt: string;
}

export interface NewTask {
  title: string;
  description: string;
  type: string;
  agentId: string;
  supervisorId?: string | null;
  priority?: Priority;
  productId?: string | null;
  campaignId?: string | null;
  workflowRunId?: string | null;
  stepKey?: string | null;
  deadlineHours?: number | null;
  dependsOn?: string[];
  input?: Record<string, unknown>;
  maxAttempts?: number;
  createdBy: string;
}

export interface TaskLog {
  id: number;
  taskId: string;
  level: 'info' | 'warn' | 'error';
  message: string;
  data: unknown;
  createdAt: string;
}

const STATUS_EVENT: Partial<Record<TaskStatus, EventType>> = {
  ASSIGNED: 'TASK_ASSIGNED',
  RUNNING: 'TASK_STARTED',
  WAITING_REVIEW: 'TASK_SUBMITTED_REVIEW',
  REVISION_REQUIRED: 'TASK_REVISION_REQUIRED',
  APPROVED: 'TASK_APPROVED',
  COMPLETED: 'TASK_COMPLETED',
  FAILED: 'TASK_FAILED',
  BLOCKED: 'TASK_BLOCKED',
};

/** TASK ENGINE — persistent queue + state machine. */
export class TaskEngine {
  constructor(private db: Database, private events: EventBus, private activity: ActivityLog) {
    // Crash recovery: anything that was mid-flight goes back to the queue.
    const stuck = this.db.all("SELECT id FROM tasks WHERE status IN ('ASSIGNED', 'RUNNING', 'WAITING_REVIEW')");
    for (const r of stuck) {
      this.db.run("UPDATE tasks SET status = 'PENDING', updated_at = ? WHERE id = ?", now(), String(r.id));
      this.log(String(r.id), 'warn', 'Server restarted while the task was in progress — re-queued');
    }
  }

  create(spec: NewTask): Task {
    const id = newId('tsk');
    const ts = now();
    this.db.insert('tasks', {
      id,
      title: spec.title,
      description: spec.description,
      type: spec.type,
      agent_id: spec.agentId,
      supervisor_id: spec.supervisorId ?? null,
      priority: spec.priority ?? 'normal',
      product_id: spec.productId ?? null,
      campaign_id: spec.campaignId ?? null,
      workflow_run_id: spec.workflowRunId ?? null,
      step_key: spec.stepKey ?? null,
      deadline: spec.deadlineHours ? addHours(ts, spec.deadlineHours) : null,
      depends_on: spec.dependsOn ?? [],
      status: 'PENDING',
      input: spec.input ?? {},
      review: [],
      max_attempts: spec.maxAttempts ?? 3,
      created_by: spec.createdBy,
      created_at: ts,
      updated_at: ts,
    });
    this.log(id, 'info', `Task created by ${spec.createdBy} for ${spec.agentId}`);
    this.activity.record({ agentId: spec.createdBy === 'OWNER' ? null : spec.createdBy, kind: 'action', action: `Crea tarea "${spec.title}" → ${spec.agentId}`, taskId: id });
    this.events.emit('TASK_CREATED', { taskId: id, title: spec.title, agentId: spec.agentId, type: spec.type, workflowRunId: spec.workflowRunId ?? null, priority: spec.priority ?? 'normal' });
    return this.get(id);
  }

  get(id: string): Task {
    const r = this.db.get('SELECT * FROM tasks WHERE id = ?', id);
    if (!r) throw new NotFoundError('Task');
    return toTask(r);
  }

  list(filter: { status?: string; agentId?: string; workflowRunId?: string; limit?: number } = {}): Task[] {
    const where: string[] = [];
    const params: (string | number)[] = [];
    if (filter.status) {
      where.push('status = ?');
      params.push(filter.status);
    }
    if (filter.agentId) {
      where.push('agent_id = ?');
      params.push(filter.agentId);
    }
    if (filter.workflowRunId) {
      where.push('workflow_run_id = ?');
      params.push(filter.workflowRunId);
    }
    params.push(filter.limit ?? 300);
    return this.db.all(`SELECT * FROM tasks ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY created_at DESC LIMIT ?`, ...params).map(toTask);
  }

  counts(): Record<TaskStatus, number> {
    const out = Object.fromEntries(TASK_STATUSES.map((s) => [s, 0])) as Record<TaskStatus, number>;
    for (const r of this.db.all<{ status: TaskStatus; n: number }>('SELECT status, COUNT(*) AS n FROM tasks GROUP BY status')) out[r.status] = Number(r.n);
    return out;
  }

  transition(id: string, to: TaskStatus, patch: Partial<{ result: unknown; error: string | null; engine: string; nextAttemptAt: string | null; attempts: number; revision: number; input: Record<string, unknown> }> = {}, note?: string): Task {
    const task = this.get(id);
    if (!TRANSITIONS[task.status].includes(to)) {
      throw new ValidationError(`Illegal task transition ${task.status} → ${to} (${id})`);
    }
    const ts = now();
    const map: Record<string, unknown> = { status: to, updated_at: ts };
    if ('result' in patch) map.result = patch.result;
    if ('error' in patch) map.error = patch.error;
    if ('engine' in patch) map.engine = patch.engine;
    if ('nextAttemptAt' in patch) map.next_attempt_at = patch.nextAttemptAt;
    if ('attempts' in patch) map.attempts = patch.attempts;
    if ('revision' in patch) map.revision = patch.revision;
    if ('input' in patch) map.input = patch.input;
    if (to === 'RUNNING') map.started_at = ts;
    if (to === 'COMPLETED' || to === 'FAILED') map.completed_at = ts;
    this.db.update('tasks', id, map);
    this.log(id, to === 'FAILED' ? 'error' : 'info', `${task.status} → ${to}${note ? ` · ${note}` : ''}`);
    const evt = STATUS_EVENT[to];
    if (evt) this.events.emit(evt, { taskId: id, title: task.title, agentId: task.agentId, workflowRunId: task.workflowRunId, from: task.status, to, note: note ?? null });
    return this.get(id);
  }

  addReview(id: string, review: TaskReview) {
    const task = this.get(id);
    this.db.update('tasks', id, { review: [...task.review, review], updated_at: now() });
  }

  /** Tasks ready to run: PENDING, retry time reached, all dependencies COMPLETED. Ordered by priority, deadline, age. */
  runnable(): Task[] {
    const ts = now();
    const pending = this.db
      .all("SELECT * FROM tasks WHERE status = 'PENDING' AND (next_attempt_at IS NULL OR next_attempt_at <= ?)", ts)
      .map(toTask);
    const ready: Task[] = [];
    for (const t of pending) {
      const deps = t.dependsOn.map((d) => this.db.get<{ status: TaskStatus }>('SELECT status FROM tasks WHERE id = ?', d)?.status ?? 'FAILED');
      if (deps.some((s) => s === 'FAILED')) {
        this.transition(t.id, 'BLOCKED', { error: 'A dependency failed' }, 'dependency failed');
        continue;
      }
      if (deps.every((s) => s === 'COMPLETED')) ready.push(t);
    }
    return ready.sort(
      (a, b) =>
        PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] ||
        (a.deadline ?? '9999').localeCompare(b.deadline ?? '9999') ||
        a.createdAt.localeCompare(b.createdAt),
    );
  }

  /** Active tasks past their deadline that nobody has been told about yet. */
  overdue(): Task[] {
    return this.db
      .all("SELECT * FROM tasks WHERE deadline IS NOT NULL AND deadline < ? AND overdue_notified = 0 AND status NOT IN ('COMPLETED', 'FAILED')", now())
      .map(toTask);
  }

  markOverdueNotified(id: string) {
    this.db.run('UPDATE tasks SET overdue_notified = 1 WHERE id = ?', id);
    this.log(id, 'warn', 'Deadline exceeded');
  }

  log(taskId: string, level: TaskLog['level'], message: string, data?: unknown) {
    this.db.run(
      'INSERT INTO task_logs (task_id, level, message, data, created_at) VALUES (?, ?, ?, ?, ?)',
      taskId,
      level,
      message,
      data === undefined ? null : JSON.stringify(data),
      now(),
    );
  }

  logs(taskId: string): TaskLog[] {
    return this.db.all('SELECT * FROM task_logs WHERE task_id = ? ORDER BY id', taskId).map((r) => ({
      id: Number(r.id),
      taskId: String(r.task_id),
      level: r.level as TaskLog['level'],
      message: String(r.message),
      data: parseJson(r.data, null),
      createdAt: String(r.created_at),
    }));
  }

  /** Latest completed task of a given step in a workflow run (used to pass results downstream). */
  latestCompletedStep(workflowRunId: string, stepKey: string): Task | null {
    const r = this.db.get("SELECT * FROM tasks WHERE workflow_run_id = ? AND step_key = ? AND status = 'COMPLETED' ORDER BY completed_at DESC LIMIT 1", workflowRunId, stepKey);
    return r ? toTask(r) : null;
  }
}

function toTask(r: Row): Task {
  return {
    id: String(r.id),
    title: String(r.title),
    description: String(r.description),
    type: String(r.type),
    agentId: String(r.agent_id),
    supervisorId: (r.supervisor_id as string) ?? null,
    priority: r.priority as Priority,
    productId: (r.product_id as string) ?? null,
    campaignId: (r.campaign_id as string) ?? null,
    workflowRunId: (r.workflow_run_id as string) ?? null,
    stepKey: (r.step_key as string) ?? null,
    deadline: (r.deadline as string) ?? null,
    dependsOn: parseJson<string[]>(r.depends_on, []),
    status: r.status as TaskStatus,
    input: parseJson(r.input, {}),
    result: parseJson(r.result, null),
    review: parseJson<TaskReview[]>(r.review, []),
    error: (r.error as string) ?? null,
    attempts: Number(r.attempts),
    maxAttempts: Number(r.max_attempts),
    revision: Number(r.revision),
    nextAttemptAt: (r.next_attempt_at as string) ?? null,
    overdueNotified: Number(r.overdue_notified) === 1,
    engine: (r.engine as string) ?? null,
    createdBy: String(r.created_by),
    createdAt: String(r.created_at),
    startedAt: (r.started_at as string) ?? null,
    completedAt: (r.completed_at as string) ?? null,
    updatedAt: String(r.updated_at),
  };
}

import { DatabaseSync, type SQLInputValue } from 'node:sqlite';

/**
 * SQLite persistence (Node's built-in driver — zero native dependencies).
 * Every subsystem stores its state here so the company survives restarts.
 */
const MIGRATIONS: string[] = [
  /* 001 — base schema */ `
  CREATE TABLE owners (
    id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, name TEXT NOT NULL,
    password_hash TEXT NOT NULL, created_at TEXT NOT NULL
  );
  CREATE TABLE sessions (
    token_hash TEXT PRIMARY KEY, owner_id TEXT NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
    expires_at TEXT NOT NULL, created_at TEXT NOT NULL
  );
  CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);

  CREATE TABLE products (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'draft',
    is_active INTEGER NOT NULL DEFAULT 0, data TEXT NOT NULL,
    created_at TEXT NOT NULL, updated_at TEXT NOT NULL
  );
  CREATE TABLE product_assets (
    id TEXT PRIMARY KEY, product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    kind TEXT NOT NULL, filename TEXT NOT NULL, original_name TEXT NOT NULL, mime TEXT NOT NULL,
    size INTEGER NOT NULL, created_at TEXT NOT NULL
  );

  CREATE TABLE campaigns (
    id TEXT PRIMARY KEY, product_id TEXT NOT NULL, name TEXT NOT NULL, objective TEXT NOT NULL,
    status TEXT NOT NULL, created_by TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
  );
  CREATE TABLE objectives (
    id TEXT PRIMARY KEY, campaign_id TEXT, product_id TEXT, title TEXT NOT NULL, rationale TEXT NOT NULL,
    workflow TEXT NOT NULL, priority TEXT NOT NULL, params TEXT NOT NULL, status TEXT NOT NULL,
    source TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
  );

  CREATE TABLE workflow_runs (
    id TEXT PRIMARY KEY, type TEXT NOT NULL, title TEXT NOT NULL, product_id TEXT, campaign_id TEXT,
    objective_id TEXT, parent_run_id TEXT, status TEXT NOT NULL, current_step TEXT, cycle INTEGER NOT NULL DEFAULT 0,
    context TEXT NOT NULL, error TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, completed_at TEXT
  );

  CREATE TABLE tasks (
    id TEXT PRIMARY KEY, title TEXT NOT NULL, description TEXT NOT NULL, type TEXT NOT NULL,
    agent_id TEXT NOT NULL, supervisor_id TEXT, priority TEXT NOT NULL,
    product_id TEXT, campaign_id TEXT, workflow_run_id TEXT, step_key TEXT,
    deadline TEXT, depends_on TEXT NOT NULL, status TEXT NOT NULL,
    input TEXT NOT NULL, result TEXT, review TEXT, error TEXT,
    attempts INTEGER NOT NULL DEFAULT 0, max_attempts INTEGER NOT NULL DEFAULT 3,
    revision INTEGER NOT NULL DEFAULT 0, next_attempt_at TEXT, overdue_notified INTEGER NOT NULL DEFAULT 0,
    engine TEXT, created_by TEXT NOT NULL,
    created_at TEXT NOT NULL, started_at TEXT, completed_at TEXT, updated_at TEXT NOT NULL
  );
  CREATE INDEX idx_tasks_status ON tasks(status);
  CREATE INDEX idx_tasks_agent ON tasks(agent_id);
  CREATE INDEX idx_tasks_run ON tasks(workflow_run_id);

  CREATE TABLE task_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT, task_id TEXT NOT NULL, level TEXT NOT NULL,
    message TEXT NOT NULL, data TEXT, created_at TEXT NOT NULL
  );
  CREATE INDEX idx_task_logs_task ON task_logs(task_id);

  CREATE TABLE agent_state (
    agent_id TEXT PRIMARY KEY, status TEXT NOT NULL, current_task_id TEXT, status_note TEXT,
    last_active_at TEXT, tasks_completed INTEGER NOT NULL DEFAULT 0, tasks_failed INTEGER NOT NULL DEFAULT 0,
    score_sum REAL NOT NULL DEFAULT 0, score_count INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE conversations (
    id TEXT PRIMARY KEY, agent_id TEXT NOT NULL, title TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
  );
  CREATE TABLE messages (
    id TEXT PRIMARY KEY, channel TEXT NOT NULL, from_id TEXT NOT NULL, to_id TEXT NOT NULL,
    conversation_id TEXT, task_id TEXT, workflow_run_id TEXT, kind TEXT NOT NULL,
    content TEXT NOT NULL, data TEXT, created_at TEXT NOT NULL
  );
  CREATE INDEX idx_messages_channel ON messages(channel, created_at);
  CREATE INDEX idx_messages_conv ON messages(conversation_id, created_at);

  CREATE TABLE memory (
    id TEXT PRIMARY KEY, scope TEXT NOT NULL, scope_id TEXT NOT NULL, kind TEXT NOT NULL,
    title TEXT NOT NULL, content TEXT NOT NULL, importance INTEGER NOT NULL DEFAULT 3,
    author TEXT NOT NULL, tags TEXT NOT NULL, created_at TEXT NOT NULL
  );
  CREATE INDEX idx_memory_scope ON memory(scope, scope_id);

  CREATE TABLE videos (
    id TEXT PRIMARY KEY, workflow_run_id TEXT NOT NULL, product_id TEXT NOT NULL, campaign_id TEXT,
    title TEXT NOT NULL, status TEXT NOT NULL, hook TEXT, hooks TEXT, blueprint TEXT, production TEXT,
    edit TEXT, qa TEXT, score REAL, revisions INTEGER NOT NULL DEFAULT 0,
    raw_asset TEXT, final_asset TEXT, poster_asset TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
  );
  CREATE TABLE media_assets (
    id TEXT PRIMARY KEY, kind TEXT NOT NULL, path TEXT NOT NULL, mime TEXT NOT NULL, size INTEGER NOT NULL,
    meta TEXT NOT NULL, created_at TEXT NOT NULL
  );
  CREATE TABLE video_versions (
    id TEXT PRIMARY KEY, video_id TEXT NOT NULL, version INTEGER NOT NULL, stage TEXT NOT NULL,
    asset_id TEXT, notes TEXT NOT NULL, created_by TEXT NOT NULL, created_at TEXT NOT NULL
  );

  CREATE TABLE deliveries (
    id TEXT PRIMARY KEY, video_id TEXT NOT NULL UNIQUE, product_id TEXT NOT NULL, campaign_id TEXT,
    title TEXT NOT NULL, status TEXT NOT NULL, score REAL, created_by TEXT NOT NULL,
    history TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
  );

  CREATE TABLE store_findings (
    id TEXT PRIMARY KEY, product_id TEXT NOT NULL, workflow_run_id TEXT, category TEXT NOT NULL,
    problem TEXT NOT NULL, why_it_matters TEXT NOT NULL, expected_impact TEXT NOT NULL,
    recommended_action TEXT NOT NULL, risk TEXT, risk_rationale TEXT, status TEXT NOT NULL,
    approval_id TEXT, created_by TEXT NOT NULL, reviewed_by TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
  );

  CREATE TABLE approvals (
    id TEXT PRIMARY KEY, kind TEXT NOT NULL, title TEXT NOT NULL, description TEXT NOT NULL,
    risk TEXT NOT NULL, payload TEXT NOT NULL, requested_by TEXT NOT NULL, status TEXT NOT NULL,
    owner_note TEXT, related_type TEXT, related_id TEXT, created_at TEXT NOT NULL, resolved_at TEXT
  );

  CREATE TABLE events (
    id INTEGER PRIMARY KEY AUTOINCREMENT, type TEXT NOT NULL, payload TEXT NOT NULL, created_at TEXT NOT NULL
  );
  CREATE INDEX idx_events_type ON events(type);

  CREATE TABLE activity_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT, agent_id TEXT, kind TEXT NOT NULL, action TEXT NOT NULL,
    task_id TEXT, result TEXT, error TEXT, details TEXT, created_at TEXT NOT NULL
  );
  CREATE INDEX idx_activity_agent ON activity_log(agent_id, created_at);

  CREATE TABLE reports (
    id TEXT PRIMARY KEY, date TEXT NOT NULL UNIQUE, data TEXT NOT NULL, narrative TEXT NOT NULL,
    engine TEXT NOT NULL, created_at TEXT NOT NULL
  );

  CREATE TABLE llm_usage (
    id INTEGER PRIMARY KEY AUTOINCREMENT, agent_id TEXT NOT NULL, task_id TEXT, model TEXT NOT NULL,
    input_tokens INTEGER NOT NULL, output_tokens INTEGER NOT NULL, created_at TEXT NOT NULL
  );
  `,
];

export type Row = Record<string, unknown>;

export class Database {
  readonly raw: DatabaseSync;

  constructor(file: string) {
    this.raw = new DatabaseSync(file);
    this.raw.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
    this.migrate();
  }

  private migrate() {
    this.raw.exec('CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL)');
    const done = new Set(
      (this.raw.prepare('SELECT version FROM schema_migrations').all() as Row[]).map((r) => Number(r.version)),
    );
    MIGRATIONS.forEach((sql, i) => {
      const version = i + 1;
      if (done.has(version)) return;
      this.transaction(() => {
        this.raw.exec(sql);
        this.raw.prepare('INSERT INTO schema_migrations VALUES (?, ?)').run(version, new Date().toISOString());
      });
    });
  }

  all<T = Row>(sql: string, ...params: SQLInputValue[]): T[] {
    return this.raw.prepare(sql).all(...params) as T[];
  }

  get<T = Row>(sql: string, ...params: SQLInputValue[]): T | undefined {
    return this.raw.prepare(sql).get(...params) as T | undefined;
  }

  run(sql: string, ...params: SQLInputValue[]) {
    return this.raw.prepare(sql).run(...params);
  }

  /** Insert an object as a row (keys = columns). Objects/arrays are JSON-encoded. */
  insert(table: string, row: Record<string, unknown>) {
    const keys = Object.keys(row);
    const sql = `INSERT INTO ${table} (${keys.join(', ')}) VALUES (${keys.map(() => '?').join(', ')})`;
    return this.run(sql, ...keys.map((k) => encode(row[k])));
  }

  update(table: string, id: string, patch: Record<string, unknown>, idColumn = 'id') {
    const keys = Object.keys(patch);
    if (keys.length === 0) return;
    const sql = `UPDATE ${table} SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE ${idColumn} = ?`;
    return this.run(sql, ...keys.map((k) => encode(patch[k])), id);
  }

  transaction<T>(fn: () => T): T {
    this.raw.exec('BEGIN');
    try {
      const out = fn();
      this.raw.exec('COMMIT');
      return out;
    } catch (err) {
      this.raw.exec('ROLLBACK');
      throw err;
    }
  }

  close() {
    this.raw.close();
  }
}

function encode(v: unknown): SQLInputValue {
  if (v === undefined) return null;
  if (v === null || typeof v === 'string' || typeof v === 'number' || typeof v === 'bigint') return v;
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (v instanceof Uint8Array) return v;
  return JSON.stringify(v);
}

export function parseJson<T>(value: unknown, fallback: T): T {
  if (typeof value !== 'string' || value === '') return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

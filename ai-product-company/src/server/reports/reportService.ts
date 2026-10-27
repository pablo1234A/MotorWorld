import type { Database, Row } from '../db.js';
import { parseJson } from '../db.js';
import type { EventBus } from '../core/events.js';
import { newId, now } from '../core/ids.js';
import type { LlmGateway } from '../llm/provider.js';

export interface DailyFacts {
  date: string;
  agentsActive: string[];
  workDone: { agentId: string; title: string; summary: string | null }[];
  tasks: { completed: number; pending: number; blocked: number; failed: number };
  errors: { agentId: string | null; action: string; error: string | null }[];
  videos: { created: number; approved: number; rejected: number; revision: number; delivered: number };
  hooksCreated: number;
  conceptsCreated: number;
  store: { problemsFound: number; approvedForApplication: number; awaitingApproval: number; applied: number };
  approvals: { pending: number; resolvedToday: number };
  decisions: string[];
  blockers: string[];
  llmCalls: number;
}

export interface DailyNarrative {
  bluf: string;
  importantDecisions: string[];
  opportunities: string[];
  blockers: string[];
  recommendations: string[];
  tomorrow: string[];
}

export interface Report {
  id: string;
  date: string;
  data: DailyFacts;
  narrative: DailyNarrative;
  engine: string;
  createdAt: string;
}

/** DAILY REPORTS + internal metrics. Every number comes from recorded facts. */
export class ReportService {
  constructor(private db: Database, private events: EventBus, private llm: LlmGateway) {}

  private range(date: string): [string, string] {
    const start = new Date(`${date}T00:00:00`);
    const end = new Date(start.getTime() + 86_400_000);
    return [start.toISOString(), end.toISOString()];
  }

  private count(sql: string, ...params: string[]): number {
    return Number(this.db.get<{ n: number }>(sql, ...params)?.n ?? 0);
  }

  collect(date: string): DailyFacts {
    const [a, b] = this.range(date);
    const evCount = (type: string) => this.count('SELECT COUNT(*) AS n FROM events WHERE type = ? AND created_at >= ? AND created_at < ?', type, a, b);
    const hooks = this.db
      .all<{ payload: string }>("SELECT payload FROM events WHERE type = 'HOOKS_CREATED' AND created_at >= ? AND created_at < ?", a, b)
      .reduce((n, r) => n + Number(parseJson<{ count?: number }>(r.payload, {}).count ?? 0), 0);
    const agentsActive = this.db
      .all<{ agent_id: string }>("SELECT DISTINCT agent_id FROM activity_log WHERE agent_id IS NOT NULL AND agent_id != 'SYSTEM' AND created_at >= ? AND created_at < ?", a, b)
      .map((r) => r.agent_id);
    const workDone = this.db
      .all("SELECT agent_id, title, result FROM tasks WHERE status = 'COMPLETED' AND completed_at >= ? AND completed_at < ? ORDER BY completed_at", a, b)
      .map((r) => ({ agentId: String(r.agent_id), title: String(r.title), summary: (parseJson<{ summary?: string }>(r.result, {}).summary ?? null) as string | null }));
    const errors = this.db
      .all("SELECT agent_id, action, error FROM activity_log WHERE kind = 'error' AND created_at >= ? AND created_at < ? ORDER BY id DESC LIMIT 50", a, b)
      .map((r) => ({ agentId: (r.agent_id as string) ?? null, action: String(r.action), error: (r.error as string) ?? null }));
    const decisions = [
      ...this.db.all<{ title: string }>("SELECT title FROM memory WHERE kind = 'decision' AND created_at >= ? AND created_at < ?", a, b).map((r) => r.title),
      ...this.db.all<{ title: string; status: string }>('SELECT title, status FROM approvals WHERE resolved_at >= ? AND resolved_at < ?', a, b).map((r) => `Propietario ${r.status}: ${r.title}`),
    ];
    const blocked = this.db.all<{ title: string; error: string }>("SELECT title, error FROM tasks WHERE status = 'BLOCKED'");
    const pendingApprovals = this.count("SELECT COUNT(*) AS n FROM approvals WHERE status = 'PENDING'");
    return {
      date,
      agentsActive,
      workDone,
      tasks: {
        completed: workDone.length,
        pending: this.count("SELECT COUNT(*) AS n FROM tasks WHERE status IN ('PENDING', 'ASSIGNED', 'RUNNING', 'WAITING_REVIEW', 'REVISION_REQUIRED', 'APPROVED') AND type != 'atlas.daily_report'"),
        blocked: blocked.length,
        failed: this.count("SELECT COUNT(*) AS n FROM tasks WHERE status = 'FAILED' AND completed_at >= ? AND completed_at < ?", a, b),
      },
      errors,
      videos: {
        created: this.count('SELECT COUNT(*) AS n FROM videos WHERE created_at >= ? AND created_at < ?', a, b),
        approved: evCount('VIDEO_APPROVED'),
        rejected: evCount('VIDEO_REJECTED'),
        revision: evCount('VIDEO_REVISION_REQUIRED'),
        delivered: this.count("SELECT COUNT(*) AS n FROM deliveries WHERE status = 'DELIVERED' AND updated_at >= ? AND updated_at < ?", a, b),
      },
      hooksCreated: hooks,
      conceptsCreated: evCount('BLUEPRINT_CREATED'),
      store: {
        problemsFound: evCount('STORE_PROBLEM_FOUND'),
        approvedForApplication: this.count("SELECT COUNT(*) AS n FROM store_findings WHERE status IN ('READY_TO_APPLY', 'APPROVED') AND updated_at >= ? AND updated_at < ?", a, b),
        awaitingApproval: this.count("SELECT COUNT(*) AS n FROM store_findings WHERE status = 'AWAITING_APPROVAL'"),
        applied: this.count("SELECT COUNT(*) AS n FROM store_findings WHERE status = 'APPLIED' AND updated_at >= ? AND updated_at < ?", a, b),
      },
      approvals: { pending: pendingApprovals, resolvedToday: this.count('SELECT COUNT(*) AS n FROM approvals WHERE resolved_at >= ? AND resolved_at < ?', a, b) },
      decisions,
      blockers: [...blocked.map((t) => `BLOQUEADA: ${t.title} — ${t.error ?? ''}`), ...(pendingApprovals ? [`${pendingApprovals} aprobación(es) del propietario pendientes`] : [])],
      llmCalls: this.count('SELECT COUNT(*) AS n FROM llm_usage WHERE created_at >= ? AND created_at < ?', a, b),
    };
  }

  save(date: string, data: DailyFacts, narrative: DailyNarrative, engine: string): Report {
    const id = newId('rpt');
    this.db.run('DELETE FROM reports WHERE date = ?', date);
    this.db.insert('reports', { id, date, data, narrative, engine, created_at: now() });
    this.events.emit('DAILY_REPORT_GENERATED', { reportId: id, date });
    return this.get(id)!;
  }

  get(id: string): Report | null {
    const r = this.db.get('SELECT * FROM reports WHERE id = ?', id);
    return r ? toReport(r) : null;
  }

  byDate(date: string): Report | null {
    const r = this.db.get('SELECT * FROM reports WHERE date = ?', date);
    return r ? toReport(r) : null;
  }

  list(): Report[] {
    return this.db.all('SELECT * FROM reports ORDER BY date DESC LIMIT 90').map(toReport);
  }

  /** Real internal metrics (used by IRIS and the Control Center). */
  internalMetrics() {
    const videos = this.db.all('SELECT status, score, revisions, qa, hooks FROM videos');
    const reviewed = videos.filter((v) => parseJson<unknown[]>(v.qa, []).length > 0);
    const scores = reviewed.map((v) => Number(v.score)).filter((n) => Number.isFinite(n));
    const firstPass = reviewed.filter((v) => parseJson<{ verdict: string }[]>(v.qa, [])[0]?.verdict === 'APPROVED').length;
    const byStatus: Record<string, number> = {};
    for (const v of videos) byStatus[String(v.status)] = (byStatus[String(v.status)] ?? 0) + 1;
    const fam = new Map<string, number[]>();
    for (const v of reviewed) {
      const f = parseJson<{ topFamily?: string }>(v.hooks, {}).topFamily ?? 'unknown';
      fam.set(f, [...(fam.get(f) ?? []), Number(v.score)]);
    }
    const taskRows = this.db.all<{ status: string; n: number }>('SELECT status, COUNT(*) AS n FROM tasks GROUP BY status');
    const total = taskRows.reduce((a, r) => a + Number(r.n), 0);
    const failed = Number(taskRows.find((r) => r.status === 'FAILED')?.n ?? 0);
    const cycle = this.db.all<{ type: string; mins: number }>(
      "SELECT type, AVG((julianday(completed_at) - julianday(created_at)) * 1440) AS mins FROM tasks WHERE status = 'COMPLETED' GROUP BY type",
    );
    const findings = this.db.all<{ risk: string | null; status: string }>('SELECT risk, status FROM store_findings');
    const byRisk: Record<string, number> = {};
    const fByStatus: Record<string, number> = {};
    for (const f of findings) {
      if (f.risk) byRisk[f.risk] = (byRisk[f.risk] ?? 0) + 1;
      fByStatus[f.status] = (fByStatus[f.status] ?? 0) + 1;
    }
    const avg = (xs: number[]) => (xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10 : null);
    return {
      videos: {
        total: videos.length,
        byStatus,
        reviewed: reviewed.length,
        avgScore: avg(scores),
        approvedFirstPass: firstPass,
        revisionRate: reviewed.length ? reviewed.filter((v) => Number(v.revisions) > 0).length / reviewed.length : 0,
      },
      hooksByFamily: [...fam.entries()].map(([family, s]) => ({ family, videos: s.length, avgScore: avg(s) })),
      tasks: {
        total,
        byStatus: Object.fromEntries(taskRows.map((r) => [r.status, Number(r.n)])),
        failureRate: total ? failed / total : 0,
        avgMinutesByType: Object.fromEntries(cycle.map((r) => [r.type, Math.round(Number(r.mins) * 10) / 10])),
      },
      findings: { total: findings.length, byRisk, byStatus: fByStatus },
      approvals: { pending: this.count("SELECT COUNT(*) AS n FROM approvals WHERE status = 'PENDING'") },
      llm: { engine: this.llm.engineLabel, callsToday: this.llm.callsToday() },
      connectors: { sales: false, ads: false, webAnalytics: false },
    };
  }
}

function toReport(r: Row): Report {
  return {
    id: String(r.id),
    date: String(r.date),
    data: parseJson(r.data, {} as DailyFacts),
    narrative: parseJson(r.narrative, {} as DailyNarrative),
    engine: String(r.engine),
    createdAt: String(r.created_at),
  };
}

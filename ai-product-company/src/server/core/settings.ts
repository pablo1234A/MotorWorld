import { z } from 'zod';
import type { Database } from '../db.js';

/** Company operating settings, editable by the owner from the UI. */
export const SettingsSchema = z.object({
  /** Agents generate their own objectives (ATLAS company reviews) when idle. */
  autopilot: z.boolean(),
  /** Minutes between autonomous ATLAS company reviews. */
  autopilotIntervalMinutes: z.number().int().min(15).max(1440),
  /** Max QA revision cycles per video before escalating to the owner. */
  maxRevisionCycles: z.number().int().min(0).max(10),
  /** Max retries for a failing task before escalation. */
  maxTaskAttempts: z.number().int().min(1).max(10),
  /** Hour (0-23, server local time) when the daily report is generated automatically. */
  dailyReportHour: z.number().int().min(0).max(23),
  /** Hard cap of LLM calls per day (cost guard). */
  maxLlmCallsPerDay: z.number().int().min(1).max(100000),
  /** How many tasks the company runs in parallel. */
  maxConcurrentTasks: z.number().int().min(1).max(10),
  /** Minimum LUNA score for approval. */
  qaApprovalThreshold: z.number().int().min(0).max(100),
  /** Language agents write in. */
  language: z.enum(['es', 'en']),
  /** Default number of videos per video objective. */
  defaultVideosPerObjective: z.number().int().min(1).max(5),
});

export type Settings = z.infer<typeof SettingsSchema>;

export const DEFAULT_SETTINGS: Settings = {
  autopilot: true,
  autopilotIntervalMinutes: 360,
  maxRevisionCycles: 2,
  maxTaskAttempts: 3,
  dailyReportHour: 23,
  maxLlmCallsPerDay: 300,
  maxConcurrentTasks: 3,
  qaApprovalThreshold: 75,
  language: 'es',
  defaultVideosPerObjective: 1,
};

export class SettingsService {
  private cache: Settings | null = null;
  constructor(private db: Database) {}

  get(): Settings {
    if (this.cache) return this.cache;
    const rows = this.db.all<{ key: string; value: string }>('SELECT key, value FROM settings');
    const stored: Record<string, unknown> = {};
    for (const r of rows) stored[r.key] = JSON.parse(r.value);
    this.cache = SettingsSchema.parse({ ...DEFAULT_SETTINGS, ...stored });
    return this.cache;
  }

  update(patch: Partial<Settings>): Settings {
    const next = SettingsSchema.parse({ ...this.get(), ...patch });
    this.db.transaction(() => {
      for (const [k, v] of Object.entries(next)) {
        this.db.run('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', k, JSON.stringify(v));
      }
    });
    this.cache = next;
    return next;
  }

  /** Internal key/value state (e.g. last autopilot run), not exposed as settings. */
  getState(key: string): string | null {
    const r = this.db.get<{ value: string }>('SELECT value FROM settings WHERE key = ?', `state:${key}`);
    return r ? JSON.parse(r.value) : null;
  }

  setState(key: string, value: string) {
    this.db.run(
      'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
      `state:${key}`,
      JSON.stringify(value),
    );
  }
}

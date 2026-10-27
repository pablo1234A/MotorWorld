import { z } from 'zod';
import type { Database, Row } from '../db.js';
import { parseJson } from '../db.js';
import type { EventBus } from '../core/events.js';
import { newId, now } from '../core/ids.js';

/**
 * MEMORY — scoped, never mixed indiscriminately.
 *  global   → company-wide decisions and rules (scope_id "company")
 *  product  → knowledge about one product (scope_id = productId)
 *  brand    → brand voice / visual learnings for a product's brand (scope_id = productId)
 *  agent    → an agent's own lessons (scope_id = agentId)
 *  task     → working notes of one task (scope_id = taskId)
 *  campaign → campaign learnings (scope_id = campaignId)
 *  video    → history and feedback of one video (scope_id = videoId)
 */
export const MEMORY_SCOPES = ['global', 'product', 'brand', 'agent', 'task', 'campaign', 'video'] as const;
export type MemoryScope = (typeof MEMORY_SCOPES)[number];

export const MEMORY_KINDS = ['decision', 'insight', 'lesson', 'asset', 'feedback', 'fact', 'note', 'preference'] as const;
export type MemoryKind = (typeof MEMORY_KINDS)[number];

export const MemoryInputSchema = z.object({
  scope: z.enum(MEMORY_SCOPES),
  scopeId: z.string().min(1).max(100),
  kind: z.enum(MEMORY_KINDS),
  title: z.string().trim().min(1).max(200),
  content: z.string().trim().min(1).max(8000),
  importance: z.number().int().min(1).max(5).default(3),
  tags: z.array(z.string().max(40)).max(10).default([]),
});

export interface MemoryEntry {
  id: string;
  scope: MemoryScope;
  scopeId: string;
  kind: MemoryKind;
  title: string;
  content: string;
  importance: number;
  author: string;
  tags: string[];
  createdAt: string;
}

export interface MemoryQuery {
  agentId: string;
  scopes: MemoryScope[];
  productId?: string | null;
  campaignId?: string | null;
  videoId?: string | null;
  taskId?: string | null;
}

export class MemoryService {
  constructor(private db: Database, private events: EventBus) {}

  write(author: string, input: z.input<typeof MemoryInputSchema>): MemoryEntry {
    const data = MemoryInputSchema.parse(input);
    const entry: MemoryEntry = { id: newId('mem'), ...data, author, createdAt: now() };
    this.db.insert('memory', {
      id: entry.id,
      scope: entry.scope,
      scope_id: entry.scopeId,
      kind: entry.kind,
      title: entry.title,
      content: entry.content,
      importance: entry.importance,
      author,
      tags: entry.tags,
      created_at: entry.createdAt,
    });
    this.events.emit('MEMORY_WRITTEN', { memoryId: entry.id, scope: entry.scope, scopeId: entry.scopeId, kind: entry.kind, author, title: entry.title });
    return entry;
  }

  list(opts: { scope?: MemoryScope; scopeId?: string; kind?: string; limit?: number } = {}): MemoryEntry[] {
    const where: string[] = [];
    const params: (string | number)[] = [];
    if (opts.scope) {
      where.push('scope = ?');
      params.push(opts.scope);
    }
    if (opts.scopeId) {
      where.push('scope_id = ?');
      params.push(opts.scopeId);
    }
    if (opts.kind) {
      where.push('kind = ?');
      params.push(opts.kind);
    }
    params.push(opts.limit ?? 200);
    return this.db
      .all(`SELECT * FROM memory ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY created_at DESC LIMIT ?`, ...params)
      .map(toEntry);
  }

  remove(id: string) {
    this.db.run('DELETE FROM memory WHERE id = ?', id);
  }

  /**
   * Retrieve only what an agent needs: its allowed scopes, bound to the current
   * product / campaign / video / task, ranked by importance then recency.
   */
  recall(q: MemoryQuery, perScope = 8): MemoryEntry[] {
    const out: MemoryEntry[] = [];
    const take = (scope: MemoryScope, scopeId: string | null | undefined) => {
      if (!scopeId || !q.scopes.includes(scope)) return;
      out.push(
        ...this.db
          .all('SELECT * FROM memory WHERE scope = ? AND scope_id = ? ORDER BY importance DESC, created_at DESC LIMIT ?', scope, scopeId, perScope)
          .map(toEntry),
      );
    };
    take('global', 'company');
    take('product', q.productId);
    take('brand', q.productId);
    take('agent', q.agentId);
    take('campaign', q.campaignId);
    take('video', q.videoId);
    take('task', q.taskId);
    return out;
  }

  render(entries: MemoryEntry[]): string {
    if (!entries.length) return 'Sin memoria relevante todavía.';
    return entries
      .map((m) => `- [${m.scope}/${m.kind}${m.importance >= 4 ? ' ★' : ''}] ${m.title}: ${m.content.replace(/\s+/g, ' ').slice(0, 600)} (por ${m.author})`)
      .join('\n');
  }
}

function toEntry(r: Row): MemoryEntry {
  return {
    id: String(r.id),
    scope: r.scope as MemoryScope,
    scopeId: String(r.scope_id),
    kind: r.kind as MemoryKind,
    title: String(r.title),
    content: String(r.content),
    importance: Number(r.importance),
    author: String(r.author),
    tags: parseJson<string[]>(r.tags, []),
    createdAt: String(r.created_at),
  };
}

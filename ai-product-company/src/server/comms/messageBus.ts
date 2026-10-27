import type { Database, Row } from '../db.js';
import { parseJson } from '../db.js';
import type { EventBus } from '../core/events.js';
import type { ActivityLog } from '../core/activity.js';
import { newId, now } from '../core/ids.js';

export type MessageKind = 'handoff' | 'request' | 'report' | 'review' | 'escalation' | 'broadcast' | 'chat' | 'info';

export interface Message {
  id: string;
  channel: 'internal' | 'chat';
  fromId: string;
  toId: string;
  conversationId: string | null;
  taskId: string | null;
  workflowRunId: string | null;
  kind: MessageKind;
  content: string;
  data: unknown;
  createdAt: string;
}

/**
 * COMMUNICATION SYSTEM.
 * Internal agent ↔ agent messages (NOVA → NEO "Hooks seleccionados", LUNA → MAX
 * "Revision required"…) and owner ↔ agent chat. Everything is persisted.
 */
export class MessageBus {
  constructor(private db: Database, private events: EventBus, private activity: ActivityLog) {}

  send(msg: {
    from: string;
    to: string;
    content: string;
    kind?: MessageKind;
    taskId?: string | null;
    workflowRunId?: string | null;
    data?: unknown;
  }): Message {
    const m: Message = {
      id: newId('msg'),
      channel: 'internal',
      fromId: msg.from,
      toId: msg.to,
      conversationId: null,
      taskId: msg.taskId ?? null,
      workflowRunId: msg.workflowRunId ?? null,
      kind: msg.kind ?? 'info',
      content: msg.content,
      data: msg.data ?? null,
      createdAt: now(),
    };
    this.persist(m);
    this.activity.record({ agentId: m.fromId, kind: 'communication', action: `${m.fromId} → ${m.toId}: ${m.content}`, taskId: m.taskId });
    this.events.emit('MESSAGE_SENT', { messageId: m.id, from: m.fromId, to: m.toId, kind: m.kind, content: m.content, taskId: m.taskId, workflowRunId: m.workflowRunId });
    return m;
  }

  /** Owner ↔ agent chat message. */
  chat(conversationId: string, from: string, to: string, content: string, data?: unknown): Message {
    const m: Message = {
      id: newId('msg'),
      channel: 'chat',
      fromId: from,
      toId: to,
      conversationId,
      taskId: null,
      workflowRunId: null,
      kind: 'chat',
      content,
      data: data ?? null,
      createdAt: now(),
    };
    this.persist(m);
    this.db.run('UPDATE conversations SET updated_at = ? WHERE id = ?', m.createdAt, conversationId);
    this.events.emit('CHAT_MESSAGE', { messageId: m.id, conversationId, from, to });
    return m;
  }

  private persist(m: Message) {
    this.db.insert('messages', {
      id: m.id,
      channel: m.channel,
      from_id: m.fromId,
      to_id: m.toId,
      conversation_id: m.conversationId,
      task_id: m.taskId,
      workflow_run_id: m.workflowRunId,
      kind: m.kind,
      content: m.content,
      data: m.data,
      created_at: m.createdAt,
    });
  }

  internal(opts: { agentId?: string; workflowRunId?: string; limit?: number } = {}): Message[] {
    const where = ["channel = 'internal'"];
    const params: (string | number)[] = [];
    if (opts.agentId) {
      where.push('(from_id = ? OR to_id = ?)');
      params.push(opts.agentId, opts.agentId);
    }
    if (opts.workflowRunId) {
      where.push('workflow_run_id = ?');
      params.push(opts.workflowRunId);
    }
    params.push(opts.limit ?? 200);
    return this.db.all(`SELECT * FROM messages WHERE ${where.join(' AND ')} ORDER BY created_at DESC LIMIT ?`, ...params).map(toMessage);
  }

  conversation(conversationId: string, limit = 200): Message[] {
    return this.db
      .all('SELECT * FROM (SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at DESC LIMIT ?) ORDER BY created_at ASC', conversationId, limit)
      .map(toMessage);
  }
}

function toMessage(r: Row): Message {
  return {
    id: String(r.id),
    channel: r.channel as 'internal' | 'chat',
    fromId: String(r.from_id),
    toId: String(r.to_id),
    conversationId: (r.conversation_id as string) ?? null,
    taskId: (r.task_id as string) ?? null,
    workflowRunId: (r.workflow_run_id as string) ?? null,
    kind: r.kind as MessageKind,
    content: String(r.content),
    data: parseJson(r.data, null),
    createdAt: String(r.created_at),
  };
}

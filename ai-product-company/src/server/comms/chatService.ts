import { z } from 'zod';
import type { Company } from '../company.js';
import type { Database } from '../db.js';
import { getAgent } from '../agents/definitions.js';
import { buildSystemPrompt } from '../agents/prompt.js';
import type { ChatAction } from '../agents/types.js';
import { buildProductContext } from '../products/productContext.js';
import { errorMessage } from '../core/errors.js';
import { localDate, newId, now } from '../core/ids.js';
import type { ChatTurn } from '../llm/provider.js';
import type { Message } from './messageBus.js';

const ACTION_TYPES = ['launch_strategy', 'launch_video_pipeline', 'launch_store_audit', 'launch_analytics_review', 'generate_daily_report', 'save_memory'] as const;

export const ChatReplySchema = z.object({
  reply: z.string(),
  actions: z.array(
    z.object({
      type: z.enum(ACTION_TYPES),
      goal: z.string(),
      count: z.number(),
      angle: z.string(),
      memoryTitle: z.string(),
      memoryContent: z.string(),
    }),
  ),
});
type ChatAct = z.infer<typeof ChatReplySchema>['actions'][number];

const ACTION_HELP: Record<ChatAction, string> = {
  launch_strategy: 'launch_strategy(goal): activa la empresa para un objetivo de negocio (ATLAS analiza, ALEX planifica, especialistas ejecutan).',
  launch_video_pipeline: 'launch_video_pipeline(count 1-3, angle): lanza el pipeline de vídeo NOVA→NEO→REX→MAX→LUNA.',
  launch_store_audit: 'launch_store_audit: EVA audita la tienda y NOAH clasifica el riesgo.',
  launch_analytics_review: 'launch_analytics_review: IRIS analiza el rendimiento con datos reales.',
  generate_daily_report: 'generate_daily_report: genera el informe diario ahora.',
  save_memory: 'save_memory(memoryTitle, memoryContent): guarda una preferencia o instrucción duradera del propietario.',
};

/** CHAT — the owner talks to ATLAS (main chat) or directly to any agent. Context is kept per agent. */
export class ChatService {
  constructor(private db: Database, private c: Company) {}

  conversationId(agentId: string): string {
    const r = this.db.get<{ id: string }>('SELECT id FROM conversations WHERE agent_id = ? ORDER BY created_at LIMIT 1', agentId);
    if (r) return r.id;
    const id = newId('cnv');
    this.db.insert('conversations', { id, agent_id: agentId, title: `${agentId} chat`, created_at: now(), updated_at: now() });
    return id;
  }

  history(agentId: string, limit = 100): Message[] {
    return this.c.messages.conversation(this.conversationId(agentId), limit);
  }

  /** Agent-initiated message to the owner (reports, results). */
  postFromAgent(agentId: string, content: string) {
    return this.c.messages.chat(this.conversationId(agentId), agentId, 'OWNER', content);
  }

  async send(agentId: string, text: string): Promise<{ reply: Message; actions: { type: string; ok: boolean; detail: string }[] }> {
    const agent = getAgent(agentId);
    const convId = this.conversationId(agentId);
    const previous = this.c.messages.conversation(convId, 30);
    this.c.messages.chat(convId, 'OWNER', agentId, text);
    this.c.activity.record({ agentId: null, kind: 'owner', action: `Propietario → ${agentId}: ${text.slice(0, 140)}` });

    let reply: string;
    let actions: ChatAct[];
    let engine: string;
    try {
      if (this.c.llm.available) {
        const res = await this.c.llm.generate({
          agentId,
          system: `${buildSystemPrompt(agent, agent.skills, this.c.settings.get().language)}\n\n# MODO CHAT CON EL PROPIETARIO
Estás hablando directamente con el propietario de la empresa. Responde como ${agent.name}, en su idioma, de forma directa y útil, usando el estado real de la empresa que se te da. Si te pide trabajo que puedes iniciar, usa "actions"; si no puedes, dile qué agente puede. Acciones permitidas para ti:
${agent.chatActions.map((a) => `- ${ACTION_HELP[a]}`).join('\n') || '- ninguna (solo conversación)'}
Rellena los campos de acción que no apliquen con "" o 0. No prometas resultados que no se han producido.`,
          user: `${this.contextBlock(agentId)}\n\n# MENSAJE DEL PROPIETARIO\n${text}`,
          history: toHistory(previous),
          schema: ChatReplySchema,
          effort: 'low',
          maxTokens: 4000,
        });
        reply = res.data.reply;
        actions = res.data.actions;
        engine = this.c.llm.engineLabel;
      } else {
        ({ reply, actions } = this.localReply(agentId, text));
        engine = 'local-heuristic';
      }
    } catch (err) {
      reply = `No he podido procesar tu mensaje: ${errorMessage(err)}`;
      actions = [];
      engine = 'error';
    }

    const results: { type: string; ok: boolean; detail: string }[] = [];
    for (const a of actions.slice(0, 4)) {
      if (!agent.chatActions.includes(a.type)) {
        results.push({ type: a.type, ok: false, detail: `${agentId} no tiene permiso para ${a.type}` });
        continue;
      }
      try {
        results.push({ type: a.type, ok: true, detail: this.execute(agentId, a, text) });
      } catch (err) {
        results.push({ type: a.type, ok: false, detail: errorMessage(err) });
      }
    }
    const footer = results.length ? `\n\n${results.map((r) => `${r.ok ? '✓' : '✗'} ${r.detail}`).join('\n')}` : '';
    const msg = this.c.messages.chat(convId, agentId, 'OWNER', reply + footer, { engine, actions: results });
    return { reply: msg, actions: results };
  }

  private execute(agentId: string, a: ChatAct, original: string): string {
    const w = this.c.workflows;
    switch (a.type) {
      case 'launch_strategy': {
        const goal = a.goal.trim() || original;
        const run = w.start('strategy', { title: goal.length > 80 ? `${goal.slice(0, 77)}…` : goal, createdBy: 'OWNER', priority: 'high', context: { goal, requestedVia: agentId } });
        return `Empresa activada: estrategia "${run.title}" en marcha (ATLAS → ALEX → especialistas).`;
      }
      case 'launch_video_pipeline': {
        const n = Math.max(1, Math.min(3, Math.round(a.count || 1)));
        const product = this.c.products.getActive();
        const ids = Array.from({ length: n }, (_, i) =>
          w.start('video_pipeline', { title: `Vídeo ${product?.name ?? ''}${a.angle ? ` · ${a.angle}` : ''}${n > 1 ? ` #${i + 1}` : ''}`.trim(), createdBy: agentId, context: { angle: a.angle, brief: a.goal || original } }).id,
        );
        return `${ids.length} pipeline(s) de vídeo lanzados.`;
      }
      case 'launch_store_audit':
        w.start('store_audit', { title: 'Auditoría de tienda', createdBy: agentId });
        return 'Auditoría de tienda lanzada (EVA → NOAH).';
      case 'launch_analytics_review':
        w.start('analytics_review', { title: 'Revisión de rendimiento', createdBy: agentId });
        return 'Análisis de rendimiento lanzado (IRIS).';
      case 'generate_daily_report': {
        const date = localDate();
        w.start('daily_report', { title: `Daily Report ${date}`, productId: null, createdBy: agentId, priority: 'high', context: { date } });
        return `Informe diario ${date} en preparación.`;
      }
      case 'save_memory': {
        const m = this.c.memory.write(agentId, {
          scope: agentId === 'ATLAS' ? 'global' : 'agent',
          scopeId: agentId === 'ATLAS' ? 'company' : agentId,
          kind: 'preference',
          title: a.memoryTitle || 'Instrucción del propietario',
          content: a.memoryContent || original,
          importance: 5,
        });
        return `Guardado en memoria (${m.scope}): ${m.title}`;
      }
    }
  }

  private contextBlock(agentId: string): string {
    const agent = getAgent(agentId);
    const product = this.c.products.getActive();
    const st = this.c.agentState.get(agentId);
    const myTasks = this.c.tasks.list({ agentId, limit: 8 }).map((t) => `- [${t.status}] ${t.title}${t.result?.summary ? ` → ${t.result.summary}` : ''}`);
    const counts = this.c.tasks.counts();
    const memory = this.c.memory.render(this.c.memory.recall({ agentId, scopes: agent.memoryScopes, productId: product?.id }));
    const recentMsgs = this.c.messages.internal({ agentId, limit: 8 }).map((m) => `- ${m.fromId} → ${m.toId}: ${m.content}`);
    return [
      product ? buildProductContext(product, agent.productFields).text : '# PRODUCTO ACTIVO\nNinguno. Pide al propietario que active un producto en el Product Center.',
      `# TU ESTADO\n${st.status}${st.statusNote ? ` — ${st.statusNote}` : ''} · completadas ${st.tasksCompleted} · fallidas ${st.tasksFailed}`,
      `# TUS TAREAS RECIENTES\n${myTasks.join('\n') || 'ninguna'}`,
      `# EMPRESA\nTareas: ${Object.entries(counts).filter(([, n]) => n).map(([s, n]) => `${s} ${n}`).join(', ') || 'ninguna'} · Workflows activos ${this.c.workflows.activeCount()} · Aprobaciones pendientes ${this.c.approvals.pendingCount()}`,
      `# COMUNICACIONES RECIENTES\n${recentMsgs.join('\n') || 'ninguna'}`,
      `# MEMORIA\n${memory}`,
    ].join('\n\n');
  }

  /** LOCAL HEURISTIC chat: intent rules + real status facts. Clearly labelled. */
  private localReply(agentId: string, text: string): { reply: string; actions: ChatAct[] } {
    const t = text.toLowerCase();
    const agent = getAgent(agentId);
    const blank = { goal: '', count: 0, angle: '', memoryTitle: '', memoryContent: '' };
    const actions: ChatAct[] = [];
    const num = Number(/(\d+)\s*(v[ií]deos?|videos?)/.exec(t)?.[1] ?? 1);
    if (/recuerda|memoriza|ten en cuenta|remember/.test(t)) actions.push({ ...blank, type: 'save_memory', memoryTitle: 'Instrucción del propietario', memoryContent: text });
    else if (/informe|report/.test(t)) actions.push({ ...blank, type: 'generate_daily_report' });
    else if (agent.chatActions.includes('launch_strategy') && /vend|ventas|sell|crecer|facturar|objetivo|estrategia/.test(t)) actions.push({ ...blank, type: 'launch_strategy', goal: text });
    else if (/v[ií]deo|video|hook|creativ/.test(t) && /(crea|haz|lanza|produce|genera|quiero|necesito)/.test(t)) actions.push({ ...blank, type: 'launch_video_pipeline', count: num, goal: text });
    else if (/tienda|auditor|p[aá]gina|cro|conversi/.test(t)) actions.push({ ...blank, type: 'launch_store_audit' });
    else if (/dato|rendimiento|anali|m[eé]trica/.test(t)) actions.push({ ...blank, type: 'launch_analytics_review' });

    const allowed = actions.filter((a) => agent.chatActions.includes(a.type));
    const st = this.c.agentState.get(agentId);
    const counts = this.c.tasks.counts();
    const product = this.c.products.getActive();
    const status = `Estado: ${st.status}${st.statusNote ? ` (${st.statusNote})` : ''}. Empresa: ${counts.RUNNING} en ejecución, ${counts.PENDING} en cola, ${counts.COMPLETED} completadas, ${counts.BLOCKED} bloqueadas. Producto activo: ${product?.name ?? 'ninguno'}.`;
    let reply: string;
    if (allowed.length) reply = `Entendido. ${status}`;
    else if (actions.length) reply = `Eso no lo puedo iniciar yo: habla con ATLAS o ALEX. ${status}`;
    else reply = `${status} Puedo: ${agent.chatActions.map((a) => a.replace(/_/g, ' ')).join(', ') || 'informarte de mi trabajo'}.`;
    return { reply: `[Motor local · sin LLM conectado] ${reply}`, actions: allowed };
  }
}

/** Convert stored messages into a valid alternating user/assistant history. */
function toHistory(msgs: Message[]): ChatTurn[] {
  const turns: ChatTurn[] = [];
  for (const m of msgs) {
    const role = m.fromId === 'OWNER' ? 'user' : 'assistant';
    const last = turns[turns.length - 1];
    if (last && last.role === role) last.content += `\n\n${m.content}`;
    else turns.push({ role, content: m.content });
  }
  const recent = turns.slice(-20);
  while (recent.length && recent[0].role === 'assistant') recent.shift();
  // History must end with an assistant turn (the new user message is appended by the provider).
  if (recent.length && recent[recent.length - 1].role === 'user') recent.pop();
  return recent;
}

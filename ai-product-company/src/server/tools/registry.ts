import fs from 'node:fs';
import path from 'node:path';
import type { Company } from '../company.js';
import { getAgent } from '../agents/definitions.js';
import { PermissionDeniedError } from '../core/errors.js';
import type { Action, Grant, Resource } from '../permissions/permissions.js';
import type { MemoryInputSchema } from '../memory/memoryService.js';
import type { MessageKind } from '../comms/messageBus.js';
import type { BrandPalette, EditDecisionList, ShotSpec } from '../integrations/types.js';
import type { QAReview } from '../videos/videoService.js';
import type { FindingRisk, FindingStatus } from '../store/findingService.js';
import type { Approval } from '../approvals/approvalService.js';
import type { z } from 'zod';

/**
 * TOOLS — the only way agents act on the world. Each tool declares the grant it
 * needs; the ToolBelt checks (1) the tool is in the agent's toolbox and (2) the
 * agent holds the grant, then logs the call on the task.
 */
export interface ToolDef {
  id: string;
  name: string;
  description: string;
  grant: Grant;
  integration?: string;
}

export const TOOLS: ToolDef[] = [
  { id: 'product.read', name: 'Read product', description: 'Lee el producto activo (solo los campos de su función).', grant: 'READ:product' },
  { id: 'memory.read', name: 'Recall memory', description: 'Recupera memoria de sus scopes permitidos.', grant: 'READ:memory' },
  { id: 'memory.write', name: 'Write memory', description: 'Guarda aprendizajes, decisiones o insights.', grant: 'CREATE:memory' },
  { id: 'message.send', name: 'Send message', description: 'Envía un mensaje interno a otro agente.', grant: 'CREATE:message' },
  { id: 'objective.create', name: 'Create objective', description: 'Crea objetivos estratégicos para ALEX.', grant: 'CREATE:objective' },
  { id: 'task.create', name: 'Create task', description: 'Crea tareas para especialistas.', grant: 'CREATE:task' },
  { id: 'workflow.launch', name: 'Launch workflow', description: 'Lanza un workflow permitido (vídeo, tienda, analítica).', grant: 'EXECUTE:task' },
  { id: 'hooks.save', name: 'Save hooks', description: 'Guarda la batería de hooks y la selección.', grant: 'CREATE:hooks' },
  { id: 'blueprint.save', name: 'Save blueprint', description: 'Guarda el VIDEO BLUEPRINT.', grant: 'CREATE:blueprint' },
  { id: 'video.generate', name: 'Generate shots', description: 'Produce los planos con el motor de generación activo.', grant: 'CREATE:video', integration: 'video_generation' },
  { id: 'video.render', name: 'Render final video', description: 'Ejecuta la Edit Decision List con el motor de render activo.', grant: 'EDIT:video', integration: 'render' },
  { id: 'media.probe', name: 'Probe media', description: 'Inspección técnica de un archivo de vídeo (ffprobe).', grant: 'READ:video' },
  { id: 'video.review', name: 'QA verdict', description: 'Registra el veredicto de QA de un vídeo.', grant: 'APPROVE:video' },
  { id: 'store.read', name: 'Read store page', description: 'Snapshot de la página pública del producto.', grant: 'READ:store', integration: 'store' },
  { id: 'store.finding.create', name: 'Report store problem', description: 'Registra un hallazgo CRO.', grant: 'CREATE:store_change' },
  { id: 'store.finding.classify', name: 'Classify store change', description: 'Clasifica el riesgo de un cambio de tienda.', grant: 'APPROVE:store_change' },
  { id: 'approval.request', name: 'Request owner approval', description: 'Envía una acción al Approval Center.', grant: 'CREATE:approval' },
  { id: 'analytics.read', name: 'Read analytics', description: 'Lee métricas internas reales y conectores de analytics.', grant: 'READ:analytics', integration: 'analytics' },
  { id: 'report.create', name: 'Create report', description: 'Genera informes de empresa.', grant: 'CREATE:report' },
];

const TOOL_MAP = new Map(TOOLS.map((t) => [t.id, t]));

export class ToolBelt {
  constructor(
    private c: Company,
    readonly agentId: string,
    private taskId: string | null,
    private workflowRunId: string | null,
  ) {}

  /** Permission gate for every tool call. */
  private use(toolId: string, detail = '') {
    const def = TOOL_MAP.get(toolId);
    if (!def) throw new Error(`Unknown tool ${toolId}`);
    const agent = getAgent(this.agentId);
    if (!agent.tools.includes(toolId)) {
      this.c.events.emit('PERMISSION_DENIED', { agentId: this.agentId, tool: toolId });
      throw new PermissionDeniedError(`${this.agentId} does not have the tool ${toolId}`);
    }
    const [action, resource] = def.grant.split(':') as [Action, Resource];
    this.c.permissions.authorize(this.agentId, action, resource, toolId);
    if (this.taskId) this.c.tasks.log(this.taskId, 'info', `tool ${toolId}${detail ? ` · ${detail}` : ''}`);
  }

  remember(input: z.input<typeof MemoryInputSchema>) {
    this.use('memory.write', `${input.scope}/${input.kind}`);
    return this.c.memory.write(this.agentId, input);
  }

  send(to: string, content: string, kind: MessageKind = 'handoff', data?: unknown) {
    this.use('message.send', `→ ${to}`);
    return this.c.messages.send({ from: this.agentId, to, content, kind, taskId: this.taskId, workflowRunId: this.workflowRunId, data });
  }

  saveHooks(videoId: string, hooks: unknown, topHook: string, count: number) {
    this.use('hooks.save', videoId);
    this.c.videos.patch(videoId, { hooks, hook: topHook });
    this.c.events.emit('HOOKS_CREATED', { videoId, agentId: this.agentId, topHook, count });
  }

  saveBlueprint(videoId: string, blueprint: unknown, title: string) {
    this.use('blueprint.save', videoId);
    this.c.videos.patch(videoId, { blueprint, title });
    this.c.events.emit('BLUEPRINT_CREATED', { videoId, agentId: this.agentId, title });
  }

  async generateShots(videoId: string, productName: string, shots: ShotSpec[], palette: BrandPalette, productImagePath: string | null) {
    const engine = this.c.integrations.videoGenerator();
    this.use('video.generate', `${shots.length} shots via ${engine.id}`);
    const dir = path.join(this.c.videos.dirFor(videoId), `raw-${Date.now()}`);
    fs.mkdirSync(dir, { recursive: true });
    const paths: string[] = [];
    for (const shot of shots) {
      const { path: p } = await engine.generateShot({ videoId, productName, shot, totalShots: shots.length, productImagePath, palette, outDir: dir });
      paths.push(p);
    }
    let rawPath: string | null = null;
    if (this.c.integrations.ffmpeg.available) {
      rawPath = path.join(dir, 'raw.mp4');
      await this.c.integrations.ffmpeg.concat(paths, rawPath);
    }
    return { engine: engine.id, paths, dir, rawPath };
  }

  async render(videoId: string, version: number, shotPaths: string[], edl: EditDecisionList, productName: string, palette: BrandPalette) {
    const engine = this.c.integrations.renderer();
    this.use('video.render', `v${version} via ${engine.id}`);
    const out = await engine.render({ videoId, version, shotPaths, edl, productName, palette, outDir: this.c.videos.dirFor(videoId) });
    return { engine: engine.id, ...out };
  }

  async probe(file: string) {
    this.use('media.probe', path.basename(file));
    return this.c.integrations.ffmpeg.probe(file);
  }

  recordQA(videoId: string, review: QAReview) {
    this.use('video.review', `${review.verdict} ${review.score}`);
    this.c.videos.addQA(videoId, review);
  }

  async storeSnapshot(url: string) {
    this.use('store.read', url);
    return this.c.integrations.pageSnapshot.snapshot(url);
  }

  createFinding(input: Parameters<Company['findings']['create']>[0]) {
    this.use('store.finding.create', input.category);
    return this.c.findings.create(input);
  }

  classifyFinding(id: string, risk: FindingRisk, rationale: string, status: FindingStatus) {
    this.use('store.finding.classify', `${id} ${risk}`);
    this.c.findings.classify(id, risk, rationale, status, this.agentId);
  }

  requestApproval(input: Omit<Parameters<Company['approvals']['request']>[0], 'requestedBy'>): Approval {
    this.use('approval.request', input.title);
    return this.c.approvals.request({ ...input, requestedBy: this.agentId });
  }

  internalMetrics() {
    this.use('analytics.read', 'internal-metrics');
    return this.c.reports.internalMetrics();
  }

  createObjective(input: Parameters<Company['campaigns']['createObjective']>[0]) {
    this.use('objective.create', input.title);
    return this.c.campaigns.createObjective(input);
  }

  launch(type: Parameters<Company['workflows']['start']>[0], opts: Omit<Parameters<Company['workflows']['start']>[1], 'createdBy'>) {
    this.use('workflow.launch', type);
    return this.c.workflows.start(type, { ...opts, createdBy: this.agentId });
  }
}

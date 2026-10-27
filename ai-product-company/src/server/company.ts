import type { AppConfig } from './config.js';
import { Database } from './db.js';
import { EventBus } from './core/events.js';
import { ActivityLog, type ActivityEntry } from './core/activity.js';
import { SettingsService } from './core/settings.js';
import { errorMessage, IntegrationRequiredError } from './core/errors.js';
import { AuthService } from './auth/auth.js';
import { ProductService } from './products/productService.js';
import { MemoryService } from './memory/memoryService.js';
import { AgentStateService } from './agents/agentState.js';
import { AGENTS, getAgent } from './agents/definitions.js';
import { PermissionChecker } from './permissions/permissions.js';
import { MessageBus } from './comms/messageBus.js';
import { ChatService } from './comms/chatService.js';
import { TaskEngine } from './tasks/taskEngine.js';
import { Scheduler } from './tasks/scheduler.js';
import { WorkflowEngine } from './workflows/workflowEngine.js';
import { ownerRevision } from './workflows/definitions.js';
import { VideoService } from './videos/videoService.js';
import { ApprovalService } from './approvals/approvalService.js';
import { FindingService } from './store/findingService.js';
import { CampaignService } from './campaigns/campaignService.js';
import { ReportService } from './reports/reportService.js';
import { DeliveryService } from './deliveries/deliveryService.js';
import { AnthropicProvider, LlmGateway, type LlmProvider } from './llm/provider.js';
import { IntegrationRegistry } from './integrations/registry.js';

/**
 * The company: one object that wires every subsystem together.
 * Created once by the server (and once per test with an isolated database).
 */
export class Company {
  readonly db: Database;
  readonly events: EventBus;
  readonly activity: ActivityLog;
  readonly settings: SettingsService;
  readonly auth: AuthService;
  readonly products: ProductService;
  readonly memory: MemoryService;
  readonly agentState: AgentStateService;
  readonly permissions: PermissionChecker;
  readonly messages: MessageBus;
  readonly chat: ChatService;
  readonly tasks: TaskEngine;
  readonly workflows: WorkflowEngine;
  readonly scheduler: Scheduler;
  readonly videos: VideoService;
  readonly approvals: ApprovalService;
  readonly findings: FindingService;
  readonly campaigns: CampaignService;
  readonly reports: ReportService;
  readonly deliveries: DeliveryService;
  readonly llm: LlmGateway;
  readonly integrations: IntegrationRegistry;
  private activityListeners = new Set<(e: ActivityEntry) => void>();

  constructor(readonly cfg: AppConfig, opts: { llmProvider?: LlmProvider } = {}) {
    this.db = new Database(cfg.dbFile);
    this.events = new EventBus(this.db);
    this.activity = new ActivityLog(this.db, (e) => this.activityListeners.forEach((l) => l(e)));
    this.settings = new SettingsService(this.db);
    this.auth = new AuthService(this.db);
    this.products = new ProductService(this.db, this.events, cfg.mediaDir);
    this.memory = new MemoryService(this.db, this.events);
    this.agentState = new AgentStateService(this.db, this.events);
    this.permissions = new PermissionChecker(
      (id) => (id === 'OWNER' ? [] : getAgent(id).grants),
      (agentId, grant, why) => {
        this.activity.record({ agentId, kind: 'error', action: `PERMISSION DENIED ${grant}`, error: why });
        this.events.emit('PERMISSION_DENIED', { agentId, grant, why });
      },
    );
    this.messages = new MessageBus(this.db, this.events, this.activity);
    this.tasks = new TaskEngine(this.db, this.events, this.activity);
    this.videos = new VideoService(this.db, this.events, cfg.mediaDir);
    this.approvals = new ApprovalService(this.db, this.events, this.activity);
    this.findings = new FindingService(this.db, this.events);
    this.campaigns = new CampaignService(this.db, this.events);
    this.llm = new LlmGateway(opts.llmProvider ?? new AnthropicProvider(cfg.anthropicApiKey, cfg.llmModel), this.db, () => this.settings.get().maxLlmCallsPerDay);
    this.reports = new ReportService(this.db, this.events, this.llm);
    this.deliveries = new DeliveryService(this.db, this.videos, this.products, this.campaigns);
    this.integrations = new IntegrationRegistry(cfg, this.llm);
    this.workflows = new WorkflowEngine(this.db, this);
    this.chat = new ChatService(this.db, this);
    this.scheduler = new Scheduler(this);
    this.registerAutomations();
  }

  onActivity(l: (e: ActivityEntry) => void) {
    this.activityListeners.add(l);
    return () => this.activityListeners.delete(l);
  }

  /** Event-driven automations and owner-decision handlers. */
  private registerAutomations() {
    // PRODUCT CONTEXT PROPAGATION — every agent is told the moment the active product changes.
    this.events.on('PRODUCT_ACTIVATED', (e) => {
      const name = String(e.payload.name);
      for (const a of AGENTS) {
        if (a.id === 'ATLAS') continue;
        this.messages.send({ from: 'ATLAS', to: a.id, kind: 'broadcast', content: `Nuevo PRODUCTO ACTIVO: ${name}. Trabajad con su contexto desde ahora.` });
      }
      this.memory.write('ATLAS', { scope: 'global', scopeId: 'company', kind: 'decision', title: `Producto activo: ${name}`, content: `El propietario activó "${name}" como producto principal de la empresa.`, importance: 5 });
    });

    // Owner decisions in the Approval Center.
    this.approvals.onResolve('store_change', async (a, d) => {
      const findingId = String(a.payload.findingId);
      if (d.decision === 'APPROVE') {
        this.findings.setStatus(findingId, 'APPROVED');
        try {
          await this.integrations.shopify.applyChange();
          this.findings.setStatus(findingId, 'APPLIED');
        } catch (err) {
          const note = err instanceof IntegrationRequiredError ? 'Aprobado. Pendiente de aplicar: requiere conector de escritura de tienda (INTEGRATION_REQUIRED).' : errorMessage(err);
          this.activity.record({ agentId: 'NOAH', kind: 'action', action: `Cambio aprobado por el propietario`, result: note });
          this.messages.send({ from: 'NOAH', to: 'EVA', kind: 'review', content: `El propietario aprobó: ${a.title}. ${note}` });
        }
      } else if (d.decision === 'REJECT') {
        this.findings.setStatus(findingId, 'REJECTED');
        this.messages.send({ from: 'NOAH', to: 'EVA', kind: 'review', content: `El propietario rechazó: ${a.title}${d.note ? ` — ${d.note}` : ''}` });
      } else {
        this.findings.setStatus(findingId, 'CHANGES_REQUESTED');
        this.messages.send({ from: 'NOAH', to: 'EVA', kind: 'review', content: `El propietario pide cambios en: ${a.title} — ${d.note}` });
        this.memory.write('NOAH', { scope: 'agent', scopeId: 'EVA', kind: 'feedback', title: 'Cambios pedidos por el propietario', content: `${a.title}: ${d.note}`, importance: 4 });
      }
    });

    this.approvals.onResolve('video_max_revisions', (a, d) => {
      const videoId = String(a.payload.videoId);
      const runId = String(a.payload.runId);
      const run = this.workflows.get(runId);
      if (d.decision === 'APPROVE') {
        this.videos.setStatus(videoId, 'APPROVED', 'OWNER', 'Aprobado por el propietario tras máximo de revisiones');
        this.workflows.patch(runId, { status: 'RUNNING' });
        const lastQa = this.tasks.latestCompletedStep(runId, 'luna_qa');
        this.workflows.api.createStepTask(this.workflows.get(runId), 'alex_deliver', { dependsOn: lastQa ? [lastQa.id] : [], createdBy: 'OWNER', input: { ownerOverride: true } });
      } else if (d.decision === 'REJECT') {
        this.videos.setStatus(videoId, 'REJECTED', 'OWNER', d.note || 'Descartado por el propietario');
        this.workflows.finish(run.id, 'COMPLETED', null, 'Vídeo descartado por el propietario');
      } else {
        ownerRevision(this.workflows.api, runId, d.target ?? 'MAX', d.note || 'Revisión pedida por el propietario');
      }
    });

    this.approvals.onResolve('strategic_objective', (a, d) => {
      const objective = this.campaigns.getObjective(String(a.payload.objectiveId));
      if (!objective) return;
      const parentId = String(a.payload.strategyRunId);
      const parent = this.workflows.get(parentId);
      if (d.decision === 'APPROVE') {
        this.campaigns.setObjectiveStatus(objective.id, 'IN_PROGRESS');
        const open = ['RUNNING', 'WAITING_APPROVAL'].includes(parent.status);
        const child = this.workflows.start(objective.workflow, {
          title: objective.title,
          productId: objective.productId,
          campaignId: objective.campaignId,
          objectiveId: objective.id,
          parentRunId: open ? parentId : null,
          priority: objective.priority,
          createdBy: 'ALEX',
          context: { brief: objective.rationale },
        });
        if (open) this.workflows.patch(parentId, { status: 'RUNNING', context: { childRunIds: [...((parent.context.childRunIds as string[]) ?? []), child.id] } });
      } else {
        this.campaigns.setObjectiveStatus(objective.id, 'REJECTED');
        const stillPending = this.approvals.list('PENDING').some((x) => x.payload.strategyRunId === parentId);
        const children = this.workflows.list({ parentRunId: parentId });
        if (parent.status === 'WAITING_APPROVAL' && !stillPending && !children.length) this.workflows.finish(parentId, 'COMPLETED', null, 'Objetivos rechazados por el propietario');
      }
    });
  }

  /** Owner "REQUEST REVISION" from the Delivery Center. */
  requestVideoRevision(videoId: string, target: 'NEO' | 'REX' | 'MAX', note: string) {
    const v = this.videos.get(videoId);
    return ownerRevision(this.workflows.api, v.workflowRunId, target, note);
  }

  /** Owner manual retry of a FAILED / BLOCKED task. */
  retryTask(taskId: string) {
    const t = this.tasks.get(taskId);
    if (t.workflowRunId) this.workflows.reopen(t.workflowRunId);
    if (t.workflowRunId) {
      const run = this.workflows.get(t.workflowRunId);
      if (run.context.videoId && ['FAILED'].includes(this.videos.get(String(run.context.videoId)).status)) {
        this.videos.setStatus(String(run.context.videoId), 'EDITING', 'OWNER', 'Reintento manual');
      }
    }
    // Dependencies that failed are retried first.
    for (const dep of t.dependsOn) {
      const d = this.tasks.get(dep);
      if (d.status === 'FAILED' || d.status === 'BLOCKED') this.retryTask(dep);
    }
    if (t.status === 'FAILED' || t.status === 'BLOCKED') {
      this.tasks.transition(t.id, 'PENDING', { attempts: 0, error: null, nextAttemptAt: null }, 'manual retry by owner');
      this.activity.record({ agentId: null, kind: 'owner', action: `Propietario reintenta "${t.title}"`, taskId: t.id });
    }
    return this.tasks.get(t.id);
  }

  close() {
    this.scheduler.stop();
    this.db.close();
  }
}

import type { WorkflowType } from '../campaigns/campaignService.js';
import type { Task } from '../tasks/taskEngine.js';
import type { WorkflowApi, WorkflowDefinition, WorkflowRun } from './workflowEngine.js';

/* ───────────────────────────── STRATEGY ─────────────────────────────
 * OWNER goal → ATLAS strategy → ALEX plan → specialist workflows → ATLAS review
 */
const strategy: WorkflowDefinition = {
  type: 'strategy',
  title: 'Estrategia ATLAS',
  description: 'ATLAS analiza el objetivo y el producto, define objetivos; ALEX los convierte en workflows; ATLAS revisa los resultados e informa.',
  requiresProduct: true,
  steps: [
    { key: 'atlas_strategy', agent: 'ATLAS', label: 'Estrategia', taskType: 'atlas.strategy', deadlineHours: 1 },
    { key: 'alex_plan', agent: 'ALEX', label: 'Plan operativo', taskType: 'alex.plan', deadlineHours: 1 },
    { key: 'atlas_review', agent: 'ATLAS', label: 'Revisión de resultados', taskType: 'atlas.results_review', deadlineHours: 2 },
  ],
  start(api, run) {
    api.createStepTask(run, 'atlas_strategy', { input: { goal: run.context.goal ?? run.title }, createdBy: String(run.context.createdBy ?? 'OWNER') });
  },
  onTaskCompleted(api, run, task) {
    if (task.stepKey === 'atlas_strategy') {
      const launchable = (task.result?.data as { launchableObjectiveIds?: string[] } | undefined)?.launchableObjectiveIds ?? [];
      const pendingApproval = (task.result?.data as { pendingApprovalIds?: string[] } | undefined)?.pendingApprovalIds ?? [];
      api.update(run, { context: { objectiveIds: launchable, pendingApprovalIds: pendingApproval } });
      if (!launchable.length) {
        if (pendingApproval.length) api.update(run, { status: 'WAITING_APPROVAL' });
        else api.complete(run, 'ATLAS no ha lanzado nuevos objetivos.');
        return;
      }
      api.createStepTask(run, 'alex_plan', { input: { objectiveIds: launchable }, dependsOn: [task.id], createdBy: 'ATLAS' });
    } else if (task.stepKey === 'alex_plan') {
      const launched = (task.result?.data as { launchedRunIds?: string[] } | undefined)?.launchedRunIds ?? [];
      api.update(run, { context: { childRunIds: launched } });
      if (!launched.length) api.complete(run, 'ALEX no ha lanzado workflows.');
      else maybeReview(api, api.c.workflows.get(run.id));
    } else if (task.stepKey === 'atlas_review') {
      api.complete(run, String(task.result?.summary ?? 'Revisión completada'));
    }
  },
  onChildFinished(api, run) {
    maybeReview(api, run);
  },
};

function maybeReview(api: WorkflowApi, run: WorkflowRun) {
  if (run.context.reviewTaskId) return;
  const children = api.c.workflows.list({ parentRunId: run.id, limit: 500 });
  const expected = (run.context.childRunIds as string[] | undefined)?.length ?? 0;
  if (children.length < expected || !children.length) return;
  if (children.some((c) => c.status === 'RUNNING' || c.status === 'WAITING_APPROVAL')) return;
  const t = api.createStepTask(run, 'atlas_review', { input: { childRunIds: children.map((c) => c.id) }, createdBy: 'ALEX' });
  api.update(run, { status: 'RUNNING', context: { reviewTaskId: t.id } });
}

/* ─────────────────────────── VIDEO PIPELINE ───────────────────────────
 * NOVA → NEO → REX → MAX → LUNA → (ALEX delivery | revision loop | owner)
 */
const VIDEO_STEP_OF: Record<string, string> = { NEO: 'neo_blueprint', REX: 'rex_produce', MAX: 'max_edit' };

const videoPipeline: WorkflowDefinition = {
  type: 'video_pipeline',
  title: 'Video Pipeline',
  description: 'Hooks → blueprint → producción → edición → QA → Delivery Center, con bucle de revisión limitado.',
  requiresProduct: true,
  steps: [
    { key: 'nova_hooks', agent: 'NOVA', label: 'Hooks', taskType: 'nova.hooks', deadlineHours: 2 },
    { key: 'neo_blueprint', agent: 'NEO', label: 'Video Blueprint', taskType: 'neo.blueprint', deadlineHours: 2 },
    { key: 'rex_produce', agent: 'REX', label: 'Producción (raw)', taskType: 'rex.produce', deadlineHours: 4 },
    { key: 'max_edit', agent: 'MAX', label: 'Edición (final)', taskType: 'max.edit', deadlineHours: 3 },
    { key: 'luna_qa', agent: 'LUNA', label: 'QA', taskType: 'luna.qa', deadlineHours: 1 },
    { key: 'alex_deliver', agent: 'ALEX', label: 'Entrega', taskType: 'alex.deliver', deadlineHours: 1 },
  ],
  start(api, run) {
    const createdBy = String(run.context.createdBy ?? 'ALEX');
    const video = api.c.videos.create({
      workflowRunId: run.id,
      productId: run.productId!,
      campaignId: run.campaignId,
      title: run.title,
      createdBy,
    });
    api.update(run, { context: { videoId: video.id } });
    const fresh = api.c.workflows.get(run.id);
    const t = api.createStepTask(fresh, 'nova_hooks', { input: { brief: run.context.brief ?? null, angle: run.context.angle ?? null }, createdBy });
    api.c.messages.send({ from: 'ALEX', to: 'NOVA', kind: 'request', content: `Nuevo encargo de vídeo: "${run.title}". Empieza por los hooks.`, taskId: t.id, workflowRunId: run.id });
  },
  onTaskCompleted(api, run, task) {
    const videoId = String(run.context.videoId);
    const next = (key: string) => api.createStepTask(run, key, { dependsOn: [task.id] });
    switch (task.stepKey) {
      case 'nova_hooks':
        return void next('neo_blueprint');
      case 'neo_blueprint':
        return void next('rex_produce');
      case 'rex_produce':
        return void next('max_edit');
      case 'max_edit':
        return void next('luna_qa');
      case 'luna_qa':
        return handleQA(api, run, task, videoId);
      case 'alex_deliver':
        api.c.videos.setStatus(videoId, 'DELIVERED', 'ALEX', 'Entregado en Delivery Center');
        return void api.complete(run, `Vídeo entregado (score ${api.c.videos.get(videoId).score ?? '—'})`);
    }
  },
};

function handleQA(api: WorkflowApi, run: WorkflowRun, task: Task, videoId: string) {
  const data = (task.result?.data ?? {}) as { verdict?: string; routeTo?: string; score?: number; feedback?: string[] };
  if (data.verdict === 'APPROVED') {
    api.c.videos.setStatus(videoId, 'APPROVED', 'LUNA', `Score ${data.score}`);
    api.createStepTask(run, 'alex_deliver', { dependsOn: [task.id], createdBy: 'LUNA' });
    return;
  }
  if (data.verdict === 'REJECTED') {
    api.c.videos.setStatus(videoId, 'REJECTED', 'LUNA', `Rechazado (score ${data.score})`);
    api.complete(run, `Vídeo rechazado por LUNA (score ${data.score}).`);
    return;
  }
  const cycle = run.cycle + 1;
  const max = api.c.settings.get().maxRevisionCycles;
  if (cycle > max) {
    api.c.videos.setStatus(videoId, 'AWAITING_OWNER', 'LUNA', `Máximo de ${max} revisiones alcanzado`);
    api.update(run, { status: 'WAITING_APPROVAL' });
    api.c.messages.send({ from: 'ALEX', to: 'ATLAS', kind: 'escalation', content: `Vídeo "${run.title}" alcanzó el máximo de ${max} ciclos de revisión (score ${data.score}). Escalado al propietario.`, workflowRunId: run.id });
    api.c.approvals.request({
      kind: 'video_max_revisions',
      title: `Decidir sobre el vídeo "${run.title}" (máx. revisiones)`,
      description: `LUNA ha pedido revisión ${cycle} veces. Último score: ${data.score}/100. Aprobar = aceptar la versión actual y entregarla. Rechazar = descartar. Pedir cambios = un ciclo más con tus instrucciones.`,
      risk: 'MEDIUM',
      payload: { videoId, runId: run.id, lastScore: data.score, feedback: data.feedback ?? [] },
      requestedBy: 'ALEX',
      relatedType: 'video',
      relatedId: videoId,
    });
    return;
  }
  const target = data.routeTo && VIDEO_STEP_OF[data.routeTo] ? data.routeTo : 'MAX';
  api.update(run, { cycle });
  api.c.videos.patch(videoId, { revisions: cycle });
  api.c.videos.setStatus(videoId, 'REVISION', 'LUNA', `Revisión ${cycle} → ${target}`);
  api.createStepTask(api.c.workflows.get(run.id), VIDEO_STEP_OF[target], { dependsOn: [task.id], input: { feedback: data.feedback ?? [], feedbackFrom: 'LUNA' }, createdBy: 'LUNA' });
}

/** Owner-driven revision (Delivery Center "REQUEST REVISION" or approval "request changes"). */
export function ownerRevision(api: WorkflowApi, runId: string, target: 'NEO' | 'REX' | 'MAX', note: string) {
  const run = api.c.workflows.get(runId);
  const cycle = run.cycle + 1;
  api.c.workflows.reopen(runId);
  api.update(run, { cycle, status: 'RUNNING' });
  const videoId = String(run.context.videoId);
  api.c.videos.patch(videoId, { revisions: cycle });
  api.c.videos.setStatus(videoId, 'REVISION', 'OWNER', `Revisión solicitada por el propietario → ${target}: ${note}`);
  const t = api.createStepTask(api.c.workflows.get(runId), VIDEO_STEP_OF[target], {
    input: { feedback: [`[PROPIETARIO] ${note}`], feedbackFrom: 'OWNER' },
    createdBy: 'OWNER',
    priority: 'high',
  });
  api.c.messages.send({ from: 'ALEX', to: target, kind: 'request', content: `El propietario pide una revisión: ${note}`, taskId: t.id, workflowRunId: runId });
  return t;
}

/* ─────────────────────────── STORE AUDIT ─────────────────────────── */
const storeAudit: WorkflowDefinition = {
  type: 'store_audit',
  title: 'Store Audit',
  description: 'EVA audita la tienda con el producto activo; NOAH valida y clasifica el riesgo; HIGH RISK → propietario.',
  requiresProduct: true,
  steps: [
    { key: 'eva_audit', agent: 'EVA', label: 'Auditoría CRO', taskType: 'eva.store_audit', deadlineHours: 4 },
    { key: 'noah_review', agent: 'NOAH', label: 'Revisión de riesgo', taskType: 'noah.store_review', deadlineHours: 2 },
  ],
  start(api, run) {
    const t = api.createStepTask(run, 'eva_audit', { createdBy: String(run.context.createdBy ?? 'ALEX') });
    api.c.messages.send({ from: 'ALEX', to: 'EVA', kind: 'request', content: 'Audita la página de producto con el producto activo.', taskId: t.id, workflowRunId: run.id });
  },
  onTaskCompleted(api, run, task) {
    if (task.stepKey === 'eva_audit') api.createStepTask(run, 'noah_review', { dependsOn: [task.id], createdBy: 'EVA' });
    else if (task.stepKey === 'noah_review') {
      const s = String(task.result?.summary ?? 'Auditoría revisada');
      api.c.messages.send({ from: 'ALEX', to: 'ATLAS', kind: 'report', content: `Auditoría de tienda completada. ${s}`, workflowRunId: run.id });
      api.complete(run, s);
    }
  },
};

/* ───────────────────────── ANALYTICS REVIEW ───────────────────────── */
const analyticsReview: WorkflowDefinition = {
  type: 'analytics_review',
  title: 'Performance Review',
  description: 'IRIS analiza rendimiento con datos reales (internos y conectores) y propone acciones.',
  requiresProduct: false,
  steps: [{ key: 'iris_analysis', agent: 'IRIS', label: 'Análisis de rendimiento', taskType: 'iris.analytics', deadlineHours: 4 }],
  start(api, run) {
    api.createStepTask(run, 'iris_analysis', { createdBy: String(run.context.createdBy ?? 'ALEX') });
  },
  onTaskCompleted(api, run, task) {
    const s = String(task.result?.summary ?? 'Análisis completado');
    api.c.messages.send({ from: 'IRIS', to: 'ALEX', kind: 'report', content: s, workflowRunId: run.id, taskId: task.id });
    api.c.messages.send({ from: 'ALEX', to: 'ATLAS', kind: 'report', content: `Análisis de IRIS disponible: ${s}`, workflowRunId: run.id });
    api.complete(run, s);
  },
};

/* ─────────────────────────── DAILY REPORT ─────────────────────────── */
const dailyReport: WorkflowDefinition = {
  type: 'daily_report',
  title: 'Daily Company Report',
  description: 'ATLAS genera el informe diario a partir de los hechos registrados.',
  requiresProduct: false,
  steps: [{ key: 'atlas_report', agent: 'ATLAS', label: 'Informe diario', taskType: 'atlas.daily_report', deadlineHours: 1 }],
  start(api, run) {
    api.createStepTask(run, 'atlas_report', { input: { date: run.context.date }, createdBy: String(run.context.createdBy ?? 'SYSTEM'), priority: 'high' });
  },
  onTaskCompleted(api, run, task) {
    api.complete(run, String(task.result?.summary ?? 'Informe generado'));
  },
};

export const WORKFLOWS: Record<WorkflowType, WorkflowDefinition> = {
  strategy,
  video_pipeline: videoPipeline,
  store_audit: storeAudit,
  analytics_review: analyticsReview,
  daily_report: dailyReport,
};

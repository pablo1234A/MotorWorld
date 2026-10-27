import fs from 'node:fs';
import { z } from 'zod';
import { defineTaskType, feedbackBlock, json, videoIdOf, type TaskContext } from './base.js';
import type { Objective } from '../../campaigns/campaignService.js';

const WF = z.enum(['video_pipeline', 'store_audit', 'analytics_review']);
const PRIORITY = z.enum(['critical', 'high', 'normal', 'low']);

export const PlanSchema = z.object({
  assignments: z.array(z.object({ agent: z.enum(['NOVA', 'NEO', 'REX', 'MAX', 'LUNA', 'EVA', 'NOAH', 'IRIS']), deliverable: z.string(), why: z.string() })),
  workflows: z.array(z.object({ objectiveId: z.string(), type: WF, title: z.string(), angle: z.string(), brief: z.string(), priority: PRIORITY })),
  risks: z.array(z.string()),
  messageToAtlas: z.string(),
});
type Plan = z.infer<typeof PlanSchema>;

const MAX_LAUNCH = 6;
const MAX_ACTIVE_VIDEO = 3;

function objectivesOf(ctx: TaskContext): Objective[] {
  const ids = (ctx.task.input.objectiveIds as string[] | undefined) ?? [];
  return ids.map((id) => ctx.c.campaigns.getObjective(id)).filter((o): o is Objective => o !== null);
}

const STANDARD: Record<z.infer<typeof WF>, Plan['assignments']> = {
  video_pipeline: [
    { agent: 'NOVA', deliverable: 'crear hooks', why: 'el primer segundo decide la retención' },
    { agent: 'NEO', deliverable: 'crear conceptos y blueprint', why: 'convertir el hook en historia' },
    { agent: 'REX', deliverable: 'producir vídeos', why: 'dirección y producción de planos' },
    { agent: 'MAX', deliverable: 'editar', why: 'ritmo, subtítulos y CTA' },
    { agent: 'LUNA', deliverable: 'revisar', why: 'nada mediocre sale de la empresa' },
  ],
  store_audit: [
    { agent: 'EVA', deliverable: 'revisar la página de producto', why: 'eliminar fricción de conversión' },
    { agent: 'NOAH', deliverable: 'clasificar el riesgo de los cambios', why: 'ningún cambio peligroso sin aprobación' },
  ],
  analytics_review: [{ agent: 'IRIS', deliverable: 'analizar rendimiento con datos reales', why: 'decidir con datos, no con intuición' }],
};

function localPlan(ctx: TaskContext): Plan {
  const objectives = objectivesOf(ctx);
  const workflows: Plan['workflows'] = [];
  for (const o of objectives) {
    const qty = Math.max(1, Math.min(3, Number(o.params.quantity ?? 1)));
    const angles = (o.params.angles as string[] | undefined) ?? [String(o.params.angle ?? '')];
    for (let i = 0; i < (o.workflow === 'video_pipeline' ? qty : 1); i++) {
      const angle = angles[i % angles.length] ?? '';
      workflows.push({
        objectiveId: o.id,
        type: o.workflow as z.infer<typeof WF>,
        title: o.workflow === 'video_pipeline' ? `${o.title}${qty > 1 ? ` #${i + 1}` : ''}` : o.title,
        angle,
        brief: o.rationale,
        priority: o.priority,
      });
    }
  }
  const seen = new Set<string>();
  const assignments = workflows.flatMap((w) => STANDARD[w.type]).filter((a) => (seen.has(a.agent) ? false : (seen.add(a.agent), true)));
  return {
    assignments,
    workflows,
    risks: [
      ...(ctx.product && !ctx.product.images.length ? ['Sin imágenes del producto: los vídeos usarán una animática sin foto real.'] : []),
      ...(ctx.product && !ctx.product.storeUrl ? ['Sin URL de tienda: EVA auditará solo sobre el perfil del producto.'] : []),
    ],
    messageToAtlas: `Plan listo: ${workflows.length} workflow(s).`,
  };
}

export const alexPlan = defineTaskType({
  type: 'alex.plan',
  agent: 'ALEX',
  label: 'Plan operativo',
  description: 'Convertir los objetivos de ATLAS en workstreams con responsable, prioridad y dependencias, y lanzarlos.',
  skills: ['operations-planning', 'data-integrity'],
  reviewer: 'ATLAS',
  requiresProduct: true,
  schema: PlanSchema,
  instructions(ctx) {
    const active = ctx.c.workflows.list({ status: 'RUNNING', type: 'video_pipeline' }).length;
    return `ATLAS te envía estos objetivos. Conviértelos en un plan operativo y en workflows concretos.

# OBJETIVOS DE ATLAS
${json(objectivesOf(ctx).map((o) => ({ id: o.id, title: o.title, rationale: o.rationale, workflow: o.workflow, priority: o.priority, params: o.params })))}

# CAPACIDAD
- Pipelines de vídeo activos ahora: ${active} (máximo simultáneo ${MAX_ACTIVE_VIDEO}). Máximo ${MAX_LAUNCH} workflows por plan.
- Workflows disponibles: video_pipeline (NOVA→NEO→REX→MAX→LUNA), store_audit (EVA→NOAH), analytics_review (IRIS).

Requisitos:
- "workflows": un elemento por workflow a lanzar, con el "objectiveId" exacto. Para objetivos de vídeo con quantity > 1, un workflow por vídeo con ángulos distintos.
- "assignments": quién hace qué y por qué (formato "Para conseguir este objetivo necesito: NOVA → crear hooks…").
- "risks": riesgos reales (datos que faltan, capacidad, dependencias).
${feedbackBlock(ctx)}`;
  },
  local: localPlan,
  gate(out, ctx) {
    const ids = new Set(objectivesOf(ctx).map((o) => o.id));
    const issues: string[] = [];
    if (!out.workflows.length) issues.push('El plan no lanza ningún workflow.');
    for (const w of out.workflows) if (!ids.has(w.objectiveId)) issues.push(`Workflow "${w.title}" referencia un objetivo inexistente (${w.objectiveId}).`);
    return issues;
  },
  async apply(ctx, out) {
    const run = ctx.run!;
    const launched: string[] = [];
    const skipped: string[] = [];
    let activeVideo = ctx.c.workflows.list({ status: 'RUNNING', type: 'video_pipeline' }).length;
    for (const w of out.workflows.slice(0, MAX_LAUNCH)) {
      if (w.type === 'video_pipeline' && activeVideo >= MAX_ACTIVE_VIDEO) {
        skipped.push(`${w.title} (capacidad de vídeo completa)`);
        continue;
      }
      const child = ctx.tools.launch(w.type, {
        title: w.title,
        productId: run.productId,
        campaignId: run.campaignId,
        objectiveId: w.objectiveId,
        parentRunId: run.id,
        priority: w.priority,
        context: { angle: w.angle, brief: w.brief },
      });
      ctx.c.campaigns.setObjectiveStatus(w.objectiveId, 'IN_PROGRESS');
      launched.push(child.id);
      if (w.type === 'video_pipeline') activeVideo++;
    }
    const lines = out.assignments.map((a, i) => `${i + 1}. ${a.agent} → ${a.deliverable}`).join('\n');
    ctx.tools.send('ATLAS', `Para conseguir este objetivo necesito:\n${lines}\n${out.messageToAtlas}${skipped.length ? `\nAplazado por capacidad: ${skipped.join(', ')}` : ''}`, 'report');
    ctx.tools.remember({ scope: 'campaign', scopeId: run.campaignId ?? 'none', kind: 'decision', title: 'Plan operativo de ALEX', content: `${launched.length} workflow(s) lanzados. Riesgos: ${out.risks.join(' | ') || 'ninguno identificado'}`, importance: 3 });
    return { summary: `Plan: ${launched.length} workflow(s) lanzados${skipped.length ? `, ${skipped.length} aplazados por capacidad` : ''}.`, data: { launchedRunIds: launched, skipped } };
  },
});

export const DeliverSchema = z.object({
  checks: z.array(z.object({ check: z.string(), passed: z.boolean(), detail: z.string() })),
  deliveryNote: z.string(),
});

export const alexDeliver = defineTaskType({
  type: 'alex.deliver',
  agent: 'ALEX',
  label: 'Entrega',
  description: 'Verificar el paquete final (vídeo, póster, QA aprobado, trazabilidad) y entregarlo en el Delivery Center.',
  skills: ['operations-planning'],
  reviewer: null,
  requiresProduct: true,
  deterministic: true,
  workingStatus: 'REVIEWING',
  schema: DeliverSchema,
  instructions: () => '',
  local(ctx) {
    const v = ctx.c.videos.get(videoIdOf(ctx));
    const final = v.finalAsset ? ctx.c.videos.getAsset(v.finalAsset) : null;
    const poster = v.posterAsset ? ctx.c.videos.getAsset(v.posterAsset) : null;
    const lastQA = v.qa[v.qa.length - 1];
    const checks = [
      { check: 'FINAL VIDEO existe en almacenamiento', passed: Boolean(final && fs.existsSync(final.path)), detail: final?.path.split('/').slice(-2).join('/') ?? '—' },
      { check: 'Póster para el Delivery Center', passed: Boolean(poster && fs.existsSync(poster.path)), detail: poster ? 'ok' : '—' },
      {
        check: 'QA aprobado por LUNA (o aprobación explícita del propietario)',
        passed: lastQA?.verdict === 'APPROVED' || ctx.task.input.ownerOverride === true,
        detail: lastQA ? `${lastQA.verdict} ${lastQA.score}${ctx.task.input.ownerOverride ? ' · aprobado por el propietario' : ''}` : 'sin QA',
      },
      { check: 'Trazabilidad (hooks + blueprint + EDL)', passed: Boolean(v.hooks && v.blueprint && v.edit), detail: '' },
    ];
    return { checks, deliveryNote: `Entregado "${v.title}" · hook "${v.hook ?? '—'}" · score ${v.score ?? '—'}` };
  },
  async apply(ctx, out) {
    const failed = out.checks.filter((c) => !c.passed);
    if (failed.length) throw new Error(`Delivery checks failed: ${failed.map((f) => f.check).join(', ')}`);
    const videoId = videoIdOf(ctx);
    const v = ctx.c.videos.get(videoId);
    ctx.tools.remember({ scope: 'product', scopeId: v.productId, kind: 'asset', title: `Creatividad aprobada: ${v.title}`.slice(0, 200), content: `Hook "${v.hook}" · score QA ${v.score} · ${v.revisions} revisión(es)`, importance: 4 });
    ctx.tools.send('ATLAS', `Creative delivered: "${v.title}" (QA ${v.score}/100, ${v.revisions} revisión(es)). Disponible en Delivery Center.`, 'report');
    return { summary: out.deliveryNote, data: { videoId } };
  },
});

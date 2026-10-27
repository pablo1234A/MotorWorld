import { z } from 'zod';
import { defineTaskType, deriveInsights, feedbackBlock, json, type TaskContext } from './base.js';
import type { Priority } from '../../campaigns/campaignService.js';
import { localDate } from '../../core/ids.js';

const WF = z.enum(['video_pipeline', 'store_audit', 'analytics_review']);
const PRIORITY = z.enum(['critical', 'high', 'normal', 'low']);

export const StrategySchema = z.object({
  diagnosis: z.object({ summary: z.string(), knowns: z.array(z.string()), unknowns: z.array(z.string()), risks: z.array(z.string()) }),
  insights: z.object({ mainPain: z.string(), mainDesire: z.string(), mainObjection: z.string(), mainBenefit: z.string() }),
  opportunities: z.array(z.object({ title: z.string(), description: z.string(), impact: z.number(), confidence: z.number(), ease: z.number() })),
  objectives: z.array(
    z.object({
      title: z.string(),
      rationale: z.string(),
      workflow: WF,
      priority: PRIORITY,
      quantity: z.number(),
      angles: z.array(z.string()),
      successCriteria: z.string(),
      requiresOwnerApproval: z.boolean(),
    }),
  ),
  decisions: z.array(z.object({ decision: z.string(), alternatives: z.string(), why: z.string() })),
  messageToOwner: z.string(),
});
type Strategy = z.infer<typeof StrategySchema>;

function companyState(ctx: TaskContext) {
  const pid = ctx.product?.id;
  const videos = pid ? ctx.c.videos.list({ productId: pid }) : [];
  const findings = pid ? ctx.c.findings.list({ productId: pid }) : [];
  const recentAudit = ctx.c.workflows.list({ type: 'store_audit', limit: 20 }).find((r) => r.productId === pid && Date.now() - Date.parse(r.createdAt) < 7 * 86_400_000);
  return {
    activeWorkflows: ctx.c.workflows.activeCount(),
    videos: { total: videos.length, delivered: videos.filter((v) => v.status === 'DELIVERED').length, inProgress: videos.filter((v) => !['DELIVERED', 'REJECTED', 'FAILED'].includes(v.status)).length },
    storeFindings: { total: findings.length, awaitingApproval: findings.filter((f) => f.status === 'AWAITING_APPROVAL').length },
    storeAuditLast7Days: Boolean(recentAudit),
    pendingApprovals: ctx.c.approvals.pendingCount(),
    tasks: ctx.c.tasks.counts(),
  };
}

function localStrategy(ctx: TaskContext): Strategy {
  const p = ctx.product!;
  const ins = deriveInsights(p);
  const goal = String(ctx.task.input.goal ?? '').toLowerCase();
  const autopilot = ctx.task.input.autopilot === true;
  const st = companyState(ctx);
  const per = ctx.settings.defaultVideosPerObjective;
  const objectives: Strategy['objectives'] = [];
  const video = (qty: number, priority: Priority, why: string) =>
    objectives.push({
      title: qty > 1 ? `Validar ${qty} ángulos creativos para ${p.name}` : `Vídeo de conversión para ${p.name}`,
      rationale: why,
      workflow: 'video_pipeline',
      priority,
      quantity: qty,
      angles: ['problem', 'desire', 'demonstration'].slice(0, qty),
      successCriteria: `Vídeo(s) aprobados por LUNA con score ≥ ${ctx.settings.qaApprovalThreshold} y entregados en Delivery Center.`,
      requiresOwnerApproval: false,
    });
  const audit = (priority: Priority) =>
    objectives.push({
      title: `Auditoría CRO de la página de ${p.name}`,
      rationale: `Responder la objeción "${ins.mainObjection}" y eliminar fricción antes de llevar tráfico.`,
      workflow: 'store_audit',
      priority,
      quantity: 1,
      angles: [],
      successCriteria: 'Hallazgos clasificados por riesgo; HIGH RISK en el Approval Center.',
      requiresOwnerApproval: false,
    });
  const analytics = () =>
    objectives.push({ title: 'Revisión de rendimiento con datos reales', rationale: 'Aprender qué hooks/conceptos funcionan mejor.', workflow: 'analytics_review', priority: 'normal', quantity: 1, angles: [], successCriteria: 'Insights con fuente y plan de medición.', requiresOwnerApproval: false });

  if (autopilot) {
    if (st.videos.delivered === 0 && st.videos.inProgress === 0) video(per, 'high', 'No hay ninguna creatividad entregada para el producto activo.');
    if (!st.storeAuditLast7Days && p.storeUrl) audit('normal');
    if (st.videos.delivered >= 2 && st.activeWorkflows === 0) analytics();
  } else {
    const wantsVideo = /v[ií]deo|creativ|contenido|hook|anuncio|ad|tiktok|reel|vender|ventas|sell/.test(goal);
    const wantsStore = /tienda|p[aá]gina|conversi[oó]n|cro|web|landing|vender|ventas|sell/.test(goal);
    const wantsData = /dato|rendimiento|analy|m[eé]trica|qu[eé] funciona/.test(goal);
    if (wantsVideo) video(/vender|ventas|sell/.test(goal) ? Math.max(2, per) : per, 'high', `Objetivo del propietario: "${ctx.task.input.goal}". El alcance creativo es la palanca con más aprendizaje sin datos previos.`);
    if (wantsStore) audit(wantsVideo ? 'normal' : 'high');
    if (wantsData || (st.videos.delivered >= 2 && /vender|ventas/.test(goal))) analytics();
    if (!objectives.length) video(per, 'normal', `Objetivo del propietario: "${ctx.task.input.goal}". Empezar por una creatividad de validación.`);
  }
  const hyp = ins.hypotheses;
  return {
    diagnosis: {
      summary: `${p.name}: ${st.videos.delivered} vídeo(s) entregados, ${st.storeFindings.total} hallazgo(s) de tienda, ${st.activeWorkflows} workflow(s) activos.`,
      knowns: [`Dolor: ${ins.mainPain}`, `Deseo: ${ins.mainDesire}`, `Objeción: ${ins.mainObjection}`, ...(p.price != null ? [`Precio ${p.price} ${p.currency}${p.marginPct != null ? `, margen ${p.marginPct}%` : ''}`] : [])],
      unknowns: [...hyp, 'Datos reales de ventas, tráfico y conversión (sin conectores).'],
      risks: [...(!p.images.length ? ['Sin imágenes del producto: los vídeos no mostrarán el producto real.'] : []), ...(!p.storeUrl ? ['Sin URL de tienda: la auditoría será solo sobre el perfil.'] : [])],
    },
    insights: { mainPain: ins.mainPain, mainDesire: ins.mainDesire, mainObjection: ins.mainObjection, mainBenefit: ins.mainBenefit },
    opportunities: objectives.map((o) => ({ title: o.title, description: o.rationale, impact: o.workflow === 'video_pipeline' ? 8 : 7, confidence: 6, ease: o.workflow === 'analytics_review' ? 8 : 6 })),
    objectives,
    decisions: objectives.length
      ? [{ decision: `Lanzar ${objectives.length} objetivo(s): ${objectives.map((o) => o.workflow).join(', ')}`, alternatives: 'Esperar a tener datos de ventas (descartado: sin conectores no llegarán solos)', why: 'Maximizar aprendizaje con la capacidad actual' }]
      : [],
    messageToOwner: objectives.length
      ? `BLUF: lanzo ${objectives.length} objetivo(s) para ${p.name}: ${objectives.map((o) => o.title).join(' · ')}. ALEX lo convierte en tareas ahora.`
      : `BLUF: revisión completada. No lanzo trabajo nuevo: ${st.activeWorkflows} workflow(s) en curso y nada urgente detectado.`,
  };
}

export const atlasStrategy = defineTaskType({
  type: 'atlas.strategy',
  agent: 'ATLAS',
  label: 'Estrategia',
  description: 'Analizar el objetivo del propietario, el producto activo y la situación real de la empresa; decidir objetivos priorizados.',
  skills: ['executive-strategy', 'product-insight-extraction', 'data-integrity'],
  reviewer: null,
  requiresProduct: true,
  schema: StrategySchema,
  instructions(ctx) {
    return `${ctx.task.input.autopilot ? 'REVISIÓN AUTÓNOMA DE LA EMPRESA (autopilot): decide si hay que lanzar trabajo nuevo. Si no hace falta, devuelve "objectives" vacío.' : `OBJETIVO DEL PROPIETARIO: "${ctx.task.input.goal}"`}

# SITUACIÓN ACTUAL DE LA EMPRESA (datos reales del sistema)
${json(companyState(ctx))}

Proceso:
1. Diagnóstico: qué sabemos (datos del producto), qué no sabemos, riesgos.
2. Insights del producto (dolor, deseo, objeción, beneficio).
3. Oportunidades puntuadas con ICE (impact/confidence/ease 1-10).
4. Objetivos (máx. 4) con workflow: video_pipeline (quantity 1-3 vídeos, "angles" distintos), store_audit o analytics_review; prioridad y criterio de éxito. requiresOwnerApproval = true solo si el objetivo implica una decisión estratégica irreversible.
5. Decisiones con alternativas descartadas.
6. "messageToOwner": BLUF en español, 2-4 frases.
No inventes datos de mercado, ventas ni competencia.
${feedbackBlock(ctx)}`;
  },
  local: localStrategy,
  async apply(ctx, out) {
    const run = ctx.run!;
    const p = ctx.product!;
    let campaignId = run.campaignId;
    if (!campaignId && out.objectives.length) {
      const goal = String(ctx.task.input.goal ?? 'Revisión autónoma');
      campaignId = ctx.c.campaigns.createCampaign({ productId: p.id, name: goal.length > 60 ? `${goal.slice(0, 57)}…` : goal, objective: goal, createdBy: 'ATLAS' }).id;
      ctx.c.workflows.patch(run.id, { campaignId });
    }
    const launchable: string[] = [];
    const pendingApprovalIds: string[] = [];
    for (const o of out.objectives.slice(0, 4)) {
      const objective = ctx.tools.createObjective({
        campaignId,
        productId: p.id,
        title: o.title,
        rationale: `${o.rationale} · Éxito: ${o.successCriteria}`,
        workflow: o.workflow,
        priority: o.priority,
        params: { quantity: Math.max(1, Math.min(3, Math.round(o.quantity))), angles: o.angles, successCriteria: o.successCriteria },
        status: o.requiresOwnerApproval ? 'AWAITING_APPROVAL' : 'PROPOSED',
        source: ctx.task.input.autopilot ? 'ATLAS_AUTOPILOT' : 'OWNER_GOAL',
      });
      if (o.requiresOwnerApproval) {
        const a = ctx.c.approvals.request({ kind: 'strategic_objective', title: `Objetivo estratégico: ${o.title}`, description: `${o.rationale}\nÉxito: ${o.successCriteria}`, risk: 'HIGH', payload: { objectiveId: objective.id, strategyRunId: run.id }, requestedBy: 'ATLAS', relatedType: 'objective', relatedId: objective.id });
        pendingApprovalIds.push(a.id);
      } else launchable.push(objective.id);
    }
    for (const d of out.decisions) {
      ctx.tools.remember({ scope: 'global', scopeId: 'company', kind: 'decision', title: d.decision.slice(0, 200), content: `Por qué: ${d.why}. Alternativas descartadas: ${d.alternatives}. Producto: ${p.name}.`, importance: 4 });
    }
    if (launchable.length) ctx.tools.send('ALEX', `Objetivos aprobados para ejecutar (${launchable.length}): ${out.objectives.filter((o) => !o.requiresOwnerApproval).map((o) => o.title).join(' · ')}`, 'request', { objectiveIds: launchable });
    if (!ctx.task.input.autopilot || out.objectives.length) ctx.c.chat.postFromAgent('ATLAS', out.messageToOwner);
    return { summary: out.messageToOwner, data: { launchableObjectiveIds: launchable, pendingApprovalIds, campaignId } };
  },
});

/* ───────────── RESULTS REVIEW ───────────── */

export const ResultsReviewSchema = z.object({
  summary: z.string(),
  wins: z.array(z.string()),
  problems: z.array(z.string()),
  nextSteps: z.array(z.string()),
  messageToOwner: z.string(),
});

function childResults(ctx: TaskContext) {
  const ids = (ctx.task.input.childRunIds as string[] | undefined) ?? [];
  return ids.map((id) => {
    const r = ctx.c.workflows.get(id);
    const video = r.context.videoId ? ctx.c.videos.get(String(r.context.videoId)) : null;
    return { title: r.title, type: r.type, status: r.status, summary: r.context.summary ?? null, error: r.error, video: video ? { status: video.status, score: video.score, hook: video.hook, revisions: video.revisions } : null };
  });
}

export const atlasResultsReview = defineTaskType({
  type: 'atlas.results_review',
  agent: 'ATLAS',
  label: 'Revisión de resultados',
  description: 'Revisar los resultados de los workflows lanzados para un objetivo e informar al propietario.',
  skills: ['company-orchestration', 'data-integrity'],
  reviewer: null,
  requiresProduct: false,
  workingStatus: 'REVIEWING',
  schema: ResultsReviewSchema,
  instructions(ctx) {
    return `Revisa los resultados de los workflows lanzados y prepara el informe para el propietario.

# RESULTADOS (datos reales)
${json(childResults(ctx))}
# APROBACIONES PENDIENTES DEL PROPIETARIO: ${ctx.c.approvals.pendingCount()}

Sé honesto con los fallos. "messageToOwner" en formato BLUF (2-5 frases), solo con hechos de los datos anteriores.
${feedbackBlock(ctx)}`;
  },
  local(ctx) {
    const res = childResults(ctx);
    const delivered = res.filter((r) => r.video?.status === 'DELIVERED');
    const failed = res.filter((r) => r.status === 'FAILED');
    const pending = ctx.c.approvals.pendingCount();
    const wins = [
      ...delivered.map((r) => `"${r.title}" entregado (QA ${r.video!.score}/100, ${r.video!.revisions} revisión(es))`),
      ...res.filter((r) => r.type !== 'video_pipeline' && r.status === 'COMPLETED').map((r) => `${r.title}: ${r.summary}`),
    ];
    const problems = [...failed.map((r) => `${r.title} falló: ${r.error}`), ...res.filter((r) => r.video && ['REJECTED', 'AWAITING_OWNER'].includes(r.video.status)).map((r) => `${r.title}: ${r.video!.status}`)];
    const nextSteps = [...(pending ? [`Resolver ${pending} aprobación(es) en el Approval Center`] : []), ...(delivered.length ? ['Revisar los vídeos en el Delivery Center'] : []), 'Conectar datos de ventas/anuncios para medir rendimiento real'];
    return {
      summary: `${res.length} workflow(s): ${delivered.length} vídeo(s) entregados, ${failed.length} fallo(s).`,
      wins,
      problems,
      nextSteps,
      messageToOwner: `BLUF: ${wins.length ? wins.slice(0, 3).map((w) => w.replace(/\.+$/, '')).join('; ') : 'sin entregas todavía'}.${problems.length ? ` Problemas: ${problems.join('; ')}.` : ''}${pending ? ` Necesito tu decisión en ${pending} aprobación(es).` : ''}`,
    };
  },
  async apply(ctx, out) {
    ctx.c.chat.postFromAgent('ATLAS', out.messageToOwner);
    ctx.tools.remember({ scope: 'global', scopeId: 'company', kind: 'insight', title: `Resultado: ${ctx.run?.title ?? 'objetivo'}`.slice(0, 200), content: `${out.summary} Próximos pasos: ${out.nextSteps.join(' | ')}`, importance: 3 });
    if (ctx.run?.campaignId) ctx.c.campaigns.setCampaignStatus(ctx.run.campaignId, 'REVIEWED');
    return { summary: out.summary };
  },
});

/* ───────────── DAILY REPORT ───────────── */

export const DailyNarrativeSchema = z.object({
  bluf: z.string(),
  importantDecisions: z.array(z.string()),
  opportunities: z.array(z.string()),
  blockers: z.array(z.string()),
  recommendations: z.array(z.string()),
  tomorrow: z.array(z.string()),
});

const factsCache = new WeakMap<TaskContext, ReturnType<TaskContext['c']['reports']['collect']>>();
const factsOf = (ctx: TaskContext) => {
  if (!factsCache.has(ctx)) factsCache.set(ctx, ctx.c.reports.collect(String(ctx.task.input.date ?? localDate())));
  return factsCache.get(ctx)!;
};

export const atlasDailyReport = defineTaskType({
  type: 'atlas.daily_report',
  agent: 'ATLAS',
  label: 'Informe diario',
  description: 'Generar el DAILY COMPANY REPORT a partir de los hechos registrados del día.',
  skills: ['company-orchestration', 'data-integrity'],
  reviewer: null,
  requiresProduct: false,
  schema: DailyNarrativeSchema,
  instructions(ctx) {
    return `Redacta la parte ejecutiva del DAILY COMPANY REPORT del ${String(ctx.task.input.date ?? localDate())}.

# HECHOS DEL DÍA (generados por el sistema; las cifras ya están calculadas, no las cambies)
${json(factsOf(ctx))}

Devuelve: BLUF (1-2 frases), decisiones importantes, oportunidades, bloqueos, recomendaciones y prioridades para mañana. Solo a partir de los hechos. Si no hubo actividad, dilo.`;
  },
  local(ctx) {
    const f = factsOf(ctx);
    return {
      bluf: f.tasks.completed || f.videos.created
        ? `${f.tasks.completed} tareas completadas, ${f.videos.approved} vídeo(s) aprobados y ${f.store.problemsFound} problema(s) de tienda detectados hoy.`
        : 'Día sin actividad registrada.',
      importantDecisions: f.decisions.slice(0, 6),
      opportunities: f.videos.approved ? ['Usar los vídeos aprobados en la página de producto y en anuncios (cuando haya conector).'] : [],
      blockers: f.blockers,
      recommendations: [
        ...(f.approvals.pending ? [`Resolver ${f.approvals.pending} aprobación(es) pendientes.`] : []),
        ...(f.errors.length ? ['Revisar los errores del día en el Activity Log.'] : []),
        'Conectar ventas/anuncios para que IRIS mida rendimiento real.',
      ],
      tomorrow: [...(f.tasks.pending ? [`Terminar ${f.tasks.pending} tarea(s) pendientes.`] : []), ...(f.videos.revision ? [`Cerrar ${f.videos.revision} vídeo(s) en revisión.`] : []), 'Revisión autónoma de ATLAS si el autopilot está activo.'],
    };
  },
  async apply(ctx, out) {
    const date = String(ctx.task.input.date ?? localDate());
    const report = ctx.c.reports.save(date, factsOf(ctx), out, ctx.engine === 'llm' ? ctx.c.llm.engineLabel : 'local-heuristic');
    ctx.c.chat.postFromAgent('ATLAS', `DAILY REPORT ${date} listo. ${out.bluf}`);
    return { summary: `Informe diario ${date} generado.`, data: { reportId: report.id } };
  },
});

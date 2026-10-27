import { z } from 'zod';
import { defineTaskType, feedbackBlock, json, type TaskContext } from './base.js';

export const AnalyticsSchema = z.object({
  dataSources: z.array(z.object({ name: z.string(), status: z.enum(['connected', 'missing']), notes: z.string() })),
  insights: z.array(z.object({ insight: z.string(), source: z.string(), confidence: z.enum(['low', 'medium', 'high']), sampleSize: z.number() })),
  problems: z.array(z.string()),
  opportunities: z.array(z.string()),
  recommendations: z.array(z.string()),
  measurementPlan: z.array(z.object({ metric: z.string(), definition: z.string(), source: z.string(), connectorRequired: z.boolean() })),
  summary: z.string(),
});
type Analytics = z.infer<typeof AnalyticsSchema>;

const metricsCache = new WeakMap<TaskContext, ReturnType<TaskContext['tools']['internalMetrics']>>();
const metricsOf = (ctx: TaskContext) => {
  if (!metricsCache.has(ctx)) metricsCache.set(ctx, ctx.tools.internalMetrics());
  return metricsCache.get(ctx)!;
};

const MEASUREMENT: Analytics['measurementPlan'] = [
  { metric: 'Hook rate', definition: 'Reproducciones de 3 s / impresiones', source: 'Plataforma de anuncios / redes', connectorRequired: true },
  { metric: 'Hold rate', definition: 'Reproducciones completas / reproducciones de 3 s', source: 'Plataforma de anuncios / redes', connectorRequired: true },
  { metric: 'CTR', definition: 'Clics / impresiones', source: 'Plataforma de anuncios', connectorRequired: true },
  { metric: 'CVR', definition: 'Pedidos / sesiones en la página de producto', source: 'Tienda / analytics web', connectorRequired: true },
  { metric: 'AOV', definition: 'Ingresos / pedidos', source: 'Tienda', connectorRequired: true },
  { metric: 'Score QA por familia de hook', definition: 'Media del score de LUNA agrupado por familia del hook seleccionado', source: 'Internal Company Metrics', connectorRequired: false },
];

function localAnalytics(ctx: TaskContext): Analytics {
  const m = metricsOf(ctx);
  const insights: Analytics['insights'] = [];
  const problems: string[] = [];
  const opportunities: string[] = [];
  if (m.videos.reviewed > 0) {
    insights.push({ insight: `Score medio de QA: ${m.videos.avgScore}/100 en ${m.videos.reviewed} vídeo(s) revisados.`, source: 'Internal Company Metrics (LUNA)', confidence: m.videos.reviewed >= 5 ? 'medium' : 'low', sampleSize: m.videos.reviewed });
    insights.push({ insight: `${m.videos.approvedFirstPass} de ${m.videos.reviewed} vídeos aprobados en el primer ciclo de QA.`, source: 'Internal Company Metrics', confidence: 'low', sampleSize: m.videos.reviewed });
    const fams = m.hooksByFamily.filter((f) => f.videos > 0).sort((a, b) => (b.avgScore ?? 0) - (a.avgScore ?? 0));
    if (fams.length >= 2) {
      insights.push({ insight: `La familia de hook "${fams[0].family}" obtiene ${fams[0].avgScore} de media frente a ${fams[fams.length - 1].avgScore} de "${fams[fams.length - 1].family}".`, source: 'Internal Company Metrics', confidence: 'low', sampleSize: fams.reduce((a, f) => a + f.videos, 0) });
      opportunities.push(`Priorizar hooks de la familia "${fams[0].family}" en el próximo lote (validar con datos reales de rendimiento cuando haya conector).`);
    }
    if (m.videos.revisionRate > 0.5) problems.push(`Tasa de revisión alta (${Math.round(m.videos.revisionRate * 100)}%): revisar el blueprint antes de producir.`);
  } else {
    problems.push('Todavía no hay vídeos revisados: no hay datos internos de calidad creativa.');
  }
  if (m.tasks.failureRate > 0.1) problems.push(`Tasa de fallo de tareas ${Math.round(m.tasks.failureRate * 100)}%: revisar errores en el Activity Log.`);
  if (m.findings.total) insights.push({ insight: `${m.findings.total} hallazgo(s) de tienda: ${m.findings.byRisk.HIGH ?? 0} HIGH, ${m.findings.byRisk.MEDIUM ?? 0} MEDIUM, ${m.findings.byRisk.LOW ?? 0} LOW.`, source: 'Internal Company Metrics (EVA/NOAH)', confidence: 'high', sampleSize: m.findings.total });
  return {
    dataSources: [
      { name: 'Internal Company Metrics', status: 'connected', notes: 'Datos reales de la empresa (QA, tareas, hallazgos).' },
      { name: 'Ventas / tienda', status: 'missing', notes: 'INTEGRATION_REQUIRED' },
      { name: 'Anuncios / redes', status: 'missing', notes: 'INTEGRATION_REQUIRED' },
      { name: 'Analytics web', status: 'missing', notes: 'INTEGRATION_REQUIRED' },
    ],
    insights,
    problems,
    opportunities: opportunities.length ? opportunities : ['Conectar ventas y anuncios para medir hook rate, CTR y CVR por creatividad.'],
    recommendations: ['No tomar decisiones de presupuesto hasta tener datos de ventas/anuncios conectados.', 'Mantener el registro de familia de hook por vídeo para cruzarlo con rendimiento real.'],
    measurementPlan: MEASUREMENT,
    summary: `Análisis con datos internos reales (${m.videos.reviewed} vídeo(s) revisados, ${m.tasks.total} tareas). Ventas, anuncios y analytics: INTEGRATION_REQUIRED — sin métricas inventadas.`,
  };
}

export const irisAnalytics = defineTaskType({
  type: 'iris.analytics',
  agent: 'IRIS',
  label: 'Análisis de rendimiento',
  description: 'Analizar rendimiento con datos reales (internos + conectores), detectar problemas y oportunidades, plan de medición.',
  skills: ['performance-analytics', 'data-integrity'],
  reviewer: 'ALEX',
  requiresProduct: false,
  schema: AnalyticsSchema,
  instructions(ctx) {
    return `Analiza el rendimiento de la empresa y del producto activo.

# DATOS DISPONIBLES (reales, del sistema)
${json(metricsOf(ctx))}

# CONECTORES
- Internal Company Metrics: conectado.
- Ventas/tienda, anuncios/redes, analytics web: NO conectados (INTEGRATION_REQUIRED).

Requisitos:
- Cada insight indica su fuente y el tamaño de muestra; con muestras pequeñas, confidence = low.
- NUNCA inventes métricas de ventas, conversión o anuncios. Lo que falte va al plan de medición.
${feedbackBlock(ctx)}`;
  },
  local: localAnalytics,
  gate(out) {
    return out.insights.some((i) => !i.source.trim()) ? ['Todos los insights deben indicar su fuente.'] : [];
  },
  async apply(ctx, out) {
    const scopeId = ctx.product?.id;
    if (scopeId) {
      ctx.tools.remember({ scope: 'product', scopeId, kind: 'insight', title: `Análisis IRIS ${new Date().toISOString().slice(0, 10)}`, content: `${out.summary} Oportunidades: ${out.opportunities.join(' | ')}`, importance: 3 });
    }
    return { summary: out.summary, data: { insights: out.insights.length, problems: out.problems, opportunities: out.opportunities } };
  },
});

import { z } from 'zod';
import { defineTaskType, feedbackBlock, json, type TaskContext } from './base.js';
import { errorMessage } from '../../core/errors.js';
import type { StorePageSnapshot } from '../../integrations/types.js';
import type { FindingRisk } from '../../store/findingService.js';

const CATEGORY = z.enum(['conversion', 'trust', 'price', 'offer', 'copy', 'images', 'cta', 'ux', 'mobile', 'checkout', 'objections', 'information', 'product', 'friction', 'clarity']);

export const AuditSchema = z.object({
  dataSource: z.enum(['page_snapshot', 'product_profile']),
  summary: z.string(),
  findings: z.array(
    z.object({
      category: CATEGORY,
      problem: z.string(),
      whyItMatters: z.string(),
      expectedImpact: z.string(),
      recommendedAction: z.string(),
      evidence: z.string(),
      priority: z.number(),
    }),
  ),
});
type Audit = z.infer<typeof AuditSchema>;

const snapshots = new WeakMap<TaskContext, { snapshot: StorePageSnapshot | null; error: string | null }>();

async function snapshotOf(ctx: TaskContext) {
  const hit = snapshots.get(ctx);
  if (hit) return hit;
  let res: { snapshot: StorePageSnapshot | null; error: string | null } = { snapshot: null, error: null };
  const url = ctx.product?.storeUrl;
  if (url) {
    try {
      res = { snapshot: await ctx.tools.storeSnapshot(url), error: null };
    } catch (err) {
      res = { snapshot: null, error: errorMessage(err) };
      ctx.c.tasks.log(ctx.task.id, 'warn', `Store page not reachable: ${res.error}`);
    }
  } else res.error = 'El producto no tiene URL de tienda configurada';
  snapshots.set(ctx, res);
  return res;
}

function localAudit(ctx: TaskContext, snap: StorePageSnapshot | null, snapError: string | null): Audit {
  const p = ctx.product!;
  const f: Audit['findings'] = [];
  const add = (category: z.infer<typeof CATEGORY>, problem: string, why: string, impact: string, action: string, evidence: string, priority: number) =>
    f.push({ category, problem, whyItMatters: why, expectedImpact: impact, recommendedAction: action, evidence, priority });

  if (snap) {
    const text = snap.textExcerpt.toLowerCase();
    if (!snap.prices.length) add('price', 'El precio no es visible en el HTML de la página', 'Un precio oculto genera desconfianza y abandono', 'Alto', 'Mostrar el precio junto al título y al CTA principal', `0 precios detectados en ${snap.url}`, 5);
    if (p.price != null && snap.prices.length && !snap.prices.some((x) => x.replace(/[^\d.,]/g, '').replace(',', '.').startsWith(String(p.price)))) {
      add('price', `El precio publicado (${snap.prices[0]}) no coincide con el del perfil (${p.price} ${p.currency})`, 'Incoherencias de precio rompen la confianza y la analítica', 'Alto', `Unificar el precio publicado con el perfil del producto (${p.price} ${p.currency}) o actualizar el perfil`, `Precios detectados: ${snap.prices.join(', ')}`, 5);
    }
    const missingTrust = ['envío gratis', 'devolución', 'garantía', 'reseñas'].filter((t) => !snap.trustSignals.includes(t));
    if (missingTrust.length >= 2) add('trust', `Faltan señales de confianza: ${missingTrust.join(', ')}`, 'La ansiedad de compra es la primera causa de abandono en producto desconocido', 'Alto', 'Añadir bajo el CTA una franja con envío, devoluciones, garantía y valoraciones reales', `Señales detectadas: ${snap.trustSignals.join(', ') || 'ninguna'}`, 4);
    if (snap.imageCount < 4) add('images', `Pocas imágenes (${snap.imageCount})`, 'El cliente no puede tocar el producto: las imágenes son la prueba', 'Medio', 'Galería mínima: hero en uso, detalle, escala, antes/después, lifestyle', `${snap.imageCount} etiquetas <img>`, 3);
    if (!snap.hasVideo) add('product', 'No hay vídeo de demostración en la página', 'La demostración resuelve la objeción "¿funciona?" mejor que el texto', 'Medio-alto', 'Insertar el vídeo aprobado del Delivery Center en la galería', 'Sin <video> ni embeds detectados', 4);
    if (!snap.ctaTexts.some((t) => /compr|añadir|carrito|cart|buy|pedir/i.test(t))) add('cta', 'No se detecta un CTA de compra claro', 'Sin una acción obvia el visitante no avanza', 'Alto', `Botón principal con texto de acción: "${p.cta || 'Añadir al carrito'}"`, `Botones: ${snap.ctaTexts.slice(0, 6).join(' | ') || 'ninguno'}`, 5);
    if (!snap.h1.length) add('clarity', 'La página no tiene un titular H1', 'El visitante debe entender qué es y para quién en 3 segundos', 'Medio', `Titular orientado a beneficio: "${p.benefits[0] ?? p.name}"`, 'Sin <h1>', 3);
    for (const o of p.objections.slice(0, 2)) {
      const key = o.toLowerCase().split(/\s+/).filter((w) => w.length > 4);
      if (!key.some((k) => text.includes(k))) add('objections', `La objeción "${o}" no se responde en la página`, 'Es una objeción documentada del cliente', 'Medio-alto', `Bloque FAQ o comparativa que responda a "${o}" cerca del CTA`, 'Palabras clave de la objeción ausentes del texto', 4);
    }
  }
  // Product-profile based findings (always available, clearly labelled).
  if (p.marginPct != null && p.marginPct < 35) add('offer', `Margen bajo (${p.marginPct}%)`, 'Limita descuentos y la inversión en adquisición', 'Medio', 'Preferir bundles o regalos de bajo coste antes que descuentos directos', `Perfil: precio ${p.price}, coste ${p.cost}`, 3);
  if (!p.cta) add('copy', 'No hay CTA definido en el perfil del producto', 'Vídeos y página deben empujar la misma acción', 'Medio', 'Definir un CTA único en Product Center (p.ej. "Pruébalo 30 días")', 'Campo CTA vacío', 2);
  if (!snap && p.objections.length) add('objections', `Objeciones documentadas sin bloque de respuesta verificable (${p.objections.length})`, 'Cada objeción no respondida es una venta perdida', 'Medio-alto', `Añadir FAQ que responda: ${p.objections.slice(0, 3).join(' / ')}`, 'Basado en perfil de producto (tienda no analizada)', 4);
  if (!p.images.length) add('images', 'No hay imágenes del producto subidas al Product Center', 'Ni los vídeos ni la auditoría pueden usar el producto real', 'Alto', 'Subir al menos 3 imágenes (hero, detalle, en uso) en Product Center', 'Perfil sin imágenes', 4);
  if (p.benefits.length < 3) add('information', 'Menos de 3 beneficios documentados', 'La página y los vídeos se quedan sin argumentos', 'Medio', 'Documentar 3-5 beneficios orientados a resultado', `${p.benefits.length} beneficio(s)`, 2);
  return {
    dataSource: snap ? 'page_snapshot' : 'product_profile',
    summary: snap
      ? `Auditoría sobre la página pública (${snap.url}) + perfil del producto: ${f.length} hallazgo(s).`
      : `Auditoría basada SOLO en el perfil del producto (${snapError ?? 'tienda no disponible'}): ${f.length} hallazgo(s).`,
    findings: f.sort((a, b) => b.priority - a.priority),
  };
}

export const evaStoreAudit = defineTaskType({
  type: 'eva.store_audit',
  agent: 'EVA',
  label: 'Auditoría CRO',
  description: 'Analizar la tienda con el producto activo y formular problemas como PROBLEM / WHY IT MATTERS / EXPECTED IMPACT / RECOMMENDED ACTION.',
  skills: ['ecommerce-cro', 'product-insight-extraction', 'data-integrity'],
  reviewer: 'NOAH',
  requiresProduct: true,
  schema: AuditSchema,
  async instructions(ctx) {
    const { snapshot, error } = await snapshotOf(ctx);
    return `Audita la conversión de la página de producto.

# DATOS OBSERVADOS DE LA TIENDA
${snapshot ? json(snapshot) : `No hay snapshot de la tienda: ${error}. Trabaja SOLO con el perfil del producto y marca dataSource = "product_profile".`}

Requisitos:
- Revisa: conversión, confianza, precio, oferta, copy, imágenes, CTA, UX, mobile, checkout, objeciones, falta de información, producto, fricción, claridad.
- Cada hallazgo: problem, whyItMatters, expectedImpact, recommendedAction (implementable tal cual), evidence (qué observaste o qué campo del perfil) y priority 1-5.
- No afirmes nada de la tienda que no esté en los datos observados. No inventes cifras de conversión.
${feedbackBlock(ctx)}`;
  },
  async local(ctx) {
    const { snapshot, error } = await snapshotOf(ctx);
    return localAudit(ctx, snapshot, error);
  },
  gate(out) {
    const issues: string[] = [];
    if (!out.findings.length) issues.push('La auditoría no contiene hallazgos.');
    out.findings.forEach((f, i) => {
      if (!f.problem.trim() || !f.whyItMatters.trim() || !f.expectedImpact.trim() || !f.recommendedAction.trim()) issues.push(`Hallazgo ${i + 1} incompleto (PROBLEM/WHY/IMPACT/ACTION).`);
    });
    return issues;
  },
  async apply(ctx, out) {
    const p = ctx.product!;
    const ids = out.findings.map(
      (f) =>
        ctx.tools.createFinding({
          productId: p.id,
          workflowRunId: ctx.run?.id ?? null,
          category: f.category,
          problem: f.problem,
          whyItMatters: f.whyItMatters,
          expectedImpact: f.expectedImpact,
          recommendedAction: f.recommendedAction,
          createdBy: 'EVA',
        }).id,
    );
    ctx.tools.send('NOAH', `Auditoría lista: ${ids.length} recomendaciones para revisar (${out.dataSource === 'page_snapshot' ? 'basadas en la página real' : 'basadas en el perfil del producto'}).`, 'handoff', { findingIds: ids });
    return { summary: out.summary, data: { findingIds: ids, dataSource: out.dataSource } };
  },
});

/* ─────────────────────────── NOAH ─────────────────────────── */

export const RiskReviewSchema = z.object({
  reviews: z.array(z.object({ findingId: z.string(), valid: z.boolean(), risk: z.enum(['LOW', 'MEDIUM', 'HIGH']), rationale: z.string() })),
  summary: z.string(),
});

const HIGH = /precio|price|descuento|discount|checkout|pago|payment|env[ií]o|shipping|pol[ií]tica|policy|garant[ií]a|guarantee|devoluci|refund|eliminar|borrar|delete|legal|salud|health|claim/i;
const MEDIUM = /imagen|image|v[ií]deo|video|oferta|offer|bundle|estructura|dise[ñn]o|layout|reordenar|galer[ií]a|secci[oó]n/i;

function findingsForReview(ctx: TaskContext) {
  return ctx.run ? ctx.c.findings.list({ workflowRunId: ctx.run.id }).filter((f) => f.status === 'PROPOSED') : [];
}

export const noahStoreReview = defineTaskType({
  type: 'noah.store_review',
  agent: 'NOAH',
  label: 'Revisión de riesgo',
  description: 'Validar las recomendaciones de EVA y clasificar su riesgo; los HIGH RISK van al Approval Center.',
  skills: ['store-risk-review', 'ecommerce-cro', 'data-integrity'],
  reviewer: 'ALEX',
  requiresProduct: true,
  workingStatus: 'REVIEWING',
  schema: RiskReviewSchema,
  instructions(ctx) {
    return `Revisa cada recomendación de EVA. Para cada una decide si es válida (correcta, específica y coherente con el producto) y clasifica el riesgo LOW / MEDIUM / HIGH con justificación.

# RECOMENDACIONES DE EVA
${json(findingsForReview(ctx).map((f) => ({ findingId: f.id, category: f.category, problem: f.problem, whyItMatters: f.whyItMatters, expectedImpact: f.expectedImpact, recommendedAction: f.recommendedAction })))}

Recuerda: precio, descuentos, políticas, garantías, envíos, checkout, pagos, claims legales/sanitarios y todo lo irreversible = HIGH. Ante la duda, sube el riesgo. Incluye TODAS las recomendaciones por su findingId.
${feedbackBlock(ctx)}`;
  },
  local(ctx) {
    const reviews = findingsForReview(ctx).map((f) => {
      const text = `${f.category} ${f.problem} ${f.recommendedAction}`;
      const risk: FindingRisk = HIGH.test(text) || f.category === 'price' || f.category === 'checkout' ? 'HIGH' : MEDIUM.test(text) ? 'MEDIUM' : 'LOW';
      const valid = f.recommendedAction.trim().length > 15 && f.problem.trim().length > 5;
      return {
        findingId: f.id,
        valid,
        risk,
        rationale:
          risk === 'HIGH'
            ? 'Afecta a precio, políticas, promesas o checkout: impacto directo en ingresos/legal. Requiere al propietario.'
            : risk === 'MEDIUM'
              ? 'Cambio visible de contenido u oferta, reversible.'
              : 'Cambio de copy/contenido reversible sin efecto en precio ni pagos.',
      };
    });
    return { reviews, summary: `${reviews.length} recomendaciones revisadas (motor heurístico de riesgo).` };
  },
  gate(out, ctx) {
    const expected = findingsForReview(ctx).map((f) => f.id);
    const got = new Set(out.reviews.map((r) => r.findingId));
    const missing = expected.filter((id) => !got.has(id));
    return missing.length ? [`Faltan por revisar ${missing.length} recomendación(es): ${missing.join(', ')}`] : [];
  },
  async apply(ctx, out) {
    const valid = new Set(findingsForReview(ctx).map((f) => f.id));
    let high = 0;
    let ready = 0;
    let rejected = 0;
    for (const r of out.reviews) {
      if (!valid.has(r.findingId)) continue;
      if (!r.valid) {
        ctx.tools.classifyFinding(r.findingId, r.risk, r.rationale, 'REJECTED');
        rejected++;
        continue;
      }
      if (r.risk === 'HIGH') {
        ctx.tools.classifyFinding(r.findingId, 'HIGH', r.rationale, 'AWAITING_APPROVAL');
        const f = ctx.c.findings.get(r.findingId);
        const approval = ctx.tools.requestApproval({
          kind: 'store_change',
          title: `Cambio de tienda HIGH RISK: ${f.recommendedAction}`.slice(0, 200),
          description: `PROBLEM: ${f.problem}\nWHY IT MATTERS: ${f.whyItMatters}\nEXPECTED IMPACT: ${f.expectedImpact}\nRECOMMENDED ACTION: ${f.recommendedAction}\n\nNOAH: ${r.rationale}`,
          risk: 'HIGH',
          payload: { findingId: f.id },
          relatedType: 'store_finding',
          relatedId: f.id,
        });
        ctx.c.findings.setStatus(f.id, 'AWAITING_APPROVAL', approval.id);
        high++;
      } else {
        ctx.tools.classifyFinding(r.findingId, r.risk, r.rationale, 'READY_TO_APPLY');
        ready++;
      }
    }
    ctx.tools.send('ALEX', `Revisión de tienda: ${ready} listos para aplicar (LOW/MEDIUM), ${high} HIGH RISK enviados al propietario, ${rejected} rechazados.`, 'report');
    if (ready) ctx.tools.send('EVA', `${ready} recomendación(es) validadas. Aplicación pendiente de conector de escritura de tienda (INTEGRATION_REQUIRED).`, 'review');
    return { summary: `${ready} listos (LOW/MEDIUM) · ${high} HIGH RISK → aprobación · ${rejected} rechazados. ${out.summary}`, data: { ready, high, rejected } };
  },
});

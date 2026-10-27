import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { z } from 'zod';
import { defineTaskType, feedbackBlock, json, videoIdOf, words, type TaskContext } from './base.js';
import { now } from '../../core/ids.js';
import type { Blueprint } from './neo.js';
import type { Production } from './rex.js';
import type { Edit } from './max.js';
import type { MediaProbe } from '../../integrations/ffmpeg.js';
import type { QAReview } from '../../videos/videoService.js';

const Owner = z.enum(['NEO', 'REX', 'MAX']);

export const QASchema = z.object({
  criteria: z.array(z.object({ criterion: z.string(), score: z.number(), max: z.number(), evidence: z.string() })),
  issues: z.array(z.object({ what: z.string(), why: z.string(), fix: z.string(), owner: Owner, severity: z.enum(['critical', 'major', 'minor']) })),
  summary: z.string(),
  verdict: z.enum(['APPROVED', 'REVISION_REQUIRED', 'REJECTED']),
});
type QAOut = z.infer<typeof QASchema>;

/** Rubric from the video-qa skill (max points per criterion). */
const RUBRIC: [string, number][] = [
  ['Hook y primeros segundos', 20],
  ['Retención y ritmo', 15],
  ['Claridad', 10],
  ['Storytelling', 10],
  ['Producto', 15],
  ['Visuales', 10],
  ['Texto y subtítulos', 5],
  ['Audio', 5],
  ['Branding y CTA', 10],
];

interface QAInputs {
  videoId: string;
  blueprint: Blueprint;
  production: Production;
  edit: Edit & { render?: { probe: MediaProbe; version: number } };
  finalPath: string;
  probe: MediaProbe;
  technical: QAReview['technical'];
}

const cache = new WeakMap<TaskContext, QAInputs>();

/** Objective technical checks of the rendered file (ffprobe) — computed in code, never by the model. */
async function load(ctx: TaskContext): Promise<QAInputs> {
  const hit = cache.get(ctx);
  if (hit) return hit;
  const videoId = videoIdOf(ctx);
  const v = ctx.c.videos.get(videoId);
  const asset = v.finalAsset ? ctx.c.videos.getAsset(v.finalAsset) : null;
  if (!asset || !fs.existsSync(asset.path)) throw new Error('Final video file not found — nothing to review');
  const probe = await ctx.tools.probe(asset.path);
  const ratio = probe.height ? probe.width / probe.height : 0;
  const technical: QAReview['technical'] = [
    { check: 'Archivo reproducible (stream de vídeo H.264)', passed: probe.videoCodec != null && probe.durationSec > 0, detail: `${probe.videoCodec ?? 'sin vídeo'} · ${probe.sizeBytes} bytes` },
    { check: 'Duración short-form (8-60 s)', passed: probe.durationSec >= 8 && probe.durationSec <= 60, detail: `${probe.durationSec.toFixed(2)} s` },
    { check: 'Formato vertical 9:16', passed: Math.abs(ratio - 9 / 16) < 0.02, detail: `${probe.width}x${probe.height}` },
    { check: 'Frame rate ≥ 24 fps', passed: probe.fps >= 24, detail: `${probe.fps} fps` },
    { check: 'Pista de audio presente', passed: probe.hasAudio, detail: probe.hasAudio ? `${probe.audioCodec} (sin voz/música: requiere conector)` : 'sin audio' },
  ];
  const out = { videoId, blueprint: v.blueprint as Blueprint, production: v.production as Production, edit: v.edit as QAInputs['edit'], finalPath: asset.path, probe, technical };
  cache.set(ctx, out);
  return out;
}

function localQA(ctx: TaskContext, q: QAInputs): QAOut {
  const issues: QAOut['issues'] = [];
  const criteria: QAOut['criteria'] = [];
  const add = (criterion: string, score: number, evidence: string) => {
    const max = RUBRIC.find(([c]) => c === criterion)![1];
    criteria.push({ criterion, score: Math.max(0, Math.min(max, Math.round(score))), max, evidence });
  };
  const segs = q.edit.segments;
  const avg = segs.reduce((a, s) => a + s.durationSec, 0) / Math.max(1, segs.length);
  const hookWords = words(q.edit.hookText || '');

  if (!q.edit.hookText) issues.push({ what: 'El primer segundo no tiene hook en pantalla', why: 'Sin hook textual el 85% que ve sin sonido no tiene motivo para quedarse', fix: 'Añadir el hook de NEO como título en el segmento 1', owner: 'MAX', severity: 'critical' });
  else if (hookWords > 12) issues.push({ what: `Hook demasiado largo (${hookWords} palabras)`, why: 'No se lee en 1 segundo', fix: 'Reducir el hook a ≤ 8 palabras manteniendo el insight', owner: 'NEO', severity: 'major' });
  add('Hook y primeros segundos', !q.edit.hookText ? 2 : hookWords <= 8 ? 20 : hookWords <= 12 ? 14 : 8, `Hook "${q.edit.hookText}" (${hookWords} palabras), zoom ${segs[0]?.zoom ?? '—'} en 0-${segs[0]?.durationSec ?? 0}s`);

  if (avg > 3.2) issues.push({ what: `Ritmo lento: planos de ${avg.toFixed(1)} s de media`, why: 'En short-form cada 2-3 s debe pasar algo nuevo o cae la retención', fix: 'Recortar segmentos a ≤ 2.5 s o dividirlos con punch-ins', owner: 'MAX', severity: 'major' });
  add('Retención y ritmo', avg <= 2.6 ? 15 : avg <= 3.2 ? 11 : 6, `Duración media de segmento ${avg.toFixed(2)} s; ${segs.filter((s) => s.zoom !== 'none').length}/${segs.length} con zoom`);

  const texts = segs.flatMap((s) => [s.caption, s.overlayText]).filter(Boolean);
  const readable = texts.filter((t) => words(t) <= 8).length / Math.max(1, texts.length);
  if (readable < 0.8) issues.push({ what: 'Textos en pantalla demasiado largos', why: 'No se pueden leer a la velocidad de corte', fix: 'Máximo 7-8 palabras por bloque', owner: 'MAX', severity: 'minor' });
  add('Claridad', 10 * readable, `${Math.round(readable * 100)}% de los textos ≤ 8 palabras`);

  const kinds = new Set(q.blueprint.sections.map((s) => s.section));
  const story = (kinds.has('PROBLEM') || kinds.has('DESIRE')) && kinds.has('DEMONSTRATION');
  if (!story) issues.push({ what: 'Falta arco problema/deseo → demostración', why: 'Sin tensión no hay motivo para ver la resolución', fix: 'Añadir PROBLEM o DESIRE antes de la demostración', owner: 'NEO', severity: 'major' });
  add('Storytelling', story ? 10 : 5, `Estructura: ${q.blueprint.sections.map((s) => s.section).join(' → ')}`);

  const pf = q.blueprint.productFirstAppearsAtSec;
  if (pf > 5) issues.push({ what: `El producto aparece en el segundo ${pf}`, why: 'Quien abandona antes no sabe qué se vende', fix: 'Mostrar el producto antes del segundo 3 (mover la demostración)', owner: 'NEO', severity: 'critical' });
  add('Producto', pf <= 3 ? 15 : pf <= 5 ? 12 : 5, `Producto visible desde ${pf}s; ${q.blueprint.sections.filter((s) => s.showsProduct).length} secciones con producto`);

  const shotsOk = q.production.shots.every((s) => s.action && s.generationPrompt);
  const hasPhoto = (ctx.product?.images.length ?? 0) > 0;
  if (!shotsOk) issues.push({ what: 'Planos sin acción definida', why: 'Un plano sin acción es un plano muerto', fix: 'Definir una acción concreta por plano', owner: 'REX', severity: 'major' });
  add('Visuales', (shotsOk ? 7 : 3) + (hasPhoto ? 3 : 0), `${q.production.shots.length} planos; ${hasPhoto ? 'foto real del producto integrada' : 'sin foto del producto (súbela en Product Center)'}; motor ${(q.production as { engine?: string }).engine ?? '—'}`);

  const coverage = segs.filter((s) => s.caption.trim()).length / Math.max(1, segs.length);
  if (coverage < 0.7) issues.push({ what: `Solo ${Math.round(coverage * 100)}% de segmentos subtitulados`, why: 'La mayoría ve sin sonido', fix: 'Subtitular todos los segmentos con locución', owner: 'MAX', severity: 'major' });
  add('Texto y subtítulos', coverage >= 0.7 ? 5 : 2, `Cobertura de subtítulos ${Math.round(coverage * 100)}%`);

  add('Audio', q.probe.hasAudio ? 3 : 0, q.probe.hasAudio ? 'Pista presente pero silenciosa: voz y música requieren conectores (INTEGRATION_REQUIRED). No imputable a los agentes.' : 'Sin pista de audio');

  const ctaOk = q.edit.cta.text.trim().length > 0 && q.edit.cta.durationSec >= 2;
  if (!ctaOk) issues.push({ what: 'CTA ausente o demasiado corto', why: 'Sin CTA claro no hay acción', fix: 'End card con CTA ≥ 2 s', owner: 'MAX', severity: 'major' });
  add('Branding y CTA', (ctaOk ? 6 : 1) + (q.edit.watermark ? 2 : 0) + (words(q.edit.cta.text) <= 6 ? 2 : 0), `CTA "${q.edit.cta.text}" ${q.edit.cta.durationSec}s; marca de agua ${q.edit.watermark ? 'sí' : 'no'}`);

  for (const t of q.technical.filter((t) => !t.passed && !t.check.startsWith('Pista de audio'))) {
    issues.push({ what: `Fallo técnico: ${t.check}`, why: t.detail, fix: 'Re-renderizar cumpliendo la especificación', owner: 'MAX', severity: 'critical' });
  }
  const score = Math.round(criteria.reduce((a, c) => a + c.score, 0));
  return {
    criteria,
    issues,
    summary: `Score heurístico ${score}/100. ${issues.length ? `${issues.length} problema(s): ${issues.map((i) => i.what).join('; ')}.` : 'Sin defectos detectados por las reglas de QA.'}`,
    verdict: 'APPROVED', // final verdict is always recomputed in apply()
  };
}

const SEVERITY_WEIGHT = { critical: 3, major: 2, minor: 1 } as const;

export const lunaQA = defineTaskType({
  type: 'luna.qa',
  agent: 'LUNA',
  label: 'QA de vídeo',
  description: 'Revisar el FINAL VIDEO: checks técnicos, rúbrica creativa, score 0-100, veredicto y enrutamiento de correcciones.',
  skills: ['video-qa', 'hook-engineering', 'data-integrity'],
  reviewer: 'ALEX',
  requiresProduct: true,
  workingStatus: 'REVIEWING',
  schema: QASchema,
  async instructions(ctx) {
    const q = await load(ctx);
    return `Revisa el FINAL VIDEO como control de calidad. Se adjuntan fotogramas reales del vídeo renderizado (inicio, mitad, final).

# CHECKS TÉCNICOS (medidos con ffprobe — son hechos)
${json(q.technical)}

# BLUEPRINT (NEO)
${json(q.blueprint)}

# PRODUCCIÓN (REX)
${json({ plan: q.production.plan, shots: q.production.shots.map((s) => ({ index: s.index, section: s.section, shotType: s.shotType, action: s.action, durationSec: s.durationSec })) })}

# EDL (MAX)
${json({ hookText: q.edit.hookText, segments: q.edit.segments, cta: q.edit.cta, watermark: q.edit.watermark, captionsStyle: q.edit.captionsStyle })}

Instrucciones:
- Puntúa cada criterio de la rúbrica con su máximo exacto: ${RUBRIC.map(([c, m]) => `${c} (${m})`).join(', ')}. Usa evidencia concreta (segundo/escena/fotograma).
- Si el motor de vídeo es una animática local, evalúa la dirección creativa y el montaje, no el fotorrealismo.
- Audio sin voz/música por falta de conector NO es culpa de ningún agente: no lo conviertas en issue.
- Cada issue: qué está mal, por qué, cómo solucionarlo, responsable (NEO concepto/estructura, REX planos/visuales, MAX ritmo/texto/subtítulos/CTA/técnico) y severidad.
- Veredicto: APPROVED si score ≥ ${ctx.settings.qaApprovalThreshold} y sin defectos críticos; REVISION_REQUIRED si es arreglable; REJECTED solo si el concepto no tiene solución.
${feedbackBlock(ctx)}`;
  },
  async images(ctx) {
    const q = await load(ctx);
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-'));
    try {
      const d = q.probe.durationSec;
      const files = await ctx.c.integrations.ffmpeg.frames(q.finalPath, [0.5, d * 0.35, d * 0.65, Math.max(0, d - 1)], dir);
      return files.map((f) => fs.readFileSync(f).toString('base64'));
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  },
  async local(ctx) {
    return localQA(ctx, await load(ctx));
  },
  gate(out) {
    const issues: string[] = [];
    if (out.criteria.length < 5) issues.push('La revisión debe puntuar todos los criterios de la rúbrica.');
    if (out.verdict !== 'APPROVED' && !out.issues.length) issues.push('Un veredicto distinto de APPROVED necesita issues accionables.');
    return issues;
  },
  async apply(ctx, out) {
    const q = await load(ctx);
    const maxPts = out.criteria.reduce((a, c) => a + c.max, 0) || 100;
    const score = Math.round((out.criteria.reduce((a, c) => a + Math.min(c.score, c.max), 0) / maxPts) * 100);
    const critical = out.issues.some((i) => i.severity === 'critical') || q.technical.some((t) => !t.passed && !t.check.startsWith('Pista de audio'));
    const threshold = ctx.settings.qaApprovalThreshold;
    // Verdict is enforced by policy: the threshold and critical defects override the model's opinion.
    let verdict: QAOut['verdict'] = out.verdict;
    if (verdict === 'APPROVED' && (score < threshold || critical)) verdict = 'REVISION_REQUIRED';
    if (verdict === 'REVISION_REQUIRED' && score >= threshold && !critical && !out.issues.some((i) => i.severity !== 'minor')) verdict = 'APPROVED';
    const issues = [...out.issues];
    if (verdict === 'REVISION_REQUIRED' && !issues.length) {
      issues.push({ what: `Score ${score} por debajo del umbral ${threshold}`, why: 'La calidad global no alcanza el estándar de la empresa', fix: 'Reforzar ritmo, legibilidad y CTA en el montaje', owner: 'MAX', severity: 'major' });
    }
    const weights: Record<string, number> = {};
    for (const i of issues) weights[i.owner] = (weights[i.owner] ?? 0) + SEVERITY_WEIGHT[i.severity];
    const routeTo = (Object.entries(weights).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'MAX') as 'NEO' | 'REX' | 'MAX';
    const cycle = Number(ctx.task.input.cycle ?? 0);
    const review: QAReview = { cycle, verdict, score, summary: out.summary, criteria: out.criteria, issues, technical: q.technical, engine: ctx.engine === 'llm' ? ctx.c.llm.engineLabel : 'local-heuristic', reviewedAt: now() };
    ctx.tools.recordQA(q.videoId, review);
    for (const a of ['NOVA', 'NEO', 'REX', 'MAX']) ctx.c.agentState.recordScore(a, score);

    const feedback = issues.map((i) => `[${i.severity.toUpperCase()} → ${i.owner}] ${i.what}. Por qué: ${i.why}. Solución: ${i.fix}`);
    if (verdict === 'APPROVED') {
      ctx.c.events.emit('VIDEO_APPROVED', { videoId: q.videoId, score });
      ctx.tools.send('ALEX', `Video approved (${score}/100). ${out.summary}`, 'review');
    } else if (verdict === 'REJECTED') {
      ctx.c.events.emit('VIDEO_REJECTED', { videoId: q.videoId, score });
      ctx.tools.send('ALEX', `Video rejected (${score}/100): ${out.summary}`, 'review');
    } else {
      ctx.c.events.emit('VIDEO_REVISION_REQUIRED', { videoId: q.videoId, score, routeTo });
      ctx.tools.send(routeTo, `Revision required (${score}/100): ${issues.filter((i) => i.owner === routeTo).map((i) => i.what).join('; ') || issues[0].what}`, 'review', { feedback });
      for (const i of issues) {
        ctx.tools.remember({ scope: 'agent', scopeId: i.owner, kind: 'lesson', title: `QA: ${i.what}`.slice(0, 200), content: `${i.why}. Solución: ${i.fix}`, importance: i.severity === 'critical' ? 5 : 3 });
      }
    }
    ctx.tools.remember({ scope: 'video', scopeId: q.videoId, kind: 'feedback', title: `QA ciclo ${cycle}: ${verdict} (${score})`, content: out.summary, importance: 3 });
    return { summary: `${verdict} · ${score}/100${verdict === 'REVISION_REQUIRED' ? ` → ${routeTo}` : ''}`, score, data: { verdict, score, routeTo, feedback } };
  },
});

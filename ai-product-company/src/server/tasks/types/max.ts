import { z } from 'zod';
import { brandPalette, clamp, defineTaskType, feedbackBlock, json, shortPhrase, videoIdOf, type TaskContext } from './base.js';
import type { Blueprint } from './neo.js';
import type { Production } from './rex.js';

export const EditSchema = z.object({
  hookText: z.string(),
  segments: z.array(
    z.object({
      shotIndex: z.number(),
      durationSec: z.number(),
      caption: z.string(),
      overlayText: z.string(),
      zoom: z.enum(['none', 'punch_in', 'slow_push']),
      transitionOut: z.enum(['cut', 'fade', 'slide', 'wipe']),
    }),
  ),
  cta: z.object({ text: z.string(), durationSec: z.number() }),
  watermark: z.string(),
  music: z.object({ mood: z.string(), bpm: z.number() }),
  soundDesign: z.array(z.string()),
  colorGrade: z.string(),
  captionsStyle: z.string(),
  editNotes: z.string(),
});
export type Edit = z.infer<typeof EditSchema>;

function inputs(ctx: TaskContext) {
  const v = ctx.c.videos.get(videoIdOf(ctx));
  const production = v.production as (Production & { shotPaths: string[]; engine: string }) | null;
  const bp = v.blueprint as Blueprint | null;
  if (!production?.shotPaths?.length) throw new Error('No raw footage from REX for this video');
  return { v, production, bp };
}

function localEdit(ctx: TaskContext): Edit {
  const p = ctx.product!;
  const { production, bp, v } = inputs(ctx);
  const fb = ctx.feedback.join(' ').toLowerCase();
  const faster = /ritmo|lento|largo|pacing|tiempo muerto/.test(fb);
  const longerCta = /cta/.test(fb);
  const segments = production.shots.map((s, i) => ({
    shotIndex: s.index,
    durationSec: Math.round(clamp(s.durationSec * (faster ? 0.8 : 1), 0.8, 6) * 10) / 10,
    caption: shortPhrase(s.voiceover || s.onScreenText, 7),
    overlayText: i === 0 ? '' : shortPhrase(s.onScreenText, 6),
    zoom: (s.section === 'HOOK' ? 'punch_in' : s.section === 'DEMONSTRATION' || s.section === 'DESIRE' ? 'slow_push' : i % 2 ? 'punch_in' : 'none') as Edit['segments'][number]['zoom'],
    transitionOut: (i === production.shots.length - 1 ? 'fade' : s.section === 'PROBLEM' ? 'slide' : 'cut') as Edit['segments'][number]['transitionOut'],
  }));
  return {
    hookText: bp?.hook.text ?? v.hook ?? '',
    segments,
    cta: { text: p.cta || bp?.cta || `Consigue ${p.name}`, durationSec: longerCta ? 3 : 2.5 },
    watermark: p.name,
    music: { mood: /lujo|premium/i.test(p.brandTone) ? 'elegante, minimal' : 'energético, optimista', bpm: faster ? 124 : 110 },
    soundDesign: ['whoosh en transiciones slide', 'impacto en el punch-in del hook', 'pop suave en cada subtítulo'],
    colorGrade: `Contraste medio, saturación natural, coherente con: ${p.visualStyle || 'estilo de marca'}`,
    captionsStyle: 'Bold blanco sobre caja negra 60%, 2 líneas máx., tercio inferior por encima de la UI',
    editNotes: ctx.feedback.length ? `Revisión: ${faster ? 'ritmo acelerado 20%. ' : ''}${longerCta ? 'CTA alargado. ' : ''}Subtítulos en todos los segmentos.` : 'Montaje según blueprint; subtítulos en todos los segmentos.',
  };
}

export const maxEdit = defineTaskType({
  type: 'max.edit',
  agent: 'MAX',
  label: 'Edición',
  description: 'Postproducción completa del raw de REX mediante una Edit Decision List y render del FINAL VIDEO.',
  skills: ['video-editing', 'data-integrity'],
  reviewer: 'ALEX',
  requiresProduct: true,
  schema: EditSchema,
  instructions(ctx) {
    const { production, bp } = inputs(ctx);
    return `Edita el vídeo. Devuelve una Edit Decision List (EDL) que el motor de render ejecutará tal cual.

# BLUEPRINT (NEO)
${json(bp)}

# PLANOS PRODUCIDOS (REX) — ${production.shots.length} planos, motor ${production.engine}
${json(production.shots.map((s) => ({ index: s.index, section: s.section, durationSec: s.durationSec, onScreenText: s.onScreenText, voiceover: s.voiceover })))}

Requisitos de la EDL:
- "segments": en orden de montaje; "shotIndex" referencia un plano existente (1..${production.shots.length}); "durationSec" ≤ duración del plano.
- "caption": subtítulo de la locución (≤ 7 palabras); "overlayText": texto de énfasis (vacío si no aporta). El primer segmento lleva el "hookText".
- "zoom": none | punch_in | slow_push con intención; "transitionOut": cut | fade | slide | wipe (mayoritariamente cut).
- "cta": texto único y "durationSec" ≥ 2.
- Música (mood + BPM), sound design, etalonaje y estilo de subtítulos (se aplicarán cuando haya conectores de audio).
${feedbackBlock(ctx)}`;
  },
  local: localEdit,
  gate(out, ctx) {
    const { production } = inputs(ctx);
    const issues: string[] = [];
    if (out.segments.length < 3) issues.push('La EDL necesita al menos 3 segmentos.');
    for (const s of out.segments) {
      const shot = production.shots.find((x) => x.index === s.shotIndex);
      if (!shot) issues.push(`El segmento referencia el plano ${s.shotIndex}, que no existe.`);
      else if (s.durationSec > shot.durationSec + 0.05) issues.push(`El segmento del plano ${s.shotIndex} dura más que el plano.`);
    }
    if (!out.cta.text.trim()) issues.push('Falta el texto del CTA.');
    if (out.cta.durationSec < 2) issues.push('El CTA debe durar al menos 2 s.');
    return issues;
  },
  async apply(ctx, out) {
    const videoId = videoIdOf(ctx);
    const p = ctx.product!;
    const { production } = inputs(ctx);
    const version = ctx.c.videos.versions(videoId).filter((v) => v.stage === 'final').length + 1;
    const r = await ctx.tools.render(videoId, version, production.shotPaths, out, p.name, brandPalette(p));
    const probe = await ctx.tools.probe(r.path);
    const finalAsset = ctx.c.videos.registerAsset(r.path, 'final', 'video/mp4', { engine: r.engine, probe, version });
    const poster = ctx.c.videos.registerAsset(r.posterPath, 'poster', 'image/jpeg', { version });
    ctx.c.videos.patch(videoId, { edit: { ...out, render: { engine: r.engine, probe, version } }, finalAsset: finalAsset.id, posterAsset: poster.id });
    ctx.c.videos.addVersion(videoId, 'final', finalAsset.id, `FINAL v${version} · ${probe.durationSec.toFixed(1)} s · ${probe.width}x${probe.height}${out.editNotes ? ` · ${out.editNotes}` : ''}`, 'MAX');
    ctx.c.videos.setStatus(videoId, 'WAITING_QA', 'MAX', `Final v${version} enviado a QA`);
    ctx.c.events.emit('VIDEO_EDITED', { videoId, version, engine: r.engine, durationSec: probe.durationSec });
    ctx.c.events.emit('VIDEO_SUBMITTED_QA', { videoId, version });
    ctx.tools.send('LUNA', `Final video ready for QA: v${version}, ${probe.durationSec.toFixed(1)} s, ${probe.width}x${probe.height}.`, 'handoff');
    return { summary: `FINAL VIDEO v${version} renderizado (${probe.durationSec.toFixed(1)} s, ${out.segments.length} segmentos + CTA).`, data: { version, finalAssetId: finalAsset.id } };
  },
});

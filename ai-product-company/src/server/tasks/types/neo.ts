import { z } from 'zod';
import { defineTaskType, deriveInsights, feedbackBlock, json, lc, shortPhrase, uc, videoIdOf, type TaskContext } from './base.js';
import type { Hooks } from './nova.js';

export const SECTION = z.enum(['HOOK', 'PROBLEM', 'DESIRE', 'DEMONSTRATION', 'SOLUTION', 'PRODUCT', 'CTA']);

export const BlueprintSchema = z.object({
  concept: z.object({
    title: z.string(),
    angle: z.string(),
    format: z.string(),
    emotion: z.string(),
    transformation: z.string(),
    whyItWorks: z.string(),
  }),
  hook: z.object({ text: z.string(), visual: z.string(), spoken: z.string(), sourceIds: z.array(z.string()) }),
  sections: z.array(
    z.object({
      section: SECTION,
      purpose: z.string(),
      visual: z.string(),
      onScreenText: z.string(),
      voiceover: z.string(),
      durationSec: z.number(),
      showsProduct: z.boolean(),
    }),
  ),
  omittedSections: z.array(z.object({ section: SECTION, reason: z.string() })),
  totalDurationSec: z.number(),
  pacing: z.string(),
  visualStyle: z.string(),
  cta: z.string(),
  productFirstAppearsAtSec: z.number(),
  revisionNotes: z.string(),
});
export type Blueprint = z.infer<typeof BlueprintSchema>;

function selectedHooks(ctx: TaskContext) {
  const v = ctx.c.videos.get(videoIdOf(ctx));
  const hooks = v.hooks as (Hooks & { totals: Record<string, number> }) | null;
  if (!hooks) throw new Error('No hooks available from NOVA for this video');
  const text = hooks.selection.topTextHookIds.map((id) => hooks.textHooks.find((h) => h.id === id)).filter(Boolean) as Hooks['textHooks'];
  const visual = hooks.selection.topVisualHookIds.map((id) => hooks.visualHooks.find((h) => h.id === id)).filter(Boolean) as Hooks['visualHooks'];
  const combo = hooks.combos.find((c) => c.id === hooks.selection.topComboId) ?? hooks.combos[0];
  const spoken = hooks.spokenHooks.find((s) => s.id === combo?.spokenHookId) ?? hooks.spokenHooks[0];
  return { hooks, text, visual, combo, spoken };
}

function localBlueprint(ctx: TaskContext): Blueprint {
  const p = ctx.product!;
  const ins = deriveInsights(p);
  const { text, visual, spoken, combo } = selectedHooks(ctx);
  const fb = ctx.feedback.join(' ').toLowerCase();
  const hookText = text[0]?.text ?? shortPhrase(ins.mainPain);
  const cta = p.cta || `Consigue ${p.name} hoy`;
  // Revision handling — the local engine reacts to concrete QA feedback.
  const tighter = /ritmo|lento|largo|duraci|pacing/.test(fb);
  const productEarlier = /producto.*(tarde|aparece|visible)|product/.test(fb);
  const scale = tighter ? 0.85 : 1;
  const d = (n: number) => Math.round(n * scale * 10) / 10;
  const sections: Blueprint['sections'] = [
    { section: 'HOOK', purpose: 'Detener el scroll en < 1 s', visual: visual[0] ? `${visual[0].firstFrame} (${visual[0].motion})` : `Primer plano de ${p.name}`, onScreenText: hookText, voiceover: spoken?.line ?? '', durationSec: d(2), showsProduct: productEarlier },
    { section: 'PROBLEM', purpose: 'Identificación con el dolor', visual: `Persona real viviendo: ${lc(ins.mainPain)}`, onScreenText: uc(shortPhrase(ins.mainPain, 6)), voiceover: `Si te pasa esto: ${lc(ins.mainPain)}…`, durationSec: d(2.5), showsProduct: false },
    { section: 'DEMONSTRATION', purpose: 'Prueba visual del mecanismo', visual: `${p.name} en uso — ${lc(ins.mostSurprisingVisual)}`, onScreenText: uc(shortPhrase(ins.mainBenefit, 6)), voiceover: `Mira lo que hace ${p.name}.`, durationSec: d(4), showsProduct: true },
    { section: 'SOLUTION', purpose: 'Resolver la objeción principal', visual: `Detalle del producto que responde a "${ins.mainObjection}"`, onScreenText: uc(shortPhrase(p.differentiators[0] ?? p.benefits[1] ?? ins.mainBenefit, 6)), voiceover: `Y no, ${lc(ins.mainObjection.replace(/[¿?]/g, ''))} no es un problema.`, durationSec: d(3), showsProduct: true },
    { section: 'DESIRE', purpose: 'Mostrar el estado DESPUÉS', visual: `Resultado final: ${lc(ins.mainDesire)}`, onScreenText: uc(shortPhrase(ins.mainDesire, 6)), voiceover: `Así se siente ${lc(ins.mainDesire)}.`, durationSec: d(3), showsProduct: true },
    { section: 'CTA', purpose: 'Una sola acción clara', visual: `${p.name} en hero shot sobre fondo de marca`, onScreenText: cta, voiceover: cta, durationSec: d(2.5), showsProduct: true },
  ];
  if (productEarlier) {
    // Move the demonstration right after the hook.
    const demo = sections.splice(2, 1)[0];
    sections.splice(1, 0, demo);
  }
  let t = 0;
  let firstProduct = 99;
  for (const s of sections) {
    if (s.showsProduct && firstProduct === 99) firstProduct = t;
    t += s.durationSec;
  }
  const total = Math.round(t * 10) / 10;
  return {
    concept: {
      title: hookText.length > 70 ? `${hookText.slice(0, 67)}…` : hookText,
      angle: text[0]?.family ?? 'problem',
      format: 'Problem → Demo → Solution (PAS + demo-first)',
      emotion: ins.dominantEmotion,
      transformation: ins.transformation,
      whyItWorks: `El hook ${text[0]?.id ?? ''} abre con ${text[0]?.mechanism ?? 'identificación'}; la demostración prueba "${ins.mainBenefit}" antes del segundo ${Math.ceil(firstProduct) || 1}.`,
    },
    hook: { text: hookText, visual: sections[0].visual, spoken: spoken?.line ?? '', sourceIds: [text[0]?.id, visual[0]?.id, combo?.id].filter(Boolean) as string[] },
    sections,
    omittedSections: [{ section: 'PRODUCT', reason: 'El producto aparece integrado en DEMONSTRATION/SOLUTION/CTA; una sección aparte añadiría un plano estático.' }],
    totalDurationSec: total,
    pacing: tighter ? 'Rápido: cortes cada ~2 s (ajustado tras QA)' : 'Cortes cada 2-3 s, cambio de estímulo continuo',
    visualStyle: p.visualStyle || 'Natural, luz suave, colores fieles al producto',
    cta,
    productFirstAppearsAtSec: firstProduct,
    revisionNotes: ctx.feedback.length ? `Revisión aplicada: ${tighter ? 'duraciones reducidas un 15%. ' : ''}${productEarlier ? 'demostración movida tras el hook. ' : ''}` : '',
  };
}

export const neoBlueprint = defineTaskType({
  type: 'neo.blueprint',
  agent: 'NEO',
  label: 'Video Blueprint',
  description: 'Convertir los mejores hooks de NOVA en un concepto de vídeo y un VIDEO BLUEPRINT completo.',
  skills: ['creative-strategy', 'product-insight-extraction', 'data-integrity'],
  reviewer: 'ALEX',
  requiresProduct: true,
  schema: BlueprintSchema,
  instructions(ctx) {
    const { text, visual, combo, spoken, hooks } = selectedHooks(ctx);
    const prev = ctx.c.videos.get(videoIdOf(ctx)).blueprint;
    return `Crea el VIDEO BLUEPRINT para el vídeo usando los hooks seleccionados por NOVA.

# HOOKS SELECCIONADOS POR NOVA
${json({ textHooks: text, visualHooks: visual, combo, spoken, analysis: hooks.analysis })}

Requisitos:
- Estructura HOOK · PROBLEM · DESIRE · DEMONSTRATION · SOLUTION · PRODUCT · CTA cuando sea adecuado; las secciones omitidas van en "omittedSections" con motivo.
- Duración total 15-30 s. La suma de "durationSec" debe ser igual a "totalDurationSec".
- El producto debe aparecer antes del segundo 5 ("productFirstAppearsAtSec"); marca "showsProduct" por sección.
- Cada sección: propósito, visual concreto (lo que se ve), texto en pantalla (≤ 8 palabras) y locución.
- Mantén el hook de NOVA (puedes ajustar la formulación justificándolo).
${prev && ctx.feedback.length ? `\n# BLUEPRINT ANTERIOR (a corregir)\n${json(prev)}` : ''}
${feedbackBlock(ctx)}`;
  },
  local: localBlueprint,
  gate(out) {
    const issues: string[] = [];
    const kinds = new Set(out.sections.map((s) => s.section));
    if (!kinds.has('HOOK')) issues.push('Falta la sección HOOK.');
    if (!kinds.has('CTA')) issues.push('Falta la sección CTA.');
    if (!['DEMONSTRATION', 'SOLUTION', 'PRODUCT'].some((k) => kinds.has(k as z.infer<typeof SECTION>))) issues.push('Falta mostrar el producto (DEMONSTRATION/SOLUTION/PRODUCT).');
    const sum = out.sections.reduce((a, s) => a + s.durationSec, 0);
    if (Math.abs(sum - out.totalDurationSec) > 1.5) issues.push(`La suma de secciones (${sum.toFixed(1)} s) no coincide con la duración total (${out.totalDurationSec} s).`);
    if (out.totalDurationSec < 8 || out.totalDurationSec > 60) issues.push(`Duración fuera de rango short-form: ${out.totalDurationSec} s.`);
    if (out.productFirstAppearsAtSec > 5) issues.push(`El producto aparece en el segundo ${out.productFirstAppearsAtSec}; debe aparecer antes del 5.`);
    return issues;
  },
  async apply(ctx, out) {
    const videoId = videoIdOf(ctx);
    ctx.tools.saveBlueprint(videoId, out, out.concept.title);
    ctx.c.videos.addVersion(videoId, 'blueprint', null, `${out.concept.format} · ${out.totalDurationSec}s${out.revisionNotes ? ` · ${out.revisionNotes}` : ''}`, 'NEO');
    ctx.c.videos.setStatus(videoId, 'PRODUCING', 'NEO', `Blueprint "${out.concept.title}"`);
    ctx.tools.remember({ scope: 'video', scopeId: videoId, kind: 'note', title: 'Concepto creativo', content: `${out.concept.title} · ${out.concept.angle} · ${out.concept.format}. ${out.concept.whyItWorks}`, importance: 3 });
    ctx.tools.send('REX', `Blueprint aprobado: "${out.concept.title}" (${out.sections.length} secciones, ${out.totalDurationSec}s). Producto en el segundo ${out.productFirstAppearsAtSec}.`, 'handoff');
    return { summary: `Blueprint "${out.concept.title}" · ${out.sections.map((s) => s.section).join(' → ')} · ${out.totalDurationSec}s`, data: { title: out.concept.title } };
  },
});

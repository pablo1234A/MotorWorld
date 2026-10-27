import { z } from 'zod';
import { hookEngineering } from '../../skills/library/creative.js';
import { clamp, defineTaskType, deriveInsights, feedbackBlock, lc, shortPhrase, uc, videoIdOf, words, type TaskContext } from './base.js';

const Family = z.enum(['problem', 'desire', 'demonstration', 'emotional', 'contrarian', 'social_proof', 'mistake', 'list', 'pov', 'challenge', 'comparison', 'curiosity']);
const Mechanism = z.enum(['pattern_interrupt', 'curiosity_gap', 'open_loop', 'contrast', 'surprise', 'identification', 'conflict']);

const Score = z.object({
  itemId: z.string(),
  attention: z.number(),
  curiosity: z.number(),
  productFit: z.number(),
  novelty: z.number(),
  emotionalImpact: z.number(),
  scrollStop: z.number(),
  clarity: z.number(),
  note: z.string(),
});

export const HooksSchema = z.object({
  analysis: z.object({
    mainPain: z.string(),
    mainDesire: z.string(),
    mainObjection: z.string(),
    mainBenefit: z.string(),
    dominantEmotion: z.string(),
    transformation: z.string(),
    mostSurprisingVisual: z.string(),
    reasonToCare: z.string(),
    hypotheses: z.array(z.string()),
  }),
  textHooks: z.array(z.object({ id: z.string(), text: z.string(), family: Family, mechanism: Mechanism })),
  visualHooks: z.array(z.object({ id: z.string(), firstFrame: z.string(), motion: z.string(), family: Family, mechanism: Mechanism })),
  spokenHooks: z.array(z.object({ id: z.string(), line: z.string(), family: Family })),
  openingConcepts: z.array(z.object({ id: z.string(), title: z.string(), text: z.string(), visual: z.string(), spoken: z.string() })),
  combos: z.array(z.object({ id: z.string(), textHookId: z.string(), visualHookId: z.string(), spokenHookId: z.string(), rationale: z.string() })),
  abVariants: z.array(z.object({ id: z.string(), baseItemId: z.string(), variable: z.string(), variantA: z.string(), variantB: z.string() })),
  scores: z.array(Score),
  selection: z.object({
    topTextHookIds: z.array(z.string()),
    topVisualHookIds: z.array(z.string()),
    topComboId: z.string(),
    rationale: z.string(),
  }),
});
export type Hooks = z.infer<typeof HooksSchema>;

/** Weighted scorecard total (0-100) from NOVA's 7 criteria (1-10 each). */
export function hookTotal(s: z.infer<typeof Score>): number {
  const weights = Object.fromEntries(hookEngineering.scorecard.map((c) => [c.criterion, c.weight]));
  const parts: [string, number][] = [
    ['Attention', s.attention],
    ['Curiosity', s.curiosity],
    ['Product Fit', s.productFit],
    ['Novelty', s.novelty],
    ['Emotional Impact', s.emotionalImpact],
    ['Scroll Stop Potential', s.scrollStop],
    ['Clarity', s.clarity],
  ];
  const wsum = parts.reduce((a, [k]) => a + (weights[k] ?? 1), 0);
  const total = parts.reduce((a, [k, v]) => a + clamp(v, 0, 10) * (weights[k] ?? 1), 0);
  return Math.round((total / (wsum * 10)) * 100);
}

/* ───────────── LOCAL HEURISTIC ENGINE ───────────── */

function localHooks(ctx: TaskContext): Hooks {
  const p = ctx.product!;
  const ins = deriveInsights(p);
  const pain = shortPhrase(ins.mainPain, 6);
  const desire = shortPhrase(ins.mainDesire, 6);
  const benefit = shortPhrase(ins.mainBenefit, 6);
  const obj = shortPhrase(ins.mainObjection.replace(/[¿?]/g, ''), 6);
  const wow = shortPhrase(ins.mostSurprisingVisual, 6);
  const name = p.name;
  const aud = p.targetAudience ? shortPhrase(p.targetAudience, 4) : 'tú';

  const textTemplates: [string, z.infer<typeof Family>, z.infer<typeof Mechanism>][] = [
    [`¿Te pasa esto? ${uc(pain)}.`, 'problem', 'identification'],
    [`${uc(pain)} no es normal.`, 'problem', 'pattern_interrupt'],
    [`Así consigo ${lc(desire)}.`, 'desire', 'open_loop'],
    [`${uc(desire)} sin complicarte`, 'desire', 'curiosity_gap'],
    [`Mira lo que pasa cuando…`, 'demonstration', 'open_loop'],
    [`No me creía esto hasta verlo`, 'demonstration', 'surprise'],
    [`Ojalá lo hubiera sabido antes`, 'emotional', 'identification'],
    [`Lo que nadie te dice de ${lc(pain)}`, 'curiosity', 'curiosity_gap'],
    [`Deja de aguantar ${lc(pain)}`, 'contrarian', 'conflict'],
    [`Esto no es otro "${lc(shortPhrase(name, 3))}"`, 'contrarian', 'contrast'],
    [`El error que todos cometen con ${lc(pain)}`, 'mistake', 'curiosity_gap'],
    [`3 señales de que necesitas esto`, 'list', 'open_loop'],
    [`POV: por fin ${lc(benefit)}`, 'pov', 'identification'],
    [`Probé ${name} 7 días. Resultado:`, 'challenge', 'open_loop'],
    [`Antes vs después de ${name}`, 'comparison', 'contrast'],
    [`"${uc(obj)}" — eso pensaba yo`, 'social_proof', 'identification'],
    [`Si eres ${lc(aud)}, para.`, 'problem', 'pattern_interrupt'],
    [`${uc(wow)}. Sí, de verdad.`, 'demonstration', 'surprise'],
    [`No compres nada hasta ver esto`, 'contrarian', 'curiosity_gap'],
    [`${uc(benefit)} en segundos`, 'desire', 'contrast'],
  ];
  const textHooks = textTemplates.map(([text, family, mechanism], i) => ({ id: `T${i + 1}`, text, family, mechanism }));

  const visualTemplates: [string, string, z.infer<typeof Family>, z.infer<typeof Mechanism>][] = [
    [`Primer plano extremo de ${name} en acción`, 'push-in rápido 0-1 s', 'demonstration', 'pattern_interrupt'],
    [`Persona mostrando ${lc(pain)} con frustración`, 'cámara en mano, corte seco a los 0.8 s', 'problem', 'identification'],
    [`Pantalla partida: antes (izq.) / después (dcha.)`, 'barrido de izquierda a derecha', 'comparison', 'contrast'],
    [`${uc(wow)} — resultado inesperado en el primer frame`, 'macro + slow motion', 'demonstration', 'surprise'],
    [`Mano lanza ${name} sobre la mesa hacia cámara`, 'top-down, impacto en 0.5 s', 'demonstration', 'pattern_interrupt'],
    [`Texto gigante "${shortPhrase(pain, 3).toUpperCase()}" tachado en rojo`, 'tachado animado 0.6 s', 'contrarian', 'conflict'],
    [`Cara de sorpresa mirando ${name}`, 'zoom punch-in a la cara', 'emotional', 'surprise'],
    [`Unboxing con giro: la caja se abre sola`, 'stop-motion 4 frames', 'curiosity', 'pattern_interrupt'],
    [`Cuenta atrás 3-2-1 sobre ${name}`, 'cortes al ritmo de la cuenta', 'list', 'open_loop'],
    [`POV en primera persona usando ${name}`, 'cámara al pecho, movimiento natural', 'pov', 'identification'],
    [`Comparativa en mesa: producto genérico vs ${name}`, 'travelling lateral', 'comparison', 'contrast'],
    [`Prueba de estrés de ${name}`, 'cámara fija, acción extrema', 'challenge', 'surprise'],
    [`Detalle de textura / material de ${name}`, 'macro con luz rasante', 'demonstration', 'curiosity_gap'],
    [`Persona interrumpe el plano tapando la cámara`, 'whip-pan al producto', 'curiosity', 'pattern_interrupt'],
    [`Montaje de 3 planos de 0.3 s del problema`, 'cortes rápidos', 'problem', 'pattern_interrupt'],
    [`${name} sobre fondo de color sólido de marca girando`, 'rotación 360° 1 s', 'desire', 'curiosity_gap'],
    [`Reacción de otra persona al ver el resultado`, 'over-the-shoulder', 'social_proof', 'identification'],
    [`El momento exacto en que ${lc(benefit)}`, 'slow motion 50%', 'desire', 'open_loop'],
    [`Objeto cotidiano que falla vs ${name} que no`, 'pantalla partida vertical', 'comparison', 'contrast'],
    [`Mano señalando un detalle del producto con texto flecha`, 'zoom al detalle', 'curiosity', 'curiosity_gap'],
  ];
  const visualHooks = visualTemplates.map(([firstFrame, motion, family, mechanism], i) => ({ id: `V${i + 1}`, firstFrame, motion, family, mechanism }));

  const spokenTemplates: [string, z.infer<typeof Family>][] = [
    [`Nadie habla de esto: ${lc(pain)}.`, 'curiosity'],
    [`Deja de hacer esto si quieres ${lc(desire)}.`, 'contrarian'],
    [`Esto me cambió el día a día.`, 'emotional'],
    [`Te enseño algo en 10 segundos.`, 'demonstration'],
    [`Si te pasa ${lc(pain)}, escucha.`, 'problem'],
    [`Yo también pensaba "${lc(obj)}".`, 'social_proof'],
    [`Tres razones por las que esto funciona.`, 'list'],
    [`Mira qué pasa ahora.`, 'demonstration'],
    [`El error que cometía cada día…`, 'mistake'],
    [`Quiero ${lc(desire)}. Y lo conseguí así.`, 'desire'],
  ];
  const spokenHooks = spokenTemplates.map(([line, family], i) => ({ id: `S${i + 1}`, line, family }));

  const openingConcepts = Array.from({ length: 10 }, (_, i) => {
    const t = textHooks[(i * 2) % textHooks.length];
    const v = visualHooks[(i * 3) % visualHooks.length];
    const s = spokenHooks[i % spokenHooks.length];
    return { id: `O${i + 1}`, title: `${uc(t.family)} × ${v.mechanism}`, text: t.text, visual: `${v.firstFrame} (${v.motion})`, spoken: s.line };
  });

  // Heuristic scorecard — real rules applied to the generated text.
  const keyTerms = [pain, desire, benefit, wow, name].flatMap((x) => x.toLowerCase().split(/\s+/)).filter((w) => w.length > 4);
  const fit = (s: string) => clamp(4 + keyTerms.filter((k) => s.toLowerCase().includes(k)).length * 2, 1, 10);
  const scoreText = (id: string, s: string, fam: string, mech: string) => ({
    itemId: id,
    attention: clamp(['pattern_interrupt', 'surprise', 'conflict'].includes(mech) ? 8 : 6, 1, 10),
    curiosity: clamp(['curiosity_gap', 'open_loop'].includes(mech) ? 9 : /…|:$|\?/.test(s) ? 7 : 5, 1, 10),
    productFit: fit(s),
    novelty: clamp(['contrarian', 'challenge', 'mistake', 'pov'].includes(fam) ? 7 : 5, 1, 10),
    emotionalImpact: clamp(['emotional', 'problem', 'pov'].includes(fam) ? 8 : 5, 1, 10),
    scrollStop: clamp(words(s) <= 6 ? 8 : words(s) <= 9 ? 6 : 4, 1, 10),
    clarity: clamp(words(s) <= 8 ? 9 : words(s) <= 11 ? 6 : 3, 1, 10),
    note: `Heurística local: ${words(s)} palabras, familia ${fam}, mecanismo ${mech}.`,
  });
  const scores = [
    ...textHooks.map((h) => scoreText(h.id, h.text, h.family, h.mechanism)),
    ...visualHooks.map((h) => ({ ...scoreText(h.id, h.firstFrame, h.family, h.mechanism), clarity: 7, scrollStop: h.motion.match(/0\.\d|rápido|impacto|punch/) ? 9 : 6 })),
    ...spokenHooks.map((h) => scoreText(h.id, h.line, h.family, 'identification')),
    ...openingConcepts.map((o) => scoreText(o.id, o.text, 'demonstration', 'open_loop')),
  ];
  const total = (id: string) => hookTotal(scores.find((s) => s.itemId === id)!);
  const rank = <T extends { id: string }>(xs: T[]) => [...xs].sort((a, b) => total(b.id) - total(a.id));
  const topText = rank(textHooks);
  const topVisual = rank(visualHooks);
  const topSpoken = rank(spokenHooks);
  // Angle steering: ALEX/ATLAS may ask for a specific angle (e.g. "desire").
  const angle = String(ctx.task.input.angle ?? '').toLowerCase();
  const steered = angle ? topText.filter((h) => angle.includes(h.family) || h.family.includes(angle)) : [];
  const orderedText = [...steered, ...topText.filter((h) => !steered.includes(h))];

  const combos = Array.from({ length: 5 }, (_, i) => ({
    id: `C${i + 1}`,
    textHookId: orderedText[i].id,
    visualHookId: topVisual[i].id,
    spokenHookId: topSpoken[i % topSpoken.length].id,
    rationale: `Texto "${orderedText[i].text}" + visual de ${topVisual[i].mechanism} refuerzan el mismo insight (${orderedText[i].family}).`,
  }));
  for (const c of combos) {
    const t = scores.find((s) => s.itemId === c.textHookId)!;
    const v = scores.find((s) => s.itemId === c.visualHookId)!;
    scores.push({ ...t, itemId: c.id, scrollStop: Math.max(t.scrollStop, v.scrollStop), attention: Math.max(t.attention, v.attention), note: 'Combinación: máximo de atención/scroll-stop de sus partes.' });
  }
  const abVariants = [
    { id: 'AB1', baseItemId: orderedText[0].id, variable: 'formulación', variantA: orderedText[0].text, variantB: orderedText[1].text },
    { id: 'AB2', baseItemId: topVisual[0].id, variable: 'primer frame', variantA: topVisual[0].firstFrame, variantB: topVisual[1].firstFrame },
    { id: 'AB3', baseItemId: combos[0].id, variable: 'hook hablado', variantA: topSpoken[0].line, variantB: topSpoken[1].line },
  ];
  return {
    analysis: ins,
    textHooks,
    visualHooks,
    spokenHooks,
    openingConcepts,
    combos,
    abVariants,
    scores,
    selection: {
      topTextHookIds: orderedText.slice(0, 3).map((h) => h.id),
      topVisualHookIds: topVisual.slice(0, 3).map((h) => h.id),
      topComboId: 'C1',
      rationale: `Seleccionados por puntuación ponderada del scorecard${angle ? ` y alineados con el ángulo "${angle}"` : ''}. Motor heurístico local (sin LLM).`,
    },
  };
}

export const novaHooks = defineTaskType({
  type: 'nova.hooks',
  agent: 'NOVA',
  label: 'Hooks',
  description: 'Analizar el producto activo y crear, puntuar y seleccionar hooks (texto, visuales, hablados, aperturas, combinaciones y A/B).',
  skills: ['product-insight-extraction', 'hook-engineering', 'data-integrity'],
  reviewer: 'ALEX',
  requiresProduct: true,
  schema: HooksSchema,
  maxTokens: 30000,
  instructions: (ctx) => `Produce la batería completa de hooks para un vídeo short-form del PRODUCTO ACTIVO.
${ctx.task.input.angle ? `Ángulo pedido por dirección: ${ctx.task.input.angle}` : ''}
${ctx.task.input.brief ? `Brief: ${ctx.task.input.brief}` : ''}

Pasos obligatorios:
1. "analysis": analiza primero el producto (dolor, deseo, objeción, beneficio, emoción dominante, transformación, elemento visual más sorprendente, motivo para prestar atención). Las inferencias sin dato van en "hypotheses".
2. Exactamente 20 "textHooks" (IDs T1..T20), 20 "visualHooks" (V1..V20, describe el primer frame y el movimiento), 10 "spokenHooks" (S1..S10), 10 "openingConcepts" (O1..O10), 5 "combos" (C1..C5 referenciando IDs existentes) y 3 "abVariants" que aíslen UNA variable.
3. Usa al menos 6 familias distintas en los textHooks. Ninguna frase genérica válida para cualquier producto.
4. "scores": puntúa CADA elemento (T, V, S, O y C) de 1 a 10 en attention, curiosity, productFit, novelty, emotionalImpact, scrollStop y clarity, con una nota breve y honesta.
5. "selection": los 3 mejores textHooks, los 3 mejores visualHooks y el mejor combo, con justificación. Esto es lo que recibirá NEO.
${feedbackBlock(ctx)}`,
  local: localHooks,
  gate(out) {
    const issues: string[] = [];
    if (out.textHooks.length < 20) issues.push(`Se requieren 20 hooks de texto (hay ${out.textHooks.length}).`);
    if (out.visualHooks.length < 20) issues.push(`Se requieren 20 hooks visuales (hay ${out.visualHooks.length}).`);
    if (out.openingConcepts.length < 10) issues.push(`Se requieren 10 conceptos de apertura (hay ${out.openingConcepts.length}).`);
    if (out.combos.length < 5) issues.push(`Se requieren 5 combinaciones (hay ${out.combos.length}).`);
    if (new Set(out.textHooks.map((h) => h.family)).size < 4) issues.push('Poca diversidad: usa más familias de hooks.');
    const ids = new Set([...out.textHooks, ...out.visualHooks, ...out.spokenHooks, ...out.openingConcepts, ...out.combos].map((x) => x.id));
    const scored = new Set(out.scores.map((s) => s.itemId));
    const unscored = [...ids].filter((id) => !scored.has(id));
    if (unscored.length) issues.push(`Elementos sin puntuar: ${unscored.slice(0, 8).join(', ')}.`);
    for (const id of [...out.selection.topTextHookIds, ...out.selection.topVisualHookIds, out.selection.topComboId]) {
      if (!ids.has(id)) issues.push(`La selección referencia un ID inexistente: ${id}.`);
    }
    if (!out.selection.topTextHookIds.length) issues.push('Falta la selección de hooks de texto.');
    return issues;
  },
  async apply(ctx, out) {
    const videoId = videoIdOf(ctx);
    const totals = Object.fromEntries(out.scores.map((s) => [s.itemId, hookTotal(s)]));
    const top = out.textHooks.find((h) => h.id === out.selection.topTextHookIds[0]) ?? out.textHooks[0];
    const topVisual = out.visualHooks.find((h) => h.id === out.selection.topVisualHookIds[0]) ?? out.visualHooks[0];
    const combo = out.combos.find((c) => c.id === out.selection.topComboId) ?? out.combos[0];
    const counts = out.textHooks.length + out.visualHooks.length + out.spokenHooks.length + out.openingConcepts.length + out.combos.length;
    ctx.tools.saveHooks(videoId, { ...out, totals, topFamily: top.family }, top.text, counts);
    ctx.c.videos.setStatus(videoId, 'BLUEPRINT', 'NOVA', `Hook: "${top.text}"`);
    const p = ctx.product!;
    if (!ctx.c.memory.list({ scope: 'product', scopeId: p.id, kind: 'insight' }).some((m) => m.title === 'Insights de atención (NOVA)')) {
      ctx.tools.remember({
        scope: 'product',
        scopeId: p.id,
        kind: 'insight',
        title: 'Insights de atención (NOVA)',
        content: `Dolor: ${out.analysis.mainPain} | Deseo: ${out.analysis.mainDesire} | Objeción: ${out.analysis.mainObjection} | Beneficio: ${out.analysis.mainBenefit} | Emoción: ${out.analysis.dominantEmotion} | Transformación: ${out.analysis.transformation}`,
        importance: 4,
      });
    }
    ctx.tools.send('NEO', `Hooks seleccionados. Top: "${top.text}" (${totals[top.id]}/100) + visual "${topVisual.firstFrame}". Combo ${combo.id}.`, 'handoff', {
      topTextHookIds: out.selection.topTextHookIds,
      topVisualHookIds: out.selection.topVisualHookIds,
      topComboId: combo.id,
    });
    const avgTop = Math.round(out.selection.topTextHookIds.map((id) => totals[id] ?? 0).reduce((a, b) => a + b, 0) / Math.max(1, out.selection.topTextHookIds.length));
    return {
      summary: `${counts} hooks creados y puntuados. Seleccionado: "${top.text}" (${totals[top.id]}/100).`,
      score: avgTop,
      data: { topHook: top.text, topHookId: top.id, count: counts },
    };
  },
});


import { z } from 'zod';
import { brandPalette, defineTaskType, feedbackBlock, json, productImagePath, videoIdOf, type TaskContext } from './base.js';
import type { Blueprint } from './neo.js';
import type { ShotSpec } from '../../integrations/types.js';

export const ProductionSchema = z.object({
  plan: z.object({
    format: z.string(),
    totalDurationSec: z.number(),
    style: z.string(),
    characters: z.array(z.object({ name: z.string(), description: z.string(), wardrobe: z.string() })),
    productHandling: z.string(),
    locations: z.array(z.string()),
    voiceDirection: z.string(),
    musicDirection: z.string(),
  }),
  shots: z.array(
    z.object({
      index: z.number(),
      section: z.string(),
      durationSec: z.number(),
      shotType: z.string(),
      camera: z.string(),
      composition: z.string(),
      lighting: z.string(),
      action: z.string(),
      onScreenText: z.string(),
      voiceover: z.string(),
      generationPrompt: z.string(),
    }),
  ),
  productionNotes: z.string(),
});
export type Production = z.infer<typeof ProductionSchema>;

const DIRECTION: Record<string, { shot: string; camera: string; light: string }> = {
  HOOK: { shot: 'ECU / macro', camera: 'push-in rápido', light: 'key lateral dura con rim' },
  PROBLEM: { shot: 'MS', camera: 'cámara en mano, estilo UGC', light: 'luz natural de ventana, algo apagada' },
  DEMONSTRATION: { shot: 'CU top-down', camera: 'cenital fija, foco en las manos', light: 'softbox 45°, colores fieles' },
  SOLUTION: { shot: 'CU detalle', camera: 'slider lateral lento', light: 'luz suave + rim para separar del fondo' },
  DESIRE: { shot: 'MS lifestyle', camera: 'gimbal, movimiento orbital suave', light: 'golden hour / cálida' },
  PRODUCT: { shot: 'Hero shot', camera: 'rotación 360° sobre peana', light: 'estudio, fondo de color de marca' },
  CTA: { shot: 'Hero shot', camera: 'estático con push-in leve', light: 'estudio, fondo de marca' },
};

function blueprintOf(ctx: TaskContext): Blueprint {
  const bp = ctx.c.videos.get(videoIdOf(ctx)).blueprint as Blueprint | null;
  if (!bp) throw new Error('No blueprint from NEO for this video');
  return bp;
}

function localProduction(ctx: TaskContext): Production {
  const p = ctx.product!;
  const bp = blueprintOf(ctx);
  const fb = ctx.feedback.join(' ').toLowerCase();
  const closer = /producto|visible|plano|encuadre|framing/.test(fb);
  const shots = bp.sections.map((s, i) => {
    const dir = DIRECTION[s.section] ?? DIRECTION.DEMONSTRATION;
    const shotType = closer && s.showsProduct ? 'CU (producto ocupa ≥ 50% del cuadro)' : dir.shot;
    return {
      index: i + 1,
      section: s.section,
      durationSec: s.durationSec,
      shotType,
      camera: dir.camera,
      composition: s.showsProduct ? 'Producto en el tercio central, logo visible, zona segura libre para texto' : 'Sujeto en el tercio central, aire arriba para el texto',
      lighting: dir.light,
      action: s.visual,
      onScreenText: s.onScreenText,
      voiceover: s.voiceover,
      generationPrompt: `Vertical 9:16, ${shotType}, ${dir.camera}. ${s.visual}. ${s.showsProduct ? `Product "${p.name}" clearly visible and in focus.` : ''} Lighting: ${dir.light}. Style: ${bp.visualStyle}. Duration ${s.durationSec}s. Single continuous action, no text in frame.`,
    };
  });
  return {
    plan: {
      format: '9:16 vertical, 1080x1920 (animatic 540x960)',
      totalDurationSec: shots.reduce((a, s) => a + s.durationSec, 0),
      style: bp.visualStyle,
      characters: [{ name: 'Protagonista', description: p.targetAudience || 'Persona del público objetivo (HIPÓTESIS: sin buyer persona definida)', wardrobe: 'Ropa cotidiana, colores neutros que no compitan con el producto' }],
      productHandling: `Siempre limpio, con la marca visible; manos en cuadro en DEMONSTRATION.${closer ? ' Planos más cerrados tras feedback de QA.' : ''}`,
      locations: ['Interior doméstico con luz natural', 'Mesa/superficie neutra para demostración', 'Fondo de color de marca para hero/CTA'],
      voiceDirection: `Tono ${p.brandTone || 'cercano y directo'}, primera frase sin saludo, ritmo ágil.`,
      musicDirection: 'Beat ligero 100-120 BPM acorde al ritmo de corte (requiere conector de música).',
    },
    shots,
    productionNotes: closer ? 'Revisión: encuadres más cerrados en los planos con producto.' : 'Producción directa del blueprint aprobado.',
  };
}

export const rexProduce = defineTaskType({
  type: 'rex.produce',
  agent: 'REX',
  label: 'Producción',
  description: 'Convertir el blueprint en un plan de producción plano a plano y producir el RAW VIDEO con el motor activo.',
  skills: ['video-production', 'data-integrity'],
  reviewer: 'ALEX',
  requiresProduct: true,
  schema: ProductionSchema,
  instructions(ctx) {
    const bp = blueprintOf(ctx);
    return `Dirige la producción del vídeo a partir del VIDEO BLUEPRINT aprobado de NEO.

# BLUEPRINT
${json(bp)}

Requisitos:
- Un plano ("shots") por sección del blueprint como mínimo (puedes dividir una sección en dos planos). "index" empieza en 1 y es consecutivo.
- La suma de "durationSec" debe igualar la duración del blueprint (${bp.totalDurationSec} s).
- Cada plano: tipo de plano, cámara/movimiento, composición, iluminación, acción concreta, texto en pantalla, locución y un "generationPrompt" autosuficiente (en inglés) para un motor de generación de vídeo: sujeto + acción + entorno + cámara + luz + estilo + duración, una sola acción, sin texto incrustado.
- Define personajes, manejo del producto, localizaciones, dirección de voz y de música.
- Material disponible del propietario: ${ctx.product!.images.length} imagen(es) del producto.
${feedbackBlock(ctx)}`;
  },
  local: localProduction,
  gate(out, ctx) {
    const issues: string[] = [];
    if (out.shots.length < 3) issues.push('Se necesitan al menos 3 planos.');
    out.shots.forEach((s, i) => {
      if (s.index !== i + 1) issues.push(`Índices de plano no consecutivos (plano ${i + 1} tiene index ${s.index}).`);
      if (!s.generationPrompt.trim() || !s.action.trim()) issues.push(`El plano ${s.index} no tiene acción o prompt de generación.`);
      if (s.durationSec <= 0) issues.push(`El plano ${s.index} tiene duración inválida.`);
    });
    const bp = blueprintOf(ctx);
    const sum = out.shots.reduce((a, s) => a + s.durationSec, 0);
    if (Math.abs(sum - bp.totalDurationSec) > 2) issues.push(`Duración total de planos ${sum.toFixed(1)} s ≠ blueprint ${bp.totalDurationSec} s.`);
    return [...new Set(issues)];
  },
  async apply(ctx, out) {
    const videoId = videoIdOf(ctx);
    const p = ctx.product!;
    const shots: ShotSpec[] = out.shots.map((s) => ({ ...s, camera: `${s.camera} · ${s.composition}` }));
    const gen = await ctx.tools.generateShots(videoId, p.name, shots, brandPalette(p), productImagePath(ctx));
    const shotAssets = gen.paths.map((file, i) => ctx.c.videos.registerAsset(file, 'shot', 'video/mp4', { shot: i + 1, engine: gen.engine }).id);
    let rawAssetId: string | null = null;
    let probe = null;
    if (gen.rawPath) {
      probe = await ctx.tools.probe(gen.rawPath);
      rawAssetId = ctx.c.videos.registerAsset(gen.rawPath, 'raw', 'video/mp4', { engine: gen.engine, probe }).id;
    }
    ctx.c.videos.patch(videoId, { production: { ...out, engine: gen.engine, shotAssetIds: shotAssets, shotPaths: gen.paths, rawProbe: probe }, ...(rawAssetId ? { rawAsset: rawAssetId } : {}) });
    ctx.c.videos.addVersion(videoId, 'raw', rawAssetId, `${out.shots.length} planos · motor ${gen.engine}${gen.engine === 'local-animatic' ? ' (animática, no metraje real)' : ''}`, 'REX');
    ctx.c.videos.setStatus(videoId, 'EDITING', 'REX', `Raw listo (${out.shots.length} planos)`);
    ctx.c.events.emit('VIDEO_CREATED', { videoId, engine: gen.engine, shots: out.shots.length });
    ctx.tools.send('MAX', `Raw video ready: ${out.shots.length} planos, ${probe ? probe.durationSec.toFixed(1) + ' s' : 'sin preview'} (motor ${gen.engine}).`, 'handoff');
    return { summary: `Producción completada: ${out.shots.length} planos con ${gen.engine}.`, data: { engine: gen.engine, shots: out.shots.length } };
  },
});

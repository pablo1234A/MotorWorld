import type { AppConfig } from '../config.js';
import { IntegrationRequiredError } from '../core/errors.js';
import type { LlmGateway } from '../llm/provider.js';
import { Ffmpeg, detectDrawtextFeatures } from './ffmpeg.js';
import { PublicPageSnapshotAdapter, ShopifyAdapter } from './store.js';
import type { IntegrationInfo, MediaEngine, PageSnapshotAdapter, RenderAdapter, VideoGenerationAdapter } from './types.js';

/** Replace built-in engines (e.g. the in-browser edition swaps ffmpeg for WebCodecs). */
export interface IntegrationOverrides {
  media?: MediaEngine;
  videoGenerators?: VideoGenerationAdapter[];
  renderers?: RenderAdapter[];
  pageSnapshot?: PageSnapshotAdapter;
  storageDescription?: string;
}
import { ExternalRenderSlot, ExternalVideoGenerationSlot, LocalAnimaticAdapter, LocalRenderAdapter } from './video.js';

/** Static slot description for capabilities with no adapter implemented yet. */
function slot(id: string, name: string, category: IntegrationInfo['category'], description: string, notes: string[] = []): IntegrationInfo {
  return { id, name, category, kind: 'external', status: 'INTEGRATION_REQUIRED', description, capabilities: [], requiredEnv: ['Credenciales del proveedor elegido'], notes, active: false };
}

/**
 * Central registry: one place that knows which adapter is active for each
 * capability. Agents ask the registry; they never talk to vendors directly.
 */
export class IntegrationRegistry {
  readonly media: MediaEngine;
  readonly videoGenerators: VideoGenerationAdapter[];
  readonly renderers: RenderAdapter[];
  readonly pageSnapshot: PageSnapshotAdapter;
  readonly shopify: ShopifyAdapter;

  constructor(private cfg: AppConfig, private llm: LlmGateway, private overrides: IntegrationOverrides = {}) {
    if (overrides.media) this.media = overrides.media;
    else {
      const ff = new Ffmpeg(cfg.ffmpegPath, cfg.ffprobePath, cfg.fontFile);
      detectDrawtextFeatures(cfg.ffmpegPath);
      this.media = ff;
    }
    // Order = preference. External engines win once implemented & connected.
    this.videoGenerators = overrides.videoGenerators ?? [new ExternalVideoGenerationSlot(), new LocalAnimaticAdapter(this.media as Ffmpeg)];
    this.renderers = overrides.renderers ?? [new ExternalRenderSlot(), new LocalRenderAdapter(this.media as Ffmpeg)];
    this.pageSnapshot = overrides.pageSnapshot ?? new PublicPageSnapshotAdapter();
    this.shopify = new ShopifyAdapter(cfg.shopifyDomain, cfg.shopifyToken);
  }

  private pick<T extends { info(): IntegrationInfo }>(list: T[], what: string): T {
    const usable = list.find((a) => ['CONNECTED', 'BUILTIN'].includes(a.info().status));
    if (!usable) throw new IntegrationRequiredError(what, `No ${what} engine available (install ffmpeg or connect an external engine)`);
    return usable;
  }

  videoGenerator(): VideoGenerationAdapter {
    return this.pick(this.videoGenerators, 'video_generation');
  }

  renderer(): RenderAdapter {
    return this.pick(this.renderers, 'render');
  }

  list(): IntegrationInfo[] {
    const mark = (list: { info(): IntegrationInfo }[], active: string | null) =>
      list.map((a) => ({ ...a.info(), active: a.info().id === active }));
    const activeGen = safe(() => this.videoGenerator().id);
    const activeRender = safe(() => this.renderer().id);
    return [
      {
        id: 'anthropic',
        name: 'Anthropic Claude (cerebro de los agentes)',
        category: 'llm',
        kind: 'external',
        status: this.llm.available ? 'CONNECTED' : 'INTEGRATION_REQUIRED',
        description: this.llm.available
          ? `Todos los agentes piensan con ${this.llm.model} (salidas estructuradas validadas).`
          : 'Sin ANTHROPIC_API_KEY: los agentes funcionan con el MOTOR HEURÍSTICO LOCAL (reglas deterministas sobre el producto). Conecta Claude para razonamiento real.',
        capabilities: this.llm.available ? ['reasoning', 'structured-output', 'chat'] : [],
        requiredEnv: ['ANTHROPIC_API_KEY', 'LLM_MODEL (opcional)'],
        notes: [],
        active: this.llm.available,
      },
      {
        id: 'local-heuristic',
        name: 'Local Heuristic Engine',
        category: 'llm',
        kind: 'builtin',
        status: 'BUILTIN',
        description: 'Motor de reserva sin IA: genera resultados con plantillas y reglas a partir de los datos del producto. Todo lo que produce queda etiquetado como "local-heuristic".',
        capabilities: ['offline-fallback'],
        requiredEnv: [],
        notes: [],
        active: !this.llm.available,
      },
      ...mark(this.videoGenerators, activeGen),
      ...mark(this.renderers, activeRender),
      slot('voice-tts', 'Voice / Text-to-Speech', 'voice', 'Locución de los guiones de REX. Sin conector, los vídeos no llevan voz.'),
      slot('music-library', 'Licensed Music & SFX Library', 'music', 'Música y sound design con licencia para MAX. Sin conector, pista de audio silenciosa.'),
      this.pageSnapshot.info(),
      this.shopify.info(),
      slot('analytics', 'Sales / Ads / Web Analytics', 'analytics', 'Datos de ventas, conversión y rendimiento de anuncios para IRIS. Sin conector IRIS solo usa datos internos reales.'),
      {
        id: 'internal-metrics',
        name: 'Internal Company Metrics',
        category: 'analytics',
        kind: 'builtin',
        status: 'BUILTIN',
        description: 'Datos reales generados por la propia empresa: tareas, scores de QA, hooks, revisiones, entregas y errores.',
        capabilities: ['qa-scores', 'pipeline-metrics'],
        requiredEnv: [],
        notes: [],
        active: true,
      },
      {
        id: 'local-storage',
        name: 'Local Disk Storage',
        category: 'storage',
        kind: 'builtin',
        status: 'BUILTIN',
        description: this.overrides.storageDescription ?? `Vídeos e imágenes en ${this.cfg.mediaDir}. Sustituible por almacenamiento externo (S3-compatible, etc.).`,
        capabilities: ['store-media', 'stream-media'],
        requiredEnv: ['DATA_DIR'],
        notes: [],
        active: true,
      },
      slot('publishing', 'Publishing Connectors', 'publishing', 'Publicación en redes. No es necesaria: un vídeo está terminado cuando llega al Delivery Center. Publicar siempre requerirá aprobación.'),
    ];
  }
}

function safe<T>(fn: () => T): T | null {
  try {
    return fn();
  } catch {
    return null;
  }
}

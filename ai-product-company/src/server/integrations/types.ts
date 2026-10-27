/**
 * INTEGRATIONS ARCHITECTURE.
 * Every external capability sits behind an adapter interface. Adapters are
 * independent modules; the company keeps working when all external ones are
 * disconnected (built-in engines or INTEGRATION_REQUIRED states).
 */
export type IntegrationCategory = 'llm' | 'video_generation' | 'render' | 'voice' | 'music' | 'store' | 'analytics' | 'storage' | 'publishing';

/**
 * CONNECTED            external service configured and reachable
 * BUILTIN              built-in engine working locally (no external service)
 * INTEGRATION_REQUIRED adapter slot exists but no implementation/credentials yet
 * UNAVAILABLE          built-in engine missing a local dependency (e.g. ffmpeg)
 */
export type IntegrationStatus = 'CONNECTED' | 'BUILTIN' | 'INTEGRATION_REQUIRED' | 'UNAVAILABLE';

export interface IntegrationInfo {
  id: string;
  name: string;
  category: IntegrationCategory;
  kind: 'builtin' | 'external';
  status: IntegrationStatus;
  description: string;
  capabilities: string[];
  requiredEnv: string[];
  notes: string[];
  /** Used by agents when this slot is active for its category. */
  active: boolean;
}

export interface ShotSpec {
  index: number;
  section: string;
  durationSec: number;
  shotType: string;
  camera: string;
  lighting: string;
  action: string;
  onScreenText: string;
  voiceover: string;
  generationPrompt: string;
}

export interface ShotGenerationRequest {
  videoId: string;
  productName: string;
  shot: ShotSpec;
  totalShots: number;
  productImagePath: string | null;
  palette: BrandPalette;
  outDir: string;
}

export interface BrandPalette {
  primary: string;
  secondary: string;
  accent: string;
  text: string;
}

export interface VideoGenerationAdapter {
  readonly id: string;
  info(): IntegrationInfo;
  generateShot(req: ShotGenerationRequest): Promise<{ path: string }>;
}

export interface EditSegment {
  shotIndex: number;
  durationSec: number;
  caption: string;
  overlayText: string;
  zoom: 'none' | 'punch_in' | 'slow_push';
  transitionOut: 'cut' | 'fade' | 'slide' | 'wipe';
}

export interface EditDecisionList {
  hookText: string;
  segments: EditSegment[];
  cta: { text: string; durationSec: number };
  watermark: string;
  music: { mood: string; bpm: number };
  soundDesign: string[];
  colorGrade: string;
  captionsStyle: string;
}

export interface RenderRequest {
  videoId: string;
  version: number;
  shotPaths: string[];
  edl: EditDecisionList;
  productName: string;
  palette: BrandPalette;
  outDir: string;
}

export interface RenderAdapter {
  readonly id: string;
  info(): IntegrationInfo;
  render(req: RenderRequest): Promise<{ path: string; posterPath: string }>;
}

export interface StorePageSnapshot {
  url: string;
  fetchedAt: string;
  httpStatus: number;
  title: string | null;
  metaDescription: string | null;
  h1: string[];
  prices: string[];
  ctaTexts: string[];
  imageCount: number;
  hasVideo: boolean;
  trustSignals: string[];
  wordCount: number;
  textExcerpt: string;
}

export interface StoreAdapter {
  readonly id: string;
  info(): IntegrationInfo;
}

export interface MediaProbe {
  durationSec: number;
  sizeBytes: number;
  width: number;
  height: number;
  fps: number;
  frames: number;
  videoCodec: string | null;
  hasAudio: boolean;
  audioCodec: string | null;
}

/** Low-level media operations the company needs (probe, join, frame grabs). ffmpeg on the server, WebCodecs in the browser. */
export interface MediaEngine {
  readonly available: boolean;
  readonly label: string;
  probe(file: string): Promise<MediaProbe>;
  concat(files: string[], out: string): Promise<void>;
  frames(file: string, times: number[], dir: string): Promise<string[]>;
  /** Generated placeholder image for the fictitious test product. */
  testProductImage(out: string, label: string): Promise<void>;
}

export interface PageSnapshotAdapter {
  readonly id: string;
  info(): IntegrationInfo;
  snapshot(url: string): Promise<StorePageSnapshot>;
}

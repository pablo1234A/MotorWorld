import { ArrayBufferTarget, Muxer } from 'mp4-muxer';
import fs from './shims/fs';
import path from './shims/path';
import type {
  BrandPalette,
  EditDecisionList,
  IntegrationInfo,
  MediaEngine,
  MediaProbe,
  PageSnapshotAdapter,
  RenderAdapter,
  RenderRequest,
  ShotGenerationRequest,
  ShotSpec,
  StorePageSnapshot,
  VideoGenerationAdapter,
} from '../server/integrations/types';
import { IntegrationRequiredError } from '../server/core/errors';

/**
 * BROWSER MEDIA ENGINE — the in-page equivalent of the ffmpeg engine.
 * Every frame is drawn on a canvas and encoded to a real H.264 MP4 with
 * WebCodecs (fallback: realtime WebM via MediaRecorder). Each file gets a
 * sidecar (.meta.json) describing how it was made, so probing, frame grabs and
 * re-composition never need a decoder.
 */
const W = 540;
const H = 960;
const FPS = 30;
const FONT = '"Geist Variable", system-ui, -apple-system, "Segoe UI", sans-serif';

interface BaseMeta extends MediaProbe {
  kind: 'shot' | 'concat' | 'final';
}
interface ShotMeta extends BaseMeta {
  kind: 'shot';
  spec: ShotSpec;
  palette: BrandPalette;
  productName: string;
  totalShots: number;
  productImagePath: string | null;
}
interface ConcatMeta extends BaseMeta {
  kind: 'concat';
  parts: string[];
}
interface FinalMeta extends BaseMeta {
  kind: 'final';
  shotPaths: string[];
  edl: EditDecisionList;
  productName: string;
  palette: BrandPalette;
}
type Meta = ShotMeta | ConcatMeta | FinalMeta;

const metaPath = (p: string) => `${p}.meta.json`;
const readMeta = (p: string): Meta => JSON.parse(fs.readFileSync(metaPath(p), 'utf8') as string);
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/* ───────────── capabilities ───────────── */

interface Caps {
  h264: string | null;
  aac: boolean;
  webm: string | null;
}
let caps: Caps | null = null;

export async function detectCaps(): Promise<Caps> {
  if (caps) return caps;
  let h264: string | null = null;
  if (typeof VideoEncoder !== 'undefined') {
    for (const codec of ['avc1.42001f', 'avc1.4d001f', 'avc1.640028']) {
      try {
        const r = await VideoEncoder.isConfigSupported({ codec, width: W, height: H, bitrate: 2_500_000, framerate: FPS, avc: { format: 'avc' } });
        if (r.supported) {
          h264 = codec;
          break;
        }
      } catch {
        /* try next */
      }
    }
  }
  let aac = false;
  if (h264 && typeof AudioEncoder !== 'undefined') {
    try {
      aac = Boolean((await AudioEncoder.isConfigSupported({ codec: 'mp4a.40.2', sampleRate: 48000, numberOfChannels: 2, bitrate: 64000 })).supported);
    } catch {
      aac = false;
    }
  }
  const webm =
    typeof MediaRecorder !== 'undefined' ? (['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'].find((m) => MediaRecorder.isTypeSupported(m)) ?? null) : null;
  caps = { h264, aac, webm };
  return caps;
}
const ext = () => (caps?.h264 ? 'mp4' : 'webm');

/* ───────────── drawing ───────────── */

const images = new Map<string, ImageBitmap | null>();
async function preloadImage(p: string | null) {
  if (!p || images.has(p)) return;
  try {
    const bytes = fs.readFileSync(p) as Uint8Array;
    images.set(p, await createImageBitmap(new Blob([bytes as BlobPart])));
  } catch {
    images.set(p, null);
  }
}

function canvas(w = W, h = H) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

function gradient(ctx: CanvasRenderingContext2D, c0: string, c1: string, t: number) {
  const a = 0.6 + t * 0.12;
  const g = ctx.createLinearGradient(W / 2 - Math.cos(a) * W, H / 2 - Math.sin(a) * H, W / 2 + Math.cos(a) * W, H / 2 + Math.sin(a) * H);
  g.addColorStop(0, c0);
  g.addColorStop(1, c1);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
}

function wrap(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, maxLines: number): string[] {
  const words = text.replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
  const lines: string[] = [];
  let line = '';
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = w;
    } else line = test;
  }
  if (line) lines.push(line);
  if (lines.length > maxLines) {
    const kept = lines.slice(0, maxLines);
    kept[maxLines - 1] = `${kept[maxLines - 1].replace(/\s*\S*$/, '')}…`;
    return kept;
  }
  return lines;
}

/** Centered text block; `y` is the top of the block, or `bottom` anchors it. */
function textBlock(
  ctx: CanvasRenderingContext2D,
  text: string,
  o: { size: number; y?: number; bottom?: number; color?: string; box?: string | null; maxWidth?: number; maxLines?: number; weight?: number; lineGap?: number; x?: number; align?: 'center' | 'left' },
) {
  if (!text.trim()) return;
  ctx.font = `${o.weight ?? 650} ${o.size}px ${FONT}`;
  const lines = wrap(ctx, text, o.maxWidth ?? W * 0.82, o.maxLines ?? 4);
  const lh = o.size * 1.2 + (o.lineGap ?? 6);
  const blockH = lines.length * lh - (o.lineGap ?? 6);
  const top = o.bottom != null ? H - o.bottom - blockH : o.y ?? 0;
  const widths = lines.map((l) => ctx.measureText(l).width);
  const maxW = Math.max(...widths);
  const align = o.align ?? 'center';
  const bx = align === 'center' ? W / 2 - maxW / 2 : o.x ?? 28;
  if (o.box) {
    const pad = 16;
    ctx.fillStyle = o.box;
    ctx.beginPath();
    ctx.roundRect(bx - pad, top - pad * 0.75, maxW + pad * 2, blockH + pad * 1.5, 8);
    ctx.fill();
  }
  ctx.fillStyle = o.color ?? '#fff';
  ctx.textBaseline = 'top';
  ctx.textAlign = 'left';
  lines.forEach((l, i) => ctx.fillText(l, align === 'center' ? W / 2 - widths[i] / 2 : bx, top + i * lh));
}

function drawShot(ctx: CanvasRenderingContext2D, m: ShotMeta, t: number) {
  const d = m.durationSec;
  gradient(ctx, m.palette.primary, m.palette.secondary, t);
  const img = m.productImagePath ? images.get(m.productImagePath) : null;
  if (img) {
    const scale = (Math.min(W * 0.74, img.width) / img.width) * (1 + (0.05 * t) / d);
    const w = img.width * scale;
    const h = img.height * scale;
    ctx.drawImage(img, W / 2 - w / 2, H / 2 - h / 2 - 40, w, h);
  } else {
    textBlock(ctx, m.productName.toUpperCase(), { size: 44, y: H / 2 - 90, color: `${m.palette.text}eb`, maxLines: 3 });
  }
  textBlock(ctx, `ANIMATIC · SHOT ${m.spec.index}/${m.totalShots} · ${m.spec.section.toUpperCase()}`, { size: 17, y: 60, color: 'rgba(255,255,255,0.85)', box: 'rgba(0,0,0,0.35)', maxLines: 1, weight: 600 });
  textBlock(ctx, `${m.spec.shotType} · ${m.spec.camera} — ${m.spec.action}`, { size: 18, bottom: 34, color: 'rgba(255,255,255,0.88)', box: 'rgba(0,0,0,0.45)', maxLines: 3, weight: 500 });
}

interface PlanItem {
  kind: 'seg' | 'cta';
  start: number;
  dur: number;
  overlapOut: number;
  trans: string;
  seg?: EditDecisionList['segments'][number];
  shot?: ShotMeta;
  first?: boolean;
}

function planFinal(m: FinalMeta) {
  const shots = m.shotPaths.map((p) => readMeta(p) as ShotMeta);
  const segs = m.edl.segments.filter((s) => shots[s.shotIndex - 1]);
  const items: PlanItem[] = segs.map((s, i) => ({
    kind: 'seg',
    seg: s,
    shot: shots[s.shotIndex - 1],
    dur: Math.min(clamp(s.durationSec, 0.8, 12), shots[s.shotIndex - 1].durationSec),
    start: 0,
    overlapOut: 0,
    trans: s.transitionOut,
    first: i === 0,
  }));
  items.push({ kind: 'cta', dur: clamp(m.edl.cta.durationSec, 1.5, 5), start: 0, overlapOut: 0, trans: 'cut' });
  let start = 0;
  items.forEach((it, i) => {
    it.start = start;
    it.overlapOut = i < items.length - 1 ? (it.trans === 'cut' ? 0.04 : 0.25) : 0;
    start += it.dur - it.overlapOut;
  });
  return { items, total: start };
}

function drawItem(ctx: CanvasRenderingContext2D, it: PlanItem, lt: number, m: FinalMeta, scratch: HTMLCanvasElement) {
  if (it.kind === 'cta') {
    gradient(ctx, m.palette.secondary, m.palette.primary, lt);
    textBlock(ctx, m.edl.cta.text, { size: 52, y: H / 2 - 110, color: m.palette.text, maxLines: 3, maxWidth: W * 0.8, lineGap: 12 });
    textBlock(ctx, m.productName.toUpperCase(), { size: 22, y: H * 0.68, color: `${m.palette.text}bf`, maxLines: 2, weight: 600 });
    if (lt < 0.3) {
      ctx.fillStyle = `rgba(0,0,0,${1 - lt / 0.3})`;
      ctx.fillRect(0, 0, W, H);
    }
    return;
  }
  const seg = it.seg!;
  const sctx = scratch.getContext('2d')!;
  drawShot(sctx, it.shot!, lt);
  const z = seg.zoom === 'punch_in' ? 1 + 0.14 * Math.min(lt / 0.25, 1) : seg.zoom === 'slow_push' ? 1 + (0.07 * lt) / it.dur : 1;
  ctx.drawImage(scratch, (W - W * z) / 2, (H - H * z) / 2, W * z, H * z);
  if (it.first && m.edl.hookText) textBlock(ctx, m.edl.hookText, { size: 44, y: H * 0.18, color: '#fff', box: `${m.palette.accent}eb`, maxLines: 4, lineGap: 10 });
  else if (seg.overlayText) textBlock(ctx, seg.overlayText, { size: 36, y: H * 0.16, color: '#fff', box: 'rgba(0,0,0,0.55)', maxLines: 2 });
  if (seg.caption) textBlock(ctx, seg.caption, { size: 30, y: H * 0.64, color: '#fff', box: 'rgba(0,0,0,0.62)', maxLines: 2 });
  if (m.edl.watermark) textBlock(ctx, m.edl.watermark.toUpperCase(), { size: 15, y: 30, color: 'rgba(255,255,255,0.6)', align: 'left', x: 28, maxLines: 1, weight: 600 });
}

function finalFrameDrawer(m: FinalMeta) {
  const { items, total } = planFinal(m);
  const layerA = canvas();
  const layerB = canvas();
  const scratch = canvas();
  return {
    total,
    draw(ctx: CanvasRenderingContext2D, t: number) {
      let idx = 0;
      for (let i = 0; i < items.length; i++) if (items[i].start <= t) idx = i;
      const cur = items[idx];
      const prev = idx > 0 && t < items[idx - 1].start + items[idx - 1].dur ? items[idx - 1] : null;
      const a = layerA.getContext('2d')!;
      drawItem(a, cur, t - cur.start, m, scratch);
      if (!prev || prev.trans === 'cut') {
        ctx.drawImage(layerA, 0, 0);
        return;
      }
      const b = layerB.getContext('2d')!;
      drawItem(b, prev, t - prev.start, m, scratch);
      const p = clamp((t - cur.start) / prev.overlapOut, 0, 1);
      ctx.drawImage(layerB, 0, 0);
      ctx.save();
      if (prev.trans === 'slide') ctx.drawImage(layerA, 0, H * (1 - p));
      else if (prev.trans === 'wipe') {
        ctx.beginPath();
        ctx.rect(W * (1 - p), 0, W * p, H);
        ctx.clip();
        ctx.drawImage(layerA, 0, 0);
      } else {
        ctx.globalAlpha = p;
        ctx.drawImage(layerA, 0, 0);
      }
      ctx.restore();
    },
  };
}

function drawerFor(m: Meta): { total: number; draw: (ctx: CanvasRenderingContext2D, t: number) => void } {
  if (m.kind === 'shot') return { total: m.durationSec, draw: (ctx, t) => drawShot(ctx, m, t) };
  if (m.kind === 'final') return finalFrameDrawer(m);
  const parts = m.parts.map((p) => readMeta(p) as ShotMeta);
  return {
    total: parts.reduce((a, p) => a + p.durationSec, 0),
    draw(ctx, t) {
      let acc = 0;
      for (const p of parts) {
        if (t < acc + p.durationSec || p === parts[parts.length - 1]) return drawShot(ctx, p, Math.min(t - acc, p.durationSec));
        acc += p.durationSec;
      }
    },
  };
}

async function preloadFor(m: Meta) {
  if (m.kind === 'shot') return preloadImage(m.productImagePath);
  const paths = m.kind === 'final' ? m.shotPaths : m.parts;
  for (const p of paths) await preloadImage((readMeta(p) as ShotMeta).productImagePath);
}

/* ───────────── encoding ───────────── */

async function encode(durationSec: number, draw: (ctx: CanvasRenderingContext2D, t: number) => void): Promise<{ bytes: Uint8Array; codec: string; hasAudio: boolean; frames: number }> {
  const c = await detectCaps();
  const frames = Math.max(1, Math.round(durationSec * FPS));
  const cv = canvas();
  const ctx = cv.getContext('2d')!;

  if (c.h264) {
    const muxer = new Muxer({
      target: new ArrayBufferTarget(),
      video: { codec: 'avc', width: W, height: H, frameRate: FPS },
      ...(c.aac ? { audio: { codec: 'aac' as const, numberOfChannels: 2, sampleRate: 48000 } } : {}),
      fastStart: 'in-memory',
      firstTimestampBehavior: 'offset',
    });
    let failure: Error | null = null;
    const enc = new VideoEncoder({ output: (chunk, meta) => muxer.addVideoChunk(chunk, meta), error: (e) => (failure = e) });
    enc.configure({ codec: c.h264, width: W, height: H, bitrate: 2_500_000, framerate: FPS, avc: { format: 'avc' } });
    for (let i = 0; i < frames; i++) {
      draw(ctx, i / FPS);
      const vf = new VideoFrame(cv, { timestamp: Math.round((i * 1e6) / FPS), duration: Math.round(1e6 / FPS) });
      enc.encode(vf, { keyFrame: i % (FPS * 2) === 0 });
      vf.close();
      while (enc.encodeQueueSize > 6) await sleep(2);
      if (i % 20 === 0) await sleep(0); // keep the UI and the company responsive
      if (failure) throw failure;
    }
    await enc.flush();
    enc.close();
    if (c.aac) {
      // Silent stereo track (voice/music need a connector) — keeps players and QA consistent with the server edition.
      const aenc = new AudioEncoder({ output: (chunk, meta) => muxer.addAudioChunk(chunk, meta), error: (e) => (failure = e) });
      aenc.configure({ codec: 'mp4a.40.2', sampleRate: 48000, numberOfChannels: 2, bitrate: 64000 });
      const total = Math.round((frames / FPS) * 48000);
      for (let pos = 0; pos < total; pos += 1024) {
        const n = Math.min(1024, total - pos);
        const ad = new AudioData({ format: 'f32-planar', sampleRate: 48000, numberOfFrames: n, numberOfChannels: 2, timestamp: Math.round((pos * 1e6) / 48000), data: new Float32Array(n * 2) });
        aenc.encode(ad);
        ad.close();
      }
      await aenc.flush();
      aenc.close();
    }
    if (failure) throw failure;
    muxer.finalize();
    return { bytes: new Uint8Array(muxer.target.buffer), codec: 'h264', hasAudio: c.aac, frames };
  }

  if (!c.webm) throw new IntegrationRequiredError('browser-video', 'Este navegador no puede codificar vídeo (ni WebCodecs H.264 ni MediaRecorder). Usa Chrome, Edge o Safari actualizados.');
  // Fallback: realtime capture (slower; keep the tab visible).
  const stream = cv.captureStream(FPS);
  const rec = new MediaRecorder(stream, { mimeType: c.webm, videoBitsPerSecond: 2_500_000 });
  const chunks: Blob[] = [];
  rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  const done = new Promise<void>((r) => (rec.onstop = () => r()));
  rec.start(250);
  const t0 = performance.now();
  for (let i = 0; i < frames; i++) {
    draw(ctx, i / FPS);
    const due = t0 + ((i + 1) * 1000) / FPS;
    await sleep(Math.max(0, due - performance.now()));
  }
  rec.stop();
  await done;
  const bytes = new Uint8Array(await new Blob(chunks).arrayBuffer());
  return { bytes, codec: c.webm.includes('vp9') ? 'vp9' : 'vp8', hasAudio: false, frames };
}

async function writeVideo(out: string, meta: Omit<Meta, keyof MediaProbe>, durationSec: number) {
  const full = { ...meta, durationSec, sizeBytes: 0, width: W, height: H, fps: FPS, frames: 0, videoCodec: null, hasAudio: false, audioCodec: null } as Meta;
  await preloadFor(full);
  const d = drawerFor(full);
  const r = await encode(d.total, d.draw);
  fs.writeFileSync(out, r.bytes);
  const probe: MediaProbe = { durationSec: r.frames / FPS, sizeBytes: r.bytes.length, width: W, height: H, fps: FPS, frames: r.frames, videoCodec: r.codec, hasAudio: r.hasAudio, audioCodec: r.hasAudio ? 'aac' : null };
  fs.writeFileSync(metaPath(out), JSON.stringify({ ...full, ...probe }));
  return probe;
}

async function snapshotJpeg(m: Meta, t: number, quality = 0.82): Promise<Uint8Array> {
  await preloadFor(m);
  const d = drawerFor(m);
  const cv = canvas();
  d.draw(cv.getContext('2d')!, clamp(t, 0, Math.max(0, d.total - 1 / FPS)));
  const blob: Blob = await new Promise((res, rej) => cv.toBlob((b) => (b ? res(b) : rej(new Error('toBlob failed'))), 'image/jpeg', quality));
  return new Uint8Array(await blob.arrayBuffer());
}

/* ───────────── engine + adapters ───────────── */

export class BrowserMediaEngine implements MediaEngine {
  readonly label = 'WebCodecs';
  get available() {
    return Boolean(caps && (caps.h264 || caps.webm));
  }
  async probe(file: string): Promise<MediaProbe> {
    const m = readMeta(file);
    return { durationSec: m.durationSec, sizeBytes: fs.statSync(file).size, width: m.width, height: m.height, fps: m.fps, frames: m.frames, videoCodec: m.videoCodec, hasAudio: m.hasAudio, audioCodec: m.audioCodec };
  }
  async concat(files: string[], out: string): Promise<void> {
    const target = out.replace(/\.mp4$/, `.${ext()}`);
    const total = files.reduce((a, f) => a + readMeta(f).durationSec, 0);
    await writeVideo(target, { kind: 'concat', parts: files } as Omit<ConcatMeta, keyof MediaProbe>, total);
    if (target !== out) {
      // Keep the caller's path valid: alias the real file.
      fs.writeFileSync(out, fs.readFileSync(target) as Uint8Array);
      fs.writeFileSync(metaPath(out), fs.readFileSync(metaPath(target), 'utf8') as string);
    }
  }
  async frames(file: string, times: number[], dir: string): Promise<string[]> {
    const m = readMeta(file);
    const out: string[] = [];
    for (const [i, t] of times.entries()) {
      const p = path.join(dir, `frame-${i}.jpg`);
      fs.writeFileSync(p, await snapshotJpeg(m, t));
      out.push(p);
    }
    return out;
  }
  async testProductImage(out: string, label: string): Promise<void> {
    const cv = canvas(600, 600);
    const ctx = cv.getContext('2d')!;
    ctx.fillStyle = '#E8EEF5';
    ctx.fillRect(0, 0, 600, 600);
    ctx.fillStyle = '#2B3F6C';
    ctx.fillRect(90, 200, 420, 220);
    ctx.fillStyle = '#5BC0BE';
    ctx.fillRect(120, 230, 360, 160);
    ctx.fillStyle = '#fff';
    ctx.font = `650 34px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, 300, 310);
    const blob: Blob = await new Promise((res, rej) => cv.toBlob((b) => (b ? res(b) : rej(new Error('toBlob failed'))), 'image/png'));
    fs.writeFileSync(out, new Uint8Array(await blob.arrayBuffer()));
  }
}

const engineInfo = (id: string, name: string, category: 'video_generation' | 'render', description: string, capabilities: string[], engine: BrowserMediaEngine): IntegrationInfo => ({
  id,
  name,
  category,
  kind: 'builtin',
  status: engine.available ? 'BUILTIN' : 'UNAVAILABLE',
  description,
  capabilities,
  requiredEnv: [],
  notes: engine.available
    ? [caps?.h264 ? 'Codificación H.264 (MP4) con WebCodecs.' : 'Sin WebCodecs H.264: grabación WebM en tiempo real (mantén la pestaña visible).']
    : ['Este navegador no puede codificar vídeo.'],
  active: false,
});

export class BrowserAnimaticAdapter implements VideoGenerationAdapter {
  readonly id = 'browser-animatic';
  constructor(private engine: BrowserMediaEngine) {}
  info() {
    return engineInfo(this.id, 'Browser Animatic Engine (WebCodecs)', 'video_generation', 'Motor integrado del navegador: animática 9:16 por plano (fondo de marca, foto del producto con push-in, dirección de REX). No es metraje fotorrealista.', ['shot-animatic', 'product-photo-motion'], this.engine);
  }
  async generateShot(req: ShotGenerationRequest) {
    const out = path.join(req.outDir, `shot-${String(req.shot.index).padStart(2, '0')}.${ext()}`);
    const d = clamp(req.shot.durationSec, 1, 12);
    await writeVideo(out, { kind: 'shot', spec: req.shot, palette: req.palette, productName: req.productName, totalShots: req.totalShots, productImagePath: req.productImagePath } as Omit<ShotMeta, keyof MediaProbe>, d);
    return { path: out };
  }
}

export class BrowserRenderAdapter implements RenderAdapter {
  readonly id = 'browser-render';
  constructor(private engine: BrowserMediaEngine) {}
  info() {
    return engineInfo(this.id, 'Browser Render Engine (WebCodecs)', 'render', 'Motor de edición/render del navegador que ejecuta la Edit Decision List de MAX y produce el FINAL VIDEO (9:16).', ['cuts', 'captions', 'overlays', 'zoom', 'transitions', 'cta-end-card', 'watermark', 'poster'], this.engine);
  }
  async render(req: RenderRequest) {
    const out = path.join(req.outDir, `final-v${req.version}.${ext()}`);
    const meta = { kind: 'final', shotPaths: req.shotPaths, edl: req.edl, productName: req.productName, palette: req.palette } as Omit<FinalMeta, keyof MediaProbe>;
    const probe = await writeVideo(out, meta, 0);
    const posterPath = path.join(req.outDir, `poster-v${req.version}.jpg`);
    fs.writeFileSync(posterPath, await snapshotJpeg(readMeta(out), Math.min(0.6, probe.durationSec / 2)));
    return { path: out, posterPath };
  }
}

/** Reading another site's page from a browser is blocked by CORS — honest INTEGRATION_REQUIRED. */
export class BrowserPageSnapshotSlot implements PageSnapshotAdapter {
  readonly id = 'public-page-snapshot';
  info(): IntegrationInfo {
    return {
      id: this.id,
      name: 'Public Product Page Snapshot',
      category: 'store',
      kind: 'builtin',
      status: 'UNAVAILABLE',
      description: 'En la edición navegador no se puede leer la página de tu tienda (el navegador bloquea leer otros dominios: CORS). EVA audita sobre el perfil del producto. La edición servidor sí lee la página.',
      capabilities: [],
      requiredEnv: [],
      notes: [],
      active: false,
    };
  }
  async snapshot(): Promise<StorePageSnapshot> {
    throw new IntegrationRequiredError('store-page', 'El navegador no puede leer páginas de otros dominios (CORS). Usa la edición servidor para que EVA analice la tienda real.');
  }
}

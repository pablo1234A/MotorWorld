import fs from 'node:fs';
import path from 'node:path';
import { IntegrationRequiredError } from '../core/errors.js';
import { drawText, wrapText, type Ffmpeg } from './ffmpeg.js';
import type {
  IntegrationInfo,
  RenderAdapter,
  RenderRequest,
  ShotGenerationRequest,
  VideoGenerationAdapter,
} from './types.js';

export const FRAME = { w: 540, h: 960, fps: 30 };

/**
 * BUILT-IN ANIMATIC ENGINE (video generation slot).
 * Renders each shot of REX's production plan as a real 9:16 MP4 clip:
 * brand gradient, the owner's product photo (slow push-in) and REX's
 * direction burned in. It is a previsualisation — not photoreal footage —
 * and is labelled as such everywhere. Connect a generation engine for footage.
 */
export class LocalAnimaticAdapter implements VideoGenerationAdapter {
  readonly id = 'local-animatic';
  constructor(private ff: Ffmpeg) {}

  info(): IntegrationInfo {
    return {
      id: this.id,
      name: 'Local Animatic Engine (ffmpeg)',
      category: 'video_generation',
      kind: 'builtin',
      status: this.ff.available ? 'BUILTIN' : 'UNAVAILABLE',
      description:
        'Motor integrado: genera una animática 9:16 por plano (fondo de marca, foto del producto con push-in, dirección de REX). No es metraje fotorrealista.',
      capabilities: ['shot-animatic', 'product-photo-motion'],
      requiredEnv: ['FFMPEG_PATH (auto-detect)', 'FONT_FILE (auto-detect)'],
      notes: this.ff.available ? [] : ['ffmpeg/ffprobe o una fuente TTF no encontrados en el servidor.'],
      active: false,
    };
  }

  async generateShot(req: ShotGenerationRequest): Promise<{ path: string }> {
    const font = this.ff.fontFile!;
    const { w, h, fps } = FRAME;
    const d = Math.max(1, Math.min(12, req.shot.durationSec));
    const work = fs.mkdtempSync(path.join(req.outDir, `shot${req.shot.index}-`));
    const out = path.join(req.outDir, `shot-${String(req.shot.index).padStart(2, '0')}.mp4`);

    const inputs = ['-f', 'lavfi', '-i', `gradients=s=${w}x${h}:c0=${req.palette.primary}:c1=${req.palette.secondary}:x0=0:y0=0:x1=${w}:y1=${h}:d=${d}:r=${fps}:speed=0.008`];
    const filters: string[] = [];
    let base = '[0:v]';
    if (req.productImagePath && fs.existsSync(req.productImagePath)) {
      inputs.push('-loop', '1', '-framerate', String(fps), '-t', String(d + 0.5), '-i', req.productImagePath);
      filters.push(`[1:v]scale=w='min(${Math.round(w * 0.74)}\\,iw)*(1+0.05*t/${d})':h=-1:eval=frame,format=rgba[prod]`);
      filters.push(`${base}[prod]overlay=x=(W-w)/2:y=(H-h)/2-40:eof_action=repeat[bg]`);
      base = '[bg]';
    } else {
      const nameText = drawText({ dir: work, name: 'pname', text: wrapText(req.productName.toUpperCase(), 16, 3), font, size: 44, x: '(w-text_w)/2', y: '(h-text_h)/2-40', color: `${req.palette.text}@0.92` });
      filters.push(`${base}${nameText}[bg]`);
      base = '[bg]';
    }
    const label = drawText({ dir: work, name: 'label', text: `ANIMATIC · SHOT ${req.shot.index}/${req.totalShots} · ${req.shot.section.toUpperCase()}`, font, size: 18, x: '(w-text_w)/2', y: '64', color: 'white@0.85', box: 'black@0.35' });
    const direction = drawText({ dir: work, name: 'dir', text: wrapText(`${req.shot.shotType} · ${req.shot.camera} — ${req.shot.action}`, 40, 3), font, size: 18, x: '(w-text_w)/2', y: 'h-text_h-34', color: 'white@0.85', box: 'black@0.45' });
    filters.push(`${base}${label},${direction},fps=${fps},format=yuv420p[v]`);

    await this.ff.run([...inputs, '-filter_complex', filters.join(';'), '-map', '[v]', '-t', String(d), '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23', '-r', String(fps), out]);
    fs.rmSync(work, { recursive: true, force: true });
    return { path: out };
  }
}

/** Slot for an external generation engine. No API is assumed — implement `generateShot` against the provider's real API. */
export class ExternalVideoGenerationSlot implements VideoGenerationAdapter {
  readonly id = 'external-video-generation';
  info(): IntegrationInfo {
    return {
      id: this.id,
      name: 'External Video Generation Engine',
      category: 'video_generation',
      kind: 'external',
      status: 'INTEGRATION_REQUIRED',
      description:
        'Ranura para conectar un motor de generación de vídeo (text/image-to-video). REX ya produce un prompt de generación por plano listo para enviarse.',
      capabilities: ['photoreal-shots (cuando se conecte)'],
      requiredEnv: ['Credenciales del proveedor elegido'],
      notes: ['Implementa generateShot() en src/server/integrations/video.ts con la API oficial del proveedor.'],
      active: false,
    };
  }
  async generateShot(): Promise<{ path: string }> {
    throw new IntegrationRequiredError('external-video-generation', 'No external video generation engine connected');
  }
}

/**
 * BUILT-IN RENDER ENGINE (edit/render slot).
 * Executes MAX's Edit Decision List: per-segment trims, punch-in / push zooms,
 * captions in the safe zone, overlays, hook title, transitions (xfade),
 * branding watermark, CTA end card and a silent stereo track.
 */
export class LocalRenderAdapter implements RenderAdapter {
  readonly id = 'local-ffmpeg-render';
  constructor(private ff: Ffmpeg) {}

  info(): IntegrationInfo {
    return {
      id: this.id,
      name: 'Local Render Engine (ffmpeg)',
      category: 'render',
      kind: 'builtin',
      status: this.ff.available ? 'BUILTIN' : 'UNAVAILABLE',
      description: 'Motor de edición/render integrado que ejecuta la Edit Decision List de MAX y produce el FINAL VIDEO MP4 (H.264, 9:16).',
      capabilities: ['cuts', 'captions', 'overlays', 'zoom', 'transitions', 'cta-end-card', 'watermark', 'poster'],
      requiredEnv: ['FFMPEG_PATH (auto-detect)', 'FONT_FILE (auto-detect)'],
      notes: ['Música, voz y sound design requieren conectores de librería/TTS (INTEGRATION_REQUIRED): el render incluye pista de audio silenciosa.'],
      active: false,
    };
  }

  async render(req: RenderRequest): Promise<{ path: string; posterPath: string }> {
    const font = this.ff.fontFile!;
    const { w, h, fps } = FRAME;
    const work = fs.mkdtempSync(path.join(req.outDir, `render-v${req.version}-`));
    const segs = req.edl.segments.filter((s) => req.shotPaths[s.shotIndex - 1]);
    if (!segs.length) throw new Error('EDL has no renderable segments');

    // 1. Render each segment with its zoom, caption and overlay.
    const segFiles: string[] = [];
    for (const [i, seg] of segs.entries()) {
      const d = Math.max(0.8, Math.min(12, seg.durationSec));
      const zoom =
        seg.zoom === 'punch_in'
          ? `scale=w='${w}*(1+0.14*min(t/0.25\\,1))':h=-2:eval=frame,crop=${w}:${h}`
          : seg.zoom === 'slow_push'
            ? `scale=w='${w}*(1+0.07*t/${d})':h=-2:eval=frame,crop=${w}:${h}`
            : `scale=${w}:${h}`;
      const chain = [zoom];
      if (i === 0 && req.edl.hookText) {
        chain.push(drawText({ dir: work, name: `hook${i}`, text: wrapText(req.edl.hookText, 20, 4), font, size: 44, x: '(w-text_w)/2', y: 'h*0.18', color: 'white', box: `${req.palette.accent}@0.92`, lineSpacing: 10 }));
      } else if (seg.overlayText) {
        chain.push(drawText({ dir: work, name: `ovl${i}`, text: wrapText(seg.overlayText, 22, 2), font, size: 36, x: '(w-text_w)/2', y: 'h*0.16', color: 'white', box: 'black@0.55' }));
      }
      if (seg.caption) {
        chain.push(drawText({ dir: work, name: `cap${i}`, text: wrapText(seg.caption, 26, 2), font, size: 30, x: '(w-text_w)/2', y: 'h*0.64', color: 'white', box: 'black@0.62' }));
      }
      if (req.edl.watermark) {
        chain.push(drawText({ dir: work, name: `wm${i}`, text: req.edl.watermark.toUpperCase(), font, size: 16, x: '28', y: '30', color: 'white@0.6' }));
      }
      chain.push(`fps=${fps}`, 'format=yuv420p', 'setsar=1');
      const out = path.join(work, `seg${i}.mp4`);
      await this.ff.run(['-i', req.shotPaths[seg.shotIndex - 1], '-t', String(d), '-vf', chain.join(','), '-an', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '21', out]);
      segFiles.push(out);
    }

    // 2. CTA end card.
    const ctaD = Math.max(1.5, Math.min(5, req.edl.cta.durationSec));
    const ctaOut = path.join(work, 'cta.mp4');
    const ctaText = drawText({ dir: work, name: 'cta', text: wrapText(req.edl.cta.text, 18, 3), font, size: 52, x: '(w-text_w)/2', y: '(h-text_h)/2-30', color: req.palette.text, lineSpacing: 12 });
    const ctaName = drawText({ dir: work, name: 'ctaname', text: req.productName.toUpperCase(), font, size: 22, x: '(w-text_w)/2', y: 'h*0.68', color: `${req.palette.text}@0.75` });
    await this.ff.run([
      '-f', 'lavfi', '-i', `gradients=s=${w}x${h}:c0=${req.palette.secondary}:c1=${req.palette.primary}:d=${ctaD}:r=${fps}:speed=0.01`,
      '-vf', `${ctaText},${ctaName},fade=t=in:st=0:d=0.3,format=yuv420p,setsar=1`,
      '-t', String(ctaD), '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '21', ctaOut,
    ]);
    segFiles.push(ctaOut);
    // xfade offsets must use the REAL length of each clip (a source shot can be shorter than the EDL asks).
    const durations: number[] = [];
    for (const f of segFiles) durations.push((await this.ff.probe(f)).durationSec);

    // 3. Assemble with transitions (xfade) + silent audio track.
    const final = path.join(req.outDir, `final-v${req.version}.mp4`);
    const T = 0.25;
    const inputs = segFiles.flatMap((f) => ['-i', f]);
    const fc: string[] = [];
    let prev = '[0:v]';
    let offset = 0;
    let overlap = 0;
    for (let i = 1; i < segFiles.length; i++) {
      const tr = i - 1 < segs.length ? segs[i - 1].transitionOut : 'fade';
      offset += durations[i - 1] - (tr === 'cut' ? 0.04 : T);
      const kind = tr === 'slide' ? 'slideup' : tr === 'wipe' ? 'wipeleft' : 'fade';
      const dur = tr === 'cut' ? 0.04 : T;
      overlap += dur;
      fc.push(`${prev}[${i}:v]xfade=transition=${kind}:duration=${dur}:offset=${offset.toFixed(3)}[x${i}]`);
      prev = `[x${i}]`;
    }
    const total = durations.reduce((a, b) => a + b, 0) - overlap;
    fc.push(`${prev}format=yuv420p[vout]`);
    await this.ff.run([
      ...inputs,
      '-f', 'lavfi', '-t', total.toFixed(3), '-i', 'anullsrc=channel_layout=stereo:sample_rate=44100',
      '-filter_complex', fc.join(';'),
      '-map', '[vout]', '-map', `${segFiles.length}:a`,
      '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '21', '-c:a', 'aac', '-b:a', '96k',
      '-movflags', '+faststart', '-shortest', final,
    ]);

    // 4. Poster frame for the Delivery Center.
    const poster = path.join(req.outDir, `poster-v${req.version}.jpg`);
    await this.ff.run(['-ss', '0.6', '-i', final, '-frames:v', '1', '-q:v', '3', poster]);
    fs.rmSync(work, { recursive: true, force: true });
    return { path: final, posterPath: poster };
  }
}

export class ExternalRenderSlot implements RenderAdapter {
  readonly id = 'external-render';
  info(): IntegrationInfo {
    return {
      id: this.id,
      name: 'External Edit / Render Engine',
      category: 'render',
      kind: 'external',
      status: 'INTEGRATION_REQUIRED',
      description: 'Ranura para un motor de edición/render externo. MAX ya produce una Edit Decision List independiente del motor.',
      capabilities: [],
      requiredEnv: ['Credenciales del proveedor elegido'],
      notes: ['Implementa render() traduciendo la EditDecisionList a la API oficial del proveedor.'],
      active: false,
    };
  }
  async render(): Promise<{ path: string; posterPath: string }> {
    throw new IntegrationRequiredError('external-render', 'No external render engine connected');
  }
}


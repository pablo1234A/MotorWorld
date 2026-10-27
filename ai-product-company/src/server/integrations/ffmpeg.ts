import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, spawn } from 'node:child_process';
import { AppError, TransientError } from '../core/errors.js';
import type { MediaEngine, MediaProbe } from './types.js';

export type { MediaProbe };

/** Thin, safe wrapper around the ffmpeg/ffprobe binaries (argument arrays, never a shell). */
export class Ffmpeg implements MediaEngine {
  readonly label = 'ffmpeg';
  constructor(
    readonly ffmpegPath: string | null,
    readonly ffprobePath: string | null,
    readonly fontFile: string | null,
  ) {}

  get available() {
    return Boolean(this.ffmpegPath && this.ffprobePath && this.fontFile);
  }

  run(args: string[], timeoutMs = 180_000): Promise<void> {
    if (!this.ffmpegPath) throw new AppError('ffmpeg not available', 'INTEGRATION_REQUIRED', 424);
    return exec(this.ffmpegPath, ['-hide_banner', '-loglevel', 'error', '-y', ...args], timeoutMs).then(() => undefined);
  }

  /** Concatenate same-format clips into one file (used for the RAW preview). */
  async concat(files: string[], out: string): Promise<void> {
    const inputs = files.flatMap((f) => ['-i', f]);
    const graph = `${files.map((_, i) => `[${i}:v]`).join('')}concat=n=${files.length}:v=1:a=0,format=yuv420p[v]`;
    await this.run([...inputs, '-filter_complex', graph, '-map', '[v]', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23', '-movflags', '+faststart', out]);
  }

  /** Extract JPEG frames at the given timestamps (for visual QA). */
  async frames(file: string, times: number[], dir: string): Promise<string[]> {
    const out: string[] = [];
    for (const [i, t] of times.entries()) {
      const target = path.join(dir, `frame-${i}.jpg`);
      await this.run(['-ss', t.toFixed(2), '-i', file, '-frames:v', '1', '-q:v', '4', target]);
      out.push(target);
    }
    return out;
  }

  async testProductImage(out: string, label: string): Promise<void> {
    const dir = fs.mkdtempSync(path.join(path.dirname(out), 'img-'));
    const text = drawText({ dir, name: 'label', text: label, font: this.fontFile!, size: 34, x: '(w-text_w)/2', y: '290' });
    await this.run(['-f', 'lavfi', '-i', 'color=c=#E8EEF5:s=600x600', '-vf', `drawbox=x=90:y=200:w=420:h=220:color=#2B3F6C:t=fill,drawbox=x=120:y=230:w=360:h=160:color=#5BC0BE:t=fill,${text}`, '-frames:v', '1', out]);
    fs.rmSync(dir, { recursive: true, force: true });
  }

  async probe(file: string): Promise<MediaProbe> {
    if (!this.ffprobePath) throw new AppError('ffprobe not available', 'INTEGRATION_REQUIRED', 424);
    const out = await exec(this.ffprobePath, ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', file], 30_000);
    const json = JSON.parse(out) as {
      streams?: { codec_type: string; codec_name: string; width?: number; height?: number; avg_frame_rate?: string; nb_frames?: string }[];
      format?: { duration?: string; size?: string; bit_rate?: string };
    };
    const video = json.streams?.find((s) => s.codec_type === 'video');
    const audio = json.streams?.find((s) => s.codec_type === 'audio');
    const [num, den] = (video?.avg_frame_rate ?? '0/1').split('/').map(Number);
    return {
      durationSec: Number(json.format?.duration ?? 0),
      sizeBytes: Number(json.format?.size ?? fs.statSync(file).size),
      width: video?.width ?? 0,
      height: video?.height ?? 0,
      fps: den ? Math.round((num / den) * 100) / 100 : 0,
      frames: Number(video?.nb_frames ?? 0),
      videoCodec: video?.codec_name ?? null,
      hasAudio: Boolean(audio),
      audioCodec: audio?.codec_name ?? null,
    };
  }
}



function exec(bin: string, args: string[], timeoutMs: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new TransientError(`${path.basename(bin)} timed out after ${timeoutMs} ms`));
    }, timeoutMs);
    child.stdout.on('data', (d) => (stdout += d));
    child.stderr.on('data', (d) => (stderr += d));
    child.on('error', (err) => {
      clearTimeout(timer);
      reject(new AppError(`${path.basename(bin)} failed to start: ${err.message}`, 'RENDER_FAILED', 500, true));
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) resolve(stdout);
      else reject(new AppError(`${path.basename(bin)} exited with ${code}: ${stderr.trim().slice(-800)}`, 'RENDER_FAILED', 500, true));
    });
  });
}

/** Word-wrap for burned-in text (drawtext has no automatic wrapping). */
export function wrapText(text: string, maxChars: number, maxLines = 4): string {
  const words = text.replace(/\s+/g, ' ').trim().split(' ');
  const lines: string[] = [];
  let line = '';
  for (const w of words) {
    if ((line + ' ' + w).trim().length > maxChars && line) {
      lines.push(line);
      line = w;
    } else line = (line + ' ' + w).trim();
  }
  if (line) lines.push(line);
  if (lines.length > maxLines) {
    const kept = lines.slice(0, maxLines);
    kept[maxLines - 1] = kept[maxLines - 1].replace(/\s*\S*$/, '') + '…';
    return kept.join('\n');
  }
  return lines.join('\n');
}

/** Escape a filesystem path / value for use inside an ffmpeg filtergraph option. */
export function fgEscape(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/:/g, '\\:').replace(/'/g, "\\'").replace(/,/g, '\\,');
}

let textAlignSupported = false;

/** Detect optional drawtext features once (older ffmpeg builds lack text_align). */
export function detectDrawtextFeatures(ffmpegPath: string | null) {
  if (!ffmpegPath) return;
  try {
    const help = execFileSync(ffmpegPath, ['-hide_banner', '-h', 'filter=drawtext'], { encoding: 'utf8' });
    textAlignSupported = help.includes('text_align');
  } catch {
    textAlignSupported = false;
  }
}

/** drawtext reading from a temp text file (avoids all quoting issues with user text). */
export function drawText(opts: {
  dir: string;
  name: string;
  text: string;
  font: string;
  size: number;
  color?: string;
  x: string;
  y: string;
  box?: string | null;
  enable?: string;
  lineSpacing?: number;
}): string {
  const file = path.join(opts.dir, `${opts.name}.txt`);
  fs.writeFileSync(file, opts.text);
  const parts = [
    `fontfile='${fgEscape(opts.font)}'`,
    `textfile='${fgEscape(file)}'`,
    `fontsize=${opts.size}`,
    `fontcolor=${opts.color ?? 'white'}`,
    `x=${opts.x}`,
    `y=${opts.y}`,
    `line_spacing=${opts.lineSpacing ?? 8}`,
  ];
  if (textAlignSupported) parts.push('text_align=C');
  if (opts.box) parts.push('box=1', `boxcolor=${opts.box}`, 'boxborderw=18');
  if (opts.enable) parts.push(`enable='${opts.enable}'`);
  return `drawtext=${parts.join(':')}`;
}

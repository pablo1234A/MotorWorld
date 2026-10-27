import { clamp } from './MathUtil';

export type QualityName = 'low' | 'medium' | 'high' | 'ultra';
export const QUALITY_NAMES: QualityName[] = ['low', 'medium', 'high', 'ultra'];

export interface QualityProfile {
  level: number;
  pixelRatio: number; // cap of devicePixelRatio
  shadows: boolean;
  shadowMap: number;
  shadowExtent: number;
  antialias: boolean;
  post: boolean; // bloom + grading
  traffic: number;
  particles: number;
  rainDrops: number;
  physicalPaint: boolean;
  carLights: boolean; // real spot lights for the player
}

export const PROFILES: Record<QualityName, QualityProfile> = {
  low: { level: 0, pixelRatio: 1.0, shadows: false, shadowMap: 512, shadowExtent: 50, antialias: false, post: false, traffic: 8, particles: 300, rainDrops: 1500, physicalPaint: false, carLights: false },
  medium: { level: 1, pixelRatio: 1.35, shadows: true, shadowMap: 1024, shadowExtent: 60, antialias: true, post: false, traffic: 14, particles: 600, rainDrops: 3000, physicalPaint: false, carLights: true },
  high: { level: 2, pixelRatio: 1.75, shadows: true, shadowMap: 2048, shadowExtent: 80, antialias: true, post: true, traffic: 20, particles: 1000, rainDrops: 5000, physicalPaint: true, carLights: true },
  ultra: { level: 3, pixelRatio: 2.5, shadows: true, shadowMap: 4096, shadowExtent: 100, antialias: true, post: true, traffic: 28, particles: 1600, rainDrops: 8000, physicalPaint: true, carLights: true },
};

/** Heuristic first-run quality from device characteristics. */
export function detectQuality(gl?: WebGLRenderingContext | WebGL2RenderingContext | null): QualityName {
  const mem = (navigator as any).deviceMemory ?? 4;
  const cores = navigator.hardwareConcurrency ?? 4;
  const mobile = /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent);
  let gpu = '';
  try {
    if (gl) {
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      gpu = ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : '';
    }
  } catch {
    /* ignore */
  }
  const g = gpu.toLowerCase();
  if (/swiftshader|llvmpipe|software/.test(g)) return 'low';
  if (!mobile) {
    if (/rtx|radeon rx|apple m[1-9]|arc a/.test(g)) return 'ultra';
    return cores >= 8 ? 'high' : 'medium';
  }
  if (/adreno \(tm\) (7[3-9]\d|8\d\d)|mali-g7[1-9]|mali-g[7-9]\d\d|xclipse|apple gpu/.test(g) && mem >= 6) return 'high';
  if (mem >= 4 && cores >= 6) return 'medium';
  return 'low';
}

/**
 * Frame time monitor with dynamic resolution and automatic quality step-down.
 */
export class PerfMonitor {
  fps = 60;
  private acc = 0;
  private frames = 0;
  private lowTime = 0;
  private highTime = 0;
  scale = 1; // dynamic resolution multiplier
  minScale = 0.6;
  target = 60;
  enabled = true;
  onDowngrade?: () => void;

  /** Returns true if the render scale changed. */
  tick(dt: number): boolean {
    this.acc += dt;
    this.frames++;
    if (this.acc < 0.5) return false;
    this.fps = this.frames / this.acc;
    const span = this.acc;
    this.acc = 0;
    this.frames = 0;
    if (!this.enabled) return false;
    const old = this.scale;
    if (this.fps < this.target * 0.85) {
      this.lowTime += span;
      this.highTime = 0;
      if (this.lowTime > 1.5) {
        this.lowTime = 0;
        if (this.scale > this.minScale + 0.01) this.scale = clamp(this.scale - 0.1, this.minScale, 1);
        else this.onDowngrade?.();
      }
    } else if (this.fps > this.target * 0.97) {
      this.highTime += span;
      this.lowTime = 0;
      if (this.highTime > 6 && this.scale < 1) {
        this.highTime = 0;
        this.scale = clamp(this.scale + 0.05, this.minScale, 1);
      }
    } else {
      this.lowTime = Math.max(0, this.lowTime - span);
    }
    return old !== this.scale;
  }
}

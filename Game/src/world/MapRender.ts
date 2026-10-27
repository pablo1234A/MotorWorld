import { Surface } from '../physics/Surface';
import type { WorldData } from './WorldGen';
import { RF } from './RoadNetwork';
import { CITY, HALF, WORLD_SIZE } from './WorldDef';

/**
 * Renders the island to a 2D canvas (used by the minimap and the full-screen map):
 * shaded relief, biomes, water, roads by class, city blocks.
 */
export class MapRender {
  readonly size: number;
  readonly canvas: HTMLCanvasElement;
  readonly scale: number; // px per metre

  constructor(private w: WorldData, size = 1024) {
    this.size = size;
    this.scale = size / WORLD_SIZE;
    this.canvas = document.createElement('canvas');
    this.canvas.width = this.canvas.height = size;
    this.draw();
  }

  toPx(x: number, z: number): [number, number] {
    return [(x + HALF) * this.scale, (z + HALF) * this.scale];
  }

  private draw() {
    const g = this.canvas.getContext('2d')!;
    const S = this.size;
    const img = g.createImageData(S, S);
    const hm = this.w.hm;
    const step = WORLD_SIZE / S;
    for (let py = 0; py < S; py++) {
      const z = py * step - HALF;
      for (let px = 0; px < S; px++) {
        const x = px * step - HALF;
        const hgt = hm.heightAt(x, z);
        let r: number, gg: number, b: number;
        if (hgt < 0) {
          const d = Math.min(1, -hgt / 20);
          r = 14 - d * 6;
          gg = 32 - d * 10;
          b = 44 - d * 8;
        } else {
          const s = hm.surfaceAt(x, z);
          switch (s) {
            case Surface.Concrete: r = 52; gg = 54; b = 58; break;
            case Surface.Sand: r = 150; gg = 136; b = 100; break;
            case Surface.Rock: r = 92; gg = 90; b = 86; break;
            case Surface.Dirt: r = 70; gg = 60; b = 42; break;
            default: r = 52; gg = 70; b = 40;
          }
          if (this.w.gen.forestMask(x, z) > 0.4 && s !== Surface.Concrete) {
            r *= 0.7; gg *= 0.85; b *= 0.7;
          }
          if (hgt > 300) {
            r = gg = b = 200;
          }
          // hillshade
          const hx = hm.heightAt(x + step, z) - hm.heightAt(x - step, z);
          const hz = hm.heightAt(x, z + step) - hm.heightAt(x, z - step);
          const shade = Math.max(0.45, Math.min(1.35, 1 + (-hx - hz) * 0.06));
          const tint = 0.75 + Math.min(1, hgt / 300) * 0.35;
          r *= shade * tint;
          gg *= shade * tint;
          b *= shade * tint;
        }
        const i = (py * S + px) * 4;
        img.data[i] = r;
        img.data[i + 1] = gg;
        img.data[i + 2] = b;
        img.data[i + 3] = 255;
      }
    }
    g.putImageData(img, 0, 0);
    // river
    const rv = this.w.gen;
    g.strokeStyle = '#1f4d63';
    g.lineCap = g.lineJoin = 'round';
    void rv;
    // city blocks
    g.fillStyle = '#3d4046';
    const { x0, x1, z0, z1 } = CITY;
    const [ax, az] = this.toPx(x0, z0), [bx, bz] = this.toPx(x1, z1);
    g.fillRect(ax, az, bx - ax, bz - az);
    // roads (outline then fill)
    const sc = this.scale;
    const order = ['dirt', 'street', 'road', 'mountain', 'strip', 'circuit', 'boulevard', 'highway'];
    for (const pass of [0, 1]) {
      for (const kind of order) {
        for (const r of this.w.roads.roads) {
          if (r.def.kind !== kind) continue;
          const width = Math.max(1.2, r.info.width * sc * (kind === 'highway' ? 1.6 : 1.35));
          g.lineWidth = pass === 0 ? width + 2 : width;
          g.strokeStyle = pass === 0 ? 'rgba(0,0,0,0.55)' : kind === 'highway' ? '#f2b631' : kind === 'circuit' ? '#e01a2b' : kind === 'dirt' ? '#9c8461' : kind === 'boulevard' ? '#e8e8e8' : '#c9ccd1';
          g.setLineDash(kind === 'dirt' && pass === 1 ? [3, 2] : []);
          g.beginPath();
          for (let i = 0; i < r.n; i += 3) {
            const [px, py] = this.toPx(r.px[i], r.pz[i]);
            if (i === 0) g.moveTo(px, py);
            else g.lineTo(px, py);
            if (pass === 1 && r.flags[i] & RF.tunnel) {
              g.stroke();
              g.save();
              g.strokeStyle = 'rgba(200,200,200,0.35)';
              g.beginPath();
              g.moveTo(px, py);
              g.restore();
            }
          }
          if (r.loop) {
            const [px, py] = this.toPx(r.px[0], r.pz[0]);
            g.lineTo(px, py);
          }
          g.stroke();
        }
      }
    }
    g.setLineDash([]);
  }
}

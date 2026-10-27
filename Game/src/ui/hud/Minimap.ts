import type { MapRender } from '../../world/MapRender';

export interface MapMarker {
  x: number;
  z: number;
  color: string;
  shape?: 'dot' | 'diamond' | 'square' | 'ring';
  size?: number;
}

/**
 * Rotating, heading-up circular minimap drawn from the pre-rendered island map.
 */
export class Minimap {
  readonly el: HTMLDivElement;
  private canvas: HTMLCanvasElement;
  private g: CanvasRenderingContext2D;
  zoom = 1.6; // canvas px per map px
  private size = 150;

  constructor(private map: MapRender) {
    this.el = document.createElement('div');
    this.el.className = 'minimap';
    this.canvas = document.createElement('canvas');
    const dpr = Math.min(2, devicePixelRatio || 1);
    this.canvas.width = this.canvas.height = Math.round(this.size * dpr);
    this.el.append(this.canvas);
    const n = document.createElement('div');
    n.className = 'n';
    n.textContent = 'N';
    this.el.append(n);
    this.g = this.canvas.getContext('2d')!;
  }

  draw(px: number, pz: number, heading: number, speed: number, markers: MapMarker[], route: { x: number[]; z: number[] } | null, others: { x: number; z: number; color: string }[]) {
    const g = this.g;
    const W = this.canvas.width;
    const s = this.map.scale;
    const zoom = (this.zoom * W) / 150 / (1 + Math.min(speed, 60) / 90);
    g.save();
    g.fillStyle = '#0d1014';
    g.fillRect(0, 0, W, W);
    g.translate(W / 2, W / 2 + W * 0.12);
    g.rotate(heading);
    g.scale(zoom, zoom);
    const [mx, my] = this.map.toPx(px, pz);
    g.translate(-mx, -my);
    g.imageSmoothingEnabled = true;
    g.drawImage(this.map.canvas, 0, 0);
    if (route) {
      g.strokeStyle = 'rgba(224,26,43,0.95)';
      g.lineWidth = 3 / zoom * 1.4;
      g.lineJoin = 'round';
      g.beginPath();
      for (let i = 0; i < route.x.length; i += 4) {
        const [x, y] = this.map.toPx(route.x[i], route.z[i]);
        if (i === 0) g.moveTo(x, y);
        else g.lineTo(x, y);
      }
      g.stroke();
    }
    for (const m of markers) {
      const [x, y] = this.map.toPx(m.x, m.z);
      const r = ((m.size ?? 4) / zoom) * (W / 150);
      g.fillStyle = m.color;
      g.strokeStyle = 'rgba(0,0,0,0.7)';
      g.lineWidth = 1.2 / zoom;
      g.beginPath();
      if (m.shape === 'diamond') {
        g.moveTo(x, y - r);
        g.lineTo(x + r, y);
        g.lineTo(x, y + r);
        g.lineTo(x - r, y);
        g.closePath();
      } else if (m.shape === 'square') g.rect(x - r, y - r, r * 2, r * 2);
      else g.arc(x, y, r, 0, Math.PI * 2);
      g.fill();
      g.stroke();
    }
    for (const o of others) {
      const [x, y] = this.map.toPx(o.x, o.z);
      g.fillStyle = o.color;
      g.beginPath();
      g.arc(x, y, (3.2 / zoom) * (W / 150), 0, Math.PI * 2);
      g.fill();
    }
    g.restore();
    // player arrow (always pointing up)
    g.save();
    g.translate(W / 2, W / 2 + W * 0.12);
    const a = W / 150;
    g.fillStyle = '#fff';
    g.strokeStyle = '#e01a2b';
    g.lineWidth = 2 * a;
    g.beginPath();
    g.moveTo(0, -8 * a);
    g.lineTo(6 * a, 7 * a);
    g.lineTo(0, 3 * a);
    g.lineTo(-6 * a, 7 * a);
    g.closePath();
    g.fill();
    g.stroke();
    g.restore();
    // vignette ring
    const grd = g.createRadialGradient(W / 2, W / 2, W * 0.36, W / 2, W / 2, W * 0.5);
    grd.addColorStop(0, 'rgba(0,0,0,0)');
    grd.addColorStop(1, 'rgba(0,0,0,0.55)');
    g.fillStyle = grd;
    g.fillRect(0, 0, W, W);
  }
}

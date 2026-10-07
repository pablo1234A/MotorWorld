import * as THREE from 'three';

/**
 * Procedural surface textures. Everything is generated on a small canvas so the
 * 3D world ships with zero image downloads and stays crisp at any size.
 */

function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >> 17;
    s ^= s << 5; s >>>= 0;
    return (s >>> 0) / 4294967296;
  };
}

function canvas(size) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  return [c, c.getContext('2d')];
}

function finish(c, { repeat = 1, srgb = true, anisotropy = 4 } = {}) {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  t.anisotropy = anisotropy;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Fine grain on a flat base colour: plaster, concrete, travertine. */
export function grainTexture({ base = '#cfc6b8', variance = 14, seed = 7, size = 256, repeat = 6, veins = false } = {}) {
  const [c, g] = canvas(size);
  const r = rng(seed);
  g.fillStyle = base;
  g.fillRect(0, 0, size, size);
  const img = g.getImageData(0, 0, size, size);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (r() - 0.5) * variance;
    d[i] += n; d[i + 1] += n; d[i + 2] += n;
  }
  g.putImageData(img, 0, 0);
  if (veins) {
    g.globalAlpha = 0.07;
    g.strokeStyle = '#6b5f50';
    for (let i = 0; i < 26; i++) {
      g.lineWidth = 0.4 + r() * 1.2;
      g.beginPath();
      let x = r() * size, y = r() * size;
      g.moveTo(x, y);
      for (let k = 0; k < 6; k++) {
        x += (r() - 0.35) * size * 0.35;
        y += (r() - 0.5) * size * 0.12;
        g.lineTo(x, y);
      }
      g.stroke();
    }
    g.globalAlpha = 1;
  }
  return finish(c, { repeat });
}

/** Horizontal timber boards with grain and board joints. */
export function woodTexture({ base = '#8b6a4a', dark = '#6e5238', seed = 11, size = 512, boards = 7, repeat = 1 } = {}) {
  const [c, g] = canvas(size);
  const r = rng(seed);
  const bw = size / boards;
  for (let b = 0; b < boards; b++) {
    const shade = 0.88 + r() * 0.22;
    g.fillStyle = base;
    g.fillRect(0, b * bw, size, bw);
    g.fillStyle = `rgba(0,0,0,${(1 - shade) * 0.9})`;
    g.fillRect(0, b * bw, size, bw);
    g.globalAlpha = 0.16;
    g.strokeStyle = dark;
    for (let i = 0; i < 26; i++) {
      g.lineWidth = 0.4 + r() * 1.1;
      const y = b * bw + r() * bw;
      g.beginPath();
      g.moveTo(0, y);
      g.bezierCurveTo(size * 0.3, y + (r() - 0.5) * 5, size * 0.7, y + (r() - 0.5) * 5, size, y + (r() - 0.5) * 3);
      g.stroke();
    }
    g.globalAlpha = 0.55;
    g.fillStyle = '#2b1d10';
    g.fillRect(0, b * bw, size, 1.4);
    g.globalAlpha = 1;
  }
  return finish(c, { repeat });
}

/** Large-format stone slabs with fine joints (terraces, pool coping). */
export function slabTexture({ base = '#dcd3c3', seed = 3, size = 512, cells = 4, repeat = 1 } = {}) {
  const [c, g] = canvas(size);
  const r = rng(seed);
  const cs = size / cells;
  for (let y = 0; y < cells; y++) {
    for (let x = 0; x < cells; x++) {
      const v = (r() - 0.5) * 16;
      g.fillStyle = base;
      g.fillRect(x * cs, y * cs, cs, cs);
      g.fillStyle = v > 0 ? `rgba(255,255,255,${v / 120})` : `rgba(0,0,0,${-v / 120})`;
      g.fillRect(x * cs, y * cs, cs, cs);
    }
  }
  g.strokeStyle = 'rgba(90,76,58,0.26)';
  g.lineWidth = 1.5;
  for (let i = 0; i <= cells; i++) {
    g.beginPath(); g.moveTo(i * cs, 0); g.lineTo(i * cs, size); g.stroke();
    g.beginPath(); g.moveTo(0, i * cs); g.lineTo(size, i * cs); g.stroke();
  }
  return finish(c, { repeat });
}

/** Soft radial contact shadow, used as a cheap ambient-occlusion decal. */
export function blobTexture(size = 128) {
  const [c, g] = canvas(size);
  const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, 'rgba(0,0,0,0.9)');
  grad.addColorStop(0.55, 'rgba(0,0,0,0.45)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  const t = new THREE.CanvasTexture(c);
  return t;
}

/** Abstract artwork for gallery walls: tonal colour fields, never a picture. */
export function artTexture({ a = '#c9b79c', b = '#2c3a3a', c: cc = '#a05a3c', seed = 5, w = 256, h = 340 } = {}) {
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  const g = cv.getContext('2d');
  const r = rng(seed);
  g.fillStyle = a; g.fillRect(0, 0, w, h);
  g.fillStyle = b; g.fillRect(w * 0.12, h * (0.12 + r() * 0.1), w * 0.76, h * (0.34 + r() * 0.2));
  g.fillStyle = cc;
  g.beginPath();
  g.arc(w * (0.35 + r() * 0.3), h * (0.7 + r() * 0.1), w * (0.14 + r() * 0.08), 0, Math.PI * 2);
  g.fill();
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

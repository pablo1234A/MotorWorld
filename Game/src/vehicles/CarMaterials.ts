import {
  BufferGeometry, CanvasTexture, Color, LinearFilter, LinearMipmapLinearFilter, Material, MeshPhysicalMaterial, MeshStandardMaterial, RepeatWrapping, SRGBColorSpace, Texture,
} from 'three';
import type { BodyStyle } from './BodyStyle';
import type { Finish, VisualConfig } from './Tuning';

/** Atlas cells (4x4). */
export const CELL = {
  plastic: 0, gloss: 1, chrome: 2, alu: 3, rubber: 4, carbon: 5, grille: 6, disc: 7,
  interior: 8, leather: 9, gauges: 10, soot: 11, sidewall: 12, reflector: 13, amber: 14, plate: 15,
} as const;

const CELL_PROPS: [string, number, number][] = [
  ['#141518', 0.72, 0], ['#060607', 0.12, 0.1], ['#f2f2f2', 0.05, 1], ['#b4b8bc', 0.32, 1],
  ['#19191a', 0.9, 0], ['#1a1a1c', 0.28, 0.25], ['#101112', 0.6, 0.3], ['#64666a', 0.42, 0.85],
  ['#1b1b1d', 0.85, 0], ['#3b2b24', 0.6, 0], ['#0d0e10', 0.3, 0], ['#050505', 0.95, 0],
  ['#1d1d1e', 0.82, 0], ['#7a0a0a', 0.25, 0], ['#b85a00', 0.25, 0], ['#e6e6e0', 0.5, 0],
];

let atlas: { map: Texture; orm: Texture } | null = null;

function makeCanvas(w: number, h: number) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

/** Shared detail atlas: albedo + ORM (G = roughness, B = metalness). */
export function getAtlas() {
  if (atlas) return atlas;
  const S = 256, C = 64;
  const ca = makeCanvas(S, S), co = makeCanvas(S, S);
  const a = ca.getContext('2d')!, o = co.getContext('2d')!;
  CELL_PROPS.forEach(([col, rough, metal], i) => {
    const x = (i % 4) * C, y = Math.floor(i / 4) * C;
    a.fillStyle = col;
    a.fillRect(x, y, C, C);
    o.fillStyle = `rgb(255,${Math.round(rough * 255)},${Math.round(metal * 255)})`;
    o.fillRect(x, y, C, C);
  });
  const cell = (i: number) => [(i % 4) * C, Math.floor(i / 4) * C];
  // carbon twill
  {
    const [x, y] = cell(CELL.carbon);
    for (let j = 0; j < C; j += 4)
      for (let k = 0; k < C; k += 4) {
        a.fillStyle = ((j + k) / 4) % 2 ? '#2a2a2e' : '#121214';
        a.fillRect(x + j, y + k, 4, 4);
      }
  }
  // honeycomb grille
  {
    const [x, y] = cell(CELL.grille);
    a.fillStyle = '#000';
    for (let j = 0; j < C; j += 6)
      for (let k = 0; k < C; k += 5) {
        a.beginPath();
        a.arc(x + j + ((k / 5) % 2) * 3, y + k, 1.8, 0, Math.PI * 2);
        a.fill();
      }
  }
  // brake disc grooves
  {
    const [x, y] = cell(CELL.disc);
    a.strokeStyle = '#3a3c40';
    for (let j = 0; j < 8; j++) {
      a.beginPath();
      a.moveTo(x + 8 + j * 6, y + 4);
      a.lineTo(x + 2 + j * 6, y + 60);
      a.stroke();
    }
  }
  // gauges
  {
    const [x, y] = cell(CELL.gauges);
    for (const cx of [x + 18, x + 46]) {
      a.strokeStyle = '#e8e8e8';
      a.lineWidth = 1.5;
      a.beginPath();
      a.arc(cx, y + 32, 12, Math.PI * 0.8, Math.PI * 2.2);
      a.stroke();
      a.strokeStyle = '#e01a2b';
      a.beginPath();
      a.moveTo(cx, y + 32);
      a.lineTo(cx + 8, y + 26);
      a.stroke();
    }
  }
  // sidewall band
  {
    const [x, y] = cell(CELL.sidewall);
    a.fillStyle = '#2a2a2a';
    a.fillRect(x, y + 26, C, 3);
    a.fillRect(x, y + 36, C, 2);
  }
  // number plate
  {
    const [x, y] = cell(CELL.plate);
    a.fillStyle = '#1d3d8f';
    a.fillRect(x + 2, y + 20, 6, 24);
    a.fillStyle = '#222';
    a.font = 'bold 13px monospace';
    a.fillText('MW 0420', x + 10, y + 37);
  }
  const map = new CanvasTexture(ca);
  map.colorSpace = SRGBColorSpace;
  map.anisotropy = 4;
  const orm = new CanvasTexture(co);
  atlas = { map, orm };
  return atlas;
}

/** Remap UVs of a geometry into an atlas cell (solid: centre point; pattern: whole cell inset). */
export function cellUV(geo: BufferGeometry, cell: number, pattern = false): BufferGeometry {
  const cx = (cell % 4) / 4, cy = 1 - (Math.floor(cell / 4) + 1) / 4;
  const uv = geo.getAttribute('uv');
  if (!uv) return geo;
  const inset = 0.006;
  for (let i = 0; i < uv.count; i++) {
    if (pattern) {
      const u = uv.getX(i) - Math.floor(uv.getX(i));
      const v = uv.getY(i) - Math.floor(uv.getY(i));
      uv.setXY(i, cx + inset + u * (0.25 - 2 * inset), cy + inset + v * (0.25 - 2 * inset));
    } else uv.setXY(i, cx + 0.125, cy + 0.125);
  }
  uv.needsUpdate = true;
  return geo;
}

let detailMat: MeshStandardMaterial | null = null;
export function getDetailMaterial(): MeshStandardMaterial {
  if (detailMat) return detailMat;
  const at = getAtlas();
  detailMat = new MeshStandardMaterial({ map: at.map, roughnessMap: at.orm, metalnessMap: at.orm, roughness: 1, metalness: 1, envMapIntensity: 1 });
  return detailMat;
}

export function applyFinish(m: MeshStandardMaterial | MeshPhysicalMaterial, finish: Finish, physical: boolean) {
  const p = m as MeshPhysicalMaterial;
  switch (finish) {
    case 'gloss':
      m.metalness = 0.05;
      m.roughness = 0.32;
      break;
    case 'metallic':
      m.metalness = 0.55;
      m.roughness = 0.34;
      break;
    case 'matte':
      m.metalness = 0.05;
      m.roughness = 0.78;
      break;
    case 'satin':
      m.metalness = 0.35;
      m.roughness = 0.5;
      break;
    case 'pearl':
      m.metalness = 0.4;
      m.roughness = 0.28;
      break;
    case 'chrome':
      m.metalness = 1;
      m.roughness = 0.06;
      break;
  }
  if (physical) {
    p.clearcoat = finish === 'matte' ? 0 : finish === 'satin' ? 0.3 : 1;
    p.clearcoatRoughness = finish === 'chrome' ? 0.02 : 0.06;
    p.iridescence = finish === 'pearl' ? 0.7 : 0;
    p.iridescenceIOR = 1.6;
  }
  m.needsUpdate = true;
}

/** Paint the vinyl/livery canvas. u = along length (x), v = around section (bottom centre -> top centre). */
export function drawLivery(canvas: HTMLCanvasElement, body: BodyStyle, v: VisualConfig) {
  const W = canvas.width, H = canvas.height;
  const g = canvas.getContext('2d')!;
  const base = '#' + new Color(v.color).getHexString();
  const c1 = '#' + new Color(v.vinylColor).getHexString();
  const c2 = '#' + new Color(v.vinylColor2).getHexString();
  g.fillStyle = base;
  g.fillRect(0, 0, W, H);
  const X = (u: number) => u * W;
  const Y = (vv: number) => (1 - vv) * H;
  // section index -> v: side 4/14..7/14, roof corner 10/14, top 12/14..1
  switch (v.vinyl) {
    case 1: {
      // twin racing stripes over hood, roof and deck
      g.fillStyle = c1;
      g.fillRect(0, Y(0.995), W, Y(0.955) - Y(0.995));
      g.fillStyle = base;
      g.fillRect(0, Y(1.0), W, Y(0.993) - Y(1.0));
      g.fillStyle = c2;
      g.fillRect(0, Y(0.958), W, 2);
      break;
    }
    case 2: {
      g.fillStyle = c1;
      g.beginPath();
      g.moveTo(X(0.06), Y(0.43));
      g.lineTo(X(0.92), Y(0.45));
      g.lineTo(X(0.94), Y(0.4));
      g.lineTo(X(0.1), Y(0.385));
      g.closePath();
      g.fill();
      g.fillStyle = c2;
      g.fillRect(X(0.1), Y(0.375), X(0.8), 3);
      break;
    }
    case 3: {
      g.fillStyle = c1;
      g.fillRect(0, Y(0.36), W, H - Y(0.36));
      g.fillStyle = c2;
      g.fillRect(0, Y(0.37), W, 3);
      break;
    }
    case 4: {
      // race livery: diagonal side bands + roundel with number + hood stripe
      g.fillStyle = c1;
      g.beginPath();
      g.moveTo(X(0.28), Y(0.0));
      g.lineTo(X(0.42), Y(0.0));
      g.lineTo(X(0.62), Y(0.62));
      g.lineTo(X(0.48), Y(0.62));
      g.closePath();
      g.fill();
      g.fillStyle = c2;
      g.beginPath();
      g.moveTo(X(0.43), Y(0.0));
      g.lineTo(X(0.47), Y(0.0));
      g.lineTo(X(0.67), Y(0.62));
      g.lineTo(X(0.63), Y(0.62));
      g.closePath();
      g.fill();
      g.fillStyle = c1;
      g.fillRect(0, Y(1.0), X(body.cowlT), Y(0.94) - Y(1.0));
      // number roundel on doors
      const cx = X((body.cowlT + body.roofT1) / 2), cy = Y(0.36), r = H * 0.09;
      g.fillStyle = '#f4f4f4';
      g.beginPath();
      g.ellipse(cx, cy, r * 0.55, r, 0, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#111';
      g.font = `bold ${Math.round(r * 1.25)}px Rajdhani, Arial, sans-serif`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.save();
      g.translate(cx, cy);
      g.scale(0.5, 1);
      g.fillText(String(v.raceNumber), 0, r * 0.08);
      g.restore();
      break;
    }
    case 5: {
      // flames licking back from the front wheel arch
      g.fillStyle = c1;
      for (let k = 0; k < 7; k++) {
        const y0 = 0.2 + k * 0.045;
        const len = 0.22 + ((k * 37) % 11) / 40;
        g.beginPath();
        g.moveTo(X(0.02), Y(y0 - 0.03));
        g.quadraticCurveTo(X(0.12 + len * 0.4), Y(y0 + 0.06), X(0.05 + len), Y(y0 + 0.01));
        g.quadraticCurveTo(X(0.1 + len * 0.5), Y(y0 - 0.01), X(0.02), Y(y0 + 0.03));
        g.fill();
      }
      g.fillStyle = c2;
      for (let k = 0; k < 5; k++) {
        const y0 = 0.26 + k * 0.05;
        g.beginPath();
        g.moveTo(X(0.02), Y(y0 - 0.01));
        g.quadraticCurveTo(X(0.1), Y(y0 + 0.03), X(0.16 + k * 0.02), Y(y0 + 0.005));
        g.quadraticCurveTo(X(0.08), Y(y0), X(0.02), Y(y0 + 0.015));
        g.fill();
      }
      break;
    }
    case 6: {
      const cols = [c1, c2, base];
      let seed = 1234;
      const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
      const cs = 10;
      for (let x = 0; x < W; x += cs)
        for (let y = 0; y < H; y += cs) {
          const r = rnd();
          if (r < 0.66) {
            g.fillStyle = cols[Math.floor(r * 3) % 3];
            g.fillRect(x, y, cs * (1 + Math.floor(rnd() * 2)), cs);
          }
        }
      break;
    }
    case 7: {
      const grd = g.createLinearGradient(0, 0, W, 0);
      grd.addColorStop(0, c1);
      grd.addColorStop(0.55, c1 + '00');
      g.fillStyle = grd;
      g.fillRect(0, 0, W, H);
      break;
    }
    case 8: {
      // carbon hood + roof
      for (let x = 0; x < W; x += 4)
        for (let y = Y(1); y < Y(0.86); y += 4) {
          g.fillStyle = ((x + y) / 4) % 2 ? '#262628' : '#111113';
          if (x < X(body.cowlT) || (x > X(body.roofT0) && x < X(body.roofT1))) g.fillRect(x, y, 4, 4);
        }
      break;
    }
  }
}

export interface CarMaterials {
  paint: MeshStandardMaterial | MeshPhysicalMaterial;
  glass: MeshStandardMaterial | MeshPhysicalMaterial;
  rim: MeshStandardMaterial;
  caliper: MeshStandardMaterial;
  head: MeshStandardMaterial;
  tail: MeshStandardMaterial;
  detail: MeshStandardMaterial;
  livery: CanvasTexture;
  canvas: HTMLCanvasElement;
  dispose(): void;
}

export function createCarMaterials(body: BodyStyle, v: VisualConfig, physical: boolean, liveryRes = 1024): CarMaterials {
  const canvas = makeCanvas(liveryRes, liveryRes / 4);
  drawLivery(canvas, body, v);
  const livery = new CanvasTexture(canvas);
  livery.colorSpace = SRGBColorSpace;
  livery.anisotropy = 4;
  livery.minFilter = LinearMipmapLinearFilter;
  livery.magFilter = LinearFilter;
  livery.wrapS = livery.wrapT = RepeatWrapping;
  const paint = physical
    ? new MeshPhysicalMaterial({ color: 0xffffff, map: livery, envMapIntensity: 1.25 })
    : new MeshStandardMaterial({ color: 0xffffff, map: livery, envMapIntensity: 1.25 });
  applyFinish(paint, v.finish, physical);
  const tintOpacity = [0.42, 0.62, 0.85][v.tint] ?? 0.62;
  const glass = physical
    ? new MeshPhysicalMaterial({ color: 0x0b0f14, metalness: 0.1, roughness: 0.04, transparent: true, opacity: tintOpacity, envMapIntensity: 1.6, clearcoat: 1, clearcoatRoughness: 0.02 })
    : new MeshStandardMaterial({ color: 0x0b0f14, metalness: 0.2, roughness: 0.05, transparent: true, opacity: tintOpacity, envMapIntensity: 1.6 });
  glass.depthWrite = false;
  const rim = new MeshStandardMaterial({ color: v.rimColor, metalness: 0.85, roughness: 0.28, envMapIntensity: 1.2 });
  const caliper = new MeshStandardMaterial({ color: v.caliperColor, metalness: 0.3, roughness: 0.4 });
  const lightTint = [0xffffff, 0x9aa4ad, 0xbfd8ff][v.lights] ?? 0xffffff;
  const head = new MeshStandardMaterial({ color: lightTint, emissive: 0xfff3e0, emissiveIntensity: 0.25, metalness: 0.4, roughness: 0.1 });
  const tail = new MeshStandardMaterial({ color: 0x5a0306, emissive: 0xff1010, emissiveIntensity: 0.35, metalness: 0.2, roughness: 0.25 });
  const detail = getDetailMaterial();
  return {
    paint, glass, rim, caliper, head, tail, detail, livery, canvas,
    dispose() {
      [paint, glass, rim, caliper, head, tail].forEach((m: Material) => m.dispose());
      livery.dispose();
    },
  };
}

export function updateLivery(m: CarMaterials, body: BodyStyle, v: VisualConfig, physical: boolean) {
  drawLivery(m.canvas, body, v);
  m.livery.needsUpdate = true;
  applyFinish(m.paint, v.finish, physical);
  m.rim.color.setHex(v.rimColor);
  m.caliper.color.setHex(v.caliperColor);
  m.glass.opacity = [0.42, 0.62, 0.85][v.tint] ?? 0.62;
  m.head.color.setHex([0xffffff, 0x9aa4ad, 0xbfd8ff][v.lights] ?? 0xffffff);
}

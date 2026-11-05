/**
 * Generative art direction. When no stock-photo provider is configured and the user has not
 * uploaded images, sections get abstract compositions derived from the theme palette.
 * They are clearly marked as `generated` in the editor so the user knows to replace them.
 */
import type { Media, Theme } from "./schema";
import { createRng, hexToHsl, hslToHex, mix } from "./util";

export type ArtMotif = "mesh" | "grid" | "arcs" | "dunes" | "rings" | "blocks";

function svgDataUri(svg: string) {
  return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg.replace(/\s{2,}/g, " "));
}

export function generatedArt(theme: Theme, seed: number, motif: ArtMotif = "mesh", w = 1600, h = 1100): string {
  const rng = createRng(seed);
  const { bg, surface, primary, accent, text } = theme.colors;
  const [ph] = hexToHsl(primary);
  const dark = theme.mode === "dark";
  const base = dark ? mix(bg, surface, 0.6) : mix(surface, primary, 0.08);
  const c1 = primary;
  const c2 = accent;
  const c3 = hslToHex(ph + rng.int(-40, 40), 60, dark ? 30 : 78);
  const grain = `<filter id="g"><feTurbulence type="fractalNoise" baseFrequency=".8" numOctaves="2" stitchTiles="stitch"/><feColorMatrix values="0 0 0 0 .5 0 0 0 0 .5 0 0 0 0 .5 0 0 0 ${dark ? ".10" : ".07"} 0"/><feComposite operator="in" in2="SourceGraphic"/></filter>`;
  let shapes = "";

  switch (motif) {
    case "mesh": {
      const blobs = Array.from({ length: 4 }, (_, i) => {
        const cx = rng.int(0, w);
        const cy = rng.int(0, h);
        const r = rng.int(Math.round(w * 0.25), Math.round(w * 0.5));
        const fill = [c1, c2, c3, c1][i];
        return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill}" opacity="${(0.55 + rng.next() * 0.35).toFixed(2)}"/>`;
      }).join("");
      shapes = `<filter id="b"><feGaussianBlur stdDeviation="${Math.round(w / 9)}"/></filter><g filter="url(#b)">${blobs}</g>`;
      break;
    }
    case "grid": {
      const step = rng.pick([80, 100, 120]);
      let lines = "";
      for (let x = 0; x <= w; x += step) lines += `<line x1="${x}" y1="0" x2="${x}" y2="${h}"/>`;
      for (let y = 0; y <= h; y += step) lines += `<line x1="0" y1="${y}" x2="${w}" y2="${y}"/>`;
      const cells = Array.from({ length: 7 }, () => {
        const x = rng.int(0, Math.floor(w / step) - 1) * step;
        const y = rng.int(0, Math.floor(h / step) - 1) * step;
        return `<rect x="${x}" y="${y}" width="${step * rng.int(1, 3)}" height="${step * rng.int(1, 2)}" fill="${rng.pick([c1, c2, c3])}" opacity=".9"/>`;
      }).join("");
      shapes = `${cells}<g stroke="${text}" stroke-opacity=".12" stroke-width="1">${lines}</g><circle cx="${rng.int(w * 0.3, w * 0.7)}" cy="${rng.int(h * 0.3, h * 0.7)}" r="${step * 1.6}" fill="none" stroke="${c1}" stroke-width="2"/>`;
      break;
    }
    case "arcs": {
      shapes = Array.from({ length: 9 }, (_, i) => {
        const r = 120 + i * 90;
        return `<circle cx="${w * 0.78}" cy="${h * 1.05}" r="${r}" fill="none" stroke="${i % 3 === 0 ? c1 : i % 3 === 1 ? c2 : c3}" stroke-width="${i % 2 ? 2 : 38}" opacity="${0.35 + (i % 3) * 0.2}"/>`;
      }).join("");
      break;
    }
    case "dunes": {
      shapes = Array.from({ length: 5 }, (_, i) => {
        const y = h * (0.35 + i * 0.14);
        const a = rng.int(60, 160);
        const d = `M0 ${y} C ${w * 0.25} ${y - a}, ${w * 0.55} ${y + a}, ${w} ${y - a / 2} L ${w} ${h} L 0 ${h} Z`;
        return `<path d="${d}" fill="${mix(i % 2 ? c1 : c3, base, i * 0.15)}" opacity="${0.92 - i * 0.08}"/>`;
      }).join("");
      shapes += `<circle cx="${rng.int(w * 0.6, w * 0.85)}" cy="${h * 0.22}" r="${rng.int(60, 110)}" fill="${c2}"/>`;
      break;
    }
    case "rings": {
      const cx = rng.int(w * 0.35, w * 0.65);
      const cy = rng.int(h * 0.35, h * 0.65);
      shapes =
        `<defs><radialGradient id="r"><stop offset="0" stop-color="${c2}"/><stop offset=".6" stop-color="${c1}"/><stop offset="1" stop-color="${base}" stop-opacity="0"/></radialGradient></defs><circle cx="${cx}" cy="${cy}" r="${h * 0.55}" fill="url(#r)"/>` +
        Array.from({ length: 6 }, (_, i) => `<ellipse cx="${cx}" cy="${cy}" rx="${200 + i * 70}" ry="${80 + i * 28}" fill="none" stroke="${text}" stroke-opacity="${0.18 - i * 0.02}" transform="rotate(${-18 + i * 4} ${cx} ${cy})"/>`).join("");
      break;
    }
    case "blocks": {
      const cols = 6;
      const cw = w / cols;
      shapes = Array.from({ length: cols }, (_, i) => {
        const hh = rng.int(Math.round(h * 0.25), Math.round(h * 0.9));
        return `<rect x="${i * cw + 10}" y="${h - hh}" width="${cw - 20}" height="${hh}" rx="${theme.radius * 2}" fill="${rng.pick([c1, c2, c3, mix(c1, base, 0.5)])}"/>`;
      }).join("");
      break;
    }
  }

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" preserveAspectRatio="xMidYMid slice"><defs>${grain}</defs><rect width="100%" height="100%" fill="${base}"/>${shapes}<rect width="100%" height="100%" filter="url(#g)"/></svg>`;
  return svgDataUri(svg);
}

const MOTIFS: ArtMotif[] = ["mesh", "grid", "arcs", "dunes", "rings", "blocks"];

export function artMedia(theme: Theme, seed: number, alt: string, query?: string, motif?: ArtMotif): Media {
  const m = motif ?? MOTIFS[seed % MOTIFS.length];
  return {
    kind: "generated",
    src: generatedArt(theme, seed, m),
    alt,
    query,
    credit: { name: "Arte generativo de World Builder", url: "", provider: "generated" },
  };
}

/** Style-appropriate motif choice. */
export function motifFor(theme: Theme, index: number): ArtMotif {
  const byStyle: Record<string, ArtMotif[]> = {
    editorial: ["dunes", "arcs", "mesh"],
    luxury: ["arcs", "rings", "dunes"],
    tech: ["grid", "rings", "mesh"],
    minimal: ["blocks", "arcs", "dunes"],
    brutalist: ["grid", "blocks"],
    warm: ["dunes", "mesh", "arcs"],
    sport: ["arcs", "grid", "mesh"],
    playful: ["blocks", "mesh", "rings"],
    cinematic: ["rings", "mesh", "arcs"],
  };
  const list = byStyle[theme.style] ?? MOTIFS;
  return list[index % list.length];
}

/** Regenerates every generated image of a document after a theme change. */
export function isGenerated(m: Media | undefined) {
  return !!m && m.kind === "generated";
}

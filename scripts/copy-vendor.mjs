// Copies runtime libraries used by generated sites (GSAP, Three.js) from node_modules
// into public/vendor so published and exported sites never depend on a third-party CDN.
import { cpSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const out = join(root, "public", "vendor");
mkdirSync(out, { recursive: true });

const files = [
  ["node_modules/gsap/dist/gsap.min.js", "gsap.min.js"],
  ["node_modules/gsap/dist/ScrollTrigger.min.js", "ScrollTrigger.min.js"],
  ["node_modules/three/build/three.module.js", "three.module.js"],
  ["node_modules/three/build/three.core.js", "three.core.js"],
];
for (const [from, to] of files) {
  const src = join(root, from);
  if (existsSync(src)) cpSync(src, join(out, to));
  else console.warn(`[vendor] missing ${from}`);
}

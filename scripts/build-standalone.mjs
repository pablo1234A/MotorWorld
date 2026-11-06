// Builds standalone/world-builder-ai.html: the whole builder (engine, renderer, editor UI) in one
// self-contained file that opens with a double click. Run: npm run build:standalone
import { build } from "esbuild";
import postcss from "postcss";
import tailwind from "@tailwindcss/postcss";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const pkg = (name) => JSON.parse(readFileSync(join(root, "node_modules", name, "package.json"), "utf8")).version;
const gsap = pkg("gsap");
const three = pkg("three");

const shims = {
  "next/link": join(root, "src/standalone/shims/next-link.tsx"),
  "next/navigation": join(root, "src/standalone/shims/next-navigation.ts"),
  "@/lib/api": join(root, "src/standalone/local-api.ts"),
};

const result = await build({
  entryPoints: [join(root, "src/standalone/main.tsx")],
  bundle: true,
  write: false,
  format: "iife",
  platform: "browser",
  target: ["es2020", "chrome100", "firefox100", "safari15"],
  minify: true,
  jsx: "automatic",
  legalComments: "none",
  tsconfig: join(root, "tsconfig.json"),
  define: { "process.env.NODE_ENV": '"production"' },
  plugins: [
    {
      name: "standalone-shims",
      setup(b) {
        b.onResolve({ filter: /^(next\/link|next\/navigation|@\/lib\/api)$/ }, (args) => ({ path: shims[args.path] }));
        b.onResolve({ filter: /^(server-only|next\/headers|next\/server)$/ }, () => ({ errors: [{ text: "Server module imported in the standalone bundle" }] }));
      },
    },
  ],
});
let js = result.outputFiles[0].text;
// Never let a literal "</script" end the inline <script> early.
js = js.replace(/<\/script/gi, "<\\/script");

const globals = readFileSync(join(root, "src/app/globals.css"), "utf8");
const css = (
  await postcss([tailwind({ base: root, optimize: { minify: true } })]).process(`${globals}\n:root{--font-geist:"Geist";--font-geist-mono:"Geist Mono"}`, { from: join(root, "src/app/globals.css") })
).css;

const vendor = {
  "gsap.min.js": `https://cdn.jsdelivr.net/npm/gsap@${gsap}/dist/gsap.min.js`,
  "ScrollTrigger.min.js": `https://cdn.jsdelivr.net/npm/gsap@${gsap}/dist/ScrollTrigger.min.js`,
  "three.module.js": `https://cdn.jsdelivr.net/npm/three@${three}/build/three.module.js`,
  "three.core.js": `https://cdn.jsdelivr.net/npm/three@${three}/build/three.core.js`,
};

const html = `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="dark">
<meta name="theme-color" content="#0b0b0d">
<title>World Builder AI</title>
<meta name="description" content="Creador de webs con IA en un solo archivo: describe tu negocio, edita visualmente o por chat y exporta el código.">
<link rel="icon" href="data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><rect x="1" y="1" width="22" height="22" rx="7" fill="#7c6cff"/><path d="M6.5 8.5l2.2 7.5 3.3-6 3.3 6 2.2-7.5" stroke="#fff" stroke-width="1.8" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>')}">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700&family=Geist+Mono:wght@400;500&display=swap">
<style>${css}</style>
</head>
<body class="min-h-dvh">
<div id="root"></div>
<noscript><p style="padding:24px;font-family:system-ui">World Builder AI necesita JavaScript.</p></noscript>
<script>window.__WB_STANDALONE__=${JSON.stringify({ vendor })};</script>
<script>${js}</script>
</body>
</html>`;

mkdirSync(join(root, "standalone"), { recursive: true });
const out = join(root, "standalone/world-builder-ai.html");
writeFileSync(out, html);
console.log(`standalone/world-builder-ai.html  ${(html.length / 1024).toFixed(0)} KB (js ${(js.length / 1024).toFixed(0)} KB, css ${(css.length / 1024).toFixed(0)} KB)`);

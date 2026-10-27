// Builds the whole game into ONE self-contained HTML file (JS, CSS and fonts inlined).
// Usage: node tools/singlefile.mjs [out.html]   (default: dist-single/MotorWorld.html)
// The file opens straight from disk (file://) or any static host; no server needed.
import { build } from 'vite';
import { readFileSync, writeFileSync, mkdirSync, rmSync, readdirSync } from 'fs';
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const out = resolve(process.argv[2] || join(root, 'dist-single/MotorWorld.html'));
const tmp = join(root, 'node_modules/.singlefile');
rmSync(tmp, { recursive: true, force: true });

// keep only the latin font subsets (Spanish/English) in woff2: the other scripts would add ~1 MB of base64
const fontSubset = {
  name: 'font-subset',
  enforce: 'pre',
  transform(code, id) {
    if (!id.includes('@fontsource') || !id.endsWith('.css')) return null;
    const blocks = code.split(/(?=\/\* [\w-]+ \*\/\s*@font-face)/);
    return blocks
      .filter((b) => /-latin(-ext)?-\d+-normal/.test(b.slice(0, 80)))
      .map((b) => b.replace(/,\s*url\([^)]+\.woff\) format\('woff'\)/, ''))
      .join('\n');
  },
};

await build({
  root,
  configFile: false,
  base: './',
  logLevel: 'warn',
  plugins: [fontSubset],
  publicDir: false,
  build: {
    target: 'es2020',
    outDir: tmp,
    emptyOutDir: true,
    assetsInlineLimit: 100_000_000,
    cssCodeSplit: false,
    modulePreload: false,
    rollupOptions: { output: { inlineDynamicImports: true } },
  },
});

let html = readFileSync(join(tmp, 'index.html'), 'utf8');
const assets = join(tmp, 'assets');
const files = readdirSync(assets);
const js = files.filter((f) => f.endsWith('.js'));
const css = files.filter((f) => f.endsWith('.css'));
if (js.length !== 1) throw new Error('expected a single JS bundle, got ' + js.join(', '));
html = html.replace(/<script type="module" crossorigin src="[^"]+"><\/script>/, '');
html = html.replace(/<link rel="stylesheet" crossorigin href="[^"]+">/g, '');
html = html.replace(/<link rel="manifest"[^>]*>/, '');
// the SVG icon is tiny: inline it as a data URL
const icon = readFileSync(join(root, 'public/icon.svg'));
html = html.replace(/href="\.\/icon\.svg"/, () => `href="data:image/svg+xml;base64,${icon.toString('base64')}"`);
const styles = css.map((f) => `<style>${readFileSync(join(assets, f), 'utf8')}</style>`).join('\n');
// escape "</script" inside the bundle so the inline script tag is not closed early
const code = readFileSync(join(assets, js[0]), 'utf8').replace(/<\/script/gi, '<\\/script');
// function replacers: the minified code contains $& / $' sequences that a replacement string would expand
html = html.replace('</head>', () => `${styles}\n</head>`);
html = html.replace('</body>', () => `<script type="module">${code}</script>\n</body>`);
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, html);
rmSync(tmp, { recursive: true, force: true });
console.log(`${out}  ${(html.length / 1024 / 1024).toFixed(2)} MB`);

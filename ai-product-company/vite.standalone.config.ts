import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';

const shim = (f: string) => fileURLToPath(new URL(`./src/standalone/shims/${f}`, import.meta.url));

/** Builds the single-file browser edition: dist/standalone/index.html */
export default defineConfig({
  root: 'src/standalone',
  base: './',
  plugins: [react(), viteSingleFile()],
  resolve: {
    alias: [
      { find: /^node:sqlite$/, replacement: shim('sqlite.ts') },
      { find: /^(node:)?fs$/, replacement: shim('fs.ts') },
      { find: /^(node:)?path$/, replacement: shim('path.ts') },
      { find: /^(node:)?crypto$/, replacement: shim('crypto.ts') },
      { find: /^node:(os|util|child_process|net|dns\/promises)$/, replacement: shim('misc.ts') },
      { find: /^@anthropic-ai\/sdk(\/helpers\/zod)?$/, replacement: shim('anthropic.ts') },
      { find: /^sql\.js\/dist\/sql-wasm-inline\.js$/, replacement: fileURLToPath(new URL('./node_modules/sql.js/dist/sql-wasm-inline.js', import.meta.url)) },
    ],
  },
  build: {
    outDir: '../../dist/standalone',
    emptyOutDir: true,
    target: 'es2022',
    assetsInlineLimit: 100_000_000,
    chunkSizeWarningLimit: 10_000,
  },
});

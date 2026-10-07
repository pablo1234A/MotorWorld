// Builds the whole site into one self-contained HTML file (dist-single/index.html).
import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

export default defineConfig({
  base: './',
  plugins: [viteSingleFile({ removeViteModuleLoader: true })],
  build: { target: 'es2022', outDir: 'dist-single', assetsInlineLimit: 1e9, cssCodeSplit: false, copyPublicDir: false, rollupOptions: { input: 'index.html', output: { inlineDynamicImports: true } } },
});

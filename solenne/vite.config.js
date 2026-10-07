import { defineConfig } from 'vite';
import { resolve } from 'node:path';

export default defineConfig({
  base: './',
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      input: { main: resolve(__dirname, 'index.html'), render: resolve(__dirname, 'render.html') },
    },
  },
  server: { host: '127.0.0.1', port: 5173 },
});

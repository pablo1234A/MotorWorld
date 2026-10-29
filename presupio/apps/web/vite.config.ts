/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { securityHeaders } from './server/security-headers.mjs';

// La API se sirve bajo el mismo origen (/api) a través del proxy: la cookie de sesión
// HttpOnly funciona sin CORS y el navegador nunca ve secretos ni tokens.
const apiTarget = process.env.PRESUPIO_API_PROXY ?? 'http://localhost:3000';
const proxy = { '/api': { target: apiTarget, changeOrigin: false } };

// Cabeceras de seguridad: una sola fuente (server/security-headers.mjs) para `vite preview`,
// el servidor de producción (server/serve.mjs) y la configuración generada de nginx y _headers.
export { securityHeaders };

export default defineConfig({
  plugins: [react()],
  server: { port: 5173, strictPort: true, proxy },
  preview: { port: Number(process.env.PREVIEW_PORT ?? 4173), strictPort: true, proxy, headers: securityHeaders },
  build: { sourcemap: false, target: 'es2022' },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./test/setup.ts'],
    include: ['test/**/*.test.{ts,tsx}'],
    css: false,
  },
});

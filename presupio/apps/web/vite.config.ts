/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { securityHeaders } from './server/security-headers.mjs';

// La API se sirve bajo el mismo origen (/api) a través del proxy: la cookie de sesión
// HttpOnly funciona sin CORS y el navegador nunca ve secretos ni tokens.
const apiTarget = process.env.PRESUPIO_API_PROXY ?? 'http://localhost:3000';
const proxy = { '/api': { target: apiTarget, changeOrigin: false } };

// `vite build` produce SIEMPRE la versión de producción. Con NODE_ENV=development en el entorno
// (p. ej. el .env local que cargan las pruebas E2E) Vite generaba un paquete de desarrollo con
// rutas absolutas del equipo. server/check-build.mjs lo comprueba después de compilar.
if (process.argv.includes('build')) process.env.NODE_ENV = 'production';

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
    // npm run test:coverage. Umbrales por debajo de lo medido para detectar retrocesos.
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,tsx}', 'server/**/*.mjs'],
      exclude: ['src/main.tsx', 'src/vite-env.d.ts'],
      reporter: ['text-summary', 'html'],
      thresholds: { statements: 25, branches: 16, functions: 20, lines: 25 },
    },
  },
});

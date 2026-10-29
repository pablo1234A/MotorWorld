/*
 * ÚNICA fuente de las cabeceras de seguridad del frontend (P1-05). La usan:
 *  - vite.config.ts (`vite preview`);
 *  - server/serve.mjs (servidor de producción incluido, también en las pruebas E2E);
 *  - server/hosting-config.mjs, que genera dist/_headers (Netlify, Cloudflare Pages) y
 *    ops/nginx/presupio-web.conf. Una prueba falla si alguno se desincroniza.
 * Aplicarlas en el alojamiento real es responsabilidad de quien despliega (docs/frontend.md).
 */

export const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join('; ');

/** Cabeceras para todas las respuestas del frontend. */
export const securityHeaders = {
  'Content-Security-Policy': CONTENT_SECURITY_POLICY,
  'X-Content-Type-Options': 'nosniff',
  // Los enlaces de los emails llevan ?token=: nunca se envían a terceros.
  'Referrer-Policy': 'no-referrer',
  'X-Frame-Options': 'DENY',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=()',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Resource-Policy': 'same-origin',
  // Solo tiene efecto por HTTPS (los navegadores la ignoran por HTTP). Sin «preload»: es una
  // decisión del dominio que no debe tomarse desde aquí.
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
};

/** Caché: los archivos con huella en /assets/ no cambian nunca; el HTML, siempre fresco. */
export const cacheHeaders = {
  assets: 'public, max-age=31536000, immutable',
  html: 'no-cache',
};

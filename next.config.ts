import type { NextConfig } from "next";

/**
 * Cabeceras de seguridad para todas las rutas.
 *
 * Content-Security-Policy SIN nonces (ADR-074): la app usa prerenderizado
 * parcial (Cache Components), que la guía de Next 16 declara incompatible con
 * los nonces. Las scripts inline de Next (carga del RSC) exigen entonces
 * 'unsafe-inline' en script-src; el resto de directivas es estricto: solo
 * scripts propios y de Cloudflare Turnstile, sin plugins, sin <base>, sin
 * incrustar la app en otras webs y formularios solo hacia la app y las
 * pasarelas que usa (Stripe Checkout/portal y Google OAuth).
 */
const isDev = process.env.NODE_ENV === "development";
export const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline' https://challenges.cloudflare.com${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  `connect-src 'self' https://challenges.cloudflare.com${isDev ? " ws: wss:" : ""}`,
  "frame-src 'self' https://challenges.cloudflare.com",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self' https://checkout.stripe.com https://billing.stripe.com https://accounts.google.com",
  "frame-ancestors 'none'",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: contentSecurityPolicy },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=(), payment=(), usb=()" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  ...(process.env.NODE_ENV === "production"
    ? [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" }]
    : []),
];

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  poweredByHeader: false,
  experimental: {
    serverActions: {
      // Importación Excel/CSV: hasta 5 MB de archivo + margen del multipart.
      // El resto de acciones envían formularios pequeños; el servidor valida cada campo.
      bodySizeLimit: "5.2mb",
    },
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;

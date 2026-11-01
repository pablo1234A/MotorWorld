import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV !== "production";
/**
 * Backend de pruebas (tests/harness/app-backend.ts): solo con LEGALITO_TEST_BACKEND=1.
 * Sustituye los clientes de Supabase por PostgreSQL local para las pruebas E2E del
 * área privada. Usa un directorio de build separado y nunca se activa en producción.
 */
const testBackend = process.env.LEGALITO_TEST_BACKEND === "1";
if (testBackend && process.env.APP_ENV === "production") throw new Error("LEGALITO_TEST_BACKEND no se permite en producción");
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";

/**
 * Política de seguridad de contenidos. El navegador solo habla con el propio
 * dominio (todas las llamadas a Supabase y Stripe se hacen desde el servidor);
 * Stripe Checkout y el portal de cliente se abren por redirección.
 */
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  `connect-src 'self'${isDev ? " ws: http://localhost:*" : ""}${supabaseUrl ? ` ${supabaseUrl}` : ""}`,
  "frame-src 'none'",
  "frame-ancestors 'none'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self' https://checkout.stripe.com https://billing.stripe.com",
  ...(isDev ? [] : ["upgrade-insecure-requests"]),
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
];

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  poweredByHeader: false,
  reactStrictMode: true,
  ...(testBackend ? { distDir: ".next-qa", serverExternalPackages: ["pg"] } : {}),
  turbopack: {
    ...(testBackend
      ? { resolveAlias: { "@supabase/supabase-js": "./tests/harness/app-backend.ts", "@supabase/ssr": "./tests/harness/app-backend.ts" } }
      : {}),
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      // Zonas privadas: nunca en cachés compartidas ni indexadas.
      {
        source: "/(panel|admin|api)/:path*",
        headers: [
          { key: "Cache-Control", value: "private, no-store" },
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
        ],
      },
    ];
  },
};

export default nextConfig;

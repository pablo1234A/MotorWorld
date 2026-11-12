# Variables de entorno

Plantilla: `.env.example`. Comprobación: `pnpm check:env` (usa el mismo esquema Zod que la aplicación: `src/lib/config/env-schema.ts`).

| Variable | Obligatoria | Ámbito | Descripción |
|---|---|---|---|
| `NEXT_PUBLIC_APP_URL` | Sí (por defecto `http://127.0.0.1:3000`) | Público | URL pública sin barra final. Se usa en enlaces de correo, redirecciones, Stripe y comprobación de origen. |
| `NEXT_PUBLIC_SUPABASE_URL` | Sí | Público | URL del proyecto de Supabase. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Sí | Público | Clave pública (anon/publishable). Segura en el navegador: RLS protege los datos. |
| `SUPABASE_SERVICE_ROLE_KEY` | Recomendada; obligatoria con pagos | **Secreta, solo servidor** | Omite RLS. Necesaria para: panel de administración, eliminación de cuentas, devolución de cuota, webhooks, cron y rate limit compartido. |
| `PAYMENTS_ENABLED` | No (`false`) | Servidor | Interruptor de pagos. |
| `STRIPE_SECRET_KEY` | Solo con pagos | Secreta | Clave secreta de Stripe. |
| `STRIPE_WEBHOOK_SECRET` | Solo con pagos | Secreta | Secreto de firma del webhook. |
| `STRIPE_PRICE_STARTER` / `_PRO` / `_BUSINESS` | Solo con pagos | Servidor | IDs de precio recurrente. |
| `AI_PROVIDER` | No (`template`) | Servidor | `template` (sin IA) o `anthropic`. |
| `ANTHROPIC_API_KEY` | Solo con `AI_PROVIDER=anthropic` | Secreta | Clave de la API de Anthropic. |
| `AI_MODEL` | No | Servidor | Modelo a usar (por defecto `claude-opus-5-5`). |
| `CRON_SECRET` | Recomendada | Secreta | Protege `/api/cron/process-jobs` (Vercel la envía como `Bearer`). Sin ella el cron está desactivado. |
| `LOG_LEVEL` | No (`info`) | Servidor | `debug`, `info`, `warn`, `error`. |

Solo para pruebas: `TEST_BASE_URL` (por defecto `http://127.0.0.1:3000`), `MAILPIT_URL` (por defecto `http://127.0.0.1:54324`).

Nunca subas `.env.local` ni valores reales al repositorio (`.gitignore` lo impide). Las variables `NEXT_PUBLIC_*` se incrustan en el código del navegador en el build: no pongas secretos con ese prefijo.

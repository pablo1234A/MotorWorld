# Despliegue

Objetivo recomendado: **Supabase** (base de datos, Auth, Storage) + **Vercel** (aplicación). Cualquier hosting Node.js ≥ 20.9 sirve con `pnpm build && pnpm start`.

> Antes de publicar comercialmente: revisa los textos legales (`src/content/legal.ts`), configura SMTP propio y completa la lista de comprobación final.

## 1. Supabase

1. Crea un proyecto en https://supabase.com (región UE si tus usuarios están en Europa). Guarda la contraseña de la base de datos.
2. Enlaza y aplica las migraciones desde tu equipo:
   ```bash
   pnpm exec supabase login
   pnpm exec supabase link --project-ref TU_REF
   pnpm db:push                 # aplica supabase/migrations/* (incluye buckets, RLS y datos de referencia)
   ```
   Comprueba en *Table Editor* que existen 4 planes y 53 categorías, y en *Storage* los buckets `product-images`, `avatars`, `imports`, `exports` (todos privados).
3. **Authentication → URL Configuration**:
   - *Site URL*: `https://TU-DOMINIO`
   - *Redirect URLs*: `https://TU-DOMINIO/**`
4. **Authentication → Providers → Email**: confirmación de correo activada, contraseña mínima 8, protección de contraseñas filtradas (si tu plan la incluye).
5. **Authentication → Email Templates**: las plantillas de `supabase/templates/*.html` solo se aplican en local. Copia su contenido a *Confirm signup*, *Reset password* y *Change email address*. Lo esencial es el enlace, que debe apuntar a la app:
   - Confirmación: `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email&next=/app`
   - Recuperación: `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery`
   - Cambio de correo: `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email_change&next=/app/cuenta`
6. **Authentication → SMTP**: configura un proveedor (Resend, Postmark, SES, Brevo…). El SMTP integrado de Supabase está pensado solo para pruebas y tiene un límite de envío muy bajo.
7. **Rate limits y CAPTCHA** (Authentication → Rate Limits / Attack Protection): ajusta los límites y valora activar CAPTCHA.
8. Copia de *Project Settings → API*: URL, clave `anon`/publishable y clave `service_role`/secret.
9. Ejecuta *Advisors → Security* y *Performance* y revisa los avisos.

## 2. Vercel

1. Importa el repositorio en Vercel (framework detectado: Next.js; comando `pnpm build`).
2. Variables de entorno (Production y Preview), ver VARIABLES-ENTORNO.md:
   ```
   NEXT_PUBLIC_APP_URL=https://TU-DOMINIO
   NEXT_PUBLIC_SUPABASE_URL=…
   NEXT_PUBLIC_SUPABASE_ANON_KEY=…
   SUPABASE_SERVICE_ROLE_KEY=…
   CRON_SECRET=<cadena aleatoria larga>   # p. ej. openssl rand -hex 32
   PAYMENTS_ENABLED=false
   ```
3. Despliega. Comprueba `https://TU-DOMINIO/api/health` → `{"status":"ok"}`.
4. **Cron**: `vercel.json` programa `/api/cron/process-jobs` cada 10 minutos para continuar trabajos masivos abandonados. Los planes gratuitos de Vercel solo admiten crons diarios: en ese caso cambia la expresión a diaria (`0 3 * * *`). El procesamiento normal no depende del cron (lo conduce el navegador del usuario).
5. **Duración de funciones**: `/api/generate`, `/api/jobs/{id}/process` y el cron declaran `maxDuration = 60`. Comprueba que tu plan de Vercel lo permite; cada lote procesa como máximo 20 elementos.
6. **Región**: `vercel.json` usa `cdg1` (París). Elige la más cercana a tu región de Supabase.

## 3. Dominio

1. Vercel → *Settings → Domains* → añade `tudominio.com` y `www.tudominio.com` y crea los registros DNS que indica (A/ALIAS o CNAME).
2. HTTPS es automático. La app envía HSTS.
3. Actualiza `NEXT_PUBLIC_APP_URL`, la *Site URL* y las *Redirect URLs* de Supabase y, si usas Stripe, la URL del webhook.
4. Configura SPF/DKIM/DMARC del dominio de envío de correo según tu proveedor SMTP.

## 4. Primer administrador

Regístrate en la app con tu correo y ejecuta (con las variables de producción en `.env.local` o en el entorno):
```bash
pnpm admin:grant tu-correo@dominio.com
```
No existe otra forma de conceder el rol (ni endpoint ni campo editable).

## 5. Almacenamiento

Los buckets y sus políticas los crea la migración `0003`. Límites: fotos 5 MB (JPG/PNG/WebP), avatares 2 MB, CSV 5 MB, exportaciones 20 MB. Los CSV de importación se eliminan al crear el trabajo; si se abandona una importación sin confirmar, el CSV queda en `imports/` (ver MANTENIMIENTO.md para limpiarlos).

## 6. Otros hostings (Node.js)

```bash
pnpm install --frozen-lockfile && pnpm build
NODE_ENV=production pnpm start -p 3000
```
Detrás de un proxy inverso (Nginx, Caddy…) con HTTPS, que **sobrescriba** `X-Forwarded-For` y `X-Forwarded-Host`. Programa el cron con el planificador del sistema:
```
*/10 * * * * curl -fsS -H "Authorization: Bearer $CRON_SECRET" https://TU-DOMINIO/api/cron/process-jobs
```

## 7. Copias de seguridad

- **Base de datos**: los planes de pago de Supabase incluyen copias diarias (y PITR opcional). En el plan gratuito no hay copias automáticas descargables: programa un volcado propio:
  ```bash
  pnpm exec supabase db dump --linked -f backup-$(date +%F).sql            # esquema
  pnpm exec supabase db dump --linked --data-only -f datos-$(date +%F).sql # datos
  ```
  Guarda los volcados cifrados fuera de Supabase y **prueba la restauración** periódicamente en un proyecto aparte.
- **Storage**: las copias de la base de datos no incluyen los archivos. Usa la API compatible con S3 de Supabase (`rclone`/`aws s3 sync`) para copiar los buckets.
- **Código y migraciones**: en Git.

## 8. Límites de los planes gratuitos (orientativo)

Los proveedores cambian sus condiciones; verifica los valores actuales en sus páginas de precios antes de decidir.

| Proveedor | Plan gratuito | A tener en cuenta |
|---|---|---|
| Supabase Free | ~500 MB de base de datos, ~1 GB de Storage, cuota de usuarios activos mensuales, 2 proyectos | Los proyectos inactivos se pausan; sin copias de seguridad descargables; SMTP integrado con límite muy bajo |
| Vercel Hobby | Funciones serverless con límite de duración y de ejecuciones, crons solo diarios | **Uso no comercial**: para un SaaS de pago se necesita un plan de pago |
| Stripe | Sin cuota fija | Comisión por transacción |

Solo se han hecho pruebas de carga en local (TESTING.md): no hay cifras verificadas de usuarios simultáneos sobre infraestructura real.

## 9. Lista de comprobación final

- [ ] Migraciones aplicadas en el proyecto de producción (`pnpm db:push`) y Advisors revisados
- [ ] Variables configuradas y `pnpm check:env` sin errores
- [ ] Plantillas de correo y SMTP configurados; registro y recuperación probados con un correo real
- [ ] `/api/health` responde `ok`
- [ ] Primer administrador concedido
- [ ] Textos legales revisados por un profesional y datos del titular completados
- [ ] Copias de seguridad programadas y restauración probada
- [ ] (Si se cobra) Stripe configurado y probado en modo test según STRIPE.md

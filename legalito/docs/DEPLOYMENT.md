# Despliegue

## Proveedor recomendado: Vercel Pro
- Soporte nativo de Next.js 16 (Cache Components, Partial Prerendering, `proxy.ts`).
- El plan **Hobby prohíbe el uso comercial**: usa **Pro** desde que Legalito cobre.
- Alternativa: Cloudflare Workers (plan de pago) con `@opennextjs/cloudflare`; Next.js indica que Cache Components requiere el runtime de Node.js, así que valida antes la compatibilidad.

## Pasos
1. Importa el repositorio en Vercel con **Root Directory = `legalito`**.
2. Variables de entorno (Production y Preview por separado) según `.env.example`:
   - Preview/staging: Supabase de staging, Stripe test, `APP_ENV=staging`, `ALLOW_DEMO_TEMPLATES=true`.
   - Production: Supabase de producción, `APP_ENV=production`, `ALLOW_DEMO_TEMPLATES=false`, `HASH_SALT` aleatorio, Stripe **test** hasta la autorización expresa del propietario.
   - Las `NEXT_PUBLIC_*` deben existir en el build.
3. Dominio propio con HTTPS. Actualiza `NEXT_PUBLIC_SITE_URL`, las URLs de Supabase Auth y el webhook de Stripe.
4. Resend: verifica el dominio (SPF, DKIM, DMARC) y usa un remitente de ese dominio en `EMAIL_FROM`.
5. Despliega y verifica:
   - `/robots.txt` permite indexar solo con `APP_ENV=production`.
   - Registro → email de verificación → acceso.
   - Compra de prueba → webhook 200 en Stripe → documentos generados.
6. Región de funciones: `fra1` (Fráncfort), cercana a Supabase UE.

## Operación
- Errores de aplicación: /admin/errores (tabla `app_errors`) y logs de Vercel.
- Eventos de Stripe fallidos: /admin/pagos (se reintentan automáticamente).
- Copias de seguridad: ver docs/SUPABASE.md.
- Actualizaciones de dependencias: `npm outdated` mensual y `npm audit`; ejecutar `npm run check` y E2E antes de desplegar.

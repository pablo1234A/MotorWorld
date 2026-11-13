# Seguridad

## Principios

1. **Defensa en profundidad**: cada acceso se comprueba en el servidor (sesión y rol) y otra vez en PostgreSQL (RLS). Un error en una capa no expone datos.
2. **Identidad solo desde la sesión**: `supabase.auth.getUser()` valida el JWT contra Auth en cada petición. Nunca se confía en identificadores enviados por el cliente.
3. **Privilegio mínimo**: los usuarios solo tienen permisos de tabla/columna explícitos; la clave `service_role` se limita a módulos marcados `server-only`.

## Controles implementados

| Riesgo | Control | Dónde | Prueba |
|---|---|---|---|
| Acceso entre cuentas | RLS por membresía en todas las tablas privadas; claves foráneas compuestas `(id, workspace_id)`; 404 en recursos ajenos | Migración 0002, servicios | `rls-isolation.test.ts`, `api.test.ts`, `dos-usuarios.spec.ts` |
| Manipulación de identificadores | `workspace_id`, `created_by`, `product_id` forzados por triggers; esquemas Zod sin esos campos | Triggers `*_before_write` | `rls-isolation`, `api` |
| Escalada de privilegios | `platform_admins` sin políticas (solo `service_role`); privilegios por columna en `profiles`; admin validado en servidor; sin endpoint para concederlo | Migración 0002, `session.ts` | `rls-isolation`, `admin.test.ts` |
| Equipos | Membresías e invitaciones solo mediante funciones con comprobación de rol; el enlace de invitación solo lo acepta la cuenta con el correo invitado; el espacio activo (cookie) se valida contra las membresías | Migración 0006, `session.ts` | `teams.test.ts`, `equipo.spec.ts` |
| Modificación del plan o consumo | `subscriptions`, `usage_records`, `plans` de solo lectura; consumo mediante funciones atómicas | Migración 0002 | `rls-isolation`, `usage-and-jobs` |
| Abuso concurrente del límite | Bloqueo `FOR UPDATE` de la suscripción + clave de idempotencia única | `consume_usage` | 25 peticiones simultáneas → exactamente el límite |
| SQL injection | Consultas parametrizadas (PostgREST/supabase-js); términos de búsqueda saneados para los filtros `or()`; funciones con `search_path` vacío | `sanitizeSearch`, migraciones | `security.test.ts`, `api.test.ts` |
| XSS | React escapa por defecto; contenido de usuario saneado en servidor (`sanitizeText`); descripciones HTML con lista blanca de etiquetas sin atributos; CSP; `nosniff` | `domain/text.ts`, `listings.ts`, `next.config.ts` | `security.test.ts`, `generation.test.ts`, `api.test.ts` |
| CSRF | Comprobación de `Origin` en mutaciones + cookies `SameSite=Lax` + cuerpos JSON | `handler.ts` | `api.test.ts` |
| Fuerza bruta / abuso | Rate limit en PostgreSQL compartido entre instancias (respaldo en memoria) por IP y por usuario/correo | `rate-limit.ts` | `api.test.ts` |
| Archivos maliciosos | Tipo real por bytes mágicos (no por extensión ni MIME declarado), tamaño, buckets con lista de MIME, nombres saneados, rutas con UUID aleatorio, CSV verificado como texto | `files.ts`, migración 0003 | `security.test.ts`, `storage.test.ts`, `api.test.ts` |
| Archivos privados | Buckets no públicos, políticas por carpeta de espacio/usuario, URLs firmadas de 1 h | Migración 0003 | `storage.test.ts` |
| Inyección de fórmulas en CSV | Prefijo `'` en celdas que empiezan por `= + - @` | `export.ts` | `marketplaces.test.ts` |
| Sesiones | Cookies httpOnly, `Secure` en producción, rotación de refresh tokens; cerrar otras sesiones; cambio de contraseña cierra las demás | `server.ts`, `proxy.ts`, `account.ts` | `api.test.ts` |
| Enumeración de cuentas | Respuestas idénticas en registro y recuperación | Rutas de auth | `api.test.ts` |
| Open redirect | Solo rutas internas en `next`; redirecciones con `NEXT_PUBLIC_APP_URL`, nunca con la cabecera Host | `auth/confirm`, `auth-forms.tsx` | `api.test.ts` |
| Webhooks falsificados | Firma Stripe verificada sobre el cuerpo sin procesar; idempotencia en `stripe_events` | `stripe.ts` | `stripe-webhooks.test.ts` |
| Fuga de errores | Errores internos → mensaje genérico; detalle solo en logs estructurados | `handler.ts`, `logger.ts` | — |
| Clickjacking y cabeceras | `X-Frame-Options: DENY`, `frame-ancestors 'none'`, HSTS, `Referrer-Policy`, `Permissions-Policy` | `next.config.ts` | — |
| Cuentas desactivadas | Ban en Auth + RLS excluye perfiles desactivados (efecto inmediato aunque el token siga vigente) | `admin.ts`, migración 0002 | `rls-isolation`, `admin.test.ts` |
| Auditoría | `audit_logs` para creación/borrado de productos y anuncios, exportaciones, trabajos, cambios de contraseña, acciones administrativas, sincronización de suscripciones | servicios | `admin.test.ts` |
| Secretos | Variables solo de servidor; `server-only` impide importar módulos con claves en el cliente; `.env*` en `.gitignore` | — | — |

## Auditoría de seguridad realizada

Revisión manual del código y verificación con pruebas automatizadas (ver TESTING.md). Hallazgos corregidos durante el desarrollo:

1. El saneamiento HTML eliminaba entera una etiqueta permitida con atributos (`<p onclick>`), dejando HTML desequilibrado → ahora se conserva la etiqueta sin atributos.
2. `/auth/confirm` construía la redirección con el origen de la petición; en producción podía diferir del dominio de la app y perderse la sesión (y depender de la cabecera Host) → ahora usa `NEXT_PUBLIC_APP_URL`.

## Limitaciones conocidas y recomendaciones

- **IP del cliente**: el rate limit por IP usa `x-forwarded-for`. En Vercel la plataforma fija esa cabecera; detrás de otro proxy, asegúrate de que el proxy la sobrescribe (si no, un atacante podría variarla y esquivar el límite por IP; el límite por correo/usuario sigue funcionando).
- **CSP** permite `'unsafe-inline'` en scripts (necesario para la hidratación de Next.js sin nonces). Valorar CSP con nonces si se añaden scripts de terceros.
- **Ataques volumétricos (DDoS)**: deben mitigarse en el borde (firewall de Vercel/Cloudflare); el rate limit de la aplicación no sustituye a esa capa.
- **Auth de Supabase en la nube**: activar confirmación de correo, longitud mínima de contraseña 8, protección de contraseñas filtradas y CAPTCHA (hCaptcha/Turnstile) desde el panel; configurar SMTP propio.
- **Supabase Advisors**: ejecutar el asesor de seguridad del panel tras aplicar las migraciones.
- No se ha realizado una auditoría de penetración externa.

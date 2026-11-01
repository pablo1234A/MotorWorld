# Seguridad y privacidad

## Controles implementados
| Control | Implementación |
| --- | --- |
| Aislamiento entre clientes | RLS en todas las tablas; privilegios revocados por defecto y concedidos por columna; probado contra PostgreSQL real (`tests/integration/rls.test.ts`) |
| Escrituras sensibles | Pagos, compras, documentos y eventos solo con `service_role` desde el servidor |
| Autorización | `requireUser` / `requireOrganization` / `requireAdmin` en cada página, acción y ruta; identidad de `supabase.auth.getUser()` |
| Administración | Rol en `user_roles` (solo SQL); 404 para no administradores; políticas RLS `is_admin()` como segunda barrera; datos enmascarados |
| Descargas | Lectura por RLS + comprobación de revocación + coherencia de ruta + URL firmada de 60 s; bucket privado |
| Pagos | Firma de webhook, idempotencia, estado desde API de Stripe, sin datos de tarjeta, cobros reales bloqueados sin autorización expresa |
| Plantillas | Aprobación con revisión documentada obligatoria en BD; contenido inmutable tras revisión; demo prohibidas en producción |
| Entradas | Validación con zod en servidor; NIF/NIE/CIF con dígito de control; HTML escapado; JSON-LD escapado |
| Sesiones | Cookies httpOnly de Supabase SSR; refresco en `proxy.ts`; rotación de refresh tokens |
| Abuso | Límites de frecuencia en registro, acceso, recuperación, contacto, checkout, generación y analítica; campo trampa en contacto |
| Redirecciones | `safeNextPath` impide redirecciones abiertas |
| Cabeceras | CSP estricta, HSTS, X-Frame-Options DENY, nosniff, Referrer-Policy, Permissions-Policy, COOP; `no-store` y `noindex` en zonas privadas |
| Secretos | Solo en variables de entorno de servidor; validación al arrancar (`src/lib/env.ts`) |
| Auditoría | `audit_logs`: accesos, consentimientos, pagos, generación, descargas, cambios administrativos |
| Errores | `app_errors` sin trazas sensibles para el usuario; códigos de error visibles |
| Privacidad | Analítica sin cookies; IP seudonimizada con sal; payloads de Stripe no almacenados; solicitud de supresión desde el panel |

## Pendiente / recomendado antes de producción
- Revisión de seguridad externa (pentest básico) y de la configuración de Supabase (Security Advisor).
- Activar MFA para las cuentas de administración de Supabase, Stripe, Vercel, Resend y GitHub.
- Registro de actividades de tratamiento y contratos de encargo (Supabase, Vercel, Stripe, Resend).
- Política de retención: purga periódica de `analytics_events`, `rate_limits` y `app_errors` antiguos.
- Procedimiento documentado para atender solicitudes de supresión (anonimizar perfil, conservar facturación bloqueada).

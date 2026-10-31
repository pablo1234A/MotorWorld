# Seguridad, aislamiento y gestión de datos

## Medidas implementadas

| Área | Medida |
|---|---|
| Contraseñas | Argon2id (m=19 MiB, t=2), política de 10+ caracteres con letras y números, comprobación ficticia para igualar tiempos (sin enumeración de usuarios) |
| Sesiones | Token aleatorio de 256 bits; en BD solo su SHA-256; cookie `HttpOnly`, `SameSite=Lax`, `Secure` en https; caducidad deslizante de 30 días; invalidación al restablecer la contraseña; listado y cierre de sesiones |
| Fuerza bruta | Rate limiting en Redis (login por IP y por email, registro, recuperación, verificación…) y bloqueo de cuenta 15 min tras 5 fallos |
| CSRF | Comprobación de `Origin`/`Referer` en todas las rutas con cookie que modifican datos + SameSite=Lax. Las rutas públicas (Stripe, API, webhook) se autentican por firma o clave |
| XSS | React escapa la salida; las plantillas escapan todo el contenido del usuario; las vistas previas se muestran en `iframe sandbox` sin scripts; CSP estricta (`frame-ancestors 'none'`, `object-src 'none'`) |
| Inyección | Prisma (consultas parametrizadas); el SQL manual usa plantillas etiquetadas parametrizadas; saneado de cabeceras de correo; neutralización de fórmulas en exportaciones CSV |
| Entrada | Validación zod en servidor de cada cuerpo y consulta; límites de tamaño |
| Secretos | Tokens OAuth, verificadores PKCE y secretos de webhook cifrados con AES-256-GCM y rotación de claves (`ENCRYPTION_KEYS`); claves de API guardadas como hash |
| OAuth | `state` de un solo uso ligado al usuario (10 min), PKCE S256, ámbito mínimo (`gmail.send` / `Mail.Send`), revocación al desconectar |
| Aislamiento | El negocio se deriva de la sesión; todas las consultas filtran por `businessId`; acceso a recursos ajenos → 404 (probado) |
| Webhooks | Stripe: firma verificada sobre el cuerpo en bruto, idempotencia y orden; webhook entrante: HMAC-SHA256 con marca de tiempo (5 min) |
| Errores | Mensajes genéricos al usuario; el detalle va al log estructurado (con campos sensibles ocultos) y a `ERROR_WEBHOOK_URL` |
| Auditoría | `audit_logs`: autenticación, conexiones, facturación, cambios de configuración, importaciones, exportaciones… con IP y navegador |
| Cabeceras | CSP, HSTS (producción), X-Frame-Options, nosniff, Referrer-Policy, Permissions-Policy, COOP |

## Política de retención (aplicada a diario por el worker)

| Dato | Plazo |
|---|---|
| Sesiones, tokens de verificación/recuperación, estados OAuth | Hasta su caducidad (+1 mes los tokens usados) |
| Registros de envío (`email_logs`) y eventos sin envío | 13 meses |
| Contenido (asunto/cuerpo) de envíos finalizados | Se vacía a los 13 meses; se conservan los metadatos de estadísticas |
| Auditoría | 24 meses |
| Eventos de facturación de Stripe | 6 años |
| Facturas | No se borran (obligación mercantil y fiscal); al eliminar la cuenta se desvinculan |
| Cuenta y datos operativos | Hasta que el usuario la elimina (Perfil y seguridad → Eliminar mi cuenta) |

Revisa estos plazos con tu asesor y ajústalos en `src/server/modules/retention.ts`.

## Copias de seguridad

`scripts/backup-db.sh`: `pg_dump` en formato custom, verificación con `pg_restore --list`, permisos 600 y rotación (`KEEP_DAYS`). Prográmalo a diario y copia los volcados a un almacenamiento externo cifrado. **Haz una restauración de prueba periódicamente.** Guarda `ENCRYPTION_KEYS` aparte: una copia sin la clave no permite usar los tokens OAuth.

## Derechos RGPD

- Portabilidad: `GET /api/v1/account/export` (JSON).
- Supresión: `POST /api/v1/account/delete` (cancela Stripe, revoca OAuth, borra los datos operativos).
- Formulario público `/legal/derechos` → `data_rights_requests` + aviso a `ADMIN_NOTIFICATIONS_EMAIL`.
- Destinatarios: baja en un clic en cada correo; se bloquean todos los envíos futuros.

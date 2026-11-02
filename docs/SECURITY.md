# Seguridad, privacidad y licencias

| Área | Implementación |
|---|---|
| Contraseñas | Argon2id (`argon2-cffi`), rehash automático, política mínima (10+ caracteres, mayúsculas, minúsculas y números). |
| Sesiones | JWT de acceso de 15 min en cookie httpOnly `SameSite=Lax` (`Secure` en producción); token de refresco opaco (hash SHA-256 en BD) con **rotación** y **detección de reutilización** (si se reutiliza uno rotado se revocan todas las sesiones). Cierre de sesión y «cerrar todas las sesiones». |
| Recuperación de contraseña | Token de un solo uso (hash en BD), caducidad 30 min, respuesta idéntica exista o no la cuenta (sin enumeración), revoca todas las sesiones al cambiarla. |
| CSRF | Cookies `SameSite=Lax` + verificación de `Origin` en métodos de escritura. |
| Aislamiento de datos | Todas las consultas filtran por `user_id`; los recursos ajenos devuelven **404** (no se revela su existencia). Las entradas de un trabajo, los clips de una timeline y las referencias de una película se validan como propias. Probado en `test_users_cannot_access_each_others_data` y en la integración. |
| Archivos | Tipo detectado por *magic bytes* (no por extensión ni MIME del cliente), lista blanca de formatos, `Pillow.verify()` + límite de píxeles (bombas de descompresión), `ffprobe` para vídeo/audio, límites de tamaño, cuota por usuario, claves de almacenamiento generadas por el servidor (sin nombres de usuario en rutas), protección de path traversal, `X-Content-Type-Options: nosniff`, descarga con `Content-Disposition`. |
| Entrega de medios | Local: `FileResponse` con autorización y rangos; S3: redirección a URL prefirmada de corta duración tras autorizar. Tokens de medios firmados por archivo. |
| Claves API | Del servidor: solo variables de entorno, nunca enviadas al frontend (el panel muestra si están configuradas, no su valor). Del usuario (BYOK): cifradas con Fernet (`ENCRYPTION_KEY`), solo se muestran los 4 últimos caracteres, se pueden desactivar (`ALLOW_USER_API_KEYS=false`). |
| Abuso | Limitador por usuario y por IP en autenticación (Redis), trabajos activos por usuario, límite diario, cuotas; descargas de stock solo desde hosts permitidos (anti-SSRF). |
| Errores | Respuestas con `code` estable y `request_id`; los errores internos no filtran trazas. |
| Cabeceras | `X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy`, HSTS en Caddy. |
| Configuración insegura | En `ENVIRONMENT=production` la API **no arranca** con `SECRET_KEY` por defecto, sin `ENCRYPTION_KEY`, sin cookies seguras o con cola en proceso. |
| RGPD | Eliminación de cuenta con borrado de archivos; descarga de todos los archivos; plantillas de privacidad y condiciones en `/legal/*` (deben completarse por el operador). |

## Contenido y voces

- No se integran herramientas de clonación de voz (RVC, XTTS). TTS solo con voces de biblioteca o propias con consentimiento.
- Las condiciones de uso prohíben deepfakes engañosos y suplantación; los proveedores aplican además su propia moderación (los rechazos se muestran como tales y **no** se reintentan en otro proveedor).

## Pendiente recomendado antes de abrir al público

Verificación de email al registrarse, 2FA, panel de administración y moderación propia de prompts, auditoría externa de seguridad, y política CSP estricta adaptada a tu dominio de medios.

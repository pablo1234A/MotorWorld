# Pruebas ejecutadas

Ejecutadas el 31/10/2026 en el entorno de desarrollo (PostgreSQL 16, Redis 7, Node 22, Chromium de Playwright 1.63).

| Batería | Comando | Resultado |
|---|---|---|
| Unitarias + integración (BD y Redis reales) | `npm test` | **79/79 superadas** (10 archivos, incluidas las regresiones de la revisión de código) |
| E2E en navegador (app de producción `next start` + worker real) | `npm run test:e2e` | **11/11 superadas** (escritorio + móvil Pixel 7) |
| Tipos / lint / build | `npm run typecheck`, `npm run lint`, `npm run build` | Sin errores |
| Dependencias de producción | `npm audit --omit=dev` | 0 vulnerabilidades |

## Qué es real y qué no en estas pruebas

- **Real**: PostgreSQL, Redis, BullMQ, el worker, las transacciones y bloqueos, la verificación de firma de los webhooks de Stripe, el envío SMTP de los correos del sistema (a un servidor SMTP local), el cifrado, el navegador.
- **No disponible en este entorno**: credenciales de Google, Microsoft y Stripe. Por eso:
  - En las pruebas, Gmail se sustituye **solo en el borde HTTP** por un servidor local que reproduce los endpoints de token, userinfo y `messages.send` de Google. Se ejecuta el código real de Reseñalo (OAuth con PKCE, cifrado de tokens, MIME, cola, worker, contadores); lo único que no ocurre es la entrega en un buzón de Gmail real.
  - Los pagos se prueban enviando al endpoint real **eventos de Stripe firmados** con el secreto de webhook. El Checkout de Stripe (la página de pago) no se ha podido abrir sin una clave.

> ⚠️ **Pendiente antes del lanzamiento** (requiere tus credenciales): conectar una cuenta Gmail y otra de Outlook reales, enviar a un destinatario autorizado y comprobar la recepción; hacer una compra en modo prueba de Stripe con `stripe listen`. Pasos en la tabla siguiente («Validación manual»).

## Las 20 pruebas exigidas

| # | Prueba | Cómo se ha ejecutado | Resultado |
|---|---|---|---|
| 1 | Crear una cuenta | E2E: formulario de registro en navegador. Integración: `auth.test.ts` (hash Argon2id, cookie HttpOnly/SameSite) | ✅ |
| 2 | Cerrar sesión | E2E (borrado de sesión → `/app` redirige a login) e integración (`logout` invalida la sesión en BD) | ✅ |
| 3 | Iniciar sesión de nuevo | E2E: contraseña errónea rechazada, correcta acepta; la cuenta persiste | ✅ |
| 4 | Recuperar contraseña | E2E: correo recibido por SMTP, enlace, nueva contraseña, login. Integración: un solo uso, invalida sesiones, sin enumeración | ✅ |
| 5 | Crear un negocio | E2E: onboarding completo | ✅ |
| 6 | Conectar una cuenta de correo autorizada | E2E + integración: flujo OAuth con `state` y PKCE, tokens cifrados, rechazo de `state` falso o reutilizado, rechazo si no se concede `gmail.send`. **Con Google real: pendiente de credenciales** | ✅ (endpoint simulado) / ⏳ real |
| 7 | Crear una plantilla | E2E: edición con vista previa en vivo; bloqueo de lenguaje con incentivos. Integración: variables desconocidas, enlace obligatorio, límite por plan | ✅ |
| 8 | Registrar un cliente | E2E (formulario) + integración (CSV: validación, duplicados en archivo y existentes) | ✅ |
| 9 | Generar una solicitud de reseña | E2E (alta con «enviar ahora») + integración (manual, CSV, API con clave, webhook HMAC, campañas) | ✅ |
| 10 | Enviar un correo de prueba | El worker envía por la ruta Gmail; endpoint de prueba implementado (`/api/v1/email-connection/test`). **Envío a Gmail real: pendiente de credenciales** | ✅ (endpoint simulado) / ⏳ real |
| 11 | Comprobar que el mensaje llega | Se verifica el MIME recibido por la «Gmail API» local (From, To, asunto RFC 2047, List-Unsubscribe). **Recepción en buzón real: pendiente** | ✅ (endpoint simulado) / ⏳ real |
| 12 | Variables personalizadas | E2E: asunto «Lucía Fernández, ¿qué tal tu mechas balayage en Peluquería Marta?»; unitarias: escape HTML, inyección de cabeceras | ✅ |
| 13 | El contador se actualiza | E2E: `sent = 1` y el panel muestra «de 70 del plan»; solo se cuenta tras la confirmación del proveedor | ✅ |
| 14 | Intentar superar el límite | E2E (interfaz y API directa → 402). Integración: **35 peticiones concurrentes en Starter → exactamente 30 aceptadas**; worker con 30 trabajos y 3 huecos → exactamente 3 envíos | ✅ |
| 15 | El sistema bloquea el envío adicional | Ningún envío adicional llega al proveedor; estado BLOCKED/LIMIT_REACHED | ✅ |
| 16 | Probar los tres planes | Límites 30/70/200 (integración); cambios Starter ↔ Pro ↔ Business por webhook (E2E e integración) | ✅ |
| 17 | Pagos y webhooks de Stripe | Integración: firma inválida → 400, idempotencia, eventos fuera de orden ignorados, renovación reinicia contador, `past_due` bloquea envíos, cancelación, factura con base/IVA/total. **Checkout real: pendiente de clave** | ✅ webhooks / ⏳ checkout |
| 18 | Dos usuarios no acceden a los datos del otro | Integración (todas las rutas por id → 404, listados vacíos) y E2E con dos sesiones de navegador | ✅ |
| 19 | Errores de conexión del correo | E2E: token revocado (`invalid_grant`) → NEEDS_REAUTH, banner, correo de aviso al propietario y reconexión. Integración: 401 en envío → trabajos en espera sin contabilizar y reanudación al reconectar; 429/5xx → reintentos con backoff; destinatario rechazado → REBOTADO | ✅ |
| 20 | Funcionamiento en móvil | E2E en Pixel 7: landing, menú móvil y las 9 secciones del panel sin scroll horizontal; capturas en `tests/e2e/.artifacts/screens/` | ✅ |

## Otras comprobaciones automatizadas

- Envío interrumpido a mitad (caída del worker) → no se reenvía para evitar duplicados.
- Tres workers procesando el mismo trabajo a la vez → un solo envío.
- Bajas: enlace de un clic (RFC 8058) y bloqueo de pendientes.
- Pausa de la automatización (permite envíos manuales).
- Retardo de envío y ventanas horarias con zona horaria y cambio de hora.
- Rate limiting de login por IP y bloqueo de cuenta tras 5 intentos.
- Protección CSRF (petición con `Origin` ajeno → 403).
- Clics en el enlace de reseña → redirección y registro.

## Validación manual pendiente (con tus credenciales)

1. Configura Stripe en modo de prueba y Google (usuario de prueba en la pantalla de consentimiento) según `CREDENCIALES.md`.
2. Regístrate, contrata Pro con `4242 4242 4242 4242` y comprueba que la suscripción pasa a Activa (webhook).
3. Conecta tu Gmail → «Comprobar conexión» → «Enviarme un correo de prueba» → comprueba que llega a tu bandeja.
4. Añade como cliente una dirección tuya con «Enviar ahora» → comprueba la recepción, las variables, el enlace y la baja.
5. Repite con una cuenta de Outlook/Microsoft 365.
6. Prueba el pago fallido con `4000 0000 0000 0341` y el portal de cliente (cambio de tarjeta y cancelación).

# RevisaYa — Integraciones externas

> Estado: **diseño (Fase 0)**. Cada integración se implementa tras un **puerto** (interfaz TypeScript) con un adaptador real. Los dobles de prueba solo existen en `tests/`.
> Si falta una credencial, la funcionalidad se muestra como **"no configurada"**; nunca se simula que funciona.

## 1. Puertos

```ts
interface EmailPort {
  send(msg: OutboundEmail & { idempotencyKey: string }): Promise<SendResult>;   // accepted | retryable | permanent
  createDomain(domain: string): Promise<DomainSetup>;                           // registros DNS a crear
  getDomainStatus(providerDomainId: string): Promise<DomainStatus>;
  verifyWebhook(rawBody: string, headers: Headers): EmailWebhookEvent[];
}
interface PaymentsPort { createCheckout(...); createPortalSession(...); verifyWebhook(...); ... }
interface CalendarPort { authUrl(...); exchangeCode(...); upsertEvent(...); deleteEvent(...); revoke(...); }
interface CaptchaPort  { verify(token: string, ip: string): Promise<boolean>; }
interface StoragePort  { put(...); signedUrl(...); remove(...); }
interface RateLimiter  { consume(key: string, cost?: number): Promise<{ allowed: boolean; retryAfter: number }>; }
```

## 2. Correo electrónico

**Proveedor principal: Resend.** Alternativa preparada: Amazon SES (más barato a gran volumen, sin límite práctico de dominios). SendGrid queda como opción documentada. Elegir región UE si el proveedor lo ofrece.

**Implementado (Fase 5)** — `src/server/email/`:

| Adaptador | Variable | Detalles |
|---|---|---|
| `ResendEmailAdapter` | `EMAIL_PROVIDER=resend`, `RESEND_API_KEY` | API HTTP de Resend con `Idempotency-Key: reminder-<id>`, timeout 15 s. 429, 409 y 5xx → reintento; resto de 4xx → definitivo. |
| `SmtpEmailAdapter` | `EMAIL_PROVIDER=smtp`, `SMTP_URL` | nodemailer (Amazon SES por SMTP, Mailpit en local). Timeouts acotados. 5xx → definitivo; 4xx y red → reintento. SMTP no tiene idempotencia: protege la comprobación de `email_logs`. |

`getEmailProvider()` devuelve `null` si falta la configuración: entonces **no se envía nada** (no hay adaptador "falso" fuera de `tests/`). Los mensajes de error del proveedor se guardan sin direcciones de correo (`sanitizeProviderMessage`).

**Implementado (Fase 6)**: dominios propios con la API de dominios de Resend (`src/server/email/domains.ts`, región `eu-west-1`), webhooks con firma Svix (`src/server/email/webhooks.ts`), editor de plantillas, correos de prueba, resúmenes y avisos de consumo. **Probado con respuestas simuladas del proveedor** (tests); falta probarlo con una cuenta real de Resend antes de producción (no hay credenciales en este entorno).

### 2.1 Modos de remitente

| Modo | From | Cuándo |
|---|---|---|
| `custom_domain` | `Taller Sur <citas@tallersur.es>` | Dominio del taller **verificado** (SPF + DKIM; DMARC recomendado). Es el modo que describe el PDF. |
| `shared` (propuesta P1) | `Taller Sur <taller-sur@avisos.revisaya.es>` con `Reply-To: tallersur@gmail.com` | Mientras el dominio no esté verificado, **o si el taller no tiene dominio propio** (muchos talleres usan Gmail/Hotmail, donde no se pueden añadir registros DNS). Subdominio de RevisaYa con SPF/DKIM/DMARC propios. El cliente ve el nombre del taller; la dirección real es de RevisaYa. |

Nunca se usa el dominio del taller en el `From` sin verificar (sería suplantación y acabaría en spam o rechazado).

### 2.2 Verificación de dominio (implementado en la Fase 6)

1. En *Configuración → Correo*, el administrador escribe su dominio (`tallersur.es`) y la dirección de envío (`avisos`). Se rechazan Gmail, Hotmail y otros correos gratuitos (no se pueden verificar). Máximo 3 dominios por taller.
2. RevisaYa lo da de alta en Resend y muestra los registros DNS **exactos** que devuelve el proveedor (SPF, DKIM, MX de retorno). Recomendado añadir DMARC (`v=DMARC1; p=none; rua=…`).
3. Comprobación automática cada 30 min durante 72 h (`email-maintenance`) y botón "Comprobar ahora" (máx. 30/h). Los verificados se vuelven a comprobar a diario: si alguien borra los registros, la sucursal vuelve sola al remitente compartido (trigger `sending_domains_unverified`).
4. Verificado → se puede elegir como remitente por sucursal. La BD impide usar uno no verificado (`sending_domain_not_verified`).
5. Solo con `EMAIL_PROVIDER=resend`. Con SMTP (SES, Mailpit) la pantalla dice que no está disponible; no se simula.
6. Pendiente: guías con capturas para los registradores habituales en España (Fase 10, con el diseño definitivo).

### 2.3 Plantillas

- Editables por **todos los planes** (`/app/configuracion/plantillas`): asunto, texto, texto del botón y activar/desactivar botón, para el aviso por fecha y el aviso por kilometraje. Las plantillas de citas llegan con la Fase 7.
- Variables (lista cerrada): `{nombre}`, `{modelo}`, `{matricula}`, `{fecha_revision}` (del PDF) y `{taller}`. Una variable desconocida es un error al guardar; el asunto no admite saltos de línea.
- Renderizado: el texto del taller es **texto plano** (línea en blanco → párrafo), las variables se sustituyen ya escapadas y el diseño (nombre y color del taller, contacto, enlace de baja) lo genera RevisaYa (`src/lib/email/reminder-email.ts`, sin React Email: una función pura probada). Siempre hay versión de texto.
- Vista previa en vivo (iframe aislado) con el próximo vehículo con revisión del taller (o datos de ejemplo), correo de prueba al administrador (máx. 20/día, cuenta en el consumo) y "restaurar la plantilla original". Una personalización por taller; cada cambio sube la versión y queda auditado.
- **"Plantillas a medida" (Excelencia)**: propuesta P10 — diseño HTML específico para el taller (maquetado por RevisaYa), varias plantillas por tipo de aviso y A/B. No recorta lo que el PDF da a todos los planes.

### 2.4 Cuenta como consumo (propuesta P5)

Cuentan contra el límite mensual los correos enviados a clientes del taller: recordatorios, confirmaciones de cita y correos de prueba. No cuentan los correos de la plataforma al propio taller (invitaciones, recuperación de contraseña, facturación, resúmenes).

### 2.5 Requisitos de entregabilidad

SPF + DKIM + DMARC alineados, `List-Unsubscribe` one-click (RFC 8058), tasa de quejas < 0,1 %, supresión automática de rebotes definitivos, calentamiento progresivo del subdominio compartido, pruebas en Gmail y Outlook antes de vender (riesgo nº 1 del PDF).

### 2.6 Webhooks del proveedor

`POST /api/webhooks/email/resend`. Resend firma con el esquema Svix/"Standard Webhooks": cabeceras `svix-id`, `svix-timestamp`, `svix-signature` (`v1,<base64>`), HMAC-SHA256 sobre `id.timestamp.cuerpo` con el secreto `whsec_…` (`RESEND_WEBHOOK_SECRET`). Se rechazan firmas no válidas y marcas de más de 5 minutos (401), cuerpos de más de 256 KB (413), y sin secreto configurado el endpoint responde 503. Eventos usados: `email.delivered`, `email.delivery_delayed`, `email.bounced` (`bounce.type`: `Permanent` → definitivo, `Transient` → temporal), `email.complained`. Lógica en AUTOMATIZACIONES §6.

En el panel de Resend: endpoint `https://<dominio>/api/webhooks/email/resend`, eventos anteriores, y copiar el *signing secret* a `RESEND_WEBHOOK_SECRET`.

### 2.7 Correos de la plataforma al taller

Resúmenes y avisos de consumo salen de `"RevisaYa" <no_reply@EMAIL_SHARED_DOMAIN>`, no cuentan en el consumo del taller y quedan en `email_logs` (`digest`, `usage_alert`). Los slugs que coinciden con buzones de servicio (`postmaster`, `abuse`, `admin`, `no-reply`…) están reservados (trigger `organizations_reserved_slug`).

## 3. Stripe (modo TEST)

- **Productos/precios**: 4 productos × 2 precios (mensual/anual) con `lookup_key` (`pro_month`, `pro_year`, …). Se crean con un script idempotente y se registran en `billing_prices`.
- **Alta con prueba de 7 días (según el PDF)**: Stripe Checkout en modo `subscription`, `subscription_data.trial_period_days = 7`, `payment_method_collection = 'always'` (se pide la tarjeta al empezar y no se cobra hasta que termina la prueba). Una prueba por organización (y control por tarjeta/email para evitar pruebas encadenadas).
- **Gestión**: Stripe Customer Portal para cambiar tarjeta, ver facturas, cambiar de plan y **cancelar** (al final del periodo). También botón propio de cancelación en el panel que llama a la API.
- **Cambios de plan**: mejora → inmediata con prorrateo; bajada → al final del periodo, y solo si el uso actual cabe en el plan destino (si no, se explica qué sobra; nunca se borran datos para encajar).
- **Webhooks** (`/api/webhooks/stripe`): firma verificada sobre el cuerpo en bruto; idempotencia por `stripe_events.id`; procesado ordenado por `created` y reconsultando el objeto a la API para evitar estados viejos. Eventos: `checkout.session.completed`, `customer.subscription.created|updated|deleted|trial_will_end`, `invoice.paid|payment_failed|finalized`.
- **Estados → acceso**: `trialing`/`active` = completo; `past_due` = completo con aviso durante 7 días de gracia (propuesta P7), después solo lectura y avisos pausados; `canceled`/`unpaid` = solo lectura + exportación durante el periodo de retención, sin avisos.
- **Impuestos**: precios del PDF **sin IVA** (propuesta P11, habitual en B2B) y Stripe Tax para calcular el IVA; facturas emitidas por Stripe. **Pendiente de validar con el gestor** que las facturas de Stripe cumplen la normativa española de facturación (incl. VeriFactu cuando aplique).
- **TEST/LIVE**: claves `sk_test_`/`pk_test_` en todos los entornos. El paso a LIVE exige `PAYMENTS_LIVE_ENABLED=true`, precios LIVE en `billing_prices` y la autorización del responsable adulto del proyecto, tras revisar obligaciones fiscales y legales (alta de actividad, textos legales).

## 4. Google Calendar (Max y superiores) — implementado en la Fase 9

Código: `src/server/integrations/google.ts` (OAuth y API REST v3, sin SDK), `src/server/integrations/crypto.ts` (AES-256-GCM), `src/server/modules/integrations/` (servicio y acciones), `src/app/api/integrations/google/callback/route.ts` y `/app/configuracion/integraciones`. Pruebas: `tests/unit/calendar.test.ts` y `tests/integration/calendar.test.ts` (con un servidor que imita a Google, solo en `tests/`).

**Qué hace**
- Una conexión por taller (la hace un administrador; plan Max, Business o Excelencia con la suscripción activa).
- Sincronización en un solo sentido, de RevisaYa a Google:
  - solicitud de cita → evento «Solicitud (sin confirmar)», provisional y sin ocupar la agenda (de día completo si el cliente solo pidió un día);
  - cita confirmada o cambiada → evento con día y hora;
  - rechazada o cancelada → se borra el evento.
- El evento lleva el nombre del cliente, la matrícula, el vehículo, el teléfono, el correo, el mensaje y el enlace a la cita en RevisaYa. No se invita al cliente: ya recibe su correo con el `.ics`.
- Id de evento **determinista** (`rv` + id de la cita, base32hex): repetir nunca duplica.
- Se sincroniza justo después de cada cambio (`after()`, sin hacer esperar al usuario).
  - Si Google falla, la cita no se ve afectada: queda `pending` en `calendar_event_links`.
  - El proceso `calendar-sync` (cada 15 min) la reintenta y sube las citas próximas que falten.

**Seguridad**
- Ámbitos mínimos: `openid`, `email` y `calendar.events`. RevisaYa no lee el resto de la cuenta ni otros calendarios.
- `access_type=offline` y `prompt=consent`.
- `state` firmado con HMAC: lleva el taller, el usuario, un nonce y caduca a los 10 minutos.
  - Viaja también en una cookie httpOnly (`SameSite=Lax`, ruta `/api/integrations/google`).
  - La vuelta exige la misma sesión, el mismo taller, la cookie y el permiso de la agenda; si no, no conecta.
- Tokens (refresh y access) **cifrados** con AES-256-GCM en `private.integration_secrets`:
  - clave `INTEGRATIONS_ENCRYPTION_KEY`, que no está en la base de datos;
  - el id de la integración va como dato asociado (AAD), así que el cifrado no se puede copiar a otra fila;
  - `key_version` permite rotar la clave.
- Si Google responde `invalid_grant` o 401 (contraseña cambiada, acceso retirado), la integración pasa a `error` y el panel pide volver a conectar. Las citas nuevas esperan y se suben al reconectar.
- Desconectar revoca el token en Google, borra los secretos, deja la integración `disconnected` y lo registra en la auditoría.
- `GOOGLE_OAUTH_BASE` y `GOOGLE_API_BASE` existen solo para las pruebas y están **prohibidas en producción** (`env.ts`).

**Puesta en marcha (la hace el responsable; no hay credenciales en este entorno)**
1. Google Cloud Console → crear un proyecto → *APIs y servicios* → habilitar **Google Calendar API**.
2. *Pantalla de consentimiento de OAuth*:
   - tipo **Externo**, con el nombre «RevisaYa», el correo de soporte, el dominio y los enlaces a la política de privacidad y a los términos (`/legal/privacidad`, `/legal/terminos`);
   - ámbitos `openid`, `.../auth/userinfo.email` y `.../auth/calendar.events`.
3. *Credenciales* → **ID de cliente OAuth** de tipo «Aplicación web», con la URI de redirección autorizada `https://<dominio>/api/integrations/google/callback`.
4. En el hosting: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` y `INTEGRATIONS_ENCRYPTION_KEY` (`openssl rand -base64 32`). **No se puede cambiar esa clave sin volver a conectar** las agendas.
5. Mientras Google no verifique la app, solo funcionan los «usuarios de prueba» que añadas (máximo 100), con el aviso de «app no verificada».
   - `calendar.events` es un ámbito **sensible**: para publicarla hay que pedir la verificación a Google (con un vídeo del uso y la política de privacidad publicada).
   - Tarda días o semanas.
6. **Pendiente: probarlo con una cuenta real de Google.** Aquí se ha probado con un servidor que imita las respuestas documentadas de Google.

## 5. Otros

| Servicio | Uso | Credenciales |
|---|---|---|
| Cloudflare Turnstile | captcha en la página pública de citas (implementado en la Fase 7; verificación en servidor con `siteverify`, si Cloudflare no responde se rechaza) | `NEXT_PUBLIC_TURNSTILE_SITE_KEY` (pública), `TURNSTILE_SECRET_KEY`. Sin ellas no se exige y siguen activos el límite de peticiones y el campo trampa. |
| Sentry (no integrado) | se puede añadir para errores; hoy los errores van a los registros de Vercel con datos personales redactados (DESPLIEGUE §5) | — |
| healthchecks.io (o similar) | *dead-man switch* de jobs | URL de ping |
| Upstash Redis (opcional, escala) | rate limiting distribuido | `UPSTASH_REDIS_REST_URL/TOKEN` |

## 6. Credenciales que deberá configurar el responsable (no se incluyen en el código)

`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`, `DATABASE_URL` (pooler), `RESEND_API_KEY`, `RESEND_WEBHOOK_SECRET`, `STRIPE_SECRET_KEY` (test), `STRIPE_WEBHOOK_SECRET`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` (test), `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `INTEGRATIONS_ENCRYPTION_KEY` (32 bytes base64), `API_KEY_PEPPER`, `CRON_SECRET`, `EMAIL_LINK_SECRET`, `TURNSTILE_*` y `LEGAL_OWNER_*`. Todas están en `.env.example`; `pnpm check:env` comprueba la configuración (DESPLIEGUE §6.5).


## PCI

- **Google Calendar** (plan Max): además de las visitas, las **órdenes de trabajo** programadas se sincronizan como eventos (`work_order_calendar_links`), y se actualizan o borran al cambiar la fecha, el técnico o el estado.
- **Calendario interno** (`/app/calendario`): órdenes, visitas confirmadas y vencimientos por instalación, en rejilla mensual (escritorio) o agenda (móvil).
- **API v1**: recursos PCI ([API.md](API.md)).

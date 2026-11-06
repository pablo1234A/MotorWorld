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

## 4. Google Calendar (Max y superiores)

- OAuth 2.0 con `access_type=offline`, `prompt=consent`, parámetro `state` firmado (anti-CSRF) y PKCE.
- Scope mínimo: crear/editar eventos (`calendar.events`) o, si encaja, solo calendarios creados por la app; se decide en la Fase 9 según la clasificación de Google en ese momento.
- Tokens (refresh y access) **cifrados** en `private.integration_secrets` (AES-256-GCM, clave en el entorno, versión de clave para rotación).
- Sincronización unidireccional RevisaYa → Google (citas **confirmadas**): job con idempotencia por `appointment_id` (`calendar_event_links`), `insert` o `patch` según exista el evento, borrado al cancelar, gestión de 401/`invalid_grant` (estado `revoked` + aviso), 404/410 (recrear), 429/5xx (backoff).
- Desconectar = revocar el token en Google + borrar secretos + conservar el registro de integración como `disconnected`.
- **Paso externo pendiente**: la app de Google debe pasar la verificación de OAuth (pantalla de consentimiento, política de privacidad publicada, dominio verificado). Hasta entonces funciona solo con usuarios de prueba (máx. 100) y con aviso de "app no verificada".

## 5. Otros

| Servicio | Uso | Credenciales |
|---|---|---|
| Cloudflare Turnstile | captcha en formularios públicos | `TURNSTILE_SITE_KEY` (pública), `TURNSTILE_SECRET_KEY` |
| Sentry | errores frontend/backend, con *scrubbing* de datos personales | `SENTRY_DSN`, `SENTRY_AUTH_TOKEN` (CI) |
| healthchecks.io (o similar) | *dead-man switch* de jobs | URL de ping |
| Upstash Redis (opcional, escala) | rate limiting distribuido | `UPSTASH_REDIS_REST_URL/TOKEN` |

## 6. Credenciales que deberá configurar el responsable (no se incluyen en el código)

`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`, `DATABASE_URL` (pooler), `RESEND_API_KEY`, `RESEND_WEBHOOK_SECRET`, `STRIPE_SECRET_KEY` (test), `STRIPE_WEBHOOK_SECRET`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` (test), `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `INTEGRATIONS_ENCRYPTION_KEY` (32 bytes base64), `API_KEY_PEPPER`, `CRON_SECRET`, `BOOKING_TOKEN_SECRET`, `TURNSTILE_*`, `SENTRY_*`. Se documentan en `.env.example` en la Fase 1.

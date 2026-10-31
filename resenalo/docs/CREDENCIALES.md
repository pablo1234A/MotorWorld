# Credenciales y datos que debes proporcionar

El código de todas las integraciones está terminado. Sin estas credenciales, la funcionalidad correspondiente **muestra que no está configurada** (no se simula nada). Todo se configura en el archivo `.env` (ver `.env.example`).

## 1. Stripe (pagos recurrentes) — obligatorio para cobrar

1. Crea la cuenta en https://dashboard.stripe.com y complétala (datos fiscales y bancarios).
2. **Stripe Tax**: Settings → Tax → activa y añade tu registro de IVA en España (y en OSS si vendes a particulares de la UE). Deja `STRIPE_AUTOMATIC_TAX=true`.
   - Alternativa sin Stripe Tax: crea una Tax Rate **inclusiva** del 21 % (ES), pon su ID en `STRIPE_TAX_RATE_ID` y `STRIPE_AUTOMATIC_TAX=false`.
3. `STRIPE_SECRET_KEY` (Developers → API keys). Empieza con la clave de **modo de prueba** (`sk_test_…`).
4. Ejecuta `npm run stripe:setup` → copia `STRIPE_PRICE_STARTER`, `STRIPE_PRICE_PRO`, `STRIPE_PRICE_BUSINESS` al `.env` y ejecuta `npm run db:seed`.
5. Webhook: Developers → Webhooks → endpoint `https://TU_DOMINIO/api/webhooks/stripe` con los eventos:
   `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `customer.subscription.paused`, `customer.subscription.resumed`, `invoice.finalized`, `invoice.paid`, `invoice.payment_failed`, `invoice.voided`, `invoice.marked_uncollectible`.
   Copia el *signing secret* en `STRIPE_WEBHOOK_SECRET`.
6. Portal de cliente: Settings → Billing → Customer portal → activa actualizar método de pago, ver facturas, cancelar (al final del periodo) y cambiar entre los 3 precios.
7. Settings → Billing → Subscriptions and emails: activa los reintentos inteligentes y, al agotarse, **cancelar la suscripción**.
8. Prueba local de webhooks: `stripe listen --forward-to localhost:3000/api/webhooks/stripe` y paga con la tarjeta `4242 4242 4242 4242`; prueba un pago fallido con `4000 0000 0000 0341`.

## 2. Google (Gmail API) — para conectar Gmail / Google Workspace

1. https://console.cloud.google.com → crea un proyecto → *APIs y servicios* → habilita **Gmail API**.
2. Pantalla de consentimiento OAuth: tipo *Externo*, nombre «Reseñalo», logo, dominio, enlaces a `/legal/privacidad` y `/legal/condiciones`. Ámbitos: `openid`, `email`, `https://www.googleapis.com/auth/gmail.send`.
3. Credenciales → *ID de cliente OAuth* → tipo *Aplicación web* → URI de redirección autorizada: `https://TU_DOMINIO/api/v1/email-connection/callback/google` (y `http://localhost:3000/...` para desarrollo).
4. Copia `GOOGLE_CLIENT_ID` y `GOOGLE_CLIENT_SECRET`.
5. **Verificación de Google**: `gmail.send` es un ámbito *sensible*. Mientras la app esté en modo «Prueba» solo funcionará con hasta 100 usuarios de prueba que añadas manualmente, y los tokens caducan a los 7 días. Para producción debes **solicitar la verificación de la app** (Google revisa la política de privacidad, el vídeo de demostración y el uso del ámbito). Plazo habitual: de días a varias semanas.

## 3. Microsoft (Outlook / Microsoft 365) — opcional

1. https://entra.microsoft.com → *Registros de aplicaciones* → Nuevo registro → *Cuentas de cualquier directorio organizativo y cuentas Microsoft personales*.
2. URI de redirección (Web): `https://TU_DOMINIO/api/v1/email-connection/callback/microsoft`.
3. *Permisos de API* → Microsoft Graph → delegados: `Mail.Send`, `User.Read`, `offline_access`, `openid`, `email`.
4. *Certificados y secretos* → nuevo secreto de cliente. Copia `MICROSOFT_CLIENT_ID` (ID de la aplicación) y `MICROSOFT_CLIENT_SECRET` (valor). `MICROSOFT_TENANT=common`.
5. Recomendado: verificación de editor (*Publisher verification*) para que los clientes no vean el aviso de «editor no verificado»; algunas organizaciones exigen el consentimiento de su administrador.

## 4. Correo transaccional de la plataforma (SMTP) — obligatorio en producción

Para los correos de verificación, recuperación de contraseña y avisos (no se usan las cuentas de los clientes). Cualquier proveedor SMTP: Amazon SES, Postmark, Brevo, Mailgun… Configura `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `MAIL_FROM`, y SPF/DKIM/DMARC del dominio remitente.

## 5. Clave de cifrado y servidor

- `ENCRYPTION_KEYS`: `node -e "console.log('v1:'+require('crypto').randomBytes(32).toString('base64'))"`. **Guárdala fuera del servidor**: sin ella no se pueden descifrar los tokens OAuth (los clientes tendrían que reconectar).
- `APP_URL`: URL pública con https. PostgreSQL y Redis gestionados o los del `docker-compose.yml`.
- `ERROR_WEBHOOK_URL` (opcional): webhook (p. ej. Slack) que recibe los errores críticos.

## 6. Datos legales del titular (no los he inventado)

Rellena en el `.env`: `LEGAL_OWNER_NAME`, `LEGAL_OWNER_TAX_ID`, `LEGAL_OWNER_ADDRESS`, `LEGAL_OWNER_REGISTRY`, `LEGAL_CONTACT_EMAIL`, `LEGAL_DPO_EMAIL`, y `ADMIN_NOTIFICATIONS_EMAIL` (recibe las solicitudes RGPD). Hasta entonces las páginas legales muestran «PENDIENTE DE COMPLETAR». Revisa además [LEGAL_REVISION.md](LEGAL_REVISION.md).

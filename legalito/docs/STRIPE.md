# Configurar Stripe

> Empieza **siempre en modo test**. Los cobros reales requieren `APP_ENV=production`, una clave `sk_live_…` **y** `STRIPE_LIVE_PAYMENTS_ENABLED=true`. Sin las tres condiciones la aplicación desactiva los pagos.

## 1. Productos y precios (modo test)
```bash
STRIPE_SECRET_KEY=sk_test_... npx tsx scripts/stripe-setup.ts
```
Crea «Pago único» (39 €) y «Suscripción mensual» (9,99 €/mes) con IVA incluido (`tax_behavior: inclusive`) y muestra los `price_…`. Pégalos en **/admin/productos**: al guardar se verifica el precio en Stripe y se sincroniza el importe mostrado.

## 2. Webhook
Developers → Webhooks → Add endpoint: `https://tudominio.es/api/stripe/webhook`

Eventos:
```
checkout.session.completed
checkout.session.async_payment_succeeded
checkout.session.async_payment_failed
customer.subscription.created
customer.subscription.updated
customer.subscription.deleted
invoice.paid
invoice.payment_failed
invoice.upcoming
charge.refunded
charge.dispute.created
```
Copia el *signing secret* en `STRIPE_WEBHOOK_SECRET`.

En local: `stripe listen --forward-to localhost:3000/api/stripe/webhook` y usa el `whsec_` que muestra.

## 3. Customer Portal
Settings → Billing → Customer portal: activa actualizar método de pago, ver facturas, **cancelar al final del periodo** y, si quieres, cambio de plan. Indica las URLs de condiciones y privacidad.

## 4. Facturación y reintentos
- Settings → Billing → Subscriptions and emails: activa **Smart Retries** y la acción final tras impago (cancelar o marcar como impagada).
- Activa el email de **próxima renovación** (genera `invoice.upcoming`, que Legalito usa para su aviso) con la antelación deseada.
- Facturas: Legalito activa `invoice_creation` en pagos únicos y Stripe factura las suscripciones. Revisa con tu gestoría los requisitos de facturación española (numeración, datos del emisor). Si usas **Stripe Tax**, actívalo y pon `STRIPE_AUTOMATIC_TAX=true`.

## 5. Pruebas
Tarjetas: `4242 4242 4242 4242` (éxito), `4000 0000 0000 0341` (falla al renovar), `4000 0025 0000 3155` (3D Secure).
Simula renovaciones e impagos con **Test clocks**. Reembolsa desde el panel de Stripe para comprobar la revocación de documentos.

## Cómo se procesa
- Firma verificada sobre el cuerpo sin modificar.
- `stripe_events` garantiza una sola ejecución por evento; los errores devuelven 500 para que Stripe reintente.
- El estado se consulta siempre a la API de Stripe (independiente del orden de llegada).
- No se almacenan datos de tarjetas ni el payload completo de los eventos.

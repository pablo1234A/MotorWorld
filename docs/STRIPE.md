# Stripe

## Estado actual

La integración está **implementada y desactivada** (`PAYMENTS_ENABLED=false`). Con el interruptor apagado:

- No se crea ningún cliente, sesión de pago ni cobro (`/api/billing/*` responde 503 `payments_disabled`).
- El webhook responde 503 y no procesa eventos.
- Las páginas muestran que los planes de pago no están disponibles; todas las cuentas funcionan en su plan actual (Free por defecto).
- Los planes se pueden asignar manualmente desde el panel de administración para pruebas o acuerdos (sin cobro).

Lo verificado: firma de webhooks, idempotencia, sincronización de alta, impago, cambio de plan, cancelación, eventos fuera de orden y reprocesado de eventos fallidos (`tests/integration/stripe-webhooks.test.ts`, con firmas locales y la lectura de suscripciones simulada).

**No verificado**: el flujo contra la API real de Stripe (Checkout, Customer Portal y entrega real de webhooks), porque no se han configurado credenciales ni productos. No hay ningún identificador de Stripe inventado en el código.

## Qué hace el código

| Pieza | Archivo |
|---|---|
| Cliente, Checkout, Customer Portal, verificación de webhooks, sincronización | `src/server/billing/stripe.ts` |
| Endpoints | `src/app/api/billing/checkout`, `src/app/api/billing/portal`, `src/app/api/stripe/webhook` |
| Idempotencia | Tabla `stripe_events` (un evento se procesa una vez; los fallidos pueden reprocesarse) |
| Estado | Tabla `subscriptions` (una por espacio de trabajo) |

Eventos gestionados: `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.paid`, `invoice.payment_failed`. En todos los casos se **vuelve a leer la suscripción desde Stripe** antes de actualizar la base de datos, para trabajar con el estado real aunque los eventos lleguen desordenados. El frontend nunca confirma un pago.

Reglas de sincronización:

- `active`, `trialing`, `past_due` → plan del precio contratado (con `past_due` se mantiene el acceso; Stripe gestiona los reintentos de cobro).
- `canceled`, `incomplete_expired` → vuelta a Free (salvo que el evento sea de una suscripción antigua distinta de la vigente).
- El periodo de consumo pasa a ser el periodo de facturación de Stripe (`current_period_start/end`).
- Precios desconocidos → plan Free y aviso en logs.

## Activar los pagos

1. **Cuenta de Stripe**: datos fiscales, cuenta bancaria y activación de pagos. Empieza en **modo de prueba**.
2. **Productos y precios** (Dashboard → Product catalog): crea tres productos con precio **recurrente mensual** en EUR: Starter 5,99 €, Pro 12,99 €, Business 29,99 €. Copia los IDs de precio (`price_…`).
   - El precio cobrado es el de Stripe. El campo «precio» de los planes en la base de datos es informativo: mantenlos iguales (panel de administración → Planes).
3. **Customer Portal** (Settings → Billing → Customer portal): activa cambio de plan entre los tres productos, actualización de método de pago, historial de facturas y cancelación.
4. **Impuestos** (opcional): Stripe Tax o configuración manual. Revisa los textos legales.
5. **Webhook** (Developers → Webhooks → Add endpoint):
   - URL: `https://TU-DOMINIO/api/stripe/webhook`
   - Eventos: los seis listados arriba.
   - Copia el *signing secret* (`whsec_…`).
6. **Variables de entorno** en el hosting:
   ```
   PAYMENTS_ENABLED=true
   STRIPE_SECRET_KEY=sk_test_… (o sk_live_…)
   STRIPE_WEBHOOK_SECRET=whsec_…
   STRIPE_PRICE_STARTER=price_…
   STRIPE_PRICE_PRO=price_…
   STRIPE_PRICE_BUSINESS=price_…
   SUPABASE_SERVICE_ROLE_KEY=…   (obligatoria con pagos)
   ```
   `pnpm check:env` falla si falta alguna.
7. **Prueba en modo test**: contrata un plan con la tarjeta `4242 4242 4242 4242`, comprueba en Mi cuenta que cambia el plan y en Admin → Suscripciones el estado. Prueba también `4000 0000 0000 0341` (pago fallido), cancelación desde el portal y cambio de plan.
   - En local: `stripe listen --forward-to 127.0.0.1:3000/api/stripe/webhook` y usa el `whsec_` que muestra.
8. **Producción**: repite los pasos 2, 3 y 5 en modo *live* y sustituye las claves.

## Cancelación y eliminación de cuentas

Al eliminar una cuenta con pagos activos se cancela antes su suscripción en Stripe; si la cancelación falla, la cuenta no se elimina y se informa al usuario.

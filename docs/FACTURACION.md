# RevisaYa — Suscripciones con Stripe (Fase 8)

> **Siempre en modo TEST.** No se activan cobros reales, no se solicitan pagos reales y no se publican claves LIVE hasta que lo autorice el responsable adulto del proyecto y se hayan revisado las obligaciones fiscales y legales.

Código: `src/server/billing/` (cliente, catálogo, aplicación de eventos, avisos), `src/server/modules/billing/` (servicio y acciones), `src/app/api/webhooks/stripe/route.ts` y `src/app/app/facturacion/page.tsx`. Migración: `20261109000100_billing.sql`. Pruebas: `tests/integration/billing.test.ts`, `tests/unit/billing.test.ts`, `supabase/tests/database/140_billing.sql` y `tests/e2e/billing.spec.ts`.

## 1. Barreras del modo TEST (varias, independientes)
1. `src/server/env.ts`: una clave `sk_live_` impide arrancar la aplicación si `PAYMENTS_LIVE_ENABLED` no es `true`. Ese indicador solo se acepta en producción y con una clave live.
2. `getStripe()`: tampoco crea el cliente con una clave live sin el indicador.
3. `assertTestMode()`: **cualquier objeto o evento de Stripe con `livemode: true` se rechaza**:
   - checkout, cliente, precio, suscripción, portal y eventos del webhook;
   - el evento queda como `ignored/livemode_blocked` y no cambia nada;
   - lo prueban los tests: el portal de ejemplo de stripe-mock viene marcado como live y se rechaza.
4. `STRIPE_API_BASE` (stripe-mock) está prohibido en producción.

## 2. Flujo
| Paso | Qué pasa |
|---|---|
| Taller nuevo | Sin plan: el panel queda en solo lectura y el inicio enlaza a **Facturación** («7 días gratis»). |
| Contratar | Página de pago de **Stripe Checkout**:<br>• tarjeta al empezar y **7 días de prueba sin cobro** (P18);<br>• una prueba por taller (si ya tuvo una suscripción de Stripe o una prueba, no hay otra);<br>• dirección de facturación y NIF-IVA;<br>• precios **sin IVA** (`tax_behavior: exclusive`); con `STRIPE_AUTOMATIC_TAX=true`, Stripe Tax añade el IVA (P11);<br>• si la prueba termina sin método de pago, la suscripción se cancela. |
| Alta | El webhook (`checkout.session.completed` y `customer.subscription.*`) refleja la suscripción: plan, estado, prueba, periodo y cancelación. El plan y sus límites se aplican al instante (la base de datos calcula el acceso). |
| Cambio de plan o de periodicidad | Desde Facturación, con prorrateo de Stripe. Para bajar de plan el taller tiene que caber en el nuevo: usuarios (contando las invitaciones pendientes), talleres, clientes y vehículos activos; si no, se explica qué sobra. Al subir de plan se reprograman los avisos saltados por cuota (P5). |
| Tarjeta, datos y facturas | **Portal de cliente de Stripe** (botón en Facturación). Las facturas también se listan en Facturación, con su enlace y su PDF de Stripe. |
| Cancelar | «Cancelar la suscripción»: al final del periodo pagado, con opción de deshacerlo. |
| Impago (P7) | `past_due` → **7 días de gracia** con acceso completo, aviso en el panel y correo a los administradores. Después, solo lectura y avisos pausados (`app.subscription_is_active`). |
| Fin de la prueba | Stripe envía `trial_will_end` 3 días antes y RevisaYa avisa por correo a los administradores. |
| Baja definitiva (P9) | `canceled`: el taller pasa a solo lectura y sus datos se conservan **60 días** (`organizations.data_retention_until`, visible en Facturación). Si vuelve a contratar, se anula. |

## 3. Webhook (`POST /api/webhooks/stripe`)
- Firma obligatoria (`Stripe-Signature`, `STRIPE_WEBHOOK_SECRET`, tolerancia de 5 min).
- Sin clave o sin secreto responde 503.
- **Idempotente**: cada `evt_…` se aplica una vez (`stripe_events`). Un evento que falló se puede reprocesar cuando Stripe lo reintenta.
- **Sin retroceder**: un evento más antiguo que el último aplicado se ignora (`last_stripe_event_at`). También se ignoran los eventos de una suscripción anterior mientras haya otra viva.
- Eventos que se procesan:
  - `checkout.session.completed`;
  - `customer.subscription.created`, `updated`, `deleted`, `paused`, `resumed` y `trial_will_end`;
  - `invoice.created`, `finalized`, `paid`, `payment_failed`, `voided` y `marked_uncollectible`.
- Compatible con las versiones de la API anteriores y posteriores a 2025-03-31 (periodo en los elementos de la suscripción).
- **Respaldo**: `billing-reconcile` (Vercel Cron, diario) vuelve a leer de Stripe las suscripciones vivas por si se perdió algún webhook.

## 4. Puesta en marcha en Stripe (modo TEST)
1. Variables: `STRIPE_SECRET_KEY=sk_test_…` y `STRIPE_WEBHOOK_SECRET=whsec_…`, más `STRIPE_AUTOMATIC_TAX=true` si se activa Stripe Tax en la cuenta.
2. Catálogo: `POST /api/internal/jobs/stripe-sync-catalog` con `Authorization: Bearer $CRON_SECRET`.
   - Crea un producto por plan y sus precios mensual y anual con los importes de la tabla `plans`, que son los del PDF.
   - Los guarda en `billing_prices`.
   - Es idempotente (`lookup_key`).
3. Webhook en el panel de Stripe (modo test) hacia `https://<dominio>/api/webhooks/stripe`, con los eventos de §3.
4. Portal de cliente (Settings → Billing → Customer portal): permitir actualizar la tarjeta, los datos de facturación, ver facturas y cancelar al final del periodo.

## 5. Pruebas sin claves reales
- **stripe-mock** es el servidor oficial de Stripe que valida cada llamada contra la especificación de su API (`pnpm stripe:mock`; también en CI). Con él se prueban:
  - el catálogo y el checkout (con prueba, NIF-IVA y dirección);
  - el portal, el cambio de plan y la cancelación.
- **Webhooks firmados** con el mismo esquema que Stripe, contra la base de datos real: ciclo completo, idempotencia, orden, modo live, firma y reprogramación de avisos.
- **E2E**: sin plan → elegir plan → la app redirige a la página de pago que devuelve Stripe (stripe-mock) → webhook firmado → prueba de 7 días visible → cancelar.
- **Pendiente: probar con una cuenta real de Stripe en modo TEST.** Se necesita una clave `sk_test_…`; la que se introdujo en este entorno no era válida. Pasos:
  1. Configurar la clave sin `STRIPE_API_BASE`.
  2. Lanzar `stripe-sync-catalog`.
  3. Completar un Checkout con la tarjeta de prueba `4242 4242 4242 4242`.
  4. Reenviar los eventos con `stripe listen --forward-to localhost:3000/api/webhooks/stripe`.

## 6. Fuera de alcance / pendiente
- Borrado automático de los datos al terminar los 60 días de conservación y aviso 7 días antes: Fase 12, con revisión. Hoy se fija y se muestra la fecha; no se borra nada automáticamente.
- Activar pagos reales: solo con la autorización expresa del responsable adulto, tras la revisión fiscal y legal, y con `PAYMENTS_LIVE_ENABLED=true` en producción.

# Activar Stripe en modo real (producción)

> **Estado actual: no activado.** El código solo funciona en modo de prueba. Este documento explica qué cambiar, dónde, qué probar y cómo volver atrás cuando se decida cobrar de verdad. Nada de lo que describe se ha hecho.

## 0. Requisitos antes de empezar

No pases a modo real sin tener **todos** estos puntos cerrados:

| # | Requisito | Dónde se trata |
|---|---|---|
| 1 | Tratamiento del IVA decidido con asesoría fiscal: precios con IVA incluido o aparte, `tax_behavior` de los precios, Stripe Tax sí o no, clientes intracomunitarios y Canarias, Ceuta y Melilla | `facturacion.md` §8 |
| 2 | Términos del servicio y política de privacidad revisados por un profesional y publicados (`LEGAL_TERMS_URL`, `LEGAL_PRIVACY_URL`) | `legal/README.md` |
| 3 | Cuenta de Stripe verificada: datos de la empresa, identidad y cuenta bancaria | Panel de Stripe |
| 4 | Toda la aceptación en modo de prueba superada en staging con una cuenta de Stripe real: compra, cobro fallido con *test clocks*, cambio de plan, cancelación y portal | `PLAN-LANZAMIENTO.md` §10.2 |
| 5 | Decisión sobre los días de gracia (hoy 7) y sobre qué pasa con la prueba gratuita al contratar | `facturacion.md` §8 |

## 1. Qué impide hoy el modo real

Hay cuatro salvaguardas independientes, todas cubiertas por pruebas:

| Archivo | Salvaguarda | Prueba que la cubre |
|---|---|---|
| `apps/api/src/config.ts` | `STRIPE_LIVE = /^(sk\|rk\|pk)_live_/`: cualquier clave live, en cualquier variable `STRIPE_*`, **detiene el arranque**, aunque `PAYMENTS_ENABLED=false`. `STRIPE_TEST_SECRET` exige `sk_test_`/`rk_test_` | `billing.test.ts › rechaza claves live y configuraciones incompletas…` |
| `apps/api/src/modules/billing/gateway.ts` | El constructor de `StripeGateway` vuelve a exigir `sk_test_`/`rk_test_` (defensa adicional) | `stripe-gateway.test.ts › nunca acepta una clave live` |
| `apps/api/src/modules/billing/service.ts` · `assertPriceMatchesCatalog` | Antes de abrir un pago exige `!price.livemode`: un precio real no abre el pago (`409`) | `billing.test.ts` (precio con `livemode: true`) |
| `apps/api/src/modules/billing/service.ts` · `processWebhookEvent` | Ignora (`outcome: ignored`) los eventos con `livemode` y las suscripciones con `livemode` | `billing.test.ts › modo real, tipos no usados, precios desconocidos…` |

**No basta con poner una clave live:** la API no arranca. Es intencionado.

## 2. Qué cambiar en el código (rama propia, revisada)

La propuesta sustituye «solo prueba» por un **modo explícito**: `STRIPE_MODE=test|live`. El valor por defecto es `test`, y cada pieza exige coherencia en los dos sentidos. Así no puede mezclarse una clave de prueba con eventos reales, ni al revés.

### 2.1 `apps/api/src/config.ts`

1. **En `envSchema`:**

   ```ts
   STRIPE_MODE: z.enum(['test', 'live']).default('test'),
   ```

2. **En `parseBilling`:** sustituye el rechazo global de claves live por una comprobación según el modo.

   ```ts
   const mode = e.STRIPE_MODE;
   const wrongPrefix = mode === 'live' ? /^(sk|rk|pk)_test_/ : /^(sk|rk|pk)_live_/;
   if (stripeValues.some((v) => v && wrongPrefix.test(v.trim()))) {
     throw new Error(`STRIPE_MODE=${mode} no admite claves de ${mode === 'live' ? 'prueba' : 'producción'}`);
   }
   // …
   const secretPattern = mode === 'live' ? /^(sk|rk)_live_[A-Za-z0-9]{10,}$/ : /^(sk|rk)_test_[A-Za-z0-9]{10,}$/;
   if (!secretPattern.test(secretKey)) throw new Error(`STRIPE_SECRET_KEY no corresponde a STRIPE_MODE=${mode}`);
   if (mode === 'live' && e.NODE_ENV !== 'production') throw new Error('STRIPE_MODE=live solo en producción');
   if (mode === 'live' && e.STRIPE_API_BASE) throw new Error('STRIPE_API_BASE no se admite con STRIPE_MODE=live');
   ```

3. **En el tipo `AppConfig['billing']['stripe']`:** añade `mode: 'test' | 'live'` y devuélvelo en el objeto `stripe`.

### 2.2 `apps/api/src/modules/billing/gateway.ts`

En el constructor, cambia la comprobación fija por la del modo:

```ts
const expected = settings.mode === 'live' ? /^(sk|rk)_live_/ : /^(sk|rk)_test_/;
if (!expected.test(settings.secretKey)) throw new Error('La clave de Stripe no corresponde al modo configurado');
```

### 2.3 `apps/api/src/modules/billing/service.ts`

1. **`assertPriceMatchesCatalog`:** sustituye `!price.livemode` por `price.livemode === (deps.config.billing.stripe!.mode === 'live')`.
2. **`processWebhookEvent`:** compara con el modo en lugar de ignorar siempre lo real.

   ```ts
   const live = deps.config.billing.stripe!.mode === 'live';
   if (event.livemode !== live) return recordEvent(deps.db, event, 'ignored', 'Evento de otro modo de Stripe');
   // …
   if (sub.livemode !== live) return recordEvent(deps.db, event, 'ignored', 'Suscripción de otro modo de Stripe');
   ```

### 2.4 Pruebas que hay que añadir o adaptar

Las pruebas de la API (`npm run test -w @presupio/api`) tienen que seguir pasando todas y, además:

- [ ] `STRIPE_MODE` por defecto es `test` y, sin la variable, el comportamiento es idéntico al actual: las pruebas existentes no cambian.
- [ ] `STRIPE_MODE=test` con una clave `sk_live_`/`rk_live_`/`pk_live_` → no arranca.
- [ ] `STRIPE_MODE=live` con una clave `sk_test_`/`rk_test_` → no arranca.
- [ ] `STRIPE_MODE=live` con `NODE_ENV≠production` o con `STRIPE_API_BASE` → no arranca.
- [ ] En modo `live`:
  - un evento con `livemode: false` se ignora;
  - una suscripción con `livemode: false` se ignora;
  - un precio con `livemode: false` no abre el pago (`409`).
- [ ] En modo `test`, lo simétrico (ya cubierto hoy).
- [ ] `StripeGateway` con un modo distinto del de la clave → error.

### 2.5 Documentación que hay que actualizar en el mismo cambio

- `.env.example`: `STRIPE_MODE=test`.
- `facturacion.md` §2: la variable `STRIPE_MODE`.
- `PLAN-LANZAMIENTO.md` §7.4.4: «realizado», con la fecha.
- `registro-correcciones.md`: el cambio y sus pruebas.

## 3. Qué configurar en Stripe (modo real)

En el panel de Stripe, **con el interruptor de modo de prueba desactivado**, repite lo que ya funciona en prueba. Los objetos de prueba y los reales son distintos: no se copian.

1. **Producto** «Presupio» con tres precios recurrentes mensuales en EUR de **27,99, 57,99 y 127,99**.
   - Usa el `tax_behavior` que decida la asesoría.
   - Presupio comprueba importe, moneda, intervalo, que el precio esté activo y el modo antes de abrir cada pago.
2. **Stripe Tax:** solo si así se decide (requisito 1).
3. **Clave restringida** `rk_live_…` con estos permisos, y nada más:
   - escritura en *Customers*, *Checkout Sessions*, *Subscriptions* y *Customer portal*;
   - lectura en *Prices*.

   No uses la clave secreta completa (`sk_live_`).
4. **Portal de cliente:**
   - actualizar el método de pago, ver facturas y cancelar **al final del periodo**;
   - **cambio de plan desactivado**;
   - opcional: copia el `bpc_…`.
5. **Webhook:**
   - URL: `https://app.tudominio.es/api/v1/webhooks/stripe`;
   - **versión de API `2026-09-30.endive`** (la que fija `stripe` 23.0.0 en `apps/api/package.json`). Si se actualiza la librería, hay que actualizar también la versión del endpoint;
   - eventos, exactamente los de `HANDLED_EVENTS` (`service.ts`):
     - `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`;
     - `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `customer.subscription.paused`, `customer.subscription.resumed`;
     - `invoice.paid`, `invoice.payment_failed`, `invoice.payment_action_required`;
   - copia el secreto `whsec_…`, que es distinto del de prueba.
6. **Correos de Stripe** (recibos y fallos de pago): actívalos o no según la decisión comercial. Presupio ya avisa en su interfaz.

## 4. Qué cambiar en el servidor (variables)

Cámbialas en el gestor de secretos del alojamiento, **nunca en el repositorio**:

| Variable | Prueba (hoy) | Real |
|---|---|---|
| `STRIPE_MODE` | `test` (o ausente) | `live` |
| `PAYMENTS_ENABLED` | `true` | `true` |
| `STRIPE_SECRET_KEY` | `rk_test_…` | `rk_live_…` |
| `STRIPE_WEBHOOK_SECRET` | `whsec_…` (endpoint de prueba) | `whsec_…` (endpoint real) |
| `STRIPE_PRICE_STARTER` / `_PRO` / `_BUSINESS` | `price_…` de prueba | `price_…` reales |
| `STRIPE_PORTAL_CONFIGURATION_ID` | `bpc_…` de prueba (opcional) | `bpc_…` real (opcional) |
| `PRICES_TAX_DISPLAY` | `pending` | `included` o `excluded`, según la decisión fiscal |
| `STRIPE_API_BASE` | Solo en pruebas locales | **No debe existir** |

Después, **reinicia la API** con `systemctl restart presupio-api`. El worker no usa Stripe, pero reinícialo también para que lea el mismo entorno.

Si algo no cuadra, la API no arranca y el registro dice por qué. Es la primera comprobación:

```bash
journalctl -u presupio-api -n 50
```

## 5. Qué probar (en este orden, el mismo día)

1. **Arranque:**
   - `GET /api/v1/health/ready` → `200`;
   - el registro no muestra errores de configuración.
2. **Webhook:** en el panel de Stripe, «Enviar evento de prueba» al endpoint real.
   - Con firma correcta, Presupio lo registra como `ignored`: es un evento sin suscripción.
   - Con otro secreto, `400 INVALID_SIGNATURE`.
3. **Compra real mínima:**
   - con una empresa interna y **una tarjeta propia**, contrata el plan Starter desde *Configuración → Plan*;
   - comprueba lo siguiente:
     - la página de pago muestra 27,99 € y el texto de IVA decidido;
     - al volver, «Estamos confirmando el pago» y, en segundos, el plan activo;
     - en Stripe, el webhook aparece entregado (`200`) y la factura generada, con los datos fiscales correctos.
4. **Cambio de plan:** de Starter a Pro desde Presupio. Comprueba el prorrateo en la siguiente factura de Stripe.
5. **Portal:** «Método de pago y facturas» abre el portal real. La factura se descarga.
6. **Cancelación:** cancela al final del periodo. Presupio muestra la fecha de fin y el plan sigue activo hasta entonces.
7. **Reembolso:** reembolsa el pago de la prueba desde el panel de Stripe.
8. **Supervisión:** `GET /api/v1/ops/status` sin las alertas `billing_events_failed` ni `billing_duplicate_subscription`.
9. **Durante la primera semana**, a diario:
   - entregas fallidas del webhook en el panel de Stripe (deben ser 0);
   - `billing_events` con `outcome = 'error'` (deben ser 0).

## 6. Cómo volver atrás

### 6.1 Volver al modo de prueba (o desactivar pagos), sin tocar el código

1. Restaura las variables de prueba de §4 (`STRIPE_MODE=test` y las claves e ids de prueba), o pon `PAYMENTS_ENABLED=false`.
2. Reinicia la API: `systemctl restart presupio-api`.
3. **Qué pasa con lo ya cobrado:**
   - Las **suscripciones reales siguen activas en Stripe** y seguirán cobrándose. Volver atrás en Presupio **no las cancela**. Si hay que dejar de cobrar, cancélalas en el panel de Stripe (al final del periodo o inmediatamente con reembolso, según el caso).
   - Con `PAYMENTS_ENABLED=false`, el webhook responde `404` y Stripe reintenta los eventos reales durante unos 3 días. Si se reactiva el modo real en ese plazo, se aplican solos. Presupio no depende del orden: lee la suscripción actual en Stripe.
   - Con `STRIPE_MODE=test`, los eventos reales que lleguen se registran como `ignored`, y el plan de cada empresa queda como estaba en la última sincronización.
   - Para mantener a una empresa con su plan sin pagos activos:

     ```bash
     npm run ops:prod -w @presupio/api -- plan --company <id> --plan <plan> --status active
     ```

### 6.2 Volver atrás en el código

Si el cambio de §2 da problemas, revierte su commit y despliega la versión anterior (`PLAN-LANZAMIENTO.md` §9.4). La versión anterior **no arranca con claves live**. Por eso, antes de desplegarla, restaura las variables de prueba o `PAYMENTS_ENABLED=false`.

### 6.3 Base de datos

El cambio no necesita migraciones. Las tablas `subscriptions` y `billing_events` son las mismas en prueba y en real.

Las filas de prueba de staging no deben existir en producción: la base de producción empieza vacía. Si por error hubiera filas con ids de prueba (`sub_…` de prueba), sus eventos se ignorarían por el modo.

## 7. Comprobación final

- [ ] Requisitos de §0 cerrados y documentados.
- [ ] Cambio de §2 hecho, con las pruebas de §2.4 en verde y CI en verde.
- [ ] Objetos reales creados en Stripe (§3).
- [ ] Variables (§4) en el gestor de secretos, sin restos de prueba.
- [ ] Pruebas de §5 hechas y reembolsadas.
- [ ] Persona responsable de revisar el panel de Stripe a diario durante la primera semana.

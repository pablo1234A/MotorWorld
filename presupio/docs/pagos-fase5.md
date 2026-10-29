# Integración de pagos (preparación para la fase 5)

> **En esta fase no hay cobros.** No se ha implementado Stripe, ni el checkout, ni los webhooks de pago. Este documento describe cómo encajarlos en lo que ya existe.
>
> Los detalles de la API de Stripe hay que **verificarlos con su documentación vigente** al implementar: versión de la API, nombres de campos y eventos.

## 1. Lo que ya está preparado

| Pieza | Dónde | Notas |
|---|---|---|
| Estado de la suscripción, una fila por empresa | Tabla `subscriptions` (clave `company_id`) | Columnas:<ul><li>`plan`, `status` (`none`, `trialing`, `active`, `past_due`, `canceled`, `unpaid`, `incomplete`), `trial_ends_at`;</li><li>`current_period_start`/`end`, `cancel_at_period_end`;</li><li>`provider`, `provider_customer_id`, `provider_subscription_id` (único por proveedor).</li></ul> |
| Catálogo de planes y límites | `apps/api/src/domain/plans.ts` | El servidor es la única fuente de precios y límites |
| Acceso según el estado | `hasActiveAccess()` | `active` y `past_due` (gracia) dan acceso; `trialing` hasta `trial_ends_at` |
| Periodos de consumo | `modules/usage/service.ts → billingPeriodFor` | Si `current_period_start/end` incluye la fecha actual, se usa el **periodo del proveedor**; si no, el mes natural. Al pasar de uno a otro no hay solapes |
| Cambios de límite | `ensureUsagePeriod` | Una subida amplía el límite en el periodo en curso; una bajada se aplica desde el siguiente |
| Protección | Permisos del rol de base de datos | La aplicación **no puede modificar `subscriptions`**. Solo el rol propietario (herramienta `npm run ops`) |
| Antirrepetición de webhooks | Tabla `webhook_events` (único por `provider` + hash del identificador) | Se reutiliza con `provider = 'stripe'` y el `event.id` |

## 2. Cómo asociar una suscripción a una empresa

1. **Contratar:** el propietario o administrador pulsa «Contratar» y el servidor crea una sesión de Checkout (modo suscripción):
   - el `price` sale de la configuración del servidor (`STRIPE_PRICE_STARTER`, `…_PRO`, `…_BUSINESS`), **nunca del navegador**; el navegador solo envía el plan elegido;
   - `client_reference_id = company_id`, y `metadata.company_id` también en el cliente y en la suscripción;
   - se reutiliza el `customer` de la empresa si ya existe (`provider_customer_id`).
2. **La suscripción solo se activa por el webhook**, no al volver del checkout. La página de retorno solo dice «Estamos confirmando el pago».
3. **Al recibir el webhook verificado:**
   - se busca la empresa por `provider_subscription_id`, o por `metadata.company_id` la primera vez;
   - se comprueba que el cliente coincide;
   - se guardan los identificadores.

## 3. Cambios de plan, renovaciones y cancelaciones

| Evento de negocio | Cómo se hace | Efecto en Presupio |
|---|---|---|
| Subir de plan | Portal de cliente de Stripe o actualización de la suscripción (con prorrateo) | Webhook → `plan` nuevo. El límite de recuperaciones sube en el acto |
| Bajar de plan | Programar el cambio para el final del periodo | El límite nuevo se aplica en el periodo siguiente |
| Renovación | Factura pagada | Nuevo `current_period_start/end` → nuevo periodo de consumo con el contador a cero |
| Pago fallido | La factura no se cobra; Stripe reintenta | `status = past_due` (sigue el acceso durante la gracia). Si se agota: `unpaid`/`canceled` → sin acceso. El motor deja de enviar; los datos y el historial se conservan y se pueden consultar y exportar |
| Cancelación | `cancel_at_period_end = true` hasta el final; después, suscripción eliminada | Acceso hasta el final del periodo; después `canceled` |
| Prueba gratuita | Ya existe (14 días, límites de Starter) | Se puede mantener sin tarjeta o pasar a la prueba de Stripe; hay que decidirlo |

**Eventos que conviene escuchar** (a confirmar en la documentación vigente de Stripe):
- `checkout.session.completed`
- `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`
- `invoice.paid`
- `invoice.payment_failed`

**Regla para no depender del orden de llegada:** ante cualquiera de esos eventos, el servidor **lee la suscripción actual** desde la API de Stripe y guarda ese estado completo. Así no importa en qué orden lleguen los eventos.

## 4. Validar las notificaciones del proveedor

- **Ruta:** `POST /api/v1/webhooks/stripe`, pública, sin sesión, con límite de peticiones. Se añade a la lista de rutas públicas de `protection.test.ts`.
- **Cuerpo en bruto:** Stripe firma los bytes exactos del cuerpo. Hay que registrar para esa ruta un analizador que conserve el `Buffer` original (igual que el analizador acotado de `modules/public`).
- **Firma:** cabecera `Stripe-Signature` (`t=…, v1=…`):
  - se calcula HMAC-SHA256 de `t + "." + cuerpo` con `STRIPE_WEBHOOK_SECRET`;
  - se compara en tiempo constante;
  - se rechaza si `t` tiene más de 5 minutos.

  Se puede usar `stripe.webhooks.constructEvent`, de la librería oficial.
- **Antirrepetición:** se inserta `event.id` en `webhook_events` (`provider = 'stripe'`). Si ya existe, se responde `200` sin procesarlo.
- **Respuesta rápida (2xx):** si el proceso falla, se responde 5xx para que Stripe reintente.
- **Escritura en la base de datos:** el rol de la aplicación no puede actualizar `subscriptions`. Hay dos opciones:
  - **(recomendada)** una función `SECURITY DEFINER` acotada (`app_apply_subscription(company_id, plan, status, periodo, ids…)`) que valide los valores y solo la llame el manejador del webhook tras verificar la firma, con una entrada en el historial (`subscription.changed`, actor «Stripe»);
  - o un rol de base de datos distinto solo para facturación.
- **Mapeo de precios:** `price.id` → plan, con la configuración del servidor. Un precio desconocido se rechaza y se registra (alerta).

## 5. Mantener los límites de uso

- `billingPeriodFor` ya usa el periodo del proveedor: no hace falta tocar el contador.
- **Al cambiar de periodo de calendario a periodo de Stripe:** el primer periodo de Stripe empieza donde acabó el anterior, para que no haya solapes.
- **Planes por encima de lo pagado:** imposibles, porque el plan solo cambia por el webhook verificado o por la herramienta de operación.
- **Pago pendiente (`past_due`):** el consumo sigue con el plan pagado. Conviene revisar con negocio cuántos días de gracia se dan.

## 6. Configuración

| Variable | Descripción |
|---|---|
| `STRIPE_SECRET_KEY` | Clave secreta, primero de **modo de prueba**. Solo servidor |
| `STRIPE_WEBHOOK_SECRET` | Secreto de firma del endpoint de webhooks |
| `STRIPE_PRICE_STARTER`, `STRIPE_PRICE_PRO`, `STRIPE_PRICE_BUSINESS` | Ids de precio mensual |
| `PAYMENTS_ENABLED` | Muestra los botones de contratación (`paymentsEnabled` en `/company/subscription`) |

La clave publicable solo hace falta si se usa Stripe.js en el navegador. Con Checkout alojado no es necesaria.

## 7. Pendiente de decidir antes de implementar

- **Si los precios incluyen IVA** (`vatIncluded`) y cómo se calcula: Stripe Tax o tipo fijo.
- **Facturación conforme a la normativa española** vigente (contenido de las facturas y sistemas de verificación): revisión fiscal profesional.
- **Prueba gratuita:** con o sin tarjeta, y qué ocurre al terminar.
- **Días de gracia** con pago pendiente y comunicación al cliente.
- **Condiciones de uso razonable de Business** (texto legal), coherentes con el límite publicado de 300.

## 8. Pruebas que habrá que añadir en la fase 5

- Firma válida, no válida y caducada; evento repetido.
- Activación solo por webhook, nunca por la vuelta del checkout.
- Subida y bajada de plan con su efecto en el límite.
- Renovación (contador a cero en el periodo del proveedor).
- Pago fallido → `past_due` → `canceled` (motor detenido, datos conservados).
- Precio desconocido rechazado.
- Aislamiento: un webhook de una empresa no toca otra.
- El navegador sigue sin poder cambiar el plan.

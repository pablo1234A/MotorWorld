# Suscripciones con Stripe (fase 5) — solo modo de prueba

> **Esta versión no puede cobrar dinero real.**
> - Solo acepta claves de **modo de prueba** de Stripe. Cualquier clave `sk_live_`, `rk_live_` o `pk_live_` detiene el arranque, aunque los pagos estén desactivados.
> - Los eventos con `livemode: true` se ignoran.
> - Para cobrar de verdad hará falta una decisión expresa, la validación fiscal y legal (apartado 8) y un cambio de código revisado.

## 1. Piezas

| Pieza | Dónde |
|---|---|
| Pasarela (única puerta a Stripe) | `apps/api/src/modules/billing/gateway.ts`. Usa la librería oficial `stripe` 23.0.0, con la versión de API `2026-09-30.endive` |
| Acciones y webhooks | `modules/billing/service.ts`, `modules/billing/routes.ts` |
| Avisos de conservación de datos | `modules/billing/retention.ts`, en el trabajo horario del worker |
| Solo lectura | `plugins/auth.ts`: cada petición que modifica datos comprueba el plan |
| Base de datos | Migración `0005_attempts_and_billing.sql`: columnas de sincronización en `subscriptions`, `billing_events` (historial y antirrepetición), `retention_notices` y funciones `SECURITY DEFINER` acotadas |
| Interfaz | *Configuración → Plan* y el aviso global de cuenta |

El rol de base de datos de la aplicación **sigue sin poder escribir en `subscriptions`**. Los cambios solo entran por funciones acotadas:
- `app_billing_link_customer`;
- `app_billing_set_checkout_session` (solo para la empresa activa);
- `app_billing_apply_subscription` y `app_billing_record_event` (tras verificar la firma del webhook).

## 2. Variables de entorno

| Variable | Obligatoria con pagos | Formato | Descripción |
|---|---|---|---|
| `PAYMENTS_ENABLED` | — | `true`/`false` (por defecto `false`) | Activa la contratación y el webhook. Sin ella, Presupio funciona como antes |
| `STRIPE_SECRET_KEY` | Sí | `sk_test_…` o `rk_test_…` | Clave secreta de **prueba**. Mejor una clave restringida (apartado 3) |
| `STRIPE_WEBHOOK_SECRET` | Sí | `whsec_…` | Secreto de firma del endpoint |
| `STRIPE_PRICE_STARTER`, `STRIPE_PRICE_PRO`, `STRIPE_PRICE_BUSINESS` | Sí | `price_…`, distintos | Precios mensuales en EUR de 27,99, 57,99 y 127,99 |
| `STRIPE_PORTAL_CONFIGURATION_ID` | No | `bpc_…` | Configuración del portal de cliente. Sin ella se usa la predeterminada |
| `PRICES_TAX_DISPLAY` | No | `pending`/`included`/`excluded` (por defecto `pending`) | Solo cambia el **texto** que acompaña a los precios. No configura impuestos |

**Validación al arrancar:**
- faltan variables o tienen un formato incorrecto;
- hay precios repetidos;
- alguna clave es live.

En cualquiera de estos casos, el servidor no arranca y explica el motivo.

**Comprobación antes de cada pago:** el servidor lee el precio en Stripe y exige:
- que esté activo;
- que sea de prueba;
- que sea en EUR y mensual;
- que el **importe sea el del catálogo**.

Si no coincide, no se abre el pago (`409`) y se registra un error.

## 3. Configurar el modo de prueba (pasos)

1. **Panel de Stripe.** Con el interruptor **«Modo de prueba»** activado:
   - Crea un producto «Presupio» con tres precios recurrentes mensuales en EUR: 27,99, 57,99 y 127,99.
   - **No actives Stripe Tax** (apartado 8).
2. **Clave restringida de prueba** (`rk_test_…`) con estos permisos de escritura y ninguno más:
   - Customers;
   - Checkout Sessions;
   - Subscriptions;
   - Customer portal;
   - Prices: solo lectura.
3. **Portal de cliente** (*Settings → Billing → Customer portal*, modo de prueba):
   - permite actualizar el método de pago, ver facturas y cancelar al final del periodo;
   - **desactiva el cambio de plan en el portal**: Presupio lo gestiona con sus propias reglas (apartado 4);
   - opcional: copia el id `bpc_…`.
4. **Webhook.**
   - URL: `https://<tu-dominio>/api/v1/webhooks/stripe`.
   - Eventos:
     - `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`;
     - `customer.subscription.created`, `.updated`, `.deleted`, `.paused`, `.resumed`;
     - `invoice.paid`, `invoice.payment_failed`, `invoice.payment_action_required`.
   - **Versión de la API del endpoint: `2026-09-30.endive`**, la que fija la librería (`stripe` 23.0.0). Con una versión anterior, los eventos de factura llegan sin `parent.subscription_details` y Presupio los ignora («Evento sin suscripción»).
   - Copia el secreto `whsec_…`.
5. **En local, con la CLI de Stripe:**
   ```bash
   stripe listen --forward-to localhost:3000/api/v1/webhooks/stripe
   ```
   Usa el `whsec_…` que imprime.
6. **Variables** del apartado 2 en el `.env` local, que no se versiona.
7. **Migraciones:**
   ```bash
   npm run db:migrate
   ```
   Arranca la API y el worker.
8. **Prueba de compra.**
   - Entra como propietario y abre *Configuración → Plan → Contratar Pro*.
   - Paga en la página de Stripe con la tarjeta de prueba `4242 4242 4242 4242` (cualquier fecha futura y CVC).
   - Al volver verás «Estamos confirmando el pago»: el plan se activa cuando llega el webhook.
9. **Más escenarios de prueba:**
   - cobro fallido: tarjeta `4000 0000 0000 0341` y, en el panel, *avanzar el reloj de prueba* (*test clocks*);
   - cambio de plan desde Presupio;
   - cancelación al final del periodo;
   - método de pago desde «Método de pago y facturas» (portal).

**Estado de la verificación en este repositorio:**
- **No había credenciales de prueba de Stripe** en el entorno de desarrollo. Por eso **no se ha ejecutado ninguna prueba contra la API de Stripe**, ni siquiera en modo de prueba.
- Las pruebas automatizadas usan:
  - una pasarela simulada (sin red);
  - la librería oficial contra un **servidor HTTP local** que imita la API;
  - la verificación de firmas **real** de la librería.
- Los pasos 1–9 quedan **pendientes** de hacer con una cuenta de prueba.

## 4. Flujos

### Contratar

1. El propietario (permiso `billing:manage`) elige un plan. El navegador solo envía `{ plan: 'pro' }`: **nunca** un precio, un importe ni un identificador de Stripe (`400` si lo intenta).
2. El servidor:
   - comprueba que no haya ya una suscripción viva;
   - verifica el precio contra el catálogo;
   - crea el cliente de Stripe una sola vez (clave de idempotencia por empresa) y lo vincula a la empresa;
   - crea una sesión de Checkout en modo suscripción con `client_reference_id = empresa` y `metadata.company_id` en la sesión y en la suscripción;
   - cierra la sesión de pago anterior que siguiera abierta.
3. La página de vuelta **no concede nada**. Solo el webhook verificado activa el plan; la interfaz consulta el estado hasta que llega.

### Webhooks: la única fuente del estado de pago

- **Firma.** Se verifica `Stripe-Signature` sobre los **bytes originales** del cuerpo: en esa ruta el JSON no se analiza antes. La tolerancia es de 5 minutos. Una firma ausente, de otro secreto, un cuerpo alterado o un evento caducado reciben `400` y no tienen efecto.
- **Antirrepetición.** `billing_events` tiene una clave única por `(proveedor, id del evento)` y un bloqueo por evento. Un evento repetido, también a la vez, devuelve `duplicate` y no aplica nada.
- **Desorden.** No se usa el contenido del evento: se **lee la suscripción actual** en Stripe y se guarda con su hora de lectura (`provider_synced_at`). Una lectura más antigua que la ya aplicada se descarta (`stale`).
- **Comprobaciones** antes de aplicar:
  - la empresa se localiza por suscripción o por cliente;
  - si el evento trae otra empresa (`client_reference_id`/metadata) que no coincide, se rechaza (`error`);
  - un cliente desconocido queda como `unmatched`;
  - una segunda suscripción viva para la misma empresa no sustituye a la primera: queda como `duplicate_subscription` y se avisa en la supervisión;
  - un precio desconocido es un `error` y no cambia el plan.
- **Stripe no responde al leer la suscripción.** Se responde `503` sin registrar nada, para que Stripe reintente.
- **Historial.** `billing_events` guarda el tipo de evento, el resultado, el estado y el plan. **Nunca guarda datos de tarjeta, importes de pago ni secretos.** La empresa ve un resumen en *Plan*.

### Estados

| Stripe | Presupio | Acceso |
|---|---|---|
| `active` | `active` | Sí |
| `trialing` | `trialing` (hasta `trial_end`) | Sí |
| `past_due` | `past_due` + `past_due_since` | Sí, **7 días de gracia** (`PAST_DUE_GRACE_DAYS`); después, solo lectura |
| `unpaid`, `paused` | `unpaid` | No (solo lectura) |
| `canceled` | `canceled` + `ended_at` | No (solo lectura) |
| `incomplete`, `incomplete_expired` | (se ignora) | Nunca da acceso ni quita la prueba en curso |

### Cambio de plan (`POST /billing/change-plan`)

Solo con la suscripción `active`. El estado se lee en Stripe antes de cambiar.

| Cambio | En Stripe | En Presupio |
|---|---|---|
| **Subida** | `proration_behavior: always_invoice` y `payment_behavior: pending_if_incomplete`: se cobra ya la parte proporcional; si el cobro no se completa, Stripe no aplica el cambio | El límite sube cuando el webhook confirma el precio nuevo |
| **Bajada** | `proration_behavior: none`: sin abonos; el precio nuevo se cobra en la renovación | El periodo en curso **conserva su límite**; el nuevo se aplica desde el siguiente. Evita «subir, consumir y bajar» para pagar menos |

### Cancelación

- `POST /billing/cancel` pone `cancel_at_period_end = true`; `POST /billing/resume` la anula.
- Se mantiene el acceso hasta el final del periodo pagado.
- Cuando Stripe elimina la suscripción, la cuenta pasa a solo lectura.

### Portal de cliente

`POST /billing/portal` abre el portal alojado por Stripe para el método de pago y las facturas. Presupio solo redirige a `https://checkout.stripe.com/…` y `https://billing.stripe.com/…`.

## 5. Fin de la prueba y solo lectura

Se aplica la decisión **D1**.

- **Cuándo.** Sin plan con acceso: prueba terminada sin pago, `canceled`, `unpaid`, `incomplete`, `none` o `past_due` con la gracia agotada.
- **En el servidor** (`plugins/auth.ts`). Toda petición autenticada que modifica datos responde `403 SUBSCRIPTION_REQUIRED`, salvo las excepciones explícitas (`readOnlyAllowed`):
  - cerrar sesión, cambiar contraseña o perfil, verificar email, cambiar de empresa, aceptar invitaciones;
  - **registrar exclusiones o bajas de clientes** (cumplimiento: nunca se bloquea);
  - desactivar el envío automático y previsualizar plantillas;
  - quitar miembros o invitaciones y cambiar roles (seguridad);
  - contratar, cambiar, cancelar o abrir el portal (la salida de la solo lectura).

  Una prueba recorre **todas** las rutas de escritura y comprueba que el resto devuelve `403`.
- **Consultar y exportar** sigue disponible: las lecturas y `GET /company/export`.
- **Motor y worker:**
  - el planificador cancela los pasos pendientes (`no_active_plan`) y no programa nada;
  - el envío vuelve a comprobarlo justo antes de enviar;
  - no se crean recuperaciones porque responder a un presupuesto es una escritura.
- **Interfaz.** Aviso permanente con el motivo, la fecha de conservación y el enlace a planes. Es solo información: el bloqueo es del servidor.

### Una prueba gratuita por persona y empresa (abuso de la prueba)

Al registrar una empresa nueva (`modules/auth/trial.ts`):

- **Una prueba por email.** Se normaliza: minúsculas, sin `+etiqueta` y, en Gmail, sin puntos (`ana.p+x@gmail.com` = `anap@gmail.com`).
- **Una prueba por dominio de empresa cada `TRIAL_DOMAIN_RULE_DAYS` días** (365 por defecto; `0` desactiva esta regla). No se aplica a los proveedores de correo gratuito (Gmail, Outlook, Yahoo, iCloud, Telefónica…).
- **Correo desechable** conocido (lista corta, no exhaustiva): sin prueba.
- Quien no cumple **se registra igualmente**: la cuenta queda sin plan (`none`, solo lectura) y puede contratar. El panel lo explica al entrar.
- Dos altas simultáneas del mismo dominio no obtienen ambas la prueba (bloqueo por dominio).
- **Privacidad:** solo se guardan huellas SHA-256 (`trial_claims`), sin el email ni el dominio en claro. Se borran a los 24 meses (trabajo de retención). La migración 0010 crea las huellas de las cuentas que ya tuvieron prueba.

**Falsos positivos conocidos** y cómo se resuelven:

| Caso | Qué pasa | Solución |
|---|---|---|
| Dos personas de la misma empresa (o de dos empresas que comparten dominio, p. ej. un grupo) se registran por separado en menos de un año | La segunda no tiene prueba | Invitar a la segunda persona a la primera cuenta, o conceder la prueba: `npm run ops -- plan --company <id> --plan starter --status trialing --trial-days 14` |
| Alguien borra su cuenta y vuelve a registrarse | Sin prueba | Lo mismo, si procede |
| Un dominio de empresa pequeño que no está en la lista de gratuitos (p. ej. un proveedor local) | Se trata como dominio de empresa | Añadirlo a la lista de `trial.ts` |
| Dos personas distintas comparten una bandeja de Gmail con puntos distintos | Gmail las trata como la misma bandeja: es correcto | — |

No se usan IP ni huellas del navegador: serían más intrusivas y darían más falsos positivos (oficinas o redes móviles compartidas).

### Aviso antes del fin de la prueba

Distinto de los avisos de conservación: llega **antes** de perder el acceso, para elegir un plan.

- Días configurables con `TRIAL_REMINDER_DAYS` (por defecto `3,1`; vacío = sin avisos).
- Una vez por etapa y fecha de fin (`trial_notices`). Si el worker estuvo parado, solo se envía la etapa vigente.
- No se avisa a quien ya contrató ni a una prueba ya terminada.
- La fecha se escribe en la zona horaria de la empresa (también en los avisos de conservación).
- Lo envía el trabajo de retención del worker, que es exclusivo entre workers.

### Conservación de datos (90 días)

- **Plazo:** 90 días desde el fin del acceso (`DATA_RETENTION_DAYS`):
  - fin de la prueba;
  - `ended_at` en cancelación o impago;
  - fin de la gracia en `past_due`.

  Se muestra en *Plan* y en el aviso.
- **Avisos por email a los propietarios** a 30, 7 y 1 día del plazo:
  - una vez por etapa (`retention_notices`);
  - los envía el trabajo horario de retención del worker.

  Si el correo no está configurado, queda anotado `not_configured`. El aviso de la aplicación sigue visible.
- **No hay borrado automático:**
  - `npm run ops -- retention` lista las cuentas y su fecha;
  - `npm run ops -- delete-company` se niega a borrar antes del plazo salvo con `--before-deadline` (petición expresa de la empresa).

  **Antes de borrar, revisa si hay obligaciones legales de conservación** (por ejemplo, documentación contable o fiscal). Las facturas las emite y conserva Stripe; Presupio no guarda facturas.

## 6. Seguridad

| Aspecto | Medida |
|---|---|
| Secretos | Solo en variables de entorno o en el gestor de secretos. Nunca en el código ni en `.env.example`. Los logs no incluyen claves; los errores de Stripe se convierten en `503 PAYMENTS_UNAVAILABLE` sin detalles |
| Firma | Librería oficial, cuerpo original, tolerancia de 5 minutos |
| Permisos | Solo propietarios (`billing:manage`). Límite de peticiones configurable (`rateLimits.billing`, 30 por hora e IP) |
| Aislamiento | RLS en `billing_events` y `retention_notices`. La empresa nunca se toma del navegador; un evento con una empresa que no corresponde al cliente se rechaza |
| Concurrencia | Bloqueo por evento, fila de la suscripción bloqueada, claves de idempotencia en Stripe (cliente y cambio de plan) |
| Datos de pago | Stripe los recoge en su página. Presupio no guarda números de tarjeta ni códigos de seguridad |

## 7. Pruebas

| Archivo | Qué prueba |
|---|---|
| `test/billing.test.ts` (23 pruebas, sin red) | <ul><li>Checkout;</li><li>activación solo por webhook;</li><li>permisos y precio elegido por el navegador;</li><li>aislamiento entre empresas;</li><li>firmas inválidas;</li><li>repetición y desorden;</li><li>modo real, precio desconocido, cliente ajeno y segunda suscripción;</li><li>subida y bajada;</li><li>cancelación;</li><li>pago fallido, gracia y recuperación;</li><li>estados;</li><li>solo lectura en todas las rutas;</li><li>motor detenido;</li><li>exportación;</li><li>avisos de conservación;</li><li>configuración, Stripe caído y precio incoherente;</li><li>solo se redirige a `checkout.stripe.com` y `billing.stripe.com`;</li><li>`STRIPE_API_BASE` rechazado en producción y fuera de local</li></ul> |
| `test/stripe-gateway.test.ts` (6 pruebas) | La librería oficial contra un servidor HTTP **local**: parámetros exactos enviados, sin impuestos automáticos, idempotencia, errores sin secretos, verificación de firma, rechazo de claves live |
| `test/plans.test.ts` | Límites de Starter, Pro y Business por intentos y regresión de D4 y de las migraciones 0004 y 0005 |
| `e2e/app.spec.ts` | Plan sin pagos activos y fin de la prueba en el navegador |
| `e2e/billing.spec.ts` (3 pruebas, **pagos simulados**) | Ver abajo |

**E2E con pagos simulados.** Una segunda API, con pagos de prueba activados, usa la librería oficial de Stripe contra el **simulador local** `apps/web/e2e/fake-stripe.mjs`. Su dirección se fija con `STRIPE_API_BASE`, que se rechaza en producción y fuera de `127.0.0.1`/`localhost`. El simulador firma los webhooks como Stripe. En el navegador, las páginas de `checkout.stripe.com` y `billing.stripe.com` se sustituyen por una página local, así que nunca se contacta con Stripe.

Se recorre:

- contratar, y volver sin pagar (no cambia nada);
- un webhook con firma falsa (400, sin cambios);
- el pago (plan activo y límite de 65) y un evento repetido (`duplicate`);
- la subida a Business (límite de 300);
- la cancelación programada, el fin del periodo y la solo lectura (escrituras en 403 y exportación disponible);
- el portal;
- el cobro fallido: aviso durante la gracia, recuperación e impago (solo lectura);
- el aislamiento entre dos empresas y el pago abandonado.

**Esto no equivale a probar con Stripe real:** el simulador reproduce los objetos y eventos que usa Presupio, no los reintentos, la autenticación 3DS, las facturas ni los impuestos de Stripe.

## 8. Pendiente (no se ha activado ni se da por resuelto)

- **IVA (D3).**
  - No se ha configurado ningún impuesto ni Stripe Tax, ni ningún tipo, exención o regla.
  - Falta validar con asesoría fiscal:
    - si 27,99, 57,99 y 127,99 € son con IVA incluido o aparte (y el `tax_behavior` de los precios de Stripe);
    - el tratamiento de clientes intracomunitarios y de Canarias, Ceuta y Melilla;
    - la facturación conforme a la normativa española vigente.
  - Hasta entonces la interfaz dice «pendiente de validación fiscal» (`PRICES_TAX_DISPLAY=pending`) y no calcula ningún desglose. Integrar Stripe **no** significa cumplir las obligaciones fiscales.
- **Pruebas reales en modo de prueba de Stripe** (apartado 3): no realizadas por falta de credenciales. Las E2E usan un simulador local (apartado 7), que no las sustituye.
- **Días de gracia** con cobro pendiente: 7, pendiente de confirmar.
- **Prueba gratuita y pago:**
  - quien contrata durante la prueba empieza a pagar en ese momento; los días de prueba restantes no se trasladan;
  - alternativa: `subscription_data.trial_end`.

  Pendiente de decidir.
- **Condiciones legales:**
  - texto de uso razonable de Business;
  - política de conservación y borrado en las condiciones del servicio;
  - revisión jurídica.
- **Producción:** no se ha desplegado nada ni se ha activado ningún cobro.

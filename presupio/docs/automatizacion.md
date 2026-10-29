# Motor de seguimiento y envío automático (fase 3)

Este documento explica cómo Presupio programa y envía los emails de seguimiento de los presupuestos sin respuesta. También recoge con qué proveedor se envían, cómo se configura y qué se ha probado de verdad.

> **Estado de verificación (importante)**
> - El motor está probado con **129 pruebas de la API contra PostgreSQL real** y **12 pruebas E2E en Chromium**. Lo cubierto: planificación, cancelaciones, concurrencia, reintentos, reinicios, aislamiento, plantillas, webhooks y la baja del cliente.
> - Los adaptadores de proveedor se han probado de dos formas, y **ninguna es el servicio real**:
>   - **Mailgun:** contra un servidor HTTP local que imita su API de mensajes.
>   - **SMTP:** contra un servidor SMTP local, con intercambio real del protocolo.
> - **No se ha enviado ningún email real.** No se ha probado con Mailgun ni con ningún otro proveedor real, por dos motivos:
>   - No hay cuenta ni credenciales.
>   - La red del entorno de desarrollo bloquea `api.eu.mailgun.net` y la documentación de Mailgun.
> - Antes de usarlo con clientes hay que hacer la prueba real descrita en [Puesta en producción](#puesta-en-producción).

## 1. Punto de partida (inspección del código de las fases 1 y 2)

| Qué había | Consecuencia para esta fase |
|---|---|
| Reglas por empresa (`company_settings`): primer seguimiento, intervalo y máximo; días y franja; revisión manual; base legal | Solo las usaba el plano del panel. **Nada las ejecutaba**. El modelo «primero + intervalo × N» no podía expresar 3/7/14 |
| `follow_ups` con `source: 'rule'` y `dedupe_key` única, pero solo con 3 estados (pendiente, hecho, cancelado) | Faltaban los estados de un envío real: enviándose, enviado y fallido |
| Cancelación de pendientes al responder, aceptar o rechazar, al archivar y al excluir un contacto | Se reutiliza tal cual. El motor añade su propia comprobación justo antes de cada envío |
| Correo SMTP solo para emails de la cuenta (verificación, invitaciones), sin confirmación de entrega | Insuficiente para saber si un email llegó: hace falta un proveedor con webhooks firmados |
| Zona horaria en `companies.timezone` (por defecto `Europe/Madrid`) | El calendario se calcula en esa zona, con cambios de hora incluidos |
| Ninguna cola ni proceso en segundo plano | Se añade un proceso `worker` cuyo estado vive solo en PostgreSQL |

## 2. Cómo funciona

```
          ┌──────────── cada minuto (WORKER_INTERVAL_SECONDS) ────────────┐
          │                                                                │
  1. Recuperación ──► 2. Planificador ──► 3. Envío ──► (cada hora) 4. Conservación
  (envíos colgados)   (bloqueo exclusivo)  (SKIP LOCKED)
```

### Estados

Cada **email automático** es un `follow_up` con `source = 'rule'`, y cada intento de envío es una fila de `message_deliveries`.

| Seguimiento (`follow_ups.status`) | Significado |
|---|---|
| `pending` | Programado. Si la empresa exige revisión, espera aprobación (`approved_at` nulo) |
| `sending` | Reclamado por el proceso de envío; el intento ya está registrado antes de llamar al proveedor |
| `sent` | **El proveedor aceptó el mensaje.** No significa «entregado» |
| `failed` | No se pudo enviar (motivo en `failure_reason`) o se agotaron los reintentos |
| `cancelled` | No se envió. Motivo en `cancel_reason` (ver la tabla siguiente) |
| `completed` | Solo seguimientos manuales (llamadas, visitas…). Un email automático **no** se puede marcar como hecho a mano |

| Intento (`message_deliveries.status`) | Quién lo confirma |
|---|---|
| `sending` | Presupio, antes de llamar al proveedor |
| `sent` | Respuesta correcta de la API del proveedor (o `250` del servidor SMTP) |
| `delivered` | **Solo** un webhook firmado del proveedor (Mailgun). Con SMTP nunca se alcanza |
| `failed` | Error del proveedor o rebote permanente notificado por webhook |
| `unknown` | El proceso se detuvo entre el envío y su registro; no se sabe si salió |

Los estados contradictorios están bloqueados en la base de datos con `CHECK`:
- `sent` exige `sent_at`, y `failed` exige `failure_reason`.
- `sending`, `sent` y `failed` solo existen en emails automáticos.
- Una aprobación exige su instantánea completa.

### Planificador

Para cada empresa con el envío activado y cada presupuesto en estado **enviado**, sin archivar, con emails automáticos permitidos y con un contacto con email:

1. Calcula el **siguiente paso** de la secuencia. Por defecto son **3, 7 y 14 días naturales** desde el envío, contados en la zona horaria de la empresa. La fecha es el inicio de la franja de contacto de ese día, o el siguiente hueco permitido si ese día no se contacta.
2. **No envía de golpe los pasos atrasados:** si el motor se activa cuando ya pasaron los días 3 y 7, empieza por el que toca ahora.
3. A los 7 días del último paso, el presupuesto queda **fuera de secuencia** y no se programa nada más.
4. Inserta el paso con la clave única `auto:{presupuesto}:{fecha de envío}:{paso}`. Además, un índice único parcial garantiza **un solo paso activo** (`pending` o `sending`) por presupuesto. Si dos procesos planifican a la vez, el segundo no inserta nada.
5. Revisa los pasos pendientes no aprobados:
   - los reprograma si cambiaron las reglas;
   - los cancela si el paso ya no existe (`rules_changed`) o si cambió la fecha de envío del presupuesto (`quote_resent`).

### Envío

1. **Reclamación** dentro de una transacción con `SELECT … FOR UPDATE SKIP LOCKED` (como máximo 25 por empresa y ciclo).
2. **Comprobación justo antes de enviar**, otra vez y con los datos actuales. Se cancela si:
   - se desactivó el envío;
   - el presupuesto ya no está «enviado», se archivó o tiene los emails automáticos desactivados;
   - el contacto no tiene email o está excluido;
   - cambió la fecha de envío o las reglas.
3. **Se espera**, sin cancelar, en estos casos:
   - **Sin aprobación**, si la empresa exige revisión. Caduca a las **72 h** de la fecha prevista (`approval_expired`).
   - **Contacto reciente:** han pasado **menos de 48 h** desde el último contacto con el cliente, manual o automático.
   - **Fuera de la franja:** fuera de los días u horas permitidos. Se reprograma al siguiente hueco.
   - **Sin proveedor o sin plan:** falta el proveedor, la dirección de respuesta o un plan activo.
4. Tras una parada larga, un paso nunca intentado con **más de 72 h de retraso se cancela** (`expired`). Así no salen ráfagas de emails viejos.
5. Se registra el intento (`sending`) y se marca el seguimiento como `sending` **en la misma transacción**. Después se llama al proveedor **fuera de la transacción**.
6. Resultado:
   - **Éxito:** intento `sent` con el id del proveedor, seguimiento `sent` y `quotes.last_follow_up_at` actualizado.
   - **Error:** intento `failed` con código y detalle (sin direcciones de email).

### Reintentos y semántica «como mucho una vez»

- **Se reintentan:** límite de peticiones (429), errores 5xx y fallos de red o SMTP 4xx.
  - Esperas: 5 min, 30 min y 2 h.
  - Máximo `FOLLOWUP_MAX_ATTEMPTS` intentos en total (3 por defecto, 5 como tope).
- **No se reintentan:** credenciales rechazadas, dirección rechazada (4xx de la API, SMTP 5xx) y rebotes.
- **Un intento que se queda en `sending` más de 15 min** (el proceso murió entre el envío y su registro) pasa a `unknown`, y el seguimiento a `failed` con el motivo `unknown_outcome`.
  - **No se reenvía:** preferimos no duplicar un email a un cliente antes que arriesgarnos.
  - Queda visible en «Fallidos» para que alguien lo revise.

### Concurrencia y reinicios

- **Todo el estado está en PostgreSQL:** reiniciar el proceso no pierde nada, y lo programado lo envía el siguiente proceso que arranque. Probado con dos conexiones distintas.
- **Varios procesos a la vez:**
  - La planificación, la recuperación y la conservación usan bloqueos consultivos (`pg_try_advisory_lock`).
  - El envío usa `SKIP LOCKED`.
  - Probado con tres ciclos simultáneos en tres conexiones: un solo email por presupuesto.
- **Apagado ordenado** con `SIGTERM`: termina el ciclo en curso.
- **Supervisión:**
  - Cada ejecución queda en `job_runs` (trabajo, estado, estadísticas y error).
  - `GET /api/v1/automation` informa de si el proceso está activo (última ejecución reciente).
  - La pantalla «Envío automático» avisa si no lo está.

### Aprobación

Con **«Revisión humana obligatoria»** (activada por defecto) ningún email sale sin aprobación:

- **Aprobar** guarda una **instantánea** del asunto y del texto, más la versión de plantilla usada. **Se envía exactamente eso**, aunque luego se edite la plantilla.
- El pie legal y el enlace de baja se añaden en el momento del envío.
- Pueden aprobar los roles con permiso de escritura en seguimientos. La persona de solo lectura no puede.

### Respuestas del cliente

- Los emails llevan `Reply-To` con la dirección de la empresa, así que **las respuestas llegan a su buzón**, no a Presupio.
- Presupio **no lee el buzón**. La respuesta se registra en la ficha con «Registrar respuesta del cliente», lo que cancela los emails pendientes. Leer las respuestas automáticamente (*inbound*) se deja para más adelante.

## 3. Plantillas

- **Hay un email por paso.** Hay tres textos iniciales en español de España: breves, cordiales, sin precios, descuentos ni promesas.
- **Versionadas:** guardar crea una versión nueva y las anteriores no se modifican.
- **Variables permitidas:**
  - `{{nombre_cliente}}`
  - `{{titulo_presupuesto}}`
  - `{{referencia}}`
  - `{{fecha_envio}}`
  - `{{empresa}}`
  - `{{remitente}}`

  **No hay variable de importe a propósito.**
- **Validación:** se rechazan las variables desconocidas, las llaves mal cerradas y los asuntos de varias líneas (`400` con el detalle).
- **Valores introducidos por usuarios:**
  - Se limpian de caracteres de control: un nombre con `\r\n` no puede inyectar cabeceras.
  - Se recortan a 200 caracteres.
  - Se escapan en la versión HTML.
- **Pie obligatorio, no editable** (LSSI art. 21):
  - razón social y NIF;
  - por qué se escribe;
  - enlace personal de baja.
- **Cabeceras** `List-Unsubscribe` y `List-Unsubscribe-Post: List-Unsubscribe=One-Click` ([RFC 8058](https://www.rfc-editor.org/rfc/rfc8058)). Permiten la baja de un clic que Gmail y Yahoo piden a quien envía correo a sus usuarios.
- **Sin seguimiento de aperturas ni de clics** (`o:tracking=no`): no hace falta y afecta a la privacidad.
- **Vista previa y prueba:**
  - La vista previa usa datos de ejemplo o de un presupuesto real de la empresa, sin enviar nada.
  - El **email de prueba** va solo a la dirección de quien lo pide (máximo 5 por hora).

## 4. Proveedor de email

### Elección: Mailgun, región UE

| Criterio | Mailgun (UE) |
|---|---|
| Residencia de datos | Región europea con su propia URL de API (`https://api.eu.mailgun.net`), separada de la de EE. UU. |
| Operación usada | `POST /v3/{dominio}/messages`, formulario `application/x-www-form-urlencoded`, autenticación HTTP Basic `api:{API_KEY}` |
| Parámetros usados | `from, to, subject, text, html, h:Reply-To, h:List-Unsubscribe, h:List-Unsubscribe-Post, o:tracking(-opens/-clicks)=no, o:tag, v:presupio_delivery_id` |
| Confirmación de entrega | Webhooks `delivered`, `failed` (con `severity` permanente o temporal), `complained` y `unsubscribed` |
| Seguridad de los webhooks | Firma HMAC-SHA256 de `timestamp + token` con la *webhook signing key*. Presupio:<ul><li>compara la firma en tiempo constante;</li><li>rechaza las de más de 15 min;</li><li>no acepta dos veces el mismo `token` (tabla `webhook_events`).</li></ul> |
| Coste orientativo | Hay plan gratuito de unos 100 emails al día y planes de pago desde unos 15 $/mes por unos 10.000 emails. Las fuentes de terceros no coinciden: **compruébalo en la web de Mailgun antes de contratar** |

**Por qué no varios proveedores:**
- La fase pide uno.
- Mailgun cubre envío y confirmación verificable con una sola integración.
- **SMTP genérico** queda como alternativa ya implementada, reutilizando la configuración `SMTP_*` existente. Con SMTP el estado máximo es «enviado», porque no hay confirmación de entrega.

**Fuentes consultadas:**
- La documentación oficial de Mailgun no se pudo abrir desde este entorno de desarrollo: la política de red del entorno bloquea `documentation.mailgun.com`.
- Los datos anteriores proceden de:
  - búsquedas sobre las páginas oficiales de Mailgun: envío de mensajes, seguridad de webhooks, *payloads* y tipos de evento, región UE;
  - la guía de webhooks de Mailgun de Hookdeck (`hookdeck.com/webhooks/skills/mailgun-webhooks`);
  - comparativas de precios de terceros.
- **Antes de producción, contrasta con la documentación oficial** en [documentation.mailgun.com](https://documentation.mailgun.com) (no se pudo abrir desde aquí, así que no se enlazan páginas concretas):
  - envío de mensajes por HTTP;
  - seguridad y *payload* de los webhooks;
  - URL base de la región UE;
  - precios y condiciones de uso aceptable en [mailgun.com](https://www.mailgun.com).

**Qué hace cada evento de webhook:**

| Evento | Efecto en Presupio |
|---|---|
| `delivered` | Intento `sent` → `delivered` |
| `failed` + `severity: permanent` | Intento `failed` (`bounced`), exclusión del email del contacto (motivo «datos de contacto erróneos») y registro en el historial del presupuesto |
| `failed` + `severity: temporary` | Nada: lo reintenta el propio proveedor |
| `complained` / `unsubscribed` | Exclusión del email (motivo «pidió no recibir más mensajes»); se cancelan los pendientes |

## 5. Variables de entorno

Las mismas que en [`.env.example`](../.env.example). **Ningún secreto va en el código ni en el repositorio.**

| Variable | Por defecto | Descripción |
|---|---|---|
| `FOLLOWUP_EMAIL_PROVIDER` | `disabled` | `disabled` (no se envía nada), `mailgun` o `smtp` |
| `FOLLOWUP_FROM_EMAIL` | — | Remitente técnico, de un dominio verificado en el proveedor (p. ej. `seguimiento@envios.tudominio.es`). Obligatoria con proveedor. El nombre visible es el de cada empresa |
| `MAILGUN_API_KEY` | — | Clave de API de Mailgun (**secreto**) |
| `MAILGUN_DOMAIN` | — | Dominio de envío verificado en Mailgun |
| `MAILGUN_API_BASE` | `https://api.eu.mailgun.net` | Región UE. En producción debe ser `https` |
| `MAILGUN_WEBHOOK_SIGNING_KEY` | — | Clave de firma de webhooks (**secreto**). Obligatoria en producción |
| `PUBLIC_API_URL` | `APP_WEB_URL` | URL pública de la API, para la baja de un clic (`/api/v1/public/unsubscribe`) |
| `WORKER_INTERVAL_SECONDS` | `60` | Cada cuánto se ejecuta un ciclo (de 5 a 3600) |
| `FOLLOWUP_MAX_ATTEMPTS` | `3` | Intentos por email ante errores temporales (de 1 a 5) |
| `MESSAGE_CONTENT_RETENTION_DAYS` | `90` | Días que se conserva el texto de cada email enviado |
| `MAIL_TRANSPORT=smtp` + `SMTP_*` | — | Solo con `FOLLOWUP_EMAIL_PROVIDER=smtp` |

**Validación al arrancar:**
- Un proveedor sin remitente, o Mailgun sin clave o sin dominio, **impide arrancar**.
- En producción también lo impide Mailgun sin `https` o sin clave de firma.

## 6. Activar y desactivar

Hay tres niveles, y los tres deben permitirlo para que salga un email.

1. **Servidor (administrador técnico):** `FOLLOWUP_EMAIL_PROVIDER` y sus credenciales. Con `disabled` nada se envía y la pantalla lo dice.
2. **Empresa (propietario o administrador)**, en *Configuración → Envío automático*:
   - Requisitos:
     - una dirección donde recibir las respuestas;
     - la base legal documentada (mínimo 20 caracteres);
     - un plan activo;
     - el **email confirmado** de quien lo activa (desde la fase 4: evita cuentas falsas usadas para enviar spam);
     - **confirmar expresamente** que hay base jurídica y que no se usan listas compradas.
   - La activación queda registrada: quién la activó y cuándo, también en el historial.
   - **Desactivar cancela en el acto** todos los emails pendientes.
   - Mientras está activo no se puede borrar la dirección de respuesta ni la base legal.
3. **Presupuesto:** el interruptor «Emails automáticos de seguimiento» de la ficha (`autoFollowUpEnabled`). Al desactivarlo se cancelan sus pendientes.

También se detienen solos cuando:
- se registra la respuesta del cliente, o el presupuesto se acepta, se rechaza o se archiva;
- el cliente pulsa el enlace de baja, o se queja o rebota (webhook);
- el contacto entra en la lista de exclusión.

## 7. Proceso de envío (despliegue)

```bash
npm run worker -w @presupio/api                 # desarrollo: bucle continuo
```

```bash
npm run build && npm run worker:start -w @presupio/api   # producción: proceso persistente
```

```bash
npm run worker -w @presupio/api -- --once       # un solo ciclo (cron / tareas programadas)
```

- **Lo normal:** un servicio aparte del de la API (otro proceso, contenedor o *dyno* tipo `worker`) con las mismas variables de entorno.
- **Si el alojamiento no admite procesos persistentes:** programa `--once` cada minuto con el cron del alojamiento (o con un cron externo que lance un *job*). Es seguro aunque dos ejecuciones se solapen.
- **No depende de que nadie tenga la aplicación abierta.**
- **Supervisión:** la tabla `job_runs`, el registro (`pino`, con los campos `proc: worker` y estadísticas por ciclo) y `GET /api/v1/automation` → `worker.healthy`.
- **Webhooks de Mailgun:** configura en Mailgun la URL `https://<tu-api>/api/v1/webhooks/mailgun` para los eventos `delivered`, `permanent_fail`, `temporary_fail`, `complained` y `unsubscribed`.

## 8. Seguridad y cumplimiento

- **Aislamiento entre empresas:**
  - Todas las tablas nuevas de empresa (`message_template_versions`, `message_deliveries`) tienen RLS y claves foráneas compuestas `(company_id, id)`.
  - El proceso de envío actúa empresa por empresa con su contexto RLS.
  - Las únicas consultas entre empresas son funciones `SECURITY DEFINER` acotadas: devuelven solo identificadores, como las que buscan la empresa de un webhook o de un enlace de baja.
- **Permisos en el servidor:**
  - Activar, desactivar, editar plantillas y enviar la prueba: `settings:update` (propietario o administrador).
  - Aprobar: `follow_ups:write`.
  - Ver: lectura.
- **Rutas públicas** (sin sesión), las tres con límite de peticiones:
  - la baja, con un token personal de 256 bits del que solo se guarda el hash;
  - el webhook, solo con firma válida.
- **Datos en los errores:** `error_detail` no guarda direcciones de email (se sustituyen por `[email]`).
- **Logs:**
  - Los registros de peticiones ocultan `token=`.
  - El proceso de envío no registra destinatarios ni contenidos.
- **Política de conservación** (trabajo `retention`, cada hora):
  - texto y asunto de cada email enviado: **90 días** (`MESSAGE_CONTENT_RETENTION_DAYS`); después se borran y queda la fecha del borrado;
  - eventos de webhook y ejecuciones del proceso: **30 días**;
  - metadatos de los intentos (fecha, estado, proveedor, id, código de error): mientras exista la empresa, por trazabilidad. Se eliminan en cascada si se elimina la empresa;
  - en la fase 4 conviene definir el plazo de conservación de cuentas canceladas.
- **Base legal (RGPD y LSSI):**
  - Solo se escribe a clientes que pidieron un presupuesto, sobre ese presupuesto, a un ritmo limitado: 3 emails por defecto, con 48 h mínimo entre contactos y dentro de la franja horaria.
  - Cada empresa documenta su base legal (p. ej. interés legítimo, art. 6.1.f RGPD, o medidas precontractuales, art. 6.1.b) y confirma que no usa listas compradas.
  - Cada email se identifica y ofrece la baja (art. 21 LSSI).
  - **Esto no es asesoramiento jurídico:** conviene que lo valide un profesional antes de la puesta en producción.

## 9. Pruebas

| Dónde | Qué |
|---|---|
| `apps/api/test/automation.test.ts` (28 pruebas, PostgreSQL real) | Las 10 obligatorias:<ol><li>un presupuesto pendiente programa sus seguimientos;</li><li>uno respondido no genera ninguno;</li><li>aceptar o rechazar cancela;</li><li>la baja impide envíos;</li><li>trabajos duplicados o simultáneos no duplican envíos;</li><li>el error del proveedor queda registrado;</li><li>los reintentos tienen límite;</li><li>aislamiento entre empresas;</li><li>sobrevive a reinicios;</li><li>plantillas y variables.</li></ol>Además: aprobación, caducidad, franjas, separación de 48 h, requisitos y permisos de activación, desactivación, interruptor por presupuesto, envío interrumpido (resultado desconocido), webhooks (firma, antirrepetición, entregado, rebote, queja) y conservación |
| `apps/api/test/automation-units.test.ts` (17) | Calendario (cambios de hora, fines de semana, franja), plantillas (relleno, escape, validación, sin precios), firma de webhooks, adaptador **Mailgun contra un servidor HTTP local** y **SMTP contra un servidor SMTP local** |
| `apps/web/e2e/app.spec.ts` | El flujo completo en Chromium, más accesibilidad (axe) y diseño adaptable de las pantallas nuevas:<ul><li>reglas;</li><li>requisitos y activación con confirmación legal;</li><li>presupuesto, programación, revisión y aprobación;</li><li>envío por el adaptador real contra un **simulador local** de la API de Mailgun (`e2e/mailgun-sink.mjs`);</li><li>trazabilidad del intento;</li><li>baja del cliente desde el enlace del email.</li></ul> |

El proveedor simulado (`apps/api/test/fake-provider.ts`) y el simulador de las pruebas E2E existen **solo en las pruebas** y están señalados como tales. **No equivalen a una integración real.**

## 10. Limitaciones conocidas

- **No se ha probado con Mailgun real ni con ningún SMTP real** (ver el estado de verificación al principio).
- **Las respuestas del cliente no se detectan solas:** llegan al buzón de la empresa y se registran a mano.
- **Rebote tras «enviado»:** si un email rebota después de aceptarse:
  - el intento pasa a fallido y el contacto queda excluido;
  - el seguimiento sigue como «enviado», porque el proveedor lo aceptó;
  - cuenta como contacto realizado para la métrica de reactivación.
- **Un paso fallido no bloquea los siguientes:** si falla, el siguiente paso se programa con normalidad. Si el motivo es la dirección, el rebote la excluye y se detiene la secuencia.
- **Sin confirmación de entrega en SMTP:** con SMTP no hay confirmación de entrega ni gestión de rebotes.
- **Límites de plan:** se aplican al envío. Desde la fase 5 el plan limita **intentos** de seguimiento por periodo: cada email automático aceptado por el proveedor, reservado antes de enviar y confirmado al aceptarse (al agotarlos se cancelan los pendientes y no se programan nuevos). Además hay un límite técnico diario de emails. Sin plan activo se cancela lo programado. Ver [`limites-y-metricas.md`](limites-y-metricas.md).

## Puesta en producción

Pendiente de cuentas, credenciales e infraestructura:

1. **Cuenta de Mailgun en la región UE** y contratación del plan según el volumen.
2. **Dominio de envío** (recomendado un subdominio, p. ej. `envios.tudominio.es`) verificado en Mailgun, con:
   - **SPF** y **DKIM** (registros que da Mailgun);
   - **DMARC** en el dominio principal.
3. Variables `FOLLOWUP_*` y `MAILGUN_*` en el gestor de secretos del alojamiento.
4. Webhook de Mailgun hacia `https://<api>/api/v1/webhooks/mailgun` con la clave de firma.
5. Desplegar el proceso de envío (persistente o con `--once` en un cron cada minuto).
6. **Prueba real controlada:**
   1. el email de prueba a una dirección propia;
   2. un presupuesto de prueba con un contacto propio y la aprobación activada;
   3. comprobar en la pantalla que el intento pasa a «Entregado» (webhook) y que la baja funciona desde Gmail (un clic) y desde el enlace.
7. Que un profesional valide la base legal y los textos.
8. Si se trabaja desde un entorno de nube con red restringida, hay que permitir `api.eu.mailgun.net` (y, para consultar la documentación, `documentation.mailgun.com`) en la configuración de acceso a red del entorno.

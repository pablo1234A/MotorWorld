# Recuperaciones, límites de los planes y métricas (fase 4)

## 1. Qué es una «recuperación»

Es la unidad que consumen los planes. Está definida en un solo sitio del código (`apps/api/src/domain/recovery.ts`) y se aplica igual en la API, el motor, las métricas y la interfaz.

**Un presupuesto cuenta como recuperación cuando se cumplen todas estas condiciones:**

1. Estaba **enviado y sin respuesta**.
2. Antes de la respuesta hubo un **seguimiento realizado y verificable**. Puede ser uno de estos dos:
   - un contacto manual registrado como hecho: llamada, email, WhatsApp, SMS o visita. Las tareas internas no cuentan;
   - un email automático **aceptado por el proveedor** (estado «enviado», con identificador del proveedor).
3. El cliente **respondió o aceptó**, y la empresa lo registró con una fecha de respuesta:
   - no anterior a ese seguimiento;
   - **no posterior en más de 30 días** (`RECOVERY_ATTRIBUTION_DAYS`).

**Cómo se cuenta:**
- **Una sola vez por presupuesto.** Volver a «pendiente» y responder otra vez no cuenta de nuevo; lo garantiza un índice único `(empresa, presupuesto)`.
- **En el periodo en que se registra la respuesta** (la hora del servidor), no en la fecha de respuesta que se escriba. Así no se puede llevar una recuperación a un periodo ya cerrado.
- **Se guarda con su prueba** (`recovery_events`):
  - el seguimiento que la precede (id, canal, si fue automático, fecha);
  - la fecha de la respuesta y quién la registró;
  - si consumió plan.

**Qué no cuenta:**
- Un email enviado sin respuesta.
- Un seguimiento programado.
- Un presupuesto pendiente.
- Una respuesta sin seguimiento previo.
- Una respuesta que llega más de 30 días después del último seguimiento.

**Limitaciones (explícitas):**
- **La respuesta la registra la empresa.** Presupio no lee el buzón: las respuestas llegan al correo de la empresa (`Reply-To`). Por tanto:
  - una empresa podría no registrar respuestas, y su consumo sería menor;
  - o registrarlas por error, y el registro no se deshace desde la aplicación; lo corrige soporte con la herramienta de operación.

  Cada registro guarda quién y cuándo, para poder auditarlo.
- **Es correlación, no causalidad.** Que un cliente responda después de un seguimiento no prueba que respondiera por el seguimiento. La interfaz lo dice expresamente y nunca habla de ventas «gracias a» Presupio.
- **Datos anteriores a esta fase:** las reactivaciones de antes de la fase 4 se migraron como `historical`. Aparecen en las métricas, pero no consumen ningún plan.

**Por qué la respuesta y no la venta:**
- La respuesta es el resultado directo y verificable del seguimiento, y llega en días.
- La venta depende de muchos otros factores (precio, plazos, competencia) y puede tardar meses.

Las ventas posteriores a un seguimiento se miden aparte («Aceptados tras un seguimiento»). Si negocio decide otra unidad, se cambia en `domain/recovery.ts` y en `followUpBeforeResponse` (`modules/quotes/service.ts`).

## 2. Límites de los planes

Los precios son los previstos comercialmente. **No hay cobro** hasta la fase 5, y queda pendiente decidir si incluyen IVA.

| Plan | Precio | Recuperaciones por periodo | Emails automáticos por día | Notas |
|---|---|---|---|---|
| Starter | 27,99 €/mes | **25** | 60 | También durante la prueba gratuita |
| Pro | 57,99 €/mes | **65** | 150 | |
| Business | 127,99 €/mes | **300** (uso razonable) | 400 | **No es ilimitado:** límite amplio, publicado en la pantalla de plan, sin restricciones ocultas |

**El límite técnico diario de emails:**
- Cuenta todos los intentos de envío del día natural, en la zona horaria de la empresa.
- Protege la reputación del dominio de envío.
- Lo vencido que no cabe espera al día siguiente.

### Cómo se aplican

- **En el servidor:**
  - En la misma transacción que registra la respuesta (`modules/usage/service.ts → recordRecovery`).
  - En el motor de envío (`automation/engine.ts`).
  - La interfaz solo muestra el estado.
- **Por empresa y periodo:** tabla `usage_periods`, con clave `(empresa, inicio del periodo)` y aislada con RLS.
- **Periodo:**
  - Sin proveedor de pagos, el **mes natural** en la zona horaria de la empresa.
  - Con proveedor (fase 5), su periodo de facturación (`subscriptions.current_period_start/end`).
  - Al cambiar de periodo se crea una fila nueva con el contador a cero, sin solapes con la anterior.
- **Concurrencia:**
  - El incremento es una única sentencia condicional (`… SET recoveries_counted = recoveries_counted + 1 WHERE recoveries_counted < recovery_limit`). PostgreSQL bloquea la fila y vuelve a evaluar la condición, así que dos peticiones simultáneas no pueden pasar del límite.
  - Además, una restricción `CHECK (recoveries_counted BETWEEN 0 AND recovery_limit)` lo impide en la propia base de datos.
  - Probado con 8 respuestas simultáneas a 3 del límite: se cuentan 3, no 8.
- **Cambio de plan:**
  - Una **subida** amplía el límite en el periodo en curso.
  - Una **bajada** se aplica desde el periodo siguiente, para no dejar a la empresa por encima de un límite a mitad de periodo.
- **Nadie se asigna un plan desde el navegador:**
  - No hay ningún endpoint que escriba en la suscripción, y los esquemas de entrada rechazan campos desconocidos (`400`).
  - Además, el **rol de base de datos de la aplicación no tiene permiso `UPDATE`/`DELETE` sobre `subscriptions`**, ni sobre `recovery_events`. Aunque un endpoint tuviera un fallo, la base de datos lo rechazaría (probado).
  - Hasta la fase 5, los planes de prueba o piloto los asigna el personal autorizado con `npm run ops -- plan …` (rol propietario; deja constancia en el historial).

### Qué pasa al acercarse y al llegar al límite

| Momento | Comportamiento |
|---|---|
| 80 % del límite | Aviso en el panel y en *Configuración → Plan*: cuánto queda y qué pasará |
| Llega al límite | Se registra `usage.limit_reached` en el historial. En el siguiente ciclo del motor:<ul><li>se **cancelan los emails automáticos pendientes** (motivo «se alcanzó el límite de recuperaciones del plan»);</li><li>no se programan nuevos;</li><li>ninguno sale, porque se comprueba otra vez justo antes de cada envío.</li></ul> |
| Respuestas por encima del límite | **Se registran igualmente:** el dato del cliente nunca se pierde ni se bloquea. Quedan como `over_limit`, no se descuentan y se muestran como tales |
| Lo que sigue funcionando | Consultar todos los datos e historial, registrar respuestas y ventas, programar y registrar seguimientos manuales, exportar los datos |
| Periodo siguiente | El contador empieza de cero y el motor vuelve a programar los presupuestos que sigan sin respuesta (sin enviar de golpe los pasos atrasados) |
| Sin plan activo (prueba caducada, cancelado) | El motor no envía. Las respuestas se registran como `no_active_plan`, sin consumir |

## 3. Métricas

Las métricas se sirven en `GET /api/v1/metrics?month=AAAA-MM` y se muestran en la pantalla **Resultados**.

- **Meses:** se usan meses naturales en la **zona horaria de la empresa**, con los cambios de hora incluidos.
- **Origen de las cifras:** todas salen de consultas a los datos guardados. **No hay estimaciones.**
- **Periodos vacíos:** devuelven ceros.
- **Meses no válidos:** los meses futuros o mal escritos devuelven `400`.

| Métrica | Cómo se calcula |
|---|---|
| Presupuestos registrados | Dados de alta en el mes (incluye archivados) |
| Presupuestos enviados | Con fecha de envío en el mes |
| Pendientes de respuesta | Ahora mismo, de cualquier mes (estado «enviado», sin archivar) |
| Contactos realizados | Seguimientos manuales hechos en el mes (sin tareas internas) |
| Emails automáticos enviados | Aceptados por el proveedor en el mes. «Con entrega confirmada» solo si el proveedor lo notificó por webhook firmado |
| Emails que no se pudieron enviar | Emails automáticos en estado fallido, y su número total de intentos fallidos |
| Programados ahora | Emails automáticos pendientes (y cuántos esperan aprobación) más tareas manuales pendientes |
| Respondieron tras un seguimiento | Recuperaciones con fecha de respuesta en el mes (incluye las que no consumen plan) |
| Respondieron sin seguimiento | Respuestas del mes sin seguimiento previo verificable. No son recuperaciones |
| Aceptados tras un seguimiento | Ventas confirmadas con evidencia en el mes, con seguimiento previo. **El importe lo declara la empresa** |
| Recuperaciones contabilizadas | Registradas en el mes que consumieron plan. Las que quedaron por encima del límite se muestran aparte |
| Tasa de respuesta tras seguimiento | De los presupuestos con un seguimiento realizado en el mes, cuántos respondieron después. Detalles debajo |
| Últimos seis meses | Las mismas cifras por mes |

**Sobre la tasa de respuesta:**
- **Solo se calcula con al menos 10 casos** (`MIN_SAMPLE_FOR_RATE`); por debajo se muestra «sin datos suficientes».
- Mientras puedan llegar respuestas (30 días tras el fin del mes), se marca como **provisional**.

**Consumo del plan** (`GET /api/v1/usage`):
- plan, estado y periodo;
- recuperaciones usadas, límite, restantes, por encima del límite, umbral de aviso y nivel;
- emails automáticos de hoy y su límite diario;
- lista de las recuperaciones del periodo con su seguimiento previo.

## 4. Pruebas

| Archivo | Qué cubre |
|---|---|
| `apps/api/test/plans.test.ts` (24 pruebas) | <ul><li>Starter (26 respuestas reales: 25 cuentan), Pro y Business;</li><li>aviso al 80 %;</li><li>simultaneidad;</li><li>ventana de 30 días, una vez por presupuesto, tareas internas;</li><li>sin plan;</li><li>aislamiento por empresa;</li><li>periodos (zona horaria, cambio de mes, diciembre, periodo del proveedor);</li><li>subida de plan;</li><li>imposibilidad de cambiar el plan (API y base de datos);</li><li>métricas frente a consultas independientes;</li><li>periodos vacíos;</li><li>exportación;</li><li>errores sin secretos;</li><li>supervisión;</li><li>migración sobre datos existentes;</li><li>motor con límite alcanzado;</li><li>límite diario con tres procesos a la vez;</li><li>recuperación tras email automático.</li></ul> |
| `apps/web/e2e/app.spec.ts` | Consumo en *Plan*, Resultados (incluida la navegación de meses), ausencia de controles para cambiar de plan y exportación descargada, más accesibilidad y diseño adaptable de las pantallas nuevas |

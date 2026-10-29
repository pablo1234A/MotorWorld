# Consumo por intentos, límites de los planes y métricas

> **Regla comercial vigente (fase 5): los planes limitan INTENTOS de seguimiento, no recuperaciones.**
> Hasta la fase 4 la unidad de consumo era la «recuperación». Ese histórico se conserva sin reclasificar (apartado 5).

## 1. Qué es un «intento»

Un **intento** es un **seguimiento automático que Presupio envía y el proveedor de email acepta**. Es la unidad que consumen los planes.

| Situación | ¿Cuenta? |
|---|---|
| Email automático aceptado por el proveedor | **Sí**, aunque el cliente no responda, rechace el presupuesto o no se recupere la venta |
| Varios seguimientos distintos del mismo presupuesto (email 1, email 2…) | **Sí, cada uno** es un intento independiente |
| Seguimiento programado que se cancela antes de enviarse | No |
| Envío que falla antes de realizarse (error del proveedor, rechazo) | No |
| Reintento técnico del mismo seguimiento tras un fallo temporal | No duplica: un seguimiento = un intento como máximo |
| Envío de resultado desconocido (el proceso se detuvo a mitad) | No se cobra (`unverified`): no se puede demostrar que salió |
| Rebote posterior a la aceptación del proveedor | Sí: el envío se realizó |
| Llamadas, mensajes o visitas registrados por el equipo | No: no son envíos de Presupio |
| Email de prueba al propio usuario (`/automation/test-email`) | No: no es un seguimiento a un cliente |
| Respuestas y recuperaciones | No: son resultados (apartado 3) |

### Cómo se cuenta (persistente, verificable e idempotente)

Tabla `attempt_events`, **una fila por seguimiento** (clave única `(empresa, seguimiento)`):

1. **Reserva** (`reserved`). El motor reclama el envío dentro del bloqueo de la empresa (`pg_advisory_xact_lock`). En la misma transacción reserva el cupo con una sentencia condicional sobre `usage_periods`: `attempts_counted + attempts_reserved < attempt_limit`. Así varios procesos a la vez no pueden pasarse del límite.
2. **Confirmación** (`counted`). El proveedor acepta el email: se guarda `sent_at` con la **hora del servidor** y el periodo pasa de reservado a contado.
3. **Liberación** (`released`). El envío falla antes de realizarse: el cupo se libera. Un reintento vuelve a reservar la **misma** fila.
4. **Sin verificar** (`unverified`). Resultado desconocido: no se cobra y no se reintenta.

**Garantías en la base de datos:**
- `CHECK (attempts_counted + attempts_reserved <= attempt_limit)`.
- El disparador `attempt_events_guard` solo permite estas transiciones: `reserved → counted | released | unverified` y `released → reserved`. Un intento contado no se puede deshacer ni cambiar de fecha o periodo.
- El rol de la aplicación no puede borrar intentos (`DELETE` revocado).
- Los contadores del periodo no pueden bajar y el límite de un periodo no puede reducirse (disparador `usage_periods_guard`, ampliado en la 0005).
- Solo el rol propietario (soporte, `npm run ops`) puede corregir.

**Las fechas que declara la empresa no intervienen en el consumo.** El intento se fecha con la hora del servidor en el momento del envío, y el periodo es el vigente en ese momento. Está probado en `plans.test.ts › la fecha declarada no altera los intentos contados, los periodos de facturación ni los límites`.

## 2. Límites de los planes

| Plan | Precio mensual | Intentos de seguimiento al mes | Emails automáticos al día | Notas |
|---|---|---|---|---|
| Starter | 27,99 € | **25** | 60 (técnico) | También durante la prueba gratuita |
| Pro | 57,99 € | **65** | 150 (técnico) | |
| Business | 127,99 € | **300** (uso razonable) | **400** | **No es ilimitado:** límite amplio y publicado, sin restricciones ocultas |

- **Dos límites independientes.**
  - El **mensual de intentos** es el comercial.
  - El **diario de emails automáticos** cuenta todos los envíos técnicos del día natural, en la zona horaria de la empresa, y protege la reputación del dominio de envío.

  300 intentos al mes no son «300 emails al día» ni se confunden con el límite diario de 400.
- **Límites diarios de Starter y Pro (60 y 150).** Son límites técnicos anteriores a la fase 5 que la oferta comercial no menciona. Se mantienen como protección; con 25 o 65 intentos al mes no llegan a aplicarse en la práctica. Ver [`decisiones-comerciales.md`](decisiones-comerciales.md).
- **Dónde se aplican.**
  - En el **backend**: en el motor, al planificar y otra vez justo antes de cada envío.
  - En los **procesos programados** (worker).
  - En la **base de datos** (restricciones y disparadores).

  La interfaz solo muestra el estado.

### Al acercarse y al llegar al límite

| Momento | Comportamiento |
|---|---|
| 80 % | Aviso en el panel y en *Configuración → Plan* |
| Intentos agotados | Se registra `usage.limit_reached` y se cancelan los emails automáticos pendientes («se agotaron los intentos de seguimiento del plan»). No se programan nuevos y no sale ninguno |
| Lo que sigue funcionando | Consultar y exportar datos, registrar respuestas y ventas, seguimientos manuales |
| Periodo siguiente | Contador a cero; el motor vuelve a programar lo que siga sin respuesta, sin enviar de golpe los pasos atrasados |
| Sin plan activo | Solo lectura (ver [`facturacion.md`](facturacion.md#5-fin-de-la-prueba-y-solo-lectura)): lo programado se cancela (`no_active_plan`) y no se envía nada |

### Periodo y cambios de plan

- **Periodo:**
  - Sin suscripción de pago, el **mes natural** en la zona horaria de la empresa.
  - Con suscripción de Stripe, su **periodo de facturación**.
  - Al confirmarse el primer pago, el periodo de la prueba (mes natural) termina en ese instante y el periodo pagado empieza con el cupo completo, sin solapes. El consumo de la prueba se conserva en su periodo.
- **Subida de plan:** el límite sube en el periodo en curso cuando Stripe confirma el cobro.
- **Bajada de plan:** el periodo en curso conserva su límite y el nuevo límite se aplica desde el periodo siguiente.
- **Nadie se asigna un plan desde el navegador.** Las rutas de facturación solo piden cambios a Stripe; el plan cambia por webhook verificado. Además, el rol de base de datos de la aplicación no puede escribir en `subscriptions`.

## 3. Recuperaciones: una métrica, no un consumo

Una **recuperación** es un presupuesto enviado y sin respuesta cuyo cliente responde o acepta en los 30 días siguientes a un seguimiento realizado y verificable. Ese seguimiento puede ser:
- un contacto manual hecho (no las tareas internas);
- un email automático aceptado por el proveedor.

Cuenta una vez por presupuesto (`recovery_events`) y se registra con el estado `recorded`.

**Limitaciones explícitas:**
- La respuesta y su fecha las registra la empresa: Presupio no lee el buzón.
- Es una correlación en el tiempo, no una causalidad. La interfaz lo dice expresamente.

### 3.1. Respuestas con fecha anterior al seguimiento (decisión D4)

**Decisión comercial:** mantener el sistema actual y revisar manualmente los casos sospechosos.

- Una respuesta fechada antes del seguimiento ya registrado **no es una recuperación**. Queda en el historial (`recovery.not_counted`) con:
  - el motivo;
  - la fecha declarada y la del seguimiento;
  - las horas de retroactividad;
  - quién la registró.
- **Revisión manual:**
  - `GET /ops/status` devuelve `review: ['recoveries_backdated_review']`;
  - `npm run ops -- backdated` lista las empresas con casos.
- **Efecto en el cobro:** desde la fase 5, **ninguno**. El consumo se mide en intentos, con la hora del servidor. Una fecha declarada no puede cambiar:
  - los intentos contados;
  - el periodo de facturación;
  - el límite del plan.

  La vía de elusión que había cuando se cobraba por recuperaciones desaparece con la nueva regla.

## 4. Métricas (`GET /api/v1/metrics`, pantalla Resultados)

Todas las cifras salen de consultas a los datos guardados, sin estimaciones. Los meses son naturales en la zona horaria de la empresa.

| Métrica | Cálculo |
|---|---|
| Intentos que consumen tu plan | Intentos `counted` con `sent_at` en el mes |
| Emails automáticos enviados | Seguimientos automáticos aceptados en el mes |
| Recuperaciones | Recuperaciones registradas en el mes (no consumen) |
| Respondieron / aceptados tras un seguimiento | Como en la fase 4 (correlación temporal; importe declarado por la empresa) |
| Últimos seis meses | Incluye la columna «Intentos del plan» |

`GET /api/v1/usage` devuelve:
- `attempts`: usados, en curso, límite, restantes, umbral de aviso, nivel y fecha de agotamiento;
- `automaticEmails`: hoy y límite diario;
- `recoveriesRecorded`: informativo;
- `events`: intentos del periodo.

## 5. Datos de la regla anterior (fase 4)

- **`usage_periods`.** Las columnas `recovery_limit`, `recoveries_counted` y `recoveries_over_limit` se conservan **tal cual** en los periodos existentes, como dato histórico. En los periodos nuevos valen 0 y ya no se modifican.
- **`recovery_events`.** Los estados `counted`, `over_limit` y `no_active_plan` son de la regla anterior. Los nuevos registros son `recorded`.
- **Emails automáticos enviados antes de la migración 0005.** Se registran como intentos `historical`: visibles, pero **sin consumir** ningún periodo.
- **Periodo en curso al desplegar.** Su consumo de intentos empieza en 0. Los envíos anteriores a la migración no se cobran.

Si negocio quisiera cobrar los envíos ya hechos en el periodo en curso, la migración segura propuesta es:
1. un script de operación que cuente los intentos `historical` del periodo vigente;
2. mostrarlos primero en modo de solo consulta;
3. aplicarlos con el rol propietario, empresa por empresa y con aviso.

No se ha aplicado porque podría bloquear de golpe a empresas que, con la regla anterior, no estaban cerca de su límite.

# Decisiones comerciales pendientes de confirmación

> Son **propuestas**. Ninguna cambia precios, ni activa cobros, ni configura impuestos. Cuando se confirmen, se implementan en la fase 5 o antes, según se indica.

| # | Decisión | Estado | Qué hace el código hoy |
|---|---|---|---|
| D1 | Fin de la prueba gratuita: seguimientos detenidos y cuenta en solo lectura | Propuesta, pendiente de confirmar | Detiene el envío automático. **La cuenta sigue editable** (el modo de solo lectura no está implementado) |
| D2 | Business: 300 recuperaciones al mes (provisional) | Propuesta, pendiente de confirmar | Aplica 300 y lo muestra al cliente |
| D3 | IVA incluido o aparte | Pendiente de decisión | No hay impuestos configurados; la pantalla de planes lo indica |
| D4 | Respuestas fechadas antes del seguimiento | Pendiente de decisión | No cuentan, pero quedan registradas para su revisión |

## D1. Fin de la prueba gratuita

**Propuesta:**
1. Al terminar la prueba sin plan contratado, **se detienen los seguimientos automáticos** y la cuenta pasa a **solo lectura**.
2. **Se conservan todos los datos.**
3. La empresa puede:
   - entrar y consultar presupuestos, historial y resultados;
   - **exportar sus datos**;
   - registrar exclusiones y bajas de sus clientes (cumplimiento: nunca debe bloquearse).
4. No puede:
   - crear ni editar presupuestos, contactos o seguimientos;
   - aprobar ni enviar emails;
   - cambiar ajustes.

**Qué hace hoy el código:**
- La prueba dura `TRIAL_DAYS` (14 días por defecto) con los límites de Starter.
- Al terminar (`trial_ends_at` pasado), `hasActiveAccess` devuelve falso y:
  - el motor no programa ni envía nada;
  - las respuestas se registran como `no_active_plan`, sin consumir plan;
  - *Configuración → Plan* y *Envío automático* muestran que no hay plan activo.
- **Pero todo lo manual sigue funcionando sin límite de tiempo.** El modo de solo lectura no existe todavía.

**Cómo se implementaría al confirmarlo** (cambio pequeño, sin tocar la arquitectura):
- Una comprobación en el servidor (`plugins/auth.ts`) que, sin acceso activo, rechace las escrituras con un código propio (p. ej. `403 SUBSCRIPTION_REQUIRED`), salvo:
  - exportación;
  - exclusiones;
  - perfil y contraseña;
  - las rutas públicas de baja y webhooks;
  - en la fase 5, el pago.
- Un aviso permanente en la interfaz con el enlace para contratar (fase 5).
- **Decidir también:**
  - si hay días de gracia;
  - cuánto tiempo se conservan los datos de una cuenta que nunca contrata (propuesta: 90 días, con aviso antes de borrar; ver `docs/operacion.md`).

## D2. Límite del plan Business

**Propuesta:** límite **provisional de 300 recuperaciones por periodo mensual**, sujeto a confirmación, más el límite técnico de 400 emails automáticos al día. Business no es «ilimitado»: es un límite amplio de uso razonable, publicado y sin restricciones ocultas.

**Cómo se comunica hoy al cliente:**
- *Configuración → Plan*: tabla de planes con «Hasta 300 · Uso razonable» y la nota «Business no es ilimitado: su límite de uso razonable está publicado aquí y no hay restricciones ocultas».
- El consumo de una empresa Business se muestra igual que en los demás planes («X de 300»), con aviso al 80 %.

**Pendiente:**
- Confirmar la cifra.
- Redactar la cláusula de uso razonable para las condiciones del servicio (revisión jurídica).
- Si cambia la cifra, se edita en un solo sitio: `apps/api/src/domain/plans.ts`.

## D3. IVA

**Pendiente de decisión** si los precios (27,99 €, 57,99 € y 127,99 €) son **con IVA incluido o IVA aparte**.

- No se ha configurado ningún impuesto ni regla fiscal.
- El catálogo tiene `vatIncluded: null` y la pantalla de planes dice «Pendiente de confirmar si incluyen IVA».
- Antes de la fase 5 hacen falta asesoramiento fiscal (tipo aplicable, facturación conforme a la normativa española vigente, clientes de Canarias, Ceuta y Melilla) y la decisión de usar o no el cálculo de impuestos del proveedor de pagos.

## D4. Respuestas fechadas antes del seguimiento

**El problema** (auditoría técnica):
- La fecha de respuesta del cliente la declara la empresa. Presupio no lee el buzón, así que no puede comprobarla.
- Si una empresa registra una respuesta con fecha anterior al seguimiento, no cuenta como recuperación.
- Eso es correcto cuando el cliente de verdad respondió antes, pero también permite **eludir el límite del plan**.
- Con los datos disponibles **no se pueden distinguir los dos casos.**

**Ya aplicado** (detalle en [`limites-y-metricas.md`](limites-y-metricas.md#11-respuestas-con-fecha-anterior-al-seguimiento)):
- cada caso queda registrado con quién, cuándo y cuánta retroactividad;
- el personal autorizado lo revisa en `/ops/status` y con `npm run ops -- backdated`;
- lo contado nunca se deshace;
- las fechas internas no se pueden fijar desde la API.

**Decisión pendiente: qué fecha manda para cobrar.**

| Opción | Cómo funciona | A favor | En contra |
|---|---|---|---|
| A. La fecha declarada (actual) | Cuenta solo si la fecha declarada es posterior al seguimiento | Fiel a lo que dice la empresa | Permite eludir el límite; solo queda la revisión |
| B. El orden de registro en Presupio | Cuenta si el seguimiento **ya estaba registrado** antes de registrar la respuesta (y en los 30 días previos), declare la fecha que declare | No se puede manipular: usa la hora del servidor | Puede contar de más si alguien registra tarde una respuesta que llegó antes del seguimiento |
| C. Fecha declarada con justificación | Si la fecha es anterior a un seguimiento ya registrado, se exige un motivo escrito; no cuenta, pero queda firmado | Transparente | La elusión sigue siendo posible, aunque visible y atribuible |
| D. B con reclamación | Como B, y la empresa puede pedir a soporte que retire una recuperación con su justificación; soporte la corrige con el rol propietario (ya es posible técnicamente) | Sin elusión y con vía para corregir errores | Necesita un procedimiento de soporte |

**Recomendación: D.**
- Es la única opción en la que el cobro se basa en datos que Presupio puede verificar (el orden de registro en el servidor) y que a la vez deja corregir los errores honestos.
- La fecha declarada se seguiría guardando y mostrando como dato informativo.
- **No se ha aplicado:** cambia qué se cobra y necesita confirmación. Si se confirma, el cambio es acotado:
  - la consulta de atribución de `modules/quotes/service.ts`;
  - sus pruebas;
  - el texto de la definición en la interfaz y la documentación.

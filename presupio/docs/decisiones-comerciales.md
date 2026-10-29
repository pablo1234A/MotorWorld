# Decisiones comerciales

> Estado tras la fase 5. Ningún precio se ha cambiado y no hay cobros reales: Stripe funciona solo en modo de prueba ([`facturacion.md`](facturacion.md)).

| # | Decisión | Estado | Qué hace el código |
|---|---|---|---|
| R1 | **Contar intentos, no recuperaciones** | **Aplicada** (regla obligatoria de la fase 5) | Los planes limitan intentos de seguimiento enviados ([`limites-y-metricas.md`](limites-y-metricas.md)) |
| D1 | Fin de la prueba → solo lectura, datos 90 días con avisos | **Aplicada** | Solo lectura en el servidor y en el worker; avisos a 30, 7 y 1 día; borrado manual tras el plazo |
| D2 | Business: 300 al mes + 400 emails automáticos al día | **Aplicada** como 300 **intentos** | Límites independientes |
| D3 | Precios con IVA incluido cuando corresponda legalmente | **Aplicada solo la presentación**; fiscalidad pendiente | Texto configurable (`PRICES_TAX_DISPLAY`, por defecto «pendiente de validación»). Sin Stripe Tax ni desglose |
| D4 | Respuestas fechadas antes del seguimiento | **Mantener el sistema y revisar a mano** | Siguen sin contar como recuperación y quedan registradas. Con R1 ya no afectan al cobro |

## R1. Intentos en lugar de recuperaciones

**Contradicción detectada en las instrucciones de la fase 5:**
- El apartado de planes dice «hasta 25/65/300 **recuperaciones** al mes» y «no interpretes 300 recuperaciones como 300 emails».
- La regla comercial obligatoria del mismo encargo dice que los límites se aplican a **intentos** y que los textos deben decir «intentos».

**Se ha aplicado la regla obligatoria:**
- 25, 65 y 300 **intentos**;
- el límite diario de 400 emails de Business es un límite **aparte**.

Así se respeta también la advertencia: 300 intentos al mes no son 300 emails al día ni se mezclan con los 400 diarios. Si la intención era otra, hay que confirmarlo.

**Diferencias con el código anterior, identificadas antes de cambiarlo:**

| Aspecto | Antes (fase 4) | Ahora |
|---|---|---|
| Unidad de consumo | Recuperación, registrada por la empresa al marcar una respuesta | Intento: email automático aceptado por el proveedor (hora del servidor) |
| Periodos existentes | — | Conservan sus contadores de recuperaciones como histórico; los intentos empiezan en 0 (apartado 5 de [`limites-y-metricas.md`](limites-y-metricas.md)) |
| Límites diarios de Starter y Pro (60 y 150) | Existían en el código | Se mantienen como límite técnico. **Pendiente de confirmar** si se publican o se quitan |

## D1. Fin de la prueba gratuita

**Aplicado:**
- **Solo lectura:**
  - toda escritura responde `403 SUBSCRIPTION_REQUIRED` salvo las excepciones listadas en [`facturacion.md`](facturacion.md#5-fin-de-la-prueba-y-solo-lectura);
  - siempre se pueden registrar exclusiones o bajas de clientes y exportar los datos.
- **Automatización:** se cancela lo programado y no se envía nada.
- **Conservación:**
  - 90 días desde el fin del acceso, con avisos a los propietarios a 30, 7 y 1 día;
  - **no hay borrado automático**: el borrado es manual y exige que haya pasado el plazo (salvo petición expresa).

**Pendiente:**
- Revisar con asesoría legal si alguna obligación exige conservar algún dato más tiempo.
- Incluir la política en las condiciones del servicio.
- Quien contrata durante la prueba empieza a pagar en ese momento: decidir si se trasladan los días restantes (`trial_end` en Stripe).

## D2. Business

**Aplicado:**
- 300 intentos al mes de uso razonable, publicado como «no ilimitado»;
- 400 emails automáticos al día, aparte.

**Pendiente:** redactar la cláusula de uso razonable (revisión jurídica). Las cifras se cambian en un solo sitio: `apps/api/src/domain/plans.ts`.

## D3. IVA

**Aplicado:**
- La presentación del precio está separada de la configuración fiscal:
  - `PRICES_TAX_DISPLAY=pending` (por defecto) dice «pendiente de validación fiscal; verás el importe exacto en la página de pago»;
  - `included` y `excluded` solo cambian ese texto.
- **No se ha activado Stripe Tax** ni ningún tipo, exención o desglose.

**Pendiente de asesoría fiscal:**
- si los importes incluyen IVA y con qué `tax_behavior` se crean los precios en Stripe;
- clientes de otros países de la UE, Canarias, Ceuta y Melilla;
- requisitos de facturación de la normativa española vigente.

Integrar Stripe no garantiza el cumplimiento fiscal.

## D4. Respuestas fechadas antes del seguimiento

**Decisión:** mantener el sistema actual y revisar manualmente los casos sospechosos.

**Verificación hecha en la fase 5, con código y pruebas:**
- **Periodo y límites.** La fecha declarada **no puede** cambiar retroactivamente los intentos contados, los periodos de facturación ni los límites:
  - los intentos se fechan con la hora del servidor al enviarse;
  - las recuperaciones se registran en el momento de registrarlas;
  - una respuesta fechada en otro mes no crea ni toca periodos pasados.

  Prueba: `plans.test.ts › la fecha declarada no altera…`.
- **Contadores.** Una fecha retroactiva sí puede hacer que una respuesta **no** sea recuperación (no se puede verificar). Desde la fase 5 eso solo afecta a la **métrica** de resultados, no al cobro. Queda registrado para la revisión manual:
  - `recovery.not_counted`;
  - `review` en `/ops/status`;
  - `npm run ops -- backdated`.
- **Coherencia con la migración 0004.** No hay contradicción:
  - los contadores siguen sin poder bajar y los periodos sin poder moverse;
  - la 0005 amplía la misma protección a los intentos (no bajan, el límite de un periodo no baja, un intento contado no se deshace).

  La única excepción nueva es intencionada y acotada: al confirmarse el primer pago, la función `SECURITY DEFINER` del webhook cierra el periodo de la prueba (mes natural) en el inicio del periodo pagado, sin tocar sus contadores. Las correcciones manuales siguen siendo solo del rol propietario.

**Conclusión:** el riesgo de manipular el **cobro** con fechas declaradas queda resuelto por diseño. La exactitud de la **métrica** de recuperaciones sigue dependiendo de lo que registra la empresa: es una limitación inherente, se mantiene la revisión manual acordada.

## Otras decisiones pendientes de confirmar

- **Días de gracia con cobro pendiente:** 7 (`PAST_DUE_GRACE_DAYS`).
- **Cambio de plan en el portal de Stripe:** se recomienda desactivarlo y usar el de Presupio, que aplica las reglas de subida y bajada.
- **Pruebas con credenciales de prueba reales de Stripe:** pendientes.

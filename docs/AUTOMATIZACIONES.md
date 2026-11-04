# RevisaYa — Motor de automatizaciones

> Estado: **diseño (Fase 0)**. Implementación en la Fase 5 (motor) y la Fase 6 (correo).

## 1. Componentes

| Proceso | Frecuencia | Qué hace |
|---|---|---|
| **planner** | cada hora (procesa las sucursales cuya hora local acaba de cruzar el inicio de su ventana de envío) | Calcula qué recordatorios tocan y crea filas `reminders` idempotentes. |
| **dispatcher** | cada minuto | Reclama recordatorios vencidos en lotes, reserva cuota, renderiza y envía, registra el resultado. |
| **reaper** | cada 5 min | Libera recordatorios con `locked_until` vencido (proceso caído) y los devuelve a la cola. |
| **email-webhook** | por evento | Actualiza entregas, rebotes y quejas; alimenta la lista de supresión. |
| **jobs-runner** | cada minuto | Cola genérica: sincronización de Google Calendar, resúmenes al taller, PDFs, exportaciones, purgas. |
| **housekeeping** | diario | Caducar presupuestos, purgar staging y borrados lógicos, retención de logs, avisos de cuota al 80 %/100 %. |

Disparo: `pg_cron` + `pg_net` hacen un `POST` a `/api/internal/jobs/<nombre>` con un secreto en cabecera (comparación en tiempo constante). Así funciona con cualquier hosting. El mismo código de `src/server/jobs` puede ejecutarse como worker Node independiente cuando la escala lo pida. Cada ejecución queda en `job_runs` y avisa a un *dead-man switch* externo: si el planner no informa en 26 h, salta una alerta.

## 2. Planner (por sucursal)

Para cada organización **activa** (suscripción `trialing`/`active`, o `past_due` dentro del periodo de gracia) y cada sucursal con `reminders_enabled = true`:

1. Lee `branch_settings` (offsets, ventana, días de envío, festivos).
2. Selecciona por lotes (keyset, 500 filas) los vehículos `active`, no borrados, cuyo `next_service_date - offset` cae en el horizonte `[hoy, hoy + 2 días]` para algún offset configurado.
3. Para cada combinación `(vehículo, tipo, due_date, offset)` hace `insert … on conflict do nothing` sobre la clave única → **no puede haber duplicados** aunque el planner se ejecute dos veces o en paralelo.
4. Calcula `scheduled_for`: fecha `due_date - offset` en hora local de la sucursal, dentro de la ventana; si cae en un día no permitido o festivo se **adelanta** al día hábil anterior (para que el aviso llegue antes de la revisión, nunca después). Si ese día ya pasó, se envía en la ventana de hoy.
5. **Supersesión**: si la fecha de próxima revisión cambia (nuevo registro de historial o edición), los recordatorios `scheduled` del `due_date` anterior pasan a `canceled` con `skip_reason = superseded`.
6. Comprobaciones que se registran como `skipped` con motivo (no se envían, pero quedan visibles en el panel): cliente sin email, email suprimido, cliente dado de baja, plan sin la funcionalidad, suscripción inactiva.

### 2.1 Recordatorios por kilometraje (Max y superiores)

RevisaYa no lee el cuentakilómetros (sin conexión a la DGT ni telemetría). El PDF pide avisar "cuando un coche supera los kilómetros de la última revisión"; como solo conocemos los km cuando el taller los registra, el sistema **estima**:

- Ritmo diario = diferencia de km / días entre lecturas de `mileage_readings` (mínimo 2 lecturas separadas ≥ 30 días; acotado entre 5 y 300 km/día para descartar errores). Sin datos suficientes: no se genera aviso por km y la ficha lo indica.
- Fecha estimada en la que se alcanzará `next_service_km` (o `last_service_km + default_interval_km`) menos `km_offset_before`.
- Se genera un recordatorio `service_km` con `due_date` = fecha estimada. El correo y el panel lo presentan como **estimación** ("según tu kilometraje habitual").
- Si existe recordatorio por fecha y por km para la misma revisión, se envía **el que ocurra antes** y el otro se cancela (`superseded`), para no avisar dos veces.

Pendiente de aprobación (P6): confirmar este enfoque de estimación.

## 3. Dispatcher

```text
loop (lote ≤ 200, presupuesto de tiempo ≤ 50 s):
  BEGIN
    SELECT … FROM reminders
     WHERE status = 'scheduled' AND scheduled_for <= now()
        OR status = 'retrying' AND next_attempt_at <= now()
     ORDER BY scheduled_for
     LIMIT n FOR UPDATE SKIP LOCKED;          -- varios workers sin pisarse
    UPDATE … SET status='processing', locked_until=now()+'5 min', locked_by=worker, attempts=attempts+1;
  COMMIT
  para cada recordatorio (reparto justo: máx. k por organización y lote):
    revalidar (vehículo activo, email válido, no suprimido, plan activo)   → skipped
    reservar cuota (usage_counters, atómico)                              → skipped/quota_exceeded
    renderizar plantilla (variables escapadas, marca del taller)
    EmailPort.send({ idempotencyKey: reminder.id, … })
      ok        → status='sent', provider_message_id, sent_at, email_logs(accepted)
      temporal  → status='retrying', next_attempt_at = now() + backoff(attempts), cuota liberada
      definitivo→ status='failed', last_error, cuota liberada
    cualquier excepción queda aislada a ESE recordatorio (try/catch), el lote continúa
```

- **Nunca se marca como enviado antes de la respuesta del proveedor.** `sent` significa "aceptado por el proveedor"; `delivered` solo llega por webhook.
- **Idempotencia frente a caídas**: si el proceso muere tras enviar pero antes de guardar, el reaper devuelve el recordatorio a la cola y el reenvío usa la **misma clave de idempotencia** (`reminder.id`), que el proveedor deduplica (Resend la respeta durante 24 h). Además se comprueba `email_logs` por `reminder_id` antes de reenviar.
- **Backoff exponencial con jitter**: 1 min, 5 min, 30 min, 2 h, 6 h (máx. 5 intentos). Errores 4xx no recuperables (dirección inválida, dominio no verificado) no se reintentan.
- **Circuit breaker global**: si el proveedor falla en > 50 % de un lote por errores 5xx/timeout, el dispatcher pausa 5 min sin quemar intentos.
- **Aislamiento entre talleres**: el fallo de un taller (plantilla, dominio, cuota) no afecta al resto; reparto justo para que un taller grande no acapare el lote.
- **Concurrencia**: `SKIP LOCKED` + lease; el planner y el dispatcher pueden ejecutarse en paralelo sin efectos dobles.

## 4. Límite de correos agotado

Propuesta (P5): el recordatorio queda `skipped/quota_exceeded`, visible en el panel; el administrador recibe aviso al 80 % y al 100 %, con opción de mejorar el plan. Si mejora el plan en el mismo mes, los recordatorios saltados cuya fecha aún sea útil se reprograman automáticamente.

## 5. Webhooks del proveedor de correo

`/api/webhooks/email/resend`: verificación de firma (Svix), idempotencia por `provider_event_id`, actualización de `email_logs` y del estado del recordatorio (`delivered`, `bounced`, `complained`). Rebote definitivo o queja → `email_suppressions` y aviso en la ficha del cliente ("email no válido").

## 6. Monitorización

Panel interno (`/admin` de plataforma, Fase 11) y métricas en `job_runs`: recordatorios planificados/enviados/fallidos por ejecución, latencia, tasa de rebote y de queja por organización (alerta si quejas > 0,1 % o rebotes > 4 %, umbrales para proteger la reputación del remitente).

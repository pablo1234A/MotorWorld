# RevisaYa — Motor de automatizaciones

> Estado: **implementado** — motor de recordatorios (Fase 5) y sistema de correos: plantillas, dominio propio, eventos de entrega, avisos de consumo y resúmenes (Fase 6).

Código: `supabase/migrations/20261106000100_reminder_engine.sql` (planificador, reclamación, recuperación) y `src/server/reminders/dispatcher.ts` (envío). Pruebas: `supabase/tests/database/110_reminder_engine.sql`, `tests/integration/dispatcher.test.ts`, `tests/integration/reminders-service.test.ts`, `tests/e2e/reminders.spec.ts`.

## 1. Componentes

| Proceso | Dónde | Frecuencia | Qué hace |
|---|---|---|---|
| **planificador** `private.plan_reminders()` | PostgreSQL (`pg_cron`, job `revisaya-plan-reminders`) | cada hora, minuto 5 | Cancela los avisos obsoletos y crea los que tocan, idempotentes. |
| **dispatcher** `runDispatcher()` | Next.js, `POST/GET /api/internal/jobs/dispatch-reminders` (Vercel Cron) | cada minuto | Reclama lotes, revalida, reserva cuota, renderiza, envía y registra. |
| **recuperación de leases** `private.release_expired_reminder_leases()` | PostgreSQL (`pg_cron`, job `revisaya-release-leases`) | cada 5 min | Devuelve a la cola los avisos de un proceso caído. |
| **mantenimiento del correo** | `/api/internal/jobs/email-maintenance` (Vercel Cron) | cada 30 min | Verifica dominios propios pendientes (72 h) y los verificados (a diario), avisos de consumo al 80 %/100 % y resúmenes al taller. |
| **estado** | `GET /api/internal/jobs/status` (Vercel Cron, monitorización) | cada hora | Últimas ejecuciones; **503** si el planificador lleva > 26 h sin éxito (*dead-man switch*). |
| **purga** `private.purge_expired_data()` | `pg_cron` | diario 03:17 | Retención de datos (Fase 3). |

Los endpoints `/api/internal/jobs/*` exigen `Authorization: Bearer CRON_SECRET` (comparación en tiempo constante, `src/server/jobs/auth.ts`). Sin `CRON_SECRET` (o con menos de 32 caracteres) responden 401 siempre. También permiten lanzar `plan-reminders` y `release-leases` a demanda.

Cada ejecución queda en `private.job_runs` (estado y estadísticas: creados, cancelados, enviados, reintentos, fallidos, reprogramados…).

## 2. Planificador

Se ejecuta cada hora para **todas** las sucursales; cada una usa **su** zona horaria (`branches.timezone` o la de la organización), así que el "hoy" de Canarias y el de la Península se calculan por separado. Horizonte: hoy + 2 días.

Requisitos para planificar en una sucursal: organización y sucursal activas, suscripción activa (`trialing`/`active`, o `past_due` dentro de la gracia), plan con `date_reminders`, `reminders_enabled = true`. Vehículos: `active`, no borrados, cliente no borrado, con `next_service_date` futura o de hoy.

1. **Obsoletos**: los avisos `scheduled`/`retrying` cuyo vehículo ya no está activo, cuya fecha de revisión ha cambiado (nueva revisión registrada o edición) o cuyo ciclo de km ha cambiado pasan a `canceled` con `skip_reason = superseded`.
2. **Avisos por fecha**: para cada offset configurado (p. ej. 30 y 7 días), si `next_service_date − offset` cae entre hoy y el horizonte se inserta un recordatorio. Clave única `(vehículo, tipo, fecha, offset)` + `on conflict do nothing` → **no puede haber duplicados** aunque el planificador se ejecute varias veces o en paralelo (probado).
3. **Aviso perdido** (vehículo dado de alta tarde, importación, planificador parado): si ya pasó la fecha de algún aviso, se crea **uno solo**, el más reciente, y solo si no hay otro aviso previsto en los próximos 3 días (para no mandar dos correos seguidos).
4. **Momento de envío** `private.next_send_slot()`: el día ideal, dentro de la ventana horaria de la sucursal (por defecto 09:00–19:00, lunes a viernes). Si el día ideal no es de envío o es festivo (`blackout_dates`), se **adelanta** al día hábil anterior (que llegue antes de la revisión, nunca después). Si ese día ya pasó, el primer hueco permitido desde ahora. Si ahora está dentro de la ventana, ahora mismo; si ya pasó la ventana de hoy, mañana a la hora de inicio.

### 2.1 Avisos por kilometraje (plan Max o superior, P6)

RevisaYa no lee el cuentakilómetros (sin DGT ni telemetría): **estima** con las lecturas que registra el taller.

- Ritmo diario = diferencia de km entre la última lectura y la anterior separada **≥ 30 días**; solo si está entre **5 y 300 km/día** (descarta errores de tecleo).
- Objetivo: `next_service_km` o, si no hay, `last_service_km + default_interval_km`; se avisa `km_offset_before` km antes (por defecto 1.000).
- Se crea **un** aviso `service_km` por ciclo de mantenimiento (`cycle_anchor` = fecha de la última revisión; índice único). Una nueva revisión abre un ciclo nuevo y cancela el anterior.
- Solo si la fecha estimada llega **antes** que la revisión por fecha (más de 7 días antes) y no se ha enviado ya el aviso por fecha de ese ciclo: nunca dos avisos para la misma revisión.
- El correo lo presenta como estimación ("según el kilometraje habitual de tu vehículo… estimamos que hacia el…").

## 3. Dispatcher

```text
mientras quede presupuesto de tiempo (50 s) y lotes:
  ids = private.claim_reminders(worker, 100, 20)   -- FOR UPDATE SKIP LOCKED, lease 5 min,
                                                    -- reparto justo: ≤ 20 por taller y lote
  para cada id (5 en paralelo, cada uno aislado con try/catch):
    ¿hay email_logs aceptado de un intento anterior? → 'sent' sin reenviar (recuperación)
    revalidar con los datos ACTUALES              → skipped / canceled con motivo
    ¿fuera de la ventana o día sin envíos?        → reprogramar (no gasta intento)
    reservar cuota mensual (app.reserve_usage)    → skipped / quota_exceeded
    renderizar plantilla (variables escapadas, marca del taller)
    EmailPort.send({ idempotencyKey: "reminder-<id>" })
      aceptado   → 'sent' + provider_message_id + email_logs('accepted')
      temporal   → 'retrying' con backoff (cuota liberada)
      definitivo → 'failed' + email_logs('failed') (cuota liberada)
  si > 50 % del lote falla porque el proveedor no responde (5xx/red) → corte del circuito
```

- **"Enviado" solo con confirmación del proveedor** (`provider_message_id`; lo impone también un CHECK). `delivered` llegará por webhook (Fase 6).
- **Revalidación** antes de enviar, en este orden: suscripción, avisos activados, funcionalidad del plan, vehículo/cliente activos (`canceled`), fecha o ciclo cambiados (`canceled/superseded`), cliente dado de baja (`opted_out`), sin correo (`no_email`), dirección suprimida (`suppressed`).
- **Backoff con jitter ±20 %**: 1 min, 5 min, 30 min, 2 h, 6 h; máximo 5 intentos (`max_attempts`). Errores definitivos (4xx de Resend, 5xx de SMTP) no se reintentan.
- **Caídas**: si el proceso muere con avisos en `processing`, a los 5 min la recuperación los devuelve a `retrying` (o `failed` si agotaron intentos). El reintento comprueba `email_logs` y usa la **misma clave de idempotencia** (Resend la respeta 24 h).
- **Aislamiento entre talleres**: un fallo (plantilla, cuota, rebote) solo afecta a ese aviso; el reparto justo evita que un taller grande acapare el lote (probado: el fallo de un taller no detiene los envíos de otro).
- **Corte del circuito**: si el proveedor está caído, el dispatcher para tras el lote en curso; el resto de la cola no gasta intentos.
- **Sin proveedor configurado** (`EMAIL_PROVIDER` vacío) **no se envía ni se simula nada**: los avisos se quedan programados y la ejecución lo registra como `provider_not_configured`.

### 3.1 Contenido del correo

- Plantilla original del PDF (`src/lib/email/reminder-email.ts`, variables `{nombre}`, `{modelo}`, `{matricula}`, `{fecha_revision}`, `{taller}`) o la personalizada del taller si existe (`email_templates`; editor en la Fase 6).
- Todo lo que viene del taller o del cliente se **escapa** en el HTML; el asunto se limpia de saltos de línea (sin inyección de cabeceras).
- Remitente: `"<Taller>" <slug@EMAIL_SHARED_DOMAIN>` (dominio compartido de RevisaYa, P1) o el dominio propio verificado del taller. `Reply-To`: la dirección "Responder a" del taller.
- Botón "Pedir cita": de momento un `mailto:` al taller (la página de citas llega en la Fase 7). Sin dirección de respuesta, sin botón.
- **Baja en un clic**: enlace firmado con HMAC (`EMAIL_LINK_SECRET`) a `/baja/<token>` y cabeceras `List-Unsubscribe` + `List-Unsubscribe-Post` (RFC 8058) hacia `/api/public/unsubscribe/<token>`. La baja marca al cliente, añade la dirección a `email_suppressions` y salta sus avisos pendientes (`opted_out`).

## 4. Límite mensual de correos (P5)

`app.reserve_usage` reserva una unidad de forma atómica (mes natural en la zona del taller). Si el plan no da para más, el aviso queda `skipped/quota_exceeded`, visible en el panel. Si el envío falla, la unidad se libera. Cuentan los avisos y los correos de prueba; no cuentan los correos de RevisaYa al propio taller (resúmenes, avisos de consumo).

- **Avisos de consumo** (Fase 6): al llegar al 80 % y al 100 % se avisa a los administradores, una vez por umbral y mes (`usage_counters.alert_80_sent_at` / `alert_100_sent_at`, reservados de forma atómica; si el correo no sale, se libera y se reintenta).
- **Reprogramación al mejorar el plan o reactivar la suscripción** (trigger `subscriptions_requeue_reminders` → `app.requeue_skipped_reminders`): los avisos saltados por cuota o por suscripción inactiva en los últimos 31 días, cuya revisión todavía no ha pasado, vuelven a la cola con un nuevo momento de envío. Bajar de plan no reprograma nada.

## 5. Panel y configuración (Fase 5)

- `/app/configuracion/avisos` (administradores): activar avisos, días de antelación (hasta 5), ventana horaria, días de envío, festivos y días de cierre, intervalo por defecto (meses/km), avisos por km (Max+), dirección "Responder a". Con la suscripción inactiva, solo lectura.
- `/app/recordatorios` (permiso `reminders.read`): resumen (pendientes, enviados este mes, problemas en 30 días, correos usados/límite), filtros por estado y búsqueda, motivo de cada aviso no enviado, y **cancelar** un aviso pendiente (solo administradores; RLS solo permite pasar a `canceled/canceled_by_user`).

## 6. Eventos de entrega (Fase 6)

`POST /api/webhooks/email/resend` (firma Svix obligatoria, ver INTEGRACIONES §2.6) → `private.apply_email_event`:

- **Idempotente**: el identificador del evento (`svix-id`) es único; el segundo envío responde `duplicate`.
- **Sin retroceder**: `accepted < delivery_delayed < delivered < bounced < complained`. Un "entregado" que llega tarde no deshace un rebote (`stale`).
- **Supresión automática**: rebote definitivo → `hard_bounce`; queja → `complaint`. Los siguientes avisos a esa dirección quedan `skipped/suppressed`. Un rebote temporal no suprime (se trata como retraso).
- El recordatorio refleja el estado (`delivered`, `bounced`, `complained`) en el panel. No se guardan direcciones ni contenido en el evento.
- Aperturas y clics no se procesan (P8: desactivado hasta revisión jurídica).
- Con SMTP no hay eventos de entrega: el estado se queda en "Enviado" (aceptado por el servidor).

## 7. Resumen al taller (Fase 6)

Por sucursal, `digest_frequency` = `daily` (cada día) o `weekly` (lunes), a partir de las **08:00** de su zona horaria, a los administradores con acceso a esa sucursal. Contenido: avisos enviados y entregados, con problemas, no enviados por falta de correo, por baja o bloqueo, por límite del mes, avisos programados y vehículos con la revisión vencida. Uno por periodo (`private.digest_runs`); si no hay nada que contar no se envía. Remitente: `"RevisaYa" <no_reply@EMAIL_SHARED_DOMAIN>` (el `_` no puede aparecer en el slug de un taller).

## 8. Pendiente (fases siguientes)

- Métricas de reputación por organización (alerta si quejas > 0,1 % o rebotes > 4 %): Fase 11.
- Eventos de entrega con Amazon SES (SNS): solo si se usa SES en producción.

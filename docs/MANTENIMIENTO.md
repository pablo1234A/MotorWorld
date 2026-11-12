# Mantenimiento

## Operación diaria

| Qué revisar | Dónde |
|---|---|
| Salud del servicio | `GET /api/health` (configura un monitor externo que alerte si no responde 200) |
| Errores de la aplicación | Logs de Vercel: líneas JSON con `"level":"error"` (eventos `api.unhandled_error`, `generation.failed`, `job.item_failed`, `stripe.webhook_failed`, `rate_limit.db_error`) |
| Trabajos masivos fallidos y webhooks fallidos | Panel `/admin/trabajos` |
| Consumo y planes | `/admin/consumo`, `/admin/espacios` |
| Mensajes de contacto | `/admin/mensajes` |
| Acciones relevantes | `/admin/auditoria` |
| Estado de la base de datos | Supabase → Reports y Advisors |

## Tareas periódicas

- **Limpieza de importaciones abandonadas** (CSV subidos sin confirmar). Con `service_role`, por ejemplo mensualmente:
  ```sql
  delete from storage.objects where bucket_id = 'imports' and created_at < now() - interval '2 days';
  ```
- **Rate limit**: la tabla `rate_limit_buckets` se purga sola (entradas de más de un día). Puede vaciarse sin riesgo.
- **Auditoría y eventos de Stripe**: define un plazo de conservación (por ejemplo, 12–24 meses) y purga con `delete … where created_at < …` según tu política legal.
- **Dependencias**: `pnpm outdated` mensual; actualiza, ejecuta `pnpm check`, integración y E2E antes de desplegar.
- **Copias de seguridad**: verifica que se generan y prueba una restauración trimestral (ver DESPLIEGUE.md).

## Cambios de esquema

1. `pnpm exec supabase migration new descripcion` crea un archivo en `supabase/migrations/`.
2. Escribe SQL idempotente cuando sea posible. Todas las tablas nuevas con datos privados deben tener `enable row level security`, políticas basadas en `is_workspace_member`/`can_edit_workspace` y privilegios explícitos (por defecto no se concede nada a `authenticated`).
3. `pnpm db:reset` en local, `pnpm db:types` para regenerar tipos, pruebas.
4. `pnpm db:push` contra producción. **Nunca** edites una migración ya aplicada: crea otra.

## Tareas habituales

| Tarea | Cómo |
|---|---|
| Cambiar límites o precio informativo de un plan | `/admin/planes` (se aplica al instante; la página pública de precios se refresca en ≤ 5 min) |
| Asignar un plan sin cobro | `/admin/espacios` → Cambiar plan (con motivo, queda auditado) |
| Desactivar una cuenta | `/admin/usuarios` → Desactivar (exige causa; bloquea login y acceso a datos al instante) |
| Conceder/retirar administrador | `pnpm admin:grant correo [--revoke]` |
| Añadir una categoría o atributo del sistema | Nueva migración con `insert into categories/category_attributes` (ver `20261110000400_reference_data.sql`) |
| Ajustar un perfil de marketplace | `src/domain/marketplaces/profiles.ts` + pruebas |
| Activar la IA | `AI_PROVIDER=anthropic`, `ANTHROPIC_API_KEY`, opcional `AI_MODEL`; revisa la política de privacidad (encargado del tratamiento) |
| Activar pagos | docs/STRIPE.md |

## Incidencias frecuentes

| Síntoma | Causa probable | Solución |
|---|---|---|
| Los correos de confirmación no llegan | SMTP integrado de Supabase limitado / plantillas no copiadas | Configura SMTP propio y las plantillas (DESPLIEGUE.md §1) |
| El enlace del correo lleva a «enlace no válido» | Enlace caducado (1 h) o ya usado, o *Site URL* mal configurada | Revisa *Site URL* y vuelve a solicitarlo |
| Un trabajo masivo se queda «Procesando» | El usuario cerró la pestaña | Lo retoma el cron (cada 10 min) o el usuario con «Reanudar»; los elementos bloqueados se liberan a los 5 min |
| «Has alcanzado el límite» antes de tiempo | Periodo de Stripe distinto del mes natural, o reintentos con claves nuevas | Revisa `/admin/consumo` del espacio |
| `/api/health` → `database: false` | Proyecto de Supabase pausado o claves incorrectas | Reactiva el proyecto / revisa variables |
| Panel de administración no disponible | Falta `SUPABASE_SERVICE_ROLE_KEY` o el usuario no está en `platform_admins` | `pnpm check:env`, `pnpm admin:grant` |

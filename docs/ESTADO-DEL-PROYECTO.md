# RevisaYa — Estado del proyecto

> Se actualiza al cerrar cada fase. Solo figura como "pasa" lo que se ha ejecutado de verdad.

## Resumen

| Fase | Estado | Fecha |
|---|---|---|
| 0 — Auditoría y planificación | ✅ Completada y **aprobada** (ADR-001…015, P1–P20) | 2026-11-04 |
| 1 — Infraestructura y base de datos | ✅ Completada (pendiente de revisión) | 2026-11-04 |
| 2 — Backend y autenticación | ⏭ Siguiente | — |
| 3 — Clientes, vehículos e historial | ⏸ No iniciada | — |
| 4 — Importación Excel/CSV | ⏸ No iniciada | — |
| 5 — Motor de automatizaciones | ⏸ No iniciada | — |
| 6 — Sistema de correos | ⏸ No iniciada | — |
| 7 — Citas y presupuestos | ⏸ No iniciada | — |
| 8 — Suscripciones y límites (Stripe TEST) | ⏸ No iniciada | — |
| 9 — Google Calendar, informes y API | ⏸ No iniciada | — |
| 10 — Frontend completo | ⏸ No iniciada | — |
| 11 — Seguridad y testing global | ⏸ No iniciada | — |
| 12 — Preparación para producción | ⏸ No iniciada | — |

---

## Fase 1 — Infraestructura y base de datos

### Qué se ha construido
- **Proyecto**: Next.js 16.4 + React 19 + TypeScript estricto + Tailwind 4, pnpm, ESLint. La web MOTORWORLD previa se ha movido sin cambios a `legacy/motorworld/` (P14).
- **Supabase local** (`supabase/config.toml`): PostgreSQL 17, Auth con verificación de email obligatoria, contraseñas de ≥ 10 caracteres con mayúsculas, minúsculas y números, reautenticación para cambiar la contraseña, Data API desactivada (ADR-003).
- **14 migraciones SQL** versionadas (`supabase/migrations/`, índice en [BASE-DE-DATOS §7](BASE-DE-DATOS.md#7-implementación-fase-1)): 45 tablas con RLS forzada, FK compuestas de tenencia, tenencia inmutable, límites del plan con bloqueo, reserva atómica de correos, numeración de presupuestos, máquinas de estado de citas y presupuestos, auditoría automática, buckets de Storage privados y una migración de verificación que falla si algo queda sin proteger.
- **Servidor** (`src/server/`): conexión con contexto RLS por transacción (`withRls` / `withSystem`), traducción de errores de BD a errores de dominio, validación del entorno con bloqueo de claves LIVE de Stripe.
- **Compartido** (`src/lib/`): normalización/validación de matrículas, catálogo tipado de planes.
- **Configuración**: `.env.example` documentado, scripts `pnpm db:*`, `pnpm test:*`, `pnpm check`, workflow de CI (`.github/workflows/ci.yml`).

### Qué funciona (verificado)
- Las migraciones se aplican desde cero sin errores (`pnpm db:reset`) y la migración `1400_hardening` confirma: todas las tablas con RLS forzada, `anon` solo lee `plans`, esquema `private` inaccesible, todas las funciones SECURITY DEFINER con `search_path` fijo.
- Los 10 casos críticos del encargo tienen cobertura a nivel de base de datos (ver tabla de pruebas).

### Pruebas ejecutadas (2026-11-04, todas en verde)

| Comando | Resultado |
|---|---|
| `pnpm db:reset` | 14/14 migraciones aplicadas |
| `pnpm db:test` (pgTAP) | **175/175** tests en 10 archivos |
| `pnpm test` (Vitest 5.1) | **35/35** (24 unitarios + 11 de integración) |
| `pnpm typecheck` | sin errores |
| `pnpm lint` | sin errores |
| `pnpm build` | correcto |
| `pnpm audit` | 0 vulnerabilidades (tras actualizar Vitest y forzar `minimatch`; ver ADR-021) |

Cobertura de los casos críticos:

| # | Caso | Prueba |
|---|---|---|
| 1 | Un taller no puede ver/modificar datos de otro | `010_tenant_isolation.sql` (36 tests, 19 tablas) + `rls-context.test.ts` |
| 2 | Un operario no puede hacer acciones de administrador | `020_roles_permissions.sql` (27 tests) |
| 3 | No se pueden duplicar recordatorios | `050_reminders_email.sql` + 10 planificadores simultáneos en `concurrency.test.ts` |
| 4 | No se pueden superar los límites del plan | `040_plan_limits.sql` (29 tests) + altas y reservas de correo simultáneas |
| 5 | Importación incorrecta sin registros parciales | Base preparada (staging + rollback de transacción probado en `rls-context.test.ts`); la confirmación de importación se prueba en la Fase 4 |
| 6 | Un error de correo no detiene otros envíos | Fase 5 (motor) |
| 7 | Webhook duplicado no duplica operaciones | Unicidad de `email_events` y `stripe_events` probada; procesadores en Fases 6 y 8 |
| 8 | La cancelación se refleja | Acceso de solo lectura con suscripción cancelada probado en `040`; webhook de Stripe en Fase 8 |
| 9 | Los vehículos mantienen su historial | `060_vehicle_history.sql` (15 tests) |
| 10 | Las sucursales permanecen aisladas | `030_branch_isolation.sql` (12 tests) |

**Pruebas de mutación** (para comprobar que los tests detectan fallos reales):
- Al abrir la política de lectura de clientes (`using (true)`), fallan 5 tests de aislamiento entre talleres y sucursales.
- Al quitar el bloqueo del límite, el test de concurrencia falla: entran 10 clientes de 5 posibles. La primera versión del test **no** lo detectaba porque las transacciones no llegaban a solaparse; se corrigió forzando el solapamiento.

### Errores encontrados y corregidos durante la fase
- `app.verify_quote_totals` fallaba al validar un presupuesto (PL/pgSQL evaluaba `new.quote_id` en la tabla `quotes`). Corregido y cubierto por test.
- Una línea de presupuesto podía cambiar de `quote_id`: ahora el UPDATE se concede solo por columnas, sin `quote_id`.

### Errores pendientes
- Ninguno conocido.

### Dependencias que faltan (se añadirán en su fase)
- Kysely + kysely-codegen (Fase 2), `@supabase/ssr` (Fase 2), ExcelJS/PapaParse (Fase 4), Resend/React Email (Fase 6), decimal.js y @react-pdf/renderer (Fase 7), Stripe (Fase 8), googleapis (Fase 9).

### Credenciales que deben configurarse
- **Ninguna para la Fase 1** (todo funciona con Supabase local).
- Para la Fase 2 (staging): proyecto Supabase en región UE → `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`, `DATABASE_URL`. Se configuran como secretos del hosting, nunca en el código.

### Notas de entorno
- En este entorno de desarrollo, las imágenes de Supabase se descargan de Docker Hub porque el registro de AWS está bloqueado por el proxy (ADR-020). En CI se usa el registro por defecto.

### Siguiente fase
**Fase 2 — Backend y autenticación**: registro con creación de organización y sucursal principal, login, logout, verificación de email, recuperación y cambio de contraseña, sesiones con `@supabase/ssr`, protección de rutas, invitaciones (crear, aceptar, revocar) respetando el límite de usuarios, guards `requireMember`/`requireRole`/`requirePermission`, servicios con validación zod, Kysely con tipos generados, errores tipados y auditoría.

---

## Fase 0 — Auditoría y planificación

Completada y aprobada el 2026-11-04. Informe: [FASE-0-INFORME](FASE-0-INFORME.md).

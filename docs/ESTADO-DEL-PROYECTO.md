# RevisaYa — Estado del proyecto

> Se actualiza al cerrar cada fase. Solo figura como "pasa" lo que se ha ejecutado de verdad.

## Resumen

| Fase | Estado | Fecha |
|---|---|---|
| 0 — Auditoría y planificación | ✅ Completada y **aprobada** (ADR-001…015, P1–P20) | 2026-11-04 |
| 1 — Infraestructura y base de datos | ✅ Completada | 2026-11-04 |
| 2 — Backend y autenticación | ✅ Completada | 2026-11-05 |
| 3 — Clientes, vehículos e historial | ✅ Completada (incluidos sus pendientes: purga y papelera) | 2026-11-05 |
| 4 — Importación Excel/CSV | ✅ Completada (pendiente de revisión) | 2026-11-05 |
| 5 — Motor de automatizaciones | ⏭ Siguiente | — |
| 6 — Sistema de correos | ⏸ No iniciada | — |
| 7 — Citas y presupuestos | ⏸ No iniciada | — |
| 8 — Suscripciones y límites (Stripe TEST) | ⏸ No iniciada | — |
| 9 — Google Calendar, informes y API | ⏸ No iniciada | — |
| 10 — Frontend completo | ⏸ No iniciada | — |
| 11 — Seguridad y testing global | ⏸ No iniciada | — |
| 12 — Preparación para producción | ⏸ No iniciada | — |

---

## Fase 4 — Importación Excel/CSV

### Qué se ha construido
Flujo completo del PDF (§3) y del encargo (§8) — detalle en [IMPORTACION](IMPORTACION.md):
1. **Plantilla** descargable en `.xlsx` (hoja «Clientes» con formatos de fecha y texto, fila de ejemplo y hoja «Instrucciones») y `.csv` (`;` + BOM para el Excel en español).
2. **Subida** de `.xlsx` o `.csv` (máx. 5 MB y 2.000 filas) con detección de cabeceras propias del taller («Correo», «Placa», «Km»…), CSV en UTF-8 o Windows-1252 y fechas nativas de Excel.
3. **Validación de cada fila** sin guardar nada: emails inválidos, matrículas incorrectas o poco habituales, fechas imposibles o futuras, años de dos cifras, km negativos o con decimales, filas vacías, fila de ejemplo, campos obligatorios vacíos, matrículas repetidas en el archivo, vehículos que ya existen (se omiten), clientes que ya existen (se vinculan), mismo cliente en varias filas (se agrupa por correo).
4. **Corrección**: editar la fila en pantalla (se revalida todo el lote), excluir filas, aceptar filas sin correo; o corregir el archivo y volver a subirlo.
5. **Informe de errores** descargable (CSV y Excel) con la fila, los datos originales, errores y avisos.
6. **Resumen** (clientes nuevos, existentes, vehículos, omitidas) y **comprobación previa de límites del plan**.
7. **Confirmación atómica** (`app.commit_import`): todo o nada; aviso y confirmación expresa si el archivo ya se importó; doble clic o doble envío no duplican.
8. **Historial** de importaciones y descarte de una importación (borra el staging).

### Pruebas ejecutadas (2026-11-05, desde base de datos nueva, todas en verde)

| Comando | Resultado |
|---|---|
| `pnpm db:test` (pgTAP) | **216/216** |
| `pnpm test` (Vitest) | **153/153** (nuevos: `imports.test.ts` unitario, 33; `imports.test.ts` de integración, 9; `trash.test.ts`, 5) |
| `pnpm test:e2e` (Playwright) | **18/18** (nuevos: importación completa con corrección en pantalla, informe y archivo repetido; archivo no válido) |
| `pnpm typecheck` · `pnpm lint` · `pnpm build` · `pnpm audit` | sin errores · 0 vulnerabilidades |

**Caso crítico 5** (una importación incorrecta no deja registros parciales): probado con un fallo por límite del plan y con un fallo a mitad de transacción (matrícula registrada por otro usuario entre validación y confirmación, después de haberse insertado ya los clientes): en ambos, 0 fichas nuevas. Rendimiento: 2.000 filas en ~1,3 s en total.

### Errores encontrados y corregidos durante la fase
- La detección automática de separador de PapaParse fallaba con pocas columnas: sustituida por una detección propia (con test).
- Los JSON de la revalidación se serializaban dos veces (se habrían guardado como texto): corregido antes de ejecutarse, cubierto por los tests de corrección de filas.
- La confirmación necesitaba permiso de columna sobre `id` para enlazar clientes y vehículos: concedido (ADR-033).

### Pendiente (documentado)
- Programación automática de avisos para las fichas importadas → Fase 5 (el motor leerá `next_service_date`, ya calculada).
- Importación con «actualizar los datos de un vehículo existente» en lugar de omitirlo: fuera del alcance actual (IMPORTACION R7).

### Siguiente fase
**Fase 5 — Motor de automatizaciones**: planificador diario por zona horaria con ventanas de envío y festivos, recordatorios idempotentes, dispatcher con cola, lease, reintentos con backoff, reparto justo por taller, recuperación tras caídas, avisos por kilometraje estimado (Max+), monitorización.

---

## Fase 3 — Clientes, vehículos e historial

### Qué se ha construido
- **Clientes** (`/app/clientes`): listado con búsqueda por nombre, correo, teléfono o matrícula, filtros (taller, con/sin correo), orden y paginación en servidor; alta con aviso de posible duplicado (mismo correo o teléfono) que exige confirmación; ficha con edición, vehículos, historial de todos sus vehículos y baja de avisos; borrado seguro (si tiene vehículos, hay que marcar que se borran también; todo en una transacción; el historial se conserva).
- **Vehículos** (`/app/vehiculos`): listado con búsqueda por matrícula, marca/modelo, bastidor o propietario y filtros de próxima revisión (vencida, 30 días, 90 días, sin fecha), estado y taller; alta desde la ficha del cliente con su última revisión opcional; ficha individual con matrícula, marca, modelo, bastidor, propietario, kilómetros, última y próxima revisión e historial completo; edición, estado (activo, inactivo, vendido, dado de baja), lecturas de kilómetros (una lectura menor exige confirmar el cambio de cuentakilómetros), próxima revisión manual, cambio de propietario con buscador (el historial se queda con el vehículo) y borrado.
- **Historial** (`/app/historial` y en cada ficha): revisiones con fecha, kilómetros, trabajos, piezas (descripción, referencia, cantidad con coma decimal), observaciones, próxima revisión recomendada, propietario en ese momento y quién la registró; edición (sustituye las piezas) y borrado solo para administradores. Cada cambio recalcula la ficha del vehículo.
- **Panel**: revisiones vencidas, en los próximos 30 días, vehículos sin próxima revisión y clientes sin correo (con enlace al listado filtrado).
- **Servidor**: servicios `customers`, `vehicles`, `maintenance`, `branches`; Server Actions con comprobación de permiso; endpoint `GET /api/app/customers/search` (con sesión, RLS); validación compartida (teléfonos a E.164, fechas reales, km, bastidor, matrícula); modo de solo lectura cuando no hay plan activo.

### Pruebas ejecutadas (2026-11-05, desde base de datos nueva, todas en verde)

| Comando | Resultado |
|---|---|
| `pnpm db:test` (pgTAP) | **197/197** |
| `pnpm test` (Vitest) | **106/106** (nuevos: `workshop.test.ts` 23 unitarios; `workshop-services.test.ts` 16 de integración) |
| `pnpm test:e2e` (Playwright) | **16/16** (nuevos: ficha completa cliente → vehículo → revisión con piezas → km → búsqueda → historial; duplicados, vencidas, matrícula repetida y borrado seguro; modo de solo lectura) |
| `pnpm typecheck` · `pnpm lint` · `pnpm build` · `pnpm audit` | sin errores · 0 vulnerabilidades |

Casos críticos reforzados en esta fase: **1** (otro taller no ve, edita ni borra clientes ni historial, ni falsificando el contexto), **2** (operario: consulta sí; escribir y borrar según permisos), **9** (cambio de propietario y borrado conservan el historial), **10** (operario limitado a una sucursal solo lista y crea en la suya).

### Errores encontrados y corregidos durante la fase
- **Mensaje engañoso al borrar**: un operario sin permiso para borrar vehículos recibía "el cliente tiene vehículos" porque RLS filtra el UPDATE en silencio. Ahora es "sin permiso" (ADR-032). Los datos nunca se modificaban: la transacción se revertía.
- **Ids de campo duplicados** cuando una página tiene varios formularios (las etiquetas apuntaban al campo equivocado; problema de accesibilidad): ids únicos con `useId`.
- **Cantidades con coma decimal** ("4,5") se leían como no válidas: normalizadas.

### Pendientes de la fase, completados después (2026-11-05)
- **Purga definitiva a los 30 días** (`private.purge_expired_data`, migración `20261105000200_retention_purge.sql`), programada a diario con `pg_cron` (03:17 UTC): elimina clientes y vehículos borrados hace más de 30 días con su historial, recordatorios y presupuestos del cliente; conserva desvinculados citas, registros de correo y presupuestos de clientes activos; purga el staging de importaciones (7 días) y los contadores de rate limiting; deja un evento de auditoría por taller (solo recuentos) y la ejecución en `job_runs`. La excepción a las protecciones de usuario solo se activa dentro de la función del sistema (probado). Tests: `100_retention_purge.sql` (19).
- **Papelera** (`/app/papelera`, enlazada desde Clientes): clientes y vehículos borrados en los últimos 30 días con fecha de eliminación definitiva; restaurar un cliente recupera los vehículos borrados con él; vuelve a comprobar límites del plan y matrícula única; exige el permiso de borrado. Tests: `trash.test.ts` (5) y paso E2E.
- La importación pasa a la Fase 4.

### Siguiente fase
Fase 4 (completada, ver arriba).

---

## Fase 2 — Backend y autenticación

### Qué se ha construido
- **Autenticación** (Supabase Auth + `@supabase/ssr`): registro con verificación de email obligatoria, inicio y cierre de sesión, cierre de sesión en todos los dispositivos, recuperación de contraseña por correo, cambio de contraseña exigiendo la actual, reenvío del correo de verificación. Correos de Auth en español con enlaces `token_hash` que funcionan desde otro dispositivo (ADR-022).
- **Sesiones y protección de rutas**: `src/proxy.ts` refresca la sesión y redirige las zonas privadas sin sesión; cada página, Server Action y Route Handler vuelve a verificar en servidor (`src/server/auth/guards.ts`).
- **Organizaciones**: alta de taller con sucursal principal y propietario en una transacción (`app.create_organization`), dirección pública automática, zona horaria (Península/Canarias), máximo 5 talleres por usuario, selector de taller activo validado contra las membresías reales.
- **Usuarios, roles y permisos**: administrador / operario con 10 permisos asignables y alcance por sucursales; gestión desde `/app/usuarios` (invitar, nuevo enlace, anular, editar permisos, suspender, reactivar, eliminar) con confirmaciones; propietario protegido.
- **Invitaciones**: enlace de un solo uso (256 bits, solo el hash en BD, 7 días), aceptación con email verificado y coincidente (`app.accept_invitation`), respeto del límite de usuarios del plan (pendientes incluidas).
- **Capa de servidor**: Kysely con tipos generados (`pnpm db:types`), servicios por módulo (`src/server/modules/*`), resultado uniforme de acciones con errores en español, validación zod compartida cliente/servidor, rate limiting en PostgreSQL, logger con redacción de datos sensibles, cabeceras de seguridad.
- **Pantallas funcionales** (P15): inicio, registro, acceso, recuperación, verificación, contraseña nueva, alta de taller, panel con contadores reales y estado del plan, usuarios, mi cuenta, invitación. Ningún botón sin backend.
- **Migración** `20261105000100_auth_functions.sql` (alta de talleres, invitaciones, validación de sucursales de la invitación, INSERT de invitaciones por columnas).

### Pruebas ejecutadas (2026-11-05, desde base de datos nueva, todas en verde)

| Comando | Resultado |
|---|---|
| `pnpm db:reset` | 15/15 migraciones |
| `pnpm db:test` (pgTAP) | **197/197** (11 archivos; nuevo `090_auth_functions.sql`, 22 tests) |
| `pnpm test` (Vitest) | **67/67** (9 archivos; nuevos: servicios de miembros y alta de taller, utilidades de auth) |
| `pnpm test:e2e` (Playwright) | **13/13**: registro → correo → verificación → alta de taller; acceso; sin verificar no entra; validación de servidor; credenciales incorrectas; recuperación de contraseña; enlace manipulado; rate limiting; redirección abierta; cambio de contraseña; invitación de operario de principio a fin; invitación para otro correo; límite Pro; sin plan no se invita |
| `pnpm typecheck` · `pnpm lint` · `pnpm build` | sin errores |
| `pnpm audit` | 0 vulnerabilidades |

Caso crítico 2 (operario ≠ administrador) cubierto ahora también de extremo a extremo: el operario no ve "Usuarios", la URL directa lo rechaza, el servicio lo rechaza y, con un contexto falsificado como administrador, lo rechaza la base de datos.

### Errores encontrados y corregidos durante la fase
- `buttonClass` se exportaba desde un módulo de cliente y se usaba en Server Components: el build lo detectó; se separó en `button-styles.ts`.
- Lectura de la sesión durante el prerender de Next (`Date.now()` en la verificación del JWT): corregido con `connection()` (ADR-023).
- El mensaje "enlace caducado" no era fiable (Supabase no distingue caducado de inventado): ahora hay un único mensaje honesto.
- Las invitaciones permitían al administrador escribir `accepted_at`: INSERT restringido por columnas.
- Los tests pgTAP dependían de una base de datos vacía: ahora acotan sus consultas y usan identificadores únicos.

### Pendiente (documentado, con su fase)
- Envío automático por correo de las invitaciones → Fase 6 (hoy el administrador copia el enlace; ADR-024).
- Aceptación de condiciones y privacidad en el registro → Fase 10 con los textos legales (ADR-025).
- 2FA para administradores y CSP con nonces → Fase 11.
- Contratación de plan desde el panel → Fase 8 (Stripe TEST). Hasta entonces una organización nueva queda en solo lectura, y lo indica.

### Credenciales que deben configurarse
- Ninguna nueva para desarrollo local. Para staging: proyecto Supabase (UE) con la configuración de Auth de [DESPLIEGUE §2](DESPLIEGUE.md) (Site URL, Redirect URLs, plantillas, SMTP propio).

### Siguiente fase
Fase 3 (completada, ver arriba).

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
| 5 | Importación incorrecta sin registros parciales | `tests/integration/imports.test.ts` (fallo por límite y fallo a mitad de transacción ⇒ 0 fichas) |
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
Fase 2 (completada, ver arriba).

---

## Fase 0 — Auditoría y planificación

Completada y aprobada el 2026-11-04. Informe: [FASE-0-INFORME](FASE-0-INFORME.md).

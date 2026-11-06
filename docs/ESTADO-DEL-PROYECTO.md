# RevisaYa — Estado del proyecto

> Se actualiza al cerrar cada fase. Solo figura como "pasa" lo que se ha ejecutado de verdad.

## Resumen

| Fase | Estado | Fecha |
|---|---|---|
| 0 — Auditoría y planificación | ✅ Completada y **aprobada** (ADR-001…015, P1–P20) | 2026-11-04 |
| 1 — Infraestructura y base de datos | ✅ Completada | 2026-11-04 |
| 2 — Backend y autenticación | ✅ Completada | 2026-11-05 |
| 3 — Clientes, vehículos e historial | ✅ Completada (incluidos sus pendientes: purga y papelera) | 2026-11-05 |
| 4 — Importación Excel/CSV | ✅ Completada | 2026-11-05 |
| 5 — Motor de automatizaciones | ✅ Completada | 2026-11-06 |
| 6 — Sistema de correos | ✅ Completada (pendiente de revisión) | 2026-11-06 |
| 7 — Citas y presupuestos | ⏭ Siguiente | — |
| 8 — Suscripciones y límites (Stripe TEST) | ⏸ No iniciada | — |
| 9 — Google Calendar, informes y API | ⏸ No iniciada | — |
| 10 — Frontend completo | ⏸ No iniciada | — |
| 11 — Seguridad y testing global | ⏸ No iniciada | — |
| 12 — Preparación para producción | ⏸ No iniciada | — |

---

## Fase 6 — Sistema de correos

### Qué se ha construido
Detalle en [INTEGRACIONES §2](INTEGRACIONES.md) y [AUTOMATIZACIONES §4–7](AUTOMATIZACIONES.md).
1. **Plantillas editables** (`/app/configuracion/plantillas`, todos los planes): asunto, texto, botón sí/no y su texto, para el aviso por fecha y por kilometraje; variables insertables con un clic; vista previa en vivo con el próximo vehículo real del taller (o datos de ejemplo); validación de variables desconocidas; **correo de prueba** real al administrador (máx. 20/día, cuenta en el consumo); **restaurar la plantilla original**. Los avisos usan la plantilla guardada.
2. **Dominio propio** (`/app/configuracion/correo`): alta en el proveedor (Resend, región UE), registros DNS exactos, "Comprobar ahora" y comprobación automática (72 h los pendientes; a diario los verificados). Solo un dominio **verificado** puede ser remitente; si deja de estarlo, la sucursal vuelve sola al remitente compartido. Se rechazan Gmail, Hotmail y similares.
3. **Remitente por sucursal** (compartido con el nombre del taller, P1, o dominio propio) y **resumen para el taller** (no / diario / semanal).
4. **Eventos de entrega** (webhook de Resend con firma Svix): entregado, retraso, rebote y queja; idempotentes y sin retroceder aunque lleguen desordenados; rebote definitivo o queja → la dirección se bloquea y los siguientes avisos no se envían.
5. **Direcciones bloqueadas**: lista con el motivo; bloqueo y desbloqueo manual (los rebotes, quejas y bajas no se pueden desbloquear desde el panel).
6. **Avisos de consumo** al 80 % y al 100 % del límite mensual, una vez por umbral y mes; **reprogramación automática** de los avisos saltados por cuota al mejorar el plan o reactivar la suscripción (P5).
7. **Resumen diario o semanal** para los administradores (a partir de las 08:00 locales): enviados, entregados, con problemas, no enviados por motivo, programados y revisiones vencidas.
8. **Configuración** agrupada en `/app/configuracion` (Avisos, Plantillas, Correo, Usuarios).
9. **Slugs reservados** (`postmaster`, `abuse`, `admin`…), porque el slug es el buzón del taller en el dominio compartido.

### Pruebas ejecutadas (2026-11-06, desde base de datos nueva, todas en verde)

| Comando | Resultado |
|---|---|
| `pnpm db:test` (pgTAP) | **275/275** (nuevo: `120_email_system.sql`, 30: slugs reservados, eventos entregado/retraso/rebote/queja, duplicados, desorden, supresión, reprogramación al mejorar el plan y al reactivar) |
| `pnpm test` (Vitest) | **225/225** (nuevos: `email-system.test.ts` 15 unitarios — firma Svix, eventos, plantillas, dominios, adaptador con `fetch` simulado —; `email-system.test.ts` 10 de integración; slug reservado al crear un taller) |
| `pnpm test:e2e` (Playwright) | **22/22** (nuevos: plantilla con vista previa, validación, guardado, **prueba real por SMTP a Mailpit** y restaurar; remitente, resumen, direcciones bloqueadas y webhook firmado/no firmado/duplicado por HTTP) |
| `pnpm typecheck` · `pnpm lint` · `pnpm build` · `pnpm audit` | sin errores · 0 vulnerabilidades |

Casos críticos reforzados: **7** (un webhook duplicado no duplica operaciones: por SQL, por el servicio y por HTTP), **1/2** (otro taller no ve ni cambia plantillas, dominios ni bloqueos; un operario no puede, ni falsificando su rol en el contexto).

### Errores encontrados y corregidos durante la fase
- **Seguridad**: el alta de dominio y el correo de prueba escriben con la conexión del sistema; la comprobación de administrador estaba solo en la acción. Un test de integración demostró que un operario que llamara al servicio directamente podía dar de alta un dominio. Ahora se comprueba en la base de datos (ADR-047). No llegó a publicarse.
- Un "entregado" desordenado devolvía un resultado engañoso (aunque no cambiaba el estado): ahora `stale`.
- Restaurar la plantilla no devolvía el formulario al texto original (el botón desaparecía antes de aplicar el cambio): corregido.
- En móvil, el asunto de la vista previa ensanchaba la página: corregido (comprobado a 390 px).
- Un test de pgTAP antiguo dependía de una base de datos vacía (slug fijo): el helper ahora evita la colisión.

### Pendiente (documentado)
- **Probar dominios y webhooks con una cuenta real de Resend** antes de producción: aquí se han probado con respuestas simuladas del proveedor (no hay credenciales).
- Con SMTP (SES) no hay eventos de entrega ni dominios propios (ADR-050).
- "Plantillas a medida" de Excelencia (P10) es un servicio de diseño de RevisaYa, no una función del producto.
- Seguimiento de aperturas (P8): desactivado hasta la revisión jurídica.
- Plantillas de los correos de citas → Fase 7.

### Credenciales que deben configurarse (staging/producción)
`RESEND_API_KEY` con `EMAIL_PROVIDER=resend` (dominios propios) y `RESEND_WEBHOOK_SECRET` (webhook de entregas), además de las de la Fase 5.

### Siguiente fase
**Fase 7 — Citas y presupuestos**: página pública de citas (destino del botón «Pedir cita»), gestión de citas, presupuestos en PDF.

---

## Fase 5 — Motor de automatizaciones (recordatorios)

### Qué se ha construido
Detalle en [AUTOMATIZACIONES](AUTOMATIZACIONES.md).
1. **Planificador** (`private.plan_reminders`, `pg_cron` cada hora): por sucursal y en su zona horaria; avisos según los días de antelación del taller (por defecto 30 y 7); aviso perdido único para altas tardías e importaciones; cancela los avisos obsoletos (nueva revisión, fecha cambiada, vehículo dado de baja); **sin duplicados** por clave única aunque se ejecute varias veces o en paralelo.
2. **Momento de envío** (`private.next_send_slot`): ventana horaria, días de envío y festivos de cada sucursal; si el día no vale, se adelanta al día hábil anterior.
3. **Avisos por kilometraje** (plan Max o superior): estimación por ritmo de km entre lecturas (≥ 30 días, 5–300 km/día), uno por ciclo de mantenimiento y solo si llega antes que el aviso por fecha.
4. **Dispatcher** (`/api/internal/jobs/dispatch-reminders`, Vercel Cron cada minuto): lotes con `SKIP LOCKED` + lease + reparto justo por taller; revalidación con los datos actuales; reserva atómica de la cuota mensual; "enviado" solo con el identificador del proveedor; reintentos con backoff y jitter; corte si el proveedor cae; recuperación tras caídas (lease vencido → cola; `email_logs` evita reenviar).
5. **Correo**: plantilla del PDF con variables escapadas y marca del taller, remitente compartido con el nombre del taller y `Reply-To` (P1), botón "Pedir cita" (`mailto:` hasta la Fase 7), versión de texto.
6. **Proveedores**: adaptadores reales **SMTP** (Amazon SES, Mailpit) y **Resend** (con clave de idempotencia). Sin proveedor configurado no se envía ni se simula nada.
7. **Baja de avisos**: enlace firmado (HMAC) en `/baja/<token>` y cabeceras `List-Unsubscribe` one-click (RFC 8058); marca al cliente, suprime la dirección y salta sus avisos pendientes.
8. **Pantallas**: `/app/configuracion/avisos` (administradores: activar, antelación, ventana, días, festivos, intervalo por defecto, km en Max+, "Responder a") y `/app/recordatorios` (resumen del mes, filtros, motivo de cada aviso no enviado, cancelar un aviso pendiente).
9. **Monitorización**: cada ejecución en `job_runs`; `/api/internal/jobs/status` responde 503 si el planificador lleva más de 26 h sin éxito. Endpoints internos protegidos con `CRON_SECRET`.

### Pruebas ejecutadas (2026-11-06, desde base de datos nueva, todas en verde)

| Comando | Resultado |
|---|---|
| `pnpm db:test` (pgTAP) | **245/245** (nuevo: `110_reminder_engine.sql`, 29: momento de envío con ventana, fin de semana, festivo y Canarias; planificador; idempotencia; obsoletos; avisos desactivados; suscripción cancelada; km Max frente a Pro; reclamación y recuperación) |
| `pnpm test` (Vitest) | **199/199** (nuevos: `email.test.ts` 17 y `reminder-settings.test.ts` 8 unitarios; `dispatcher.test.ts` 12 y `reminders-service.test.ts` 9 de integración) |
| `pnpm test:e2e` (Playwright) | **20/20** (nuevos: configurar avisos → planificar → enviar por SMTP real → correo en Mailpit con las variables → baja del cliente → panel; endpoints internos sin secreto → 401) |
| `pnpm typecheck` · `pnpm lint` · `pnpm build` · `pnpm audit` | sin errores · 0 vulnerabilidades |

Casos críticos cubiertos en esta fase:
- **3** (no se duplican recordatorios): planificador ejecutado varias veces (pgTAP) y **dos dispatchers simultáneos con 30 avisos: cada uno se envía exactamente una vez** (`dispatcher.test.ts`); el segundo `dispatch-reminders` del E2E no reenvía nada.
- **6** (un error de correo no detiene los demás): el fallo del proveedor para un taller no impide los envíos de otro; un error definitivo queda como fallido y uno temporal se reintenta con la cuota liberada.
- **1/2** en las nuevas pantallas: otro taller no puede leer ni cambiar la configuración ni cancelar avisos (ni cambiando los identificadores del formulario); un operario no puede cambiar la configuración ni cancelar; sin `reminders.read` no ve los avisos.

### Errores encontrados y corregidos durante la fase
- El aviso perdido podía crear un segundo aviso el mismo día que otro previsto: se exige que no haya otro en los 3 días siguientes (test).
- La lectura del lote reclamado usaba un nombre de columna inexistente (`setof uuid`): detectado por los tests de integración y corregido.
- `email_logs` no admitía el proveedor `smtp`: restricción ampliada (no destructiva, ADR-044).
- El filtro del panel aceptaba nombres heredados del objeto (`"toString"`): detectado por un test unitario, corregido con `Object.hasOwn`.
- En móvil, el texto oculto de la columna de acciones ensanchaba la página del panel: corregido (comprobado a 390 px).

### Pendiente (documentado)
- Webhooks de entrega, rebote y queja; avisos de cuota al 80 %/100 %; editor de plantillas; dominios propios; resúmenes al taller → **Fase 6**.
- Página de citas como destino del botón "Pedir cita" → Fase 7 (hasta entonces, `mailto:` al taller).
- En local, el puerto SMTP de Mailpit no se publica con esta versión de la CLI de Supabase: se usa la IP del contenedor (`pnpm mailpit:smtp-url`), también en CI.

### Credenciales que deben configurarse (staging/producción)
`CRON_SECRET`, `EMAIL_PROVIDER` + `RESEND_API_KEY` (o `SMTP_URL`), `EMAIL_SHARED_DOMAIN` (subdominio de envío verificado con SPF/DKIM/DMARC) y `EMAIL_LINK_SECRET`, como secretos del hosting. **No se ha enviado ningún correo a direcciones reales**: todo el envío probado va a Mailpit (local).

### Siguiente fase
Fase 6 (completada, ver arriba).

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
Fase 5 (completada, ver arriba). Las fichas importadas reciben avisos automáticamente (el planificador lee `next_service_date`).

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
| 3 | No se pueden duplicar recordatorios | `050_reminders_email.sql` + 10 planificadores simultáneos en `concurrency.test.ts` + `110_reminder_engine.sql` y dos dispatchers simultáneos en `dispatcher.test.ts` (Fase 5) |
| 4 | No se pueden superar los límites del plan | `040_plan_limits.sql` (29 tests) + altas y reservas de correo simultáneas |
| 5 | Importación incorrecta sin registros parciales | `tests/integration/imports.test.ts` (fallo por límite y fallo a mitad de transacción ⇒ 0 fichas) |
| 6 | Un error de correo no detiene otros envíos | `dispatcher.test.ts` (Fase 5) |
| 7 | Webhook duplicado no duplica operaciones | Correo: `120_email_system.sql`, `email-system.test.ts` y E2E por HTTP (Fase 6); Stripe en la Fase 8 |
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

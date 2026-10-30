# Operación, seguridad y privacidad (fase 4)

> **Presupio no está listo para producción todavía.** El código está preparado para un despliegue controlado (piloto). Antes de usarlo con clientes reales faltan:
> - la infraestructura (alojamiento, base de datos gestionada con copias, monitor externo);
> - el proveedor de email probado de verdad;
> - los pagos (fase 5);
> - la revisión jurídica.
>
> Todo ello se detalla en la [sección 9](#9-pendiente-antes-de-producción).

## 1. Qué está activo y qué solo está documentado

| Medida | Estado | Dónde |
|---|---|---|
| Registros estructurados (JSON, `pino`) con id de petición, sin cookies, tokens ni datos personales en errores | **Activo en el código** | `src/app.ts`, `src/lib/log.ts`, `src/worker.ts` |
| Comprobaciones de salud `GET /api/v1/health` y `/health/ready` (base de datos) | **Activo** | `modules/health` |
| Estado para un monitor externo `GET /api/v1/ops/status` (con token): cola, envíos atascados, fallos, último ciclo de cada trabajo y alertas | **Activo en el código.** Ningún monitor lo consulta todavía | `modules/ops` |
| Registro de cada ciclo del motor (`job_runs`) y aviso en la interfaz si el proceso de envío se detiene | **Activo** | `automation/runner.ts`, *Configuración → Envío automático* |
| Base de datos caída → `503 SERVICE_UNAVAILABLE` con `Retry-After`, sin detalles internos | **Activo** | `src/app.ts`, `lib/errors.ts` |
| Migraciones transaccionales, con checksum, bloqueo y aplicables paso a paso | **Activo y probado** sobre datos existentes | `src/db/migrator.ts` |
| Copia de seguridad y restauración (`ops/backup.sh`, `ops/restore.sh`) | **Probado en local** (copia de la base de desarrollo, restauración en una base vacía, migración y recuento) | `ops/` |
| Copias automáticas y recuperación a un punto en el tiempo | **Solo documentado:** depende del proveedor de PostgreSQL, que aún no está elegido ni configurado | [Sección 4](#4-copias-de-seguridad-y-restauración) |
| Monitor externo y alertas (uptime, `/ops/status`) | **Solo documentado:** no hay ninguno configurado | [Sección 3](#3-supervisión) |
| Exportación de datos de una empresa | **Activo** (`GET /company/export`, botón en *Configuración → Empresa*) | `modules/company/export.ts` |
| Eliminación de una empresa | **Activo** solo para el personal autorizado (`npm run ops -- delete-company`) | `scripts/ops.ts` |
| Conservación: texto de emails 90 días; eventos de webhook y ejecuciones del motor 30 días | **Activo** (trabajo `retention` cada hora) | `automation/engine.ts` |
| Suscripciones con Stripe **en modo de prueba** (Checkout, webhooks firmados, cambio de plan, cancelación, portal) | **Activo en el código, desactivado por defecto** (`PAYMENTS_ENABLED`). Sin pruebas contra Stripe por falta de credenciales de prueba | [`facturacion.md`](facturacion.md) |
| Solo lectura sin plan activo y avisos de conservación (30, 7 y 1 día; 90 días) | **Activo.** El borrado sigue siendo manual | `plugins/auth.ts`, `modules/billing/retention.ts` |

## 2. Entornos y configuración

| Entorno | Base de datos | Correo | Notas |
|---|---|---|---|
| Desarrollo | `presupio` local (`docker compose up -d` o PostgreSQL local; `npm run db:bootstrap`) | `MAIL_TRANSPORT=log` y `FOLLOWUP_EMAIL_PROVIDER=disabled` | Datos ficticios con `npm run db:seed` |
| Pruebas | Base **cuyo nombre termina en `_test`**: las pruebas se niegan a ejecutarse en otra | Correo en memoria y proveedores simulados o locales | Cada ejecución recrea el esquema |
| Producción | PostgreSQL gestionado (UE), roles separados: propietario (migraciones) y aplicación (sin superusuario, sin `BYPASSRLS`) | SMTP real y Mailgun UE | `NODE_ENV=production` activa las validaciones de abajo |

**En producción, la API y el proceso de envío se niegan a arrancar si:**
- las cookies no son seguras;
- `APP_WEB_URL` no es `https`;
- `MAIL_TRANSPORT=log`;
- `CORS_ORIGINS` contiene `*`;
- Mailgun no tiene clave de firma o no usa `https`;
- `OPS_STATUS_TOKEN` tiene menos de 32 caracteres.

**Secretos:**
- Viven solo en el gestor de secretos del alojamiento: claves de base de datos, SMTP, Mailgun y `OPS_STATUS_TOKEN`.
- `.env` está en `.gitignore`.
- Revisión de esta fase: **ningún secreto en el repositorio ni en el código del navegador** (búsqueda en `git ls-files` y en `apps/web/dist`).

## 3. Despliegue, migraciones y vuelta atrás

1. **Prepara:** `npm ci && npm run typecheck && npm test && npm run build`. Es lo mismo que ejecuta la CI (`.github/workflows/presupio.yml`), que además pasa las pruebas E2E.
2. **Copia antes de migrar:** `ops/backup.sh` (o una instantánea del proveedor).
3. **Migra** con el rol propietario: `npm run db:migrate:prod` (código compilado; funciona tras `npm ci --omit=dev`).
   - Cada migración va en su transacción. Si falla, no se aplica nada de ella.
   - Las migraciones son **aditivas**: la versión anterior de la aplicación sigue funcionando con el esquema nuevo. Hay que mantener esa regla (expandir primero, contraer en una versión posterior).
4. **Despliega la API, el proceso de envío y el frontend:**
   - API: `npm start`;
   - proceso de envío: `npm run start:worker`, o `node apps/api/dist/src/worker.js --once` desde un cron cada minuto;
   - frontend: `npm run start:web` o nginx.

   Hay que desplegar los tres con la misma versión. En producción solo hacen falta las dependencias de producción (`npm ci --omit=dev`) y los `dist/` compilados. La herramienta de operación compilada es `npm run ops:prod -w @presupio/api -- …`.
5. **Comprueba:** `GET /api/v1/health/ready` y `GET /api/v1/ops/status` (`status: "ok"`).

**Vuelta atrás:**
- **Fallo de código:** se redespliega la versión anterior. Las migraciones aditivas no la rompen.
- **Migración defectuosa o datos dañados:** se restaura la copia del paso 2 en una base nueva ([sección 4](#4-copias-de-seguridad-y-restauración)) y se apunta la aplicación a ella.
- **Nunca se edita una migración aplicada;** se corrige con otra nueva.

### Supervisión

**Monitor externo** (por configurar: UptimeRobot, Better Stack, el del alojamiento…):

| Comprobación | Frecuencia | Alerta si |
|---|---|---|
| `GET /api/v1/health/ready` | 1 min | no responde `200` dos veces seguidas |
| `GET /api/v1/ops/status` con `Authorization: Bearer $OPS_STATUS_TOKEN` | 5 min | `status` ≠ `ok`. Alertas posibles:<ul><li>`worker_not_running`;</li><li>`deliveries_stuck_sending`;</li><li>`deliveries_unknown_review` (envíos de resultado desconocido pendientes de revisar);</li><li>`approved_emails_delayed`;</li><li>`job_errors_last_24h`;</li><li>`attempts_reserved_stuck`;</li><li>`billing_events_failed`;</li><li>`billing_duplicate_subscription`.</li></ul> |

**Qué devuelve `/ops/status`:** solo cifras agregadas, sin empresas, personas ni emails. Sin token configurado, la ruta responde `404`. Además de `alerts`, devuelve `review` con avisos informativos que no degradan el estado: `recoveries_backdated_review` indica respuestas fechadas antes de un seguimiento (revisar con `npm run ops -- backdated`).

**Indicadores de trabajos pendientes y fallos:**
- emails vencidos;
- aprobados con más de 15 min de retraso;
- envíos en curso o atascados;
- fallidos y desconocidos en 24 h;
- último ciclo de cada trabajo;
- errores de trabajos.

**Registros:**
- La salida estándar es JSON. Conviene enviarla a un servicio de logs con retención limitada (p. ej. 30 días).
- Los errores no incluyen el `detail` de PostgreSQL, que puede contener emails, y enmascaran direcciones (`[email]`).
- Las peticiones no registran cookies, cabeceras de autorización ni tokens de URL.

## 4. Copias de seguridad y restauración

**Lo recomendado:** un PostgreSQL gestionado en la UE con copias automáticas diarias y **recuperación a un punto en el tiempo (PITR)** de al menos 7 días. Por ejemplo, la base gestionada del alojamiento elegido, o un proveedor especializado. **No está configurado:** se elegirá con el alojamiento.

**Copia lógica adicional** (antes de migrar o desplegar, y semanal fuera del proveedor):

```bash
BACKUP_DATABASE_URL="$MIGRATION_DATABASE_URL" ops/backup.sh /ruta/segura
```

- Genera `presupio-AAAAmmdd-HHMMSS.dump` y su suma SHA-256.
- Comprueba que la copia se puede leer.
- Guárdala cifrada y fuera del servidor de la base de datos: contiene datos personales.

**Restauración** (siempre en una base **nueva y vacía**, nunca encima de la que está en uso):

```bash
RESTORE_DATABASE_URL=postgres://owner:…@host/presupio_restaurada ops/restore.sh presupio-….dump
```

```bash
MIGRATION_DATABASE_URL=postgres://owner:…@host/presupio_restaurada DATABASE_URL=postgres://app:…@host/presupio_restaurada npm run db:migrate:prod
```

1. Restaura la copia (primer comando).
2. Migra la base restaurada (segundo comando): vuelve a conceder los permisos del rol de aplicación.
3. Comprueba con `GET /health/ready` y revisando una empresa.
4. Cambia `DATABASE_URL` de la aplicación y del proceso de envío.

**Prueba realizada en esta fase (local):**
1. Copia de la base de desarrollo (1 empresa, 6 presupuestos, 3 migraciones).
2. Restauración en una base vacía.
3. Migración posterior (permisos concedidos).
4. Recuento correcto.

**Objetivo orientativo para el piloto:** pérdida máxima de 24 h (5 min con PITR) y restauración en menos de 2 h. Hay que repetir la prueba de restauración cada trimestre.

## 5. Revisión de seguridad

| Área | Resultado |
|---|---|
| Aislamiento entre empresas | **Correcto.** Tres barreras:<ol><li>todas las consultas filtran por empresa;</li><li>RLS en todas las tablas de empresa, incluidas las nuevas `usage_periods` y `recovery_events`;</li><li>claves foráneas compuestas.</li></ol>Recursos de otra empresa → `404`. Probado en API y en PostgreSQL |
| Autorización | **Correcto.** Toda ruta es privada salvo una lista cerrada, comprobada por una prueba que recorre todas las rutas. Permisos por rol en cada ruta. Nuevo permiso `data:export` (propietario y administrador) |
| Validación de entradas | **Correcto.** Zod estricto (campos desconocidos → `400`), límites de tamaño y validación de fechas, meses y uuid |
| Sesiones y autenticación | **Correcto.** Argon2id; token de sesión aleatorio guardado como hash; cookie `HttpOnly`, `SameSite=Lax` y `Secure` en producción; caducidad absoluta y por inactividad; CSRF por origen |
| Credenciales | **Correcto.** Solo en variables de entorno. Ninguna en el repositorio ni en el navegador |
| CORS y cookies | **Correcto.** Lista cerrada de orígenes, sin `*`, con credenciales |
| Abuso de la API | **Correcto con un riesgo.** Límite global por IP y límites específicos (login, registro, recuperación, tokens, baja, email de prueba, exportación y supervisión). **Riesgo:** los contadores están en memoria del proceso; con varias instancias hay que compartirlos (Redis o PostgreSQL) |
| Errores | **Corregido en esta fase.**<ul><li>Base de datos caída → `503` sin detalles (antes `500`);</li><li>los logs ya no guardan el `detail` de PostgreSQL;</li><li>las respuestas nunca incluyen trazas.</li></ul>Probado |
| Webhooks | **Correcto.** Mailgun con firma HMAC, antigüedad máxima y antirrepetición |
| Plan y consumo | **Corregido en esta fase:** el rol de base de datos de la aplicación podía modificar `subscriptions`. Ahora no puede, ni tampoco modificar o borrar `recovery_events` |
| Envío de spam con cuentas falsas | **Corregido en esta fase:** activar el envío automático exige el **email confirmado** de quien lo activa. Antes solo exigía datos de configuración. Además actúan el límite diario de emails, la revisión humana por defecto y los enlaces de baja |
| Dependencias | `npm audit`: **0 vulnerabilidades** (29-10-2026). Conviene activar Dependabot o similar |
| Migrador | **Corregido en esta fase:** los permisos se aplican al esquema que se migra, y se puede migrar paso a paso (antes fallaba si faltaban tablas de migraciones posteriores) |

**Riesgos pendientes** (ninguno bloquea un piloto controlado; todos antes de abrir el registro al público):
1. **Límites de peticiones en memoria:** no se comparten entre instancias.
2. **Inicio de sesión sin email confirmado:** está permitido. Solo se exige para el envío automático.
3. **Sin segundo factor (2FA)** para propietarios y administradores.
4. **El registro indica si un email ya existe** (decisión de la fase 1, mitigada con límite por IP).
5. **Supresión de un contacto concreto** (derecho de supresión del cliente final): no hay botón. Se hace con el procedimiento de la [sección 6](#6-privacidad-y-operación).
6. **Proveedor de email sin probar en real:** ver `docs/automatizacion.md`.
7. **Sin copias automáticas ni monitor configurados**, hasta elegir el alojamiento.

## 6. Privacidad y operación

**Papeles:**
- Cada empresa cliente es **responsable del tratamiento** de los datos de sus clientes.
- Presupio actúa como **encargado del tratamiento** (art. 28 RGPD) y necesita un contrato de encargo con cada empresa (pendiente de redactar).

| Necesidad | Medida técnica |
|---|---|
| **Exportar datos** (portabilidad, copia propia) | `GET /company/export` (propietario o administrador, 5 por hora): JSON con empresa, miembros, ajustes, plan, contactos, exclusiones, presupuestos, seguimientos, envíos, plantillas, recuperaciones, consumo e historial. No incluye contraseñas, sesiones ni tokens. Queda en el historial |
| **Eliminar una empresa** (baja del servicio) | `npm run ops -- delete-company --company <id> --confirm "<nombre exacto>"`: borra en cascada todos sus datos. Las cuentas de usuario sin otras empresas se conservan; si lo piden, se eliminan con una solicitud aparte. Las copias de seguridad caducan según su retención |
| **Solicitudes de clientes finales** (acceso, supresión, oposición) | Las recibe la empresa (responsable). **Oposición:** la propia empresa la registra en la lista de exclusión, o el cliente usa el enlace de baja. **Acceso:** la empresa lo atiende con la ficha del contacto o la exportación. **Supresión:** por ahora la tramita el soporte de Presupio a petición de la empresa, en tres pasos:<ol><li>registrar una exclusión (para no volver a escribirle);</li><li>anonimizar el contacto: sustituir el nombre y vaciar el teléfono y las notas. El email solo se conserva para la lista de exclusión, que lo necesita para respetar su oposición;</li><li>borrar el texto de los emails enviados.</li></ol>Queda pendiente un endpoint propio |
| **Conservación** | Texto de los emails: 90 días. Eventos de webhook y ejecuciones: 30 días. El resto, mientras la empresa tenga cuenta. Pendiente: definir el plazo para cuentas canceladas (p. ej. 90 días y borrado) |
| **Acceso del personal autorizado** | Sin «superadministrador» en la aplicación: nadie de Presupio entra en la cuenta de una empresa desde la web. El acceso técnico es con el rol propietario de la base de datos (operación y migraciones), limitado a las personas designadas y con autenticación del proveedor. La herramienta `npm run ops` deja constancia en el historial de la empresa. Pendiente: registro de accesos del personal y doble factor en el proveedor |
| **Incidentes de seguridad** | Ver el procedimiento debajo de esta tabla |
| **Desactivar una integración sin perder datos** | Hay cuatro formas, y en todas el historial, los intentos de envío y las métricas se conservan:<ul><li>*Envío automático → Desactivar:* cancela lo pendiente y conserva todo lo anterior;</li><li>por presupuesto, el interruptor de la ficha;</li><li>en el servidor, `FOLLOWUP_EMAIL_PROVIDER=disabled` (no se envía nada y la interfaz lo indica);</li><li>en Mailgun, retirar la clave.</li></ul> |
| **Ningún envío tras una baja o desactivación** | Ver la lista debajo de esta tabla |

**Procedimiento ante incidentes de seguridad:**
1. Contener: revocar claves, cerrar sesiones o desactivar el envío.
2. Evaluar el alcance con los logs y el historial.
3. Si afecta a datos personales:
   - notificar a la AEPD **en 72 h** (art. 33 RGPD);
   - avisar a las empresas afectadas (como encargado, sin dilación indebida).
4. Corregir y documentar.

**Por qué no sale ningún envío tras una baja o desactivación** (todo probado en `automation.test.ts` y en E2E):
- **La baja del cliente:**
  - crea una exclusión;
  - cancela los pendientes;
  - se comprueba otra vez justo antes de cada envío.
- **Ocurre lo mismo al:**
  - desactivar el envío o el presupuesto;
  - registrar la respuesta, aceptar, rechazar o archivar;
  - recibir un rebote o una queja;
  - alcanzar el límite del plan.

## 7. Herramienta de operación

```bash
npm run ops -w @presupio/api -- companies
```

```bash
npm run ops -w @presupio/api -- usage --company <uuid>
```

```bash
npm run ops -w @presupio/api -- plan --company <uuid> --plan pro --status active
```

```bash
npm run ops -w @presupio/api -- delete-company --company <uuid> --confirm "<nombre exacto>"
```

```bash
npm run ops -w @presupio/api -- retention
```

```bash
npm run ops -w @presupio/api -- billing-events --days 7
```

```bash
npm run ops -w @presupio/api -- backdated --days 30
```

- Usa `MIGRATION_DATABASE_URL`, el rol propietario, que **solo debe tener el personal autorizado**.
- **`plan`** asigna un plan sin pasar por Stripe (pilotos, correcciones). Con una suscripción de Stripe, el siguiente webhook lo sobrescribe.
- **`retention`** lista las cuentas sin plan activo con su fecha de conservación y los avisos enviados. **Nada se borra automáticamente.**
- **`delete-company`** se niega a borrar antes de que termine el plazo de conservación, salvo con `--before-deadline` (petición expresa de la empresa). Antes de borrar, revisa las obligaciones legales de conservación.
- **`billing-events`** muestra los eventos de facturación con error, sin empresa o con una segunda suscripción.

## 8. Procedimientos rápidos

| Situación | Qué hacer |
|---|---|
| `worker_not_running` | Comprobar el proceso o cron del motor y sus logs. Lo programado espera; los pasos con más de 72 h de retraso se cancelan para no enviar ráfagas |
| `deliveries_stuck_sending` | El motor los marca como «resultado desconocido» en 15 min y no los reenvía. Revisar en *Seguimientos → Fallidos* |
| `approved_emails_delayed` | Revisar el límite diario, la franja horaria y el proveedor (`/ops/status`, logs) |
| Base de datos caída | La API responde `503` y el motor reintenta en el siguiente ciclo. Revisar el proveedor de PostgreSQL |
| Clave filtrada | Rotarla en el proveedor y en el gestor de secretos y redesplegar. Para `OPS_STATUS_TOKEN`, cambiarlo también en el monitor; para `STRIPE_WEBHOOK_SECRET`, generar uno nuevo en el endpoint de Stripe |
| `billing_events_failed` | `npm run ops -- billing-events`. Un precio desconocido indica un `STRIPE_PRICE_*` mal configurado; tras corregirlo, reenvía el evento desde el panel de Stripe (los eventos con error se pueden reprocesar) |
| `billing_duplicate_subscription` | Una empresa tiene dos suscripciones vivas en Stripe. Cancela y reembolsa la sobrante desde el panel de Stripe; Presupio mantiene la primera |
| `attempts_reserved_stuck` | Un ciclo del motor se detuvo entre reservar y enviar. El trabajo `recovery` lo resuelve en 15 min (intento sin verificar, no se cobra); si persiste, revisa el worker |

## 9. Pendiente antes de producción

**Infraestructura:**
- alojamiento en la UE para la API, el proceso de envío y el frontend estático;
- PostgreSQL gestionado con copias y PITR;
- monitor externo;
- servicio de logs;
- dominio con HTTPS.

**Email:**
- prueba real con Mailgun UE y SMTP: dominio verificado con SPF, DKIM y DMARC, y webhooks (`docs/automatizacion.md`).

**Seguridad:**
- límites de peticiones compartidos si hay varias instancias;
- 2FA para administradores;
- Dependabot;
- endpoint de supresión de contactos.

**Pagos (fase 5):** integración solo en modo de prueba; pendientes en [`facturacion.md`](facturacion.md#8-pendiente-no-se-ha-activado-ni-se-da-por-resuelto).

**Revisión profesional (jurídica y fiscal) pendiente:**
- política de privacidad, aviso legal y condiciones de uso;
- contrato de encargo del tratamiento (art. 28 RGPD) y lista de subencargados (alojamiento, base de datos, Mailgun, proveedor de pagos);
- registro de actividades de tratamiento;
- valorar si hace falta una evaluación de impacto;
- base legal de los emails de seguimiento (interés legítimo o medidas precontractuales) y textos de las plantillas (LSSI);
- política de uso razonable de Business;
- facturación e IVA de las suscripciones.

**Implementar estas medidas no equivale a cumplir la normativa:** hace falta esa revisión.

# RevisaYa — Estrategia de testing

> Estado: **diseño (Fase 0)**. Ningún módulo se da por terminado sin sus pruebas ejecutadas. Solo se marcará como "pasa" lo que se haya ejecutado de verdad (con la salida registrada en ESTADO-DEL-PROYECTO).

## 1. Niveles y herramientas

| Nivel | Herramienta | Alcance |
|---|---|---|
| Unitarios | Vitest | Funciones puras: normalización de matrículas, fechas, dinero/IVA, variables de plantilla, backoff, estimación de km, validadores zod. |
| BD / RLS | **pgTAP** (`supabase test db`) sobre Supabase local en Docker | Aislamiento por organización y sucursal, permisos por rol, FK compuestas, unicidades, triggers de límites, inmutabilidad, reglas de borrado. |
| Integración | Vitest + Supabase local | Servicios reales contra Postgres real (sin mocks de BD): importación, planner, dispatcher, webhooks, numeración de presupuestos. |
| Proveedores | MSW + modo test real | Respuestas de Resend/Stripe/Google simuladas solo en tests (incluye timeouts, 429, 5xx); verificación adicional manual con Stripe CLI y Resend en modo test. |
| API | Vitest + fetch contra el servidor | Auth por API key, scopes, rate limiting, formato de errores, 404 entre organizaciones. |
| E2E | Playwright | Registro → verificación → alta de cliente/vehículo → importación → plantilla → cita pública → confirmación; checkout TEST. |
| Concurrencia | scripts con transacciones paralelas | Límites del plan, reserva de cuota, `SKIP LOCKED`, doble confirmación de importación. |
| Seguridad | `pnpm audit` y gitleaks (en CI); cabeceras y CSP, 2FA y pruebas IDOR (integración y E2E) | Auditoría de la Fase 11 en SEGURIDAD §9. Semgrep no está en CI (propuesta). |
| Calidad | `tsc --noEmit`, ESLint, `next build` | Bloquean el merge. |

## 2. Casos críticos obligatorios (del encargo)

| # | Caso | Dónde se prueba |
|---|---|---|
| 1 | Un taller no puede consultar los datos de otro | pgTAP (todas las tablas) + API + E2E |
| 2 | Un operario no puede realizar acciones de administrador | pgTAP + integración de Server Actions |
| 3 | No se pueden duplicar recordatorios | pgTAP (unique) + planner ejecutado 2 veces y en paralelo |
| 4 | No se pueden superar los límites del plan | pgTAP + concurrencia (N inserciones simultáneas en el límite) |
| 5 | Una importación incorrecta no deja registros parciales | integración: fallo forzado a mitad de `commit_import` ⇒ 0 filas |
| 6 | Un error de correo no detiene los demás envíos | dispatcher con un proveedor que falla para una organización |
| 7 | Un webhook duplicado no duplica operaciones | Stripe y correo: mismo evento enviado 2 veces y desordenado |
| 8 | Una cancelación se refleja correctamente | webhook `customer.subscription.updated/deleted` ⇒ estado + acceso |
| 9 | Los vehículos mantienen su historial | cambio de propietario y borrado de cliente ⇒ historial intacto |
| 10 | Las sucursales permanecen aisladas | pgTAP con operario de sucursal A frente a datos de B |

## 3. Cómo ejecutar las pruebas

```bash
pnpm db:start          # Supabase local (Docker)
pnpm db:reset          # aplica todas las migraciones desde cero
pnpm db:test           # pgTAP: supabase/tests/database/*.sql
pnpm test:unit         # Vitest: tests/unit
pnpm test:integration  # Vitest contra la BD local: tests/integration
pnpm build && pnpm test:e2e   # Playwright: app compilada + Auth real + Mailpit
pnpm check             # typecheck, lint, unit, pgTAP, integración y build
```

Estructura:

| Ruta | Contenido |
|---|---|
| `supabase/tests/database/000_helpers.sql` | Helpers de test (`tests.create_org`, `tests.authenticate_as`…). Solo en la BD local; no es una migración. |
| `supabase/tests/database/0x0_*.sql` | Un archivo por área: esquema, aislamiento, roles, sucursales, límites, recordatorios, historial, presupuestos/citas, anónimo, purga, motor de recordatorios (`110`), sistema de correos (`120`), citas y presupuestos (`130`), suscripción (`140`). |
| `tests/unit/` | Funciones puras (matrículas, planes, entorno, errores, importación, plantilla del correo, enlaces de baja, backoff, adaptador de Resend con `fetch` simulado, configuración de avisos, firma de webhooks, plantillas, dominios, importes con decimal.js, NIF/NIE/CIF, `.ics`, enlaces de cita). |
| `tests/integration/` | Contexto RLS del servidor, sincronía de planes, concurrencia, servicios de miembros y alta de talleres (incluidos contextos falsificados), importación, papelera, dispatcher (con un puerto de correo de prueba y un envío SMTP real a Mailpit) servicio de recordatorios y sistema de correos (plantillas, dominios con un puerto de prueba, webhook, bloqueos, avisos de consumo y resúmenes), citas (del aviso a la cita confirmada, huecos simultáneos, robots y límites, permisos), presupuestos (PDF real, emisión, envío con adjunto, numeración concurrente) y datos del taller (logo en el almacenamiento real). Leen `NEXT_PUBLIC_SUPABASE_URL` y `SUPABASE_SECRET_KEY` de `.env.local`. Suscripción: `billing.test.ts` contra **stripe-mock** (`pnpm stripe:mock`) y webhooks firmados. |
| `tests/e2e/` | Playwright: registro → correo (Mailpit) → verificación → alta de taller; acceso, recuperación y cambio de contraseña; invitaciones; límites de usuarios; rate limiting; redirecciones abiertas; clientes, vehículos e historial de principio a fin; borrado seguro; solo lectura; importación; avisos de punta a punta (configuración → planificador → dispatcher → correo real en Mailpit → baja); plantillas con prueba real; configuración del correo y webhook firmado; del correo del aviso a la cita confirmada con su `.ics`; citas por huecos; datos fiscales y logo; presupuesto con IVA emitido y enviado con el PDF adjunto; suscripción: sin plan → pago de Stripe (stripe-mock) → webhook firmado → prueba de 7 días → cancelar; informes, integraciones y API con una clave creada en el panel (Fase 9); web pública con precios, textos legales, aceptación registrada, bienvenida, 404 y móvil (Fase 10); 2FA de punta a punta, cabeceras y rutas sin sesión (Fase 11). |

El E2E de avisos necesita en `.env.local` `EMAIL_PROVIDER=smtp`, `SMTP_URL` (`pnpm -s mailpit:smtp-url`), `EMAIL_SHARED_DOMAIN`, `EMAIL_LINK_SECRET`, `CRON_SECRET` y `RESEND_WEBHOOK_SECRET` (`whsec_` + base64); el CI los genera en cada ejecución (secretos efímeros, no reales). Si faltan, el test falla indicando qué variable falta (no se salta).

Con Cache Components, Next mantiene la página anterior oculta en el DOM (`<Activity>`): en los E2E los selectores se acotan a la tarjeta o sección visible.

Los tests no dependen del orden ni de una base de datos vacía: cada uno crea sus propios talleres con identificadores aleatorios y acota sus consultas a ellos.

`tests.authenticate_as(uuid)` reproduce exactamente lo que hace `withRls` en el servidor (rol `authenticated` + claims del JWT en la transacción), así que las pruebas de RLS cubren el camino real de producción.

Resultados de la última ejecución: ver [ESTADO-DEL-PROYECTO](ESTADO-DEL-PROYECTO.md).

## 4. CI (GitHub Actions)

`install → typecheck → lint → unit → supabase start → db reset (migraciones) → pgTAP → integración → build → e2e (en PR a main) → audit/gitleaks`.
Las migraciones se prueban desde cero en cada ejecución: si no se aplican limpias, el pipeline falla.


## PCI

| Capa | Archivos | Qué cubre |
|---|---|---|
| pgTAP | `supabase/tests/database/160_pci.sql` | Aislamiento, integridad, vencimientos, inmutabilidad, órdenes, RLS de técnicos, límites y avisos. |
| Unit | `tests/unit/pci-validation.test.ts` | Validación de equipos (extintor), órdenes, materiales, datos de empresa, archivos privados. |
| Integración | `pci.test.ts`, `pci-reminders.test.ts`, `pci-notify.test.ts`, `pci-imports.test.ts`, `pci-quotes.test.ts`, `api-pci.test.ts` | Flujo completo por los servicios; avisos sin duplicados y cancelados al hacer la actuación; correos y PDF; importación; presupuestos; API y compatibilidad. |
| E2E | `tests/e2e/pci.spec.ts` (+ las demás adaptadas) | Cliente → instalación → extintor → técnico → orden → resultado → finalizar → historial, incidencia, calendario e informes; etiqueta QR; técnico en el móvil con foto. |
| E2E | `tests/e2e/smoke-crawl.spec.ts` | Recorrido automático de todas las pantallas enlazadas (administrador en escritorio y móvil, técnico con solo «ejecutar» en móvil, web pública y página de citas): sin errores de JavaScript ni de consola, sin respuestas 5xx, sin enlaces rotos (pantalla 404), sin desbordamiento horizontal y sin infracciones de accesibilidad graves o críticas (axe, WCAG 2.1 AA). Además, identificadores mal formados o inexistentes dan 404, nunca 500. Solo navega (GET): no crea ni borra nada. |

Las pruebas de vehículos se conservan: simulan una cuenta que ya tiene vehículos y recorren su interfaz. Los correos de las pruebas van a Mailpit local o a un proveedor falso dentro de `tests/`: no sale ningún correo real.

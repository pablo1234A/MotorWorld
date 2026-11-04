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
| Seguridad | `pnpm audit`, gitleaks, Semgrep, cabeceras (CSP), pruebas IDOR | En CI y en la auditoría de la Fase 11. |
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

## 3. CI (GitHub Actions, Fase 1)

`install → typecheck → lint → unit → supabase start → db reset (migraciones) → pgTAP → integración → build → e2e (en PR a main) → audit/gitleaks`.
Las migraciones se prueban desde cero en cada ejecución: si no se aplican limpias, el pipeline falla.

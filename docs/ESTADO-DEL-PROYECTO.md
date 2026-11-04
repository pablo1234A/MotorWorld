# RevisaYa — Estado del proyecto

> Se actualiza al cerrar cada fase.

## Resumen

| Fase | Estado | Fecha |
|---|---|---|
| 0 — Auditoría y planificación | ✅ Completada · ⏳ **pendiente de aprobación** | 2026-11-04 |
| 1 — Infraestructura y base de datos | ⏸ No iniciada (espera aprobación) | — |
| 2 — Backend y autenticación | ⏸ No iniciada | — |
| 3 — Clientes, vehículos e historial | ⏸ No iniciada | — |
| 4 — Importación Excel/CSV | ⏸ No iniciada | — |
| 5 — Motor de automatizaciones | ⏸ No iniciada | — |
| 6 — Sistema de correos | ⏸ No iniciada | — |
| 7 — Citas y presupuestos | ⏸ No iniciada | — |
| 8 — Suscripciones y límites | ⏸ No iniciada | — |
| 9 — Google Calendar, informes y API | ⏸ No iniciada | — |
| 10 — Frontend completo | ⏸ No iniciada | — |
| 11 — Seguridad y testing global | ⏸ No iniciada | — |
| 12 — Preparación para producción | ⏸ No iniciada | — |

## Fase 0 — Auditoría y planificación

**Qué se ha construido**
- Lectura completa del PDF de requisitos (7 páginas) y trazabilidad con el diseño.
- Auditoría del repositorio: solo contiene una web estática ajena al proyecto (`index__1_.html`, MOTORWORLD), que se conserva sin cambios.
- Documentación de diseño: arquitectura, base de datos (esquema, relaciones, índices, RLS), seguridad, automatizaciones, importación, integraciones, API, testing, despliegue, decisiones técnicas e informe de la fase.

**Qué funciona**
- Nada ejecutable todavía: la Fase 0 es de diseño. No se ha escrito código de aplicación ni migraciones.

**Pruebas ejecutadas**
- Ninguna (no hay código). Comprobada la disponibilidad de herramientas en el entorno: Node 22.23, pnpm 10.28, Docker 29.9, psql 16.15.

**Errores pendientes**
- Ninguno.

**Dependencias que faltan**
- Supabase CLI (se añadirá como devDependency en la Fase 1).

**Credenciales que deben configurarse** (más adelante, nunca en el código)
- Fase 1: ninguna (Supabase local).
- Fase 2: proyecto Supabase de staging (URL, clave publicable, clave secreta, `DATABASE_URL`).
- Fases 6–9: Resend, Stripe TEST, Google OAuth, Turnstile, Sentry (lista completa en INTEGRACIONES §6).

**Decisiones pendientes de aprobación**
- ADR-001…015 y propuestas P1–P17 de [DECISIONES-TECNICAS](DECISIONES-TECNICAS.md). Las que afectan a la Fase 1: ADR-003, ADR-004, ADR-005, P2, P4, P13, P14.

**Siguiente fase**
- Fase 1: inicializar Next.js + TypeScript estricto, Supabase local, migraciones del esquema completo, RLS, triggers de límites, siembra de planes, pgTAP de aislamiento y CI.

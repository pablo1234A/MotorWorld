# RevisaYa

SaaS para talleres mecánicos: el taller registra sus clientes, vehículos e historial de revisiones, y RevisaYa envía cada día avisos por correo a los clientes a los que les toca la revisión, con un botón para pedir cita.

> **Estado: Fase 3 completada**: autenticación, talleres, usuarios e invitaciones (Fase 2) y gestión de clientes, vehículos e historial de mantenimiento con búsqueda, filtros y fichas (Fase 3). Ver [docs/ESTADO-DEL-PROYECTO.md](docs/ESTADO-DEL-PROYECTO.md).
> "RevisaYa" es un nombre provisional: falta comprobar la marca y el dominio.

## Puesta en marcha local

Requisitos: Node ≥ 22, pnpm 10 y Docker.

```bash
pnpm install
cp .env.example .env.local   # valores locales: los muestra `pnpm db:start`
pnpm db:start                # Supabase local (PostgreSQL 17, Auth, Storage)
pnpm db:reset                # aplica las migraciones
pnpm check                   # typecheck, lint, tests (unit, pgTAP, integración) y build
pnpm test:e2e                # E2E con Playwright (tras pnpm build)
pnpm dev                     # http://localhost:3000 · correos locales en http://127.0.0.1:54324
```

## Estructura

```
src/
  app/            Next.js App Router (UI y rutas)
  lib/            código compartido sin secretos (matrículas, catálogo de planes)
  components/     componentes de interfaz (ui/, auth/, members/…)
  server/         solo servidor: acceso a BD con RLS, auth, módulos de dominio, seguridad
  proxy.ts        refresco de sesión y redirección optimista de zonas privadas
supabase/
  migrations/     esquema SQL versionado (fuente de verdad)
  tests/database/ tests pgTAP (RLS, límites, integridad)
tests/            Vitest (unit/, integration/) y Playwright (e2e/)
docs/             documentación técnica
legacy/           contenido previo del repositorio (web MOTORWORLD), sin uso
```

## Documentación

| Documento | Contenido |
|---|---|
| [FASE-0-INFORME](docs/FASE-0-INFORME.md) | Análisis de requisitos, plan por fases, riesgos, dependencias y costes |
| [ARQUITECTURA](docs/ARQUITECTURA.md) | Stack, diagrama de componentes, estructura, tenencia, escalabilidad |
| [BASE-DE-DATOS](docs/BASE-DE-DATOS.md) | Esquema PostgreSQL, relaciones, índices, borrados, matriz RLS, migraciones |
| [SEGURIDAD](docs/SEGURIDAD.md) | Modelo de amenazas, autorización, secretos, RGPD, backups |
| [AUTOMATIZACIONES](docs/AUTOMATIZACIONES.md) | Planner, dispatcher, reintentos, idempotencia, monitorización |
| [IMPORTACION](docs/IMPORTACION.md) | Plantilla, validación, staging y confirmación atómica |
| [INTEGRACIONES](docs/INTEGRACIONES.md) | Correo, Stripe (TEST), Google Calendar y otros |
| [API](docs/API.md) | API pública v1 (plan Excelencia) |
| [TESTING](docs/TESTING.md) | Estrategia, casos críticos y cómo ejecutar las pruebas |
| [DESPLIEGUE](docs/DESPLIEGUE.md) | Entornos, procedimiento y checklist de lanzamiento |
| [DECISIONES-TECNICAS](docs/DECISIONES-TECNICAS.md) | ADR y cuestiones resueltas |
| [ESTADO-DEL-PROYECTO](docs/ESTADO-DEL-PROYECTO.md) | Qué está hecho, qué se ha probado y qué sigue |

## Pagos

Stripe funciona **solo en modo TEST**. La aplicación se niega a arrancar con una clave `sk_live_` salvo que `PAYMENTS_LIVE_ENABLED=true` en producción, y ese paso queda reservado al responsable adulto del proyecto tras revisar las obligaciones fiscales y legales.

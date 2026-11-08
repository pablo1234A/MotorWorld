# RevisaYa

SaaS para **empresas mantenedoras de protección contra incendios (PCI)**: clientes e instalaciones, extintores, BIE, detección y demás equipos con su programa de mantenimiento según el RIPCI, etiquetas QR, órdenes de trabajo para los técnicos en el móvil, historial de actuaciones inalterable, incidencias, fotos y documentos, partes en PDF, avisos de vencimiento por correo, informes, importación de Excel y API.

> **RevisaYa no certifica el cumplimiento normativo** ni emite certificados oficiales: ayuda a planificar y registrar el mantenimiento ([docs/NORMATIVA-PCI.md](docs/NORMATIVA-PCI.md)).

> **Estado: transformación PCI completada (2026-11-15)** sobre las Fases 0–12 anteriores ([docs/PCI-DISENO.md](docs/PCI-DISENO.md), [estado](docs/ESTADO-DEL-PROYECTO.md)). Los datos de vehículos de la etapa de talleres se conservan.
> Fases 0–12 (etapa anterior): El producto está construido de punta a punta: talleres y usuarios con 2FA, clientes, vehículos e historial, importación de Excel, avisos automáticos por correo, citas, presupuestos, suscripciones con Stripe (**siempre en modo TEST**), Google Calendar, informes, API, web pública, textos legales (borrador para revisión jurídica) y preparación para producción. Para publicarlo: [docs/DESPLIEGUE.md §6](docs/DESPLIEGUE.md) y [docs/LANZAMIENTO.md](docs/LANZAMIENTO.md). Estado detallado y lo que falta probar con cuentas reales: [docs/ESTADO-DEL-PROYECTO.md](docs/ESTADO-DEL-PROYECTO.md).
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
pnpm stripe:mock             # stripe-mock (pagos de prueba sin claves reales) para los tests de facturación
pnpm check:env .env.local    # comprueba la configuración (también antes de desplegar)
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
| [CITAS-PRESUPUESTOS](docs/CITAS-PRESUPUESTOS.md) | Página pública de citas, solicitud frente a cita, huecos, correos y presupuestos con IVA en PDF |
| [FACTURACION](docs/FACTURACION.md) | Suscripciones con Stripe (siempre TEST): flujo, webhook, puesta en marcha y pruebas |
| [GUIA-DOMINIO-PROPIO](docs/GUIA-DOMINIO-PROPIO.md) | Guía para el taller: registros DNS de su dominio de envío |
| [IMPORTACION](docs/IMPORTACION.md) | Plantilla, validación, staging y confirmación atómica |
| [INTEGRACIONES](docs/INTEGRACIONES.md) | Correo, Stripe (TEST), Google Calendar y otros |
| [API](docs/API.md) | API pública v1 (plan Excelencia) |
| [TESTING](docs/TESTING.md) | Estrategia, casos críticos y cómo ejecutar las pruebas |
| [DESPLIEGUE](docs/DESPLIEGUE.md) | Entornos, publicar paso a paso (Supabase + Vercel), monitorización, copias e incidentes |
| [LANZAMIENTO](docs/LANZAMIENTO.md) | Lista de lo que hay que hacer antes de abrir a talleres reales |
| [INFORMES](docs/INFORMES.md) | Informes (plan Max) y contadores del inicio |
| [DECISIONES-TECNICAS](docs/DECISIONES-TECNICAS.md) | ADR y cuestiones resueltas |
| [ESTADO-DEL-PROYECTO](docs/ESTADO-DEL-PROYECTO.md) | Qué está hecho, qué se ha probado y qué sigue |

## Pagos

Stripe funciona **solo en modo TEST**. La aplicación se niega a arrancar con una clave `sk_live_` salvo que `PAYMENTS_LIVE_ENABLED=true` en producción, y ese paso queda reservado al responsable adulto del proyecto tras revisar las obligaciones fiscales y legales.

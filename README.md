# RevisaYa

SaaS para talleres mecánicos: el taller registra sus clientes, vehículos e historial de revisiones, y RevisaYa envía cada día avisos por correo a los clientes a los que les toca la revisión, con un botón para pedir cita.

> **Estado: Fase 0 completada (diseño), pendiente de aprobación.** Aún no hay código de aplicación. Ver [docs/ESTADO-DEL-PROYECTO.md](docs/ESTADO-DEL-PROYECTO.md).
> "RevisaYa" es un nombre provisional: falta comprobar la marca y el dominio.

## Documentación

| Documento | Contenido |
|---|---|
| [FASE-0-INFORME](docs/FASE-0-INFORME.md) | Análisis de requisitos, plan por fases, riesgos, dependencias y costes |
| [ARQUITECTURA](docs/ARQUITECTURA.md) | Stack, diagrama de componentes, estructura, tenencia, escalabilidad |
| [BASE-DE-DATOS](docs/BASE-DE-DATOS.md) | Esquema PostgreSQL, relaciones, índices, borrados, matriz RLS |
| [SEGURIDAD](docs/SEGURIDAD.md) | Modelo de amenazas, autorización, secretos, RGPD, backups |
| [AUTOMATIZACIONES](docs/AUTOMATIZACIONES.md) | Planner, dispatcher, reintentos, idempotencia, monitorización |
| [IMPORTACION](docs/IMPORTACION.md) | Plantilla, validación, staging y confirmación atómica |
| [INTEGRACIONES](docs/INTEGRACIONES.md) | Correo, Stripe (TEST), Google Calendar y otros |
| [API](docs/API.md) | API pública v1 (plan Excelencia) |
| [TESTING](docs/TESTING.md) | Estrategia y casos críticos |
| [DESPLIEGUE](docs/DESPLIEGUE.md) | Entornos, procedimiento y checklist de lanzamiento |
| [DECISIONES-TECNICAS](docs/DECISIONES-TECNICAS.md) | ADR y cuestiones abiertas |

## Stack previsto

Next.js 16 · React 19 · TypeScript · Tailwind CSS v4 · Supabase (PostgreSQL, Auth, Storage, pg_cron) en la UE · Kysely · Resend/SES · Stripe (modo TEST) · Google Calendar API · Vitest · pgTAP · Playwright.

## Nota sobre el contenido previo

`index__1_.html` (web MOTORWORLD) ya estaba en el repositorio y no forma parte de RevisaYa. Se conserva sin cambios hasta que se decida qué hacer con él (P14 en DECISIONES-TECNICAS).

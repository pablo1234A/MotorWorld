# AnunciaPro

Plataforma SaaS para crear, optimizar, organizar y preparar anuncios de productos de cualquier categoría: desde un particular que vende su móvil hasta una tienda que gestiona miles de referencias.

- **Generador universal** con formularios adaptados a cada categoría (atributos dinámicos) y un motor que **no inventa datos**: redacción natural por tipo de producto, otra versión del texto al regenerar y **medidor de calidad** en vivo.
- **Generación masiva** desde CSV: mapeo de columnas, validación por fila, procesamiento por lotes, reintentos y exportación.
- **Perfiles de marketplace** (Wallapop, Vinted, eBay, Shopify, Facebook Marketplace y plantillas propias) para adaptar, copiar y exportar. Sin integraciones oficiales ni publicación automática.
- **Catálogo** con búsqueda, filtros, paginación en servidor, edición en lote, archivo y fotografías privadas.
- **Planes y límites** controlados en la base de datos con operaciones atómicas. **Stripe integrado y desactivado** (`PAYMENTS_ENABLED=false`).
- **Equipos**: invitaciones por enlace, roles (administrador, editor, solo lectura) y cambio de espacio de trabajo.
- **Panel de administración** separado y validado en servidor.
- **Seguridad**: RLS en todas las tablas privadas, aislamiento por espacio de trabajo, CSRF, limitación de peticiones, validación de archivos por contenido, auditoría.

> Estado real del proyecto, lo verificado y lo pendiente: [docs/ESTADO-DEL-PROYECTO.md](docs/ESTADO-DEL-PROYECTO.md).

## Tecnologías

| Pieza | Versión |
|---|---|
| Next.js (App Router, Route Handlers, Turbopack) | 16.4.6 |
| React | 19.3.1 |
| TypeScript (estricto) | 6.0.3 ¹ |
| Tailwind CSS | 4.3.5 |
| Supabase (PostgreSQL 17, Auth, Storage) · `@supabase/supabase-js` · `@supabase/ssr` | CLI 3.1.0 · 2.119.0 · 0.12.7 |
| Zod · React Hook Form | 4.6.7 · 7.91.0 |
| Stripe SDK | 23.1.0 |
| Radix UI (diálogos, menús, tooltips accesibles) · Sonner (notificaciones) · Lucide (iconos) | 1.8 · 2.0 · 1.71 |
| Vitest · Playwright | 5.1.0 · 1.63.0 |
| Node.js | ≥ 20.9 (probado con 22) |

¹ Se usa TypeScript 6 porque `typescript-eslint` aún no admite TypeScript 7.

## Puesta en marcha local

Requisitos: Node.js 22, pnpm 10 y Docker (para Supabase local).

```bash
pnpm install
pnpm db:start                 # Supabase local: aplica migraciones y arranca Auth, Storage y Mailpit
pnpm exec supabase status     # muestra URL y claves locales
cp .env.example .env.local    # rellena NEXT_PUBLIC_SUPABASE_URL, ANON_KEY y SERVICE_ROLE_KEY con lo anterior
pnpm check:env                # valida la configuración
pnpm dev                      # http://127.0.0.1:3000
```

- Correos de confirmación y recuperación: bandeja local en http://127.0.0.1:54324 (Mailpit).
- Datos de demostración: `pnpm seed:demo` (crea `demo@anunciapro.local` / `Demo12345`).
- Hacer administrador a una cuenta: `pnpm admin:grant correo@dominio.com`.

## Comandos

| Comando | Qué hace |
|---|---|
| `pnpm dev` / `pnpm build` / `pnpm start` | Desarrollo, build de producción y servidor de producción |
| `pnpm typecheck` · `pnpm lint` | Tipos y lint |
| `pnpm test` | Pruebas unitarias |
| `pnpm test:integration` | Pruebas contra Supabase local y el servidor (`pnpm build && pnpm start` antes) |
| `pnpm test:e2e` | Pruebas E2E con Playwright |
| `pnpm test:load` | Prueba de carga local (autocannon) |
| `pnpm check:env` | Comprueba variables de entorno antes de desplegar |
| `pnpm db:reset` | Recrea la base de datos local aplicando todas las migraciones |
| `pnpm db:push` | Aplica las migraciones al proyecto de Supabase enlazado |
| `pnpm db:types` | Regenera los tipos TypeScript de la base de datos |
| `pnpm seed:demo` · `pnpm admin:grant` | Datos demo locales · rol de administrador |

## Documentación

| Documento | Contenido |
|---|---|
| [ARQUITECTURA](docs/ARQUITECTURA.md) | Capas, diagrama, decisiones técnicas, motor de generación, procesamiento por lotes |
| [BASE-DE-DATOS](docs/BASE-DE-DATOS.md) | Esquema, diagrama de relaciones, funciones, migraciones |
| [API](docs/API.md) | Todos los endpoints |
| [SEGURIDAD](docs/SEGURIDAD.md) | Modelo de amenazas, controles y auditoría |
| [STRIPE](docs/STRIPE.md) | Cómo activar los pagos |
| [DESPLIEGUE](docs/DESPLIEGUE.md) | Supabase, Vercel, dominio, almacenamiento, copias de seguridad |
| [TESTING](docs/TESTING.md) | Estrategia y resultados de las pruebas |
| [VARIABLES-ENTORNO](docs/VARIABLES-ENTORNO.md) | Todas las variables |
| [MANTENIMIENTO](docs/MANTENIMIENTO.md) | Operación diaria, tareas periódicas, incidencias |
| [ESTADO-DEL-PROYECTO](docs/ESTADO-DEL-PROYECTO.md) | Qué está terminado, verificado y pendiente |

## Estructura

```
src/
  app/                 Rutas: (marketing) públicas, (auth), app/ (panel), admin/, api/ (Route Handlers)
  components/          UI reutilizable (ui/), panel (app/), administración (admin/), formularios
  domain/              Lógica de negocio pura: generación, categorías, planes, CSV, marketplaces
  server/              Solo servidor: sesión y permisos, servicios, Stripe, HTTP, seguridad
  validation/          Esquemas Zod compartidos por formularios y API
  lib/                 Configuración, clientes de Supabase, utilidades, logger
supabase/              config.toml, migraciones SQL versionadas, plantillas de correo
tests/                 unit/, integration/, e2e/
scripts/               check-env, seed-demo, grant-admin
legacy/                Contenido previo del repositorio (MotorWorld), conservado sin cambios
```

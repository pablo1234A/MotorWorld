# CLAUDE.md — Guía para trabajar en Legalito

@AGENTS.md

Legalito es un micro-SaaS que genera documentos legales para webs a partir de plantillas jurídicas revisadas. Este archivo resume las reglas que cualquier persona o agente debe respetar al modificar el código.

## Reglas de producto (no negociables)

1. **Nada de texto jurídico generado libremente.** El texto legal solo vive en las plantillas (`template_versions.content`), que pasan por revisión profesional. No uses IA para redactar o "mejorar" cláusulas.
2. **Plantillas no aprobadas no llegan a producción.** La base de datos exige revisor, fecha y referencia para aprobar/publicar, y prohíbe aprobar versiones `is_demo`. `ALLOW_DEMO_TEMPLATES=true` hace que la app no arranque con `APP_ENV=production`.
3. **Sin promesas de cumplimiento.** Nunca escribas "cumplimiento garantizado" o similar. Mantén el `DISCLAIMER` (`src/config/site.ts`).
4. **No se inventan actualizaciones legales.** `legal_updates` solo se publican con referencia de revisión.
5. **No se simulan servicios.** Si falta configuración, se muestra "no configurado".

## Reglas técnicas

- **Next.js 16** con Cache Components: lee `node_modules/next/dist/docs/` antes de usar una API. El middleware se llama `proxy.ts`. Todo acceso a cookies/sesión va dentro de `<Suspense>` (los layouts de `panel` y `admin` ya lo hacen) y `getSessionUser()` llama a `connection()`.
- **Autorización siempre en servidor.** Cada Server Action, página y ruta llama a `requireUser()` / `requireOrganization()` / `requireAdmin()` (`src/lib/auth.ts`). El proxy es solo una primera barrera.
- **Dos clientes de Supabase** (`src/lib/supabase/server.ts`):
  - `createSessionClient()` → sesión del usuario, sujeto a RLS. **Usar por defecto.**
  - `createAdminClient()` → `service_role`, ignora RLS. Solo para webhooks, generación, registros y metadatos, **después** de verificar permisos.
- **Nunca confíes en IDs del navegador** para autorizar: la organización se obtiene de la sesión; Stripe se vincula por `stripe_customer_id` guardado en servidor.
- **Pagos idempotentes.** Webhooks registrados en `stripe_events`; cumplimiento con upserts por IDs de Stripe; el estado autoritativo se consulta a la API de Stripe.
- **Emails idempotentes.** Siempre con `sendEmail({ key })`; la clave única evita duplicados.
- **Nuevas tablas**: la migración de RLS revoca privilegios por defecto. Cada tabla nueva debe declarar `enable row level security`, sus `grant` y sus políticas. Añade pruebas en `tests/integration/rls.test.ts`.
- **Nunca edites migraciones aplicadas**: crea una nueva en `supabase/migrations/`.
- **Cuestionario**: cambiar ids o valores de `src/lib/documents/questionnaire.ts` exige subir `QUESTIONNAIRE_VERSION` y revisar las plantillas.
- **Plantillas demo**: tras editar `src/lib/documents/templates/*.demo.ts` ejecuta `npm run db:seed:generate` (hay una prueba que lo verifica).

## Antes de dar algo por terminado

```bash
npm run lint && npm run typecheck && npm test
npm run test:e2e:build && npm run test:e2e
```

`npm run test:db` necesita PostgreSQL local (`TEST_DATABASE_URL`); si no está disponible, esas pruebas se omiten (dilo explícitamente en tu informe).

## Diseño

Colores `#1F3A5F` (navy), `#2F5D8C` (blue), `#F4F1EA` (sand) como tokens en `src/app/globals.css`. Tipografía Inter autoalojada. Componentes en `src/components/ui`. Sin degradados ni efectos innecesarios; responsive y accesible (un `h1` por página, etiquetas en formularios, foco visible).

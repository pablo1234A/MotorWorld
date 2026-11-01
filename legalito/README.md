# Legalito

Micro-SaaS para generar el **aviso legal**, la **política de privacidad** y la **política de cookies** de páginas web de autónomos, profesionales y pequeñas empresas en España, a partir de un formulario inteligente y **plantillas estructuradas, versionadas y revisadas jurídicamente**.

> Legalito no es un despacho de abogados ni sustituye el asesoramiento jurídico. Las plantillas incluidas son **de demostración** hasta que un profesional las revise y apruebe (ver [Lista de lanzamiento](docs/LAUNCH_CHECKLIST.md)).

## Estado

| Área | Estado |
| --- | --- |
| Web pública (inicio, cómo funciona, precios, FAQ, contacto, legales, 5 landings SEO) | Construida |
| Autenticación (registro, verificación, acceso, recuperación, cambio de email) | Construida (requiere proyecto Supabase) |
| Panel de cliente (dashboard, generador, revisión, documentos, datos, suscripción, ayuda) | Construido |
| Motor documental (cuestionario condicional, reglas, variables, PDF y HTML, versionado) | Construido y probado |
| Pagos (Checkout, suscripciones, webhooks idempotentes, impagos, reembolsos, portal) | Construido (requiere cuenta Stripe en modo test) |
| Emails transaccionales (Resend) | Construidos (requiere dominio verificado en Resend) |
| Panel de administración | Construido |
| Plantillas jurídicas aprobadas | **Pendiente: revisión profesional** |
| Páginas legales propias de Legalito | **Borradores pendientes de revisión** |

## Stack

- **Next.js 16** (App Router, Cache Components, Server Actions, `proxy.ts`), **TypeScript**, **Tailwind CSS 4**
- **Supabase**: PostgreSQL con RLS, Auth y Storage privado
- **Stripe**: Checkout, Billing, Customer Portal, webhooks
- **Resend**: emails transaccionales
- **pdf-lib**: generación de PDF en servidor (JavaScript puro)
- **Vitest** + **Playwright** para pruebas
- Hosting recomendado: **Vercel Pro** (uso comercial permitido; Hobby lo prohíbe). Ver [Despliegue](docs/DEPLOYMENT.md).

## Inicio rápido

```bash
cd legalito
npm install
cp .env.example .env.local        # completa Supabase, Stripe (test) y Resend
npm run dev                        # http://localhost:3000
```

Sin variables de Supabase la web pública funciona y el área privada muestra «Servicio no configurado» (nunca se simulan servicios).

Configuración paso a paso: [Supabase](docs/SUPABASE.md) · [Stripe](docs/STRIPE.md) · [Despliegue](docs/DEPLOYMENT.md).

## Scripts

| Comando | Descripción |
| --- | --- |
| `npm run dev` / `build` / `start` | Desarrollo, build y servidor de producción |
| `npm run lint` · `npm run typecheck` | ESLint y TypeScript |
| `npm test` | Pruebas unitarias + integración de base de datos |
| `npm run test:db` | RLS, privilegios y funciones SQL contra PostgreSQL real (`TEST_DATABASE_URL`) |
| `npm run test:e2e:build && npm run test:e2e` | Pruebas end-to-end de la web pública con Playwright (incluye accesibilidad) |
| `scripts/qa-app.sh build\|start\|test` | App completa contra PostgreSQL local y E2E del área privada |
| `npm run db:seed:generate` | Regenera `supabase/seed/templates.sql` desde las plantillas demo del código |
| `npx tsx scripts/stripe-setup.ts` | Crea productos y precios en Stripe **modo test** |

## Estructura

```
legalito/
├── src/
│   ├── app/
│   │   ├── (marketing)/        Web pública y landings SEO
│   │   ├── (auth)/             Acceder, registro, recuperación
│   │   ├── panel/              Área del cliente
│   │   ├── admin/              Administración (solo rol admin)
│   │   ├── api/                Webhook Stripe, descargas, analítica
│   │   └── auth/confirm/       Verificación de enlaces de email
│   ├── components/             UI reutilizable (ui/, marketing/, app/, admin/)
│   ├── lib/
│   │   ├── documents/          Motor documental (cuestionario, reglas, plantillas, PDF/HTML, servicio)
│   │   ├── billing/            Stripe, permisos, cumplimiento de pagos, webhooks
│   │   ├── email/              Plantillas y envío idempotente
│   │   ├── actions/            Server Actions (formularios)
│   │   ├── supabase/           Clientes de sesión (RLS) y de sistema
│   │   └── auth.ts             Capa de acceso a datos de la sesión
│   └── proxy.ts                Refresco de sesión y protección de rutas
├── supabase/
│   ├── migrations/             Esquema, funciones, RLS y storage
│   ├── seed/                   Datos iniciales y plantillas demo
│   └── templates/              Emails de Supabase Auth con la marca
├── tests/                      unit/, integration/ (PostgreSQL), e2e/ (Playwright)
└── docs/                       Documentación técnica y de lanzamiento
```

## Documentación

- [Arquitectura](docs/ARCHITECTURE.md)
- [Motor documental y plantillas](docs/TEMPLATES.md)
- [Supabase](docs/SUPABASE.md) · [Stripe](docs/STRIPE.md) · [Despliegue](docs/DEPLOYMENT.md)
- [Seguridad y privacidad](docs/SECURITY.md) · [Pruebas](docs/TESTING.md)
- [Lista de pendientes para abrir al público](docs/LAUNCH_CHECKLIST.md)
- [Auditoría de calidad (ronda 2)](docs/AUDITORIA.md)

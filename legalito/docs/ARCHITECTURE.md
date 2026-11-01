# Arquitectura

## Visión general

```
Navegador ──► Next.js 16 (Vercel) ──► Supabase (PostgreSQL + Auth + Storage)
                 │   │                      ▲
                 │   └── Resend (emails)    │ webhooks verificados
                 └────► Stripe Checkout / Portal ──┘
```

- El navegador **solo habla con el dominio de Legalito**. Supabase, Stripe y Resend se usan desde el servidor (CSP `connect-src 'self'`).
- Lecturas: Server Components. Escrituras: Server Actions (protección CSRF integrada de Next) y rutas API solo donde hace falta (webhook, descargas, analítica).
- Cache Components: páginas públicas prerenderizadas (FAQ y planes cacheados con `use cache` + etiquetas `faqs` / `products`); zonas privadas dinámicas dentro de `<Suspense>`.

## Capas

| Capa | Ubicación | Responsabilidad |
| --- | --- | --- |
| Presentación | `src/app`, `src/components` | Páginas, formularios, estados de carga/vacío/error |
| Acciones | `src/lib/actions` | Validación con zod, autorización, orquestación |
| Dominio | `src/lib/documents`, `src/lib/billing` | Motor documental, permisos de pago, cumplimiento |
| Acceso a datos | `src/lib/auth.ts`, `src/lib/data`, `src/lib/supabase` | Sesión, RLS, cliente de sistema |
| Base de datos | `supabase/migrations` | Esquema, restricciones, RLS, funciones atómicas, flujo editorial |

## Modelo de datos

- `profiles` (1:1 `auth.users`) → `organizations` (creada automáticamente al registrarse) ← `organization_members`.
- `user_roles` (`admin`, `support`, `legal_reviewer`).
- Comercial: `products` (alcance configurable), `subscriptions`, `payments`, `purchases` (pago único con versiones de plantilla congeladas y límite de generaciones), `stripe_events` (idempotencia).
- Documental: `document_types`, `templates` → `template_versions` (estado, revisión jurídica, contenido inmutable tras revisión), `form_responses` (borrador/completado), `documents` → `document_versions` (versión de plantilla usada, hash, rutas privadas, revocación).
- Editorial: `legal_updates`, `notices`, `faqs`.
- Operación: `email_events`, `support_requests`, `audit_logs`, `app_errors`, `analytics_events`, `rate_limits`.

Los registros económicos usan `on delete set null` para conservar la trazabilidad contable.

## Flujos principales

### Generación de documentos (`src/lib/documents/service.ts`)
1. Respuestas completadas → `validateAnswers` (solo preguntas visibles; descarta ramas ocultas).
2. `buildContext` → datos y banderas (sin texto jurídico).
3. Permisos (`computeEntitlements`) con datos del servidor.
4. Selección de versión: congelada en la compra, publicada, o demo (solo fuera de producción).
5. `renderTemplate`: reglas `when` + variables `{{ruta}}`; si falta una variable, **no se genera**.
6. HTML (escapado) y PDF (pdf-lib) → Storage privado `documents/{org}/{tipo}/{versión}`.
7. `record_document_version` (transacción: numeración, versión actual, auditoría). Clave de lote idempotente.
8. Email «documentos disponibles».

### Pago
1. `startCheckout` (Server Action): producto y precio desde BD, cliente de Stripe de la organización, consentimientos de contenido digital registrados en auditoría.
2. Stripe → webhook firmado → `stripe_events` → `fulfillCheckoutSession` / `syncSubscription` / `recordInvoice` / `recordRefund`.
3. La página de confirmación también ejecuta el cumplimiento (idempotente) verificando que la sesión es de la organización.
4. Generación inicial automática; si falla, el cliente puede generar desde el panel y el error queda en `app_errors`.

### Permisos
| Situación | Generar | Descargar lo generado |
| --- | --- | --- |
| Sin pago | No (solo vista previa parcial) | No hay documentos |
| Pago único con generaciones | Sí (versiones congeladas) | Sí |
| Pago único agotado | No | Sí |
| Suscripción activa | Sí (versión publicada más reciente) | Sí |
| Suscripción con impago | No | Sí |
| Suscripción cancelada | No | Sí (lo generado durante el periodo pagado) |
| Compra reembolsada | No | **No** (versiones revocadas) |

## Decisiones técnicas

- **Next.js 16 con Cache Components** (opción por defecto del framework y obligatoria en la próxima versión mayor).
- **pdf-lib** en lugar de un navegador sin cabeza: sin binarios, rápido y compatible con funciones serverless.
- **Analítica propia sin cookies**: no requiere banner de consentimiento; métricas del embudo calculadas en SQL (`admin_metrics`).
- **Vercel Pro** como hosting recomendado: soporte nativo de Next 16 (Cache Components requiere runtime Node.js) y uso comercial permitido.

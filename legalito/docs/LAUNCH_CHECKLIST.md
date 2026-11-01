# Lista de pendientes para abrir al público

Legalito **no está listo para cobrar a clientes reales** hasta completar los puntos bloqueantes. El código está preparado; lo pendiente son revisiones y configuraciones que solo puede hacer el propietario.

## Bloqueantes jurídicos
- [ ] **Revisión profesional de las tres plantillas** (aviso legal, privacidad, cookies): partir de las versiones demo, crear versión 1.0.0, revisar con abogado/a colegiado/a, registrar aprobación y publicar en /admin/plantillas.
- [ ] Revisión del **catálogo de cookies** y de las reglas de adaptación (qué bloque aplica a qué caso).
- [ ] Revisión de las **páginas legales propias** (`src/content/legal-pages.ts`): completar datos del titular, regiones de proveedores, política de reembolsos, desistimiento en suscripción y límites de responsabilidad. Después `NEXT_PUBLIC_LEGAL_PAGES_REVIEWED=true`.
- [ ] Revisión de textos comerciales (sin promesas de cumplimiento) y de la cláusula de consentimiento de contenido digital en la precompra.
- [ ] Registro de actividades de tratamiento y contratos de encargo con Supabase, Vercel, Stripe y Resend.
- [ ] Confirmar con gestoría: IVA, facturación de pagos únicos y suscripciones, alta censal de la actividad.

## Bloqueantes técnicos / configuración
- [ ] Proyectos Supabase staging y producción (UE), migraciones aplicadas, plantillas de email, SMTP con Resend, primer admin.
- [ ] Stripe: productos y precios, webhook de producción, portal, Smart Retries, email de próxima renovación.
- [ ] Resend: dominio verificado (SPF/DKIM/DMARC).
- [ ] Vercel Pro con dominio, variables de producción y `APP_ENV=production`.
- [ ] Ejecutar la **E2E completa** y los 11 recorridos de docs/TESTING.md en staging.
- [ ] Copias de seguridad (Pro + PITR) y prueba de restauración.
- [ ] MFA en todas las cuentas de servicio.
- [ ] Sustituir el **logotipo provisional** (`public/logo.svg`, `src/app/icon.svg`, `src/components/ui/logo.tsx`) por el original.
- [ ] Revisar la imagen Open Graph (`src/app/opengraph-image.tsx`) cuando esté el logotipo final.

## Autorización expresa del propietario
- [ ] Activar cobros reales: clave `sk_live_`, precios live y `STRIPE_LIVE_PAYMENTS_ENABLED=true`.

## Recomendado tras el lanzamiento
- Condiciones generales de contratación para tiendas online (nuevo tipo de documento).
- Integración o recomendación de plataformas de consentimiento de cookies.
- Purga programada de registros antiguos (analítica, límites, errores).
- Programa de afiliados sobre los parámetros `ref`/UTM ya registrados en el alta.
- Contenido orgánico (guías) enlazado a las landings existentes.

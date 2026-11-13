# Estado del proyecto

Fecha: noviembre de 2026. Rama: `claude/anunciapro-saas-build-mierdl`.

## Resumen

La aplicación está **completa a nivel funcional y verificada en local** (Supabase CLI + build de producción) con pruebas unitarias, de integración, E2E y de carga local. **No se ha desplegado** en ningún entorno en la nube y **no está lista para cobrar**: faltan pasos externos que requieren cuentas y decisiones del titular (ver «Pendiente»).

## Funcionalidades

| Área | Estado | Verificación |
|---|---|---|
| Web pública (landing, cómo funciona, precios, contacto, legales) | ✅ Terminado. Ejemplos generados en directo con el motor real; sin testimonios ni cifras inventadas | E2E |
| Registro, confirmación de correo, login, logout, recuperación y cambio de contraseña, sesiones, eliminación de cuenta | ✅ | Integración + E2E (correo real en Mailpit) |
| Dashboard con datos reales, onboarding, atajos de teclado | ✅ | E2E |
| Catálogo: CRUD, duplicar, archivar/restaurar, búsqueda con debounce, filtros, orden, paginación en servidor, tabla y tarjetas, edición en lote, fotos, margen | ✅ | Integración + E2E |
| Generador universal con atributos por categoría (53 categorías, 103 atributos), redacción natural por tipo de producto y variaciones al regenerar | ✅ | Unitarias (matriz de 432 combinaciones sin datos inventados) + E2E |
| Medidor de calidad del anuncio en vivo | ✅ | Unitarias + E2E |
| Equipos: invitaciones por enlace, roles, cambio de espacio de trabajo | ✅ | Integración + E2E |
| Cambio de correo con confirmación | ✅ | Integración (correo real en Mailpit) |
| Editor: editar, regenerar, tono, acortar, ampliar, mejorar título, copiar, descargar, guardar | ✅ | E2E |
| Anuncios: CRUD, duplicar, favoritos, estados, versiones y restauración, cambio de plantilla, búsqueda, exportación TXT/CSV/JSON/Shopify | ✅ | Integración |
| Generación masiva: CSV, plantilla, mapeo, validación por fila, duplicados, trabajos por lotes, progreso, reintentos, exportación | ✅ | Integración + E2E |
| Perfiles de marketplace y plantillas personalizadas | ✅ (sin integraciones oficiales, por diseño) | Unitarias |
| Planes y límites atómicos en servidor | ✅ | Integración (concurrencia) |
| Stripe | ✅ Implementado y **desactivado**. Lógica de webhooks verificada con firmas locales; **no probado contra Stripe real** | Integración (simulada) |
| Panel de administración | ✅ | Integración |
| Estadísticas | ✅ | E2E |
| Proveedor de IA (Anthropic) | ✅ Implementado y probado con el SDK simulado; **no probado contra la API real** (sin clave). Por defecto se usan plantillas | Unitarias (simulado) |
| Seguridad (RLS, CSRF, rate limit, archivos, XSS, auditoría) | ✅ | Unitarias + integración |
| Documentación | ✅ | — |

## Migraciones

Siete migraciones en `supabase/migrations/`. **Aplicadas y probadas en la base de datos local.** **Pendientes de aplicar** en un proyecto de Supabase en la nube (`pnpm db:push`).

## Pendiente (requiere acción externa)

1. Crear el proyecto de Supabase, aplicar migraciones, configurar Auth (URLs, plantillas de correo, SMTP) — DESPLIEGUE.md §1.
2. Desplegar en Vercel u otro hosting y configurar dominio — DESPLIEGUE.md §2–3.
3. Conceder el primer administrador.
4. Revisión jurídica de privacidad, condiciones y cookies, con los datos reales del titular.
5. Si se quiere cobrar: cuenta, productos, precios, portal y webhook de Stripe; pruebas en modo test — STRIPE.md.
6. Si se quiere IA: clave de Anthropic, prueba de calidad de resultados y actualización de la política de privacidad.
7. Copias de seguridad programadas.

## Limitaciones conocidas

- Las invitaciones al equipo no envían correo: se comparte un enlace personal (y la persona invitada lo ve en su panel). Enviar el correo automáticamente requiere configurar un proveedor de correo transaccional.
- La calidad de los textos del proveedor de IA no se ha evaluado con una clave real. El generador por plantillas redacta con naturalidad y es fiel a los datos, pero no «entiende» el producto: no reescribe la descripción del usuario ni deduce beneficios.
- Pruebas de carga solo en local (ver TESTING.md): no hay cifras de capacidad sobre infraestructura real.
- El rate limit por IP confía en `X-Forwarded-For` (correcto en Vercel; revisar en otros proxies).
- La CSP usa `'unsafe-inline'` para scripts (requisito de Next.js sin nonces).
- Las capturas y pruebas visuales se han hecho en Chromium; no en Safari/Firefox.
- El contenido anterior del repositorio (página estática MotorWorld) se ha conservado en `legacy/` sin integrarlo.

## Mejoras futuras previstas por la arquitectura

Reconocimiento de productos por foto, extracción de características con visión artificial, mejora de imágenes, creatividades, traducción automática, comparación de precios, detección de duplicados (índice trigram ya creado), API pública, integraciones oficiales con marketplaces y sincronización de inventario. Ver ARQUITECTURA.md §«Preparado para el futuro».

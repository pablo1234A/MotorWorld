# Auditoría de calidad · Ronda 2 (1 de noviembre de 2026)

Análisis completo de Legalito: pruebas reales de extremo a extremo, corrección de defectos, mejora estética y de usabilidad, y evaluación final.

## 1. Cómo se ha probado

Por primera vez se ha ejecutado **la aplicación completa** (servidor Next de producción + navegador + PostgreSQL con RLS) sin depender de servicios externos, gracias a un arnés que reproduce la API de Supabase sobre la base de datos real (ver `docs/TESTING.md`).

| Suite | Resultado |
| --- | --- |
| Unitarias + base de datos + flujos de negocio | **103 / 103** |
| E2E web pública (escritorio y móvil, con accesibilidad) | **65 / 65** |
| E2E área privada y administración (escritorio y móvil, con accesibilidad) | **10 / 10** |
| Lint y tipado | Sin errores |

No probado en este entorno (requiere credenciales del propietario): envío real de emails con Resend, pago real en la página de Stripe y verificación por email de Supabase. Las pruebas están escritas (`tests/e2e/full-journey.spec.ts`).

## 2. Defectos encontrados y corregidos

| # | Gravedad | Defecto | Impacto | Corrección |
| --- | --- | --- | --- | --- |
| 1 | **Crítica** | Tres consultas incrustaban `documents(...)` desde `document_versions`, pero hay dos relaciones entre esas tablas: Supabase responde con error de relación ambigua | Descargas de documentos, idempotencia de la generación y listado de administración **rotos en producción** | Relación explícita `documents!document_versions_document_id_fkey` |
| 2 | Alta | Variables `NEXT_PUBLIC_*` no visibles en servidor si no se repetían en tiempo de ejecución | Área privada «no configurada» en algunos despliegues | Lectura explícita en `env()` *(ronda 1)* |
| 3 | Alta | Contraste insuficiente del gris secundario (3,1:1) | Textos de ayuda, avisos legales y pie ilegibles para personas con baja visión (incumple WCAG AA) | Grises recalibrados (≥4,85:1 en todos los fondos) |
| 4 | Media | Un cliente con pago único era expulsado de la página de compra | Imposible pasar de pago único a suscripción | Solo se redirige a suscriptores activos; aviso y plan sugerido |
| 5 | Media | Tablas con scroll horizontal no accesibles con teclado | Contenido inaccesible sin ratón en móvil | Regiones enfocables con etiqueta |
| 6 | Media | Enlaces dentro de texto distinguibles solo por color | Incumple WCAG 1.4.1 | Estilo de enlace unificado con subrayado discreto |
| 7 | Baja | Métricas con formato decimal inglés (`100.0 %`) | Inconsistencia | `Intl` en español |
| 8 | Baja | Icono de email para alertas de cumplimiento | Confuso | Icono de alerta |
| 9 | Baja | Cuatro páginas públicas sin `<h1>` | SEO y accesibilidad | Corregido *(ronda 1)* |

## 3. Mejoras funcionales

- **Copiar código HTML** de cada documento con un clic, listo para pegar en la web.
- **Guía de publicación** por plataforma: WordPress, Wix, Shopify, WooCommerce/PrestaShop, Squarespace/Webflow y web propia.
- **Indicador de progreso** en el panel (cuenta → formulario → modalidad → documentos → publicación).
- **Editar un paso concreto** desde la revisión, sin recorrer todo el formulario.
- **«Guardar y salir»** en el formulario, y nombre del paso visible en móvil.
- **Más tipos de negocio**: asociaciones y entidades sin ánimo de lucro, y «otro tipo de web».
- **Redes sociales** como tratamiento de datos (bloque nuevo en la política de privacidad de demostración).
- **Buscador** en preguntas frecuentes.
- Paso de pago único a suscripción.

## 4. Mejoras estéticas

- Portada: textura sutil y retícula de puntos en la cabecera; documentos en **zig-zag con maquetas** que muestran cómo se adaptan los bloques (sustituye las tres columnas iguales).
- Acceso y registro a **dos columnas** con panel de marca.
- Panel: progreso destacado, lista de documentos compacta con acciones agrupadas, barra lateral fija.
- Administración: **navegación lateral agrupada** (Negocio, Contenido, Operación) en lugar de doble menú.
- Tipografía: títulos equilibrados (`text-wrap: balance`), etiquetas en mayúsculas sustituidas por estilo de frase, cifras tabulares.

## 5. Evaluación final

| Área | Valoración | Comentario |
| --- | --- | --- |
| Seguridad y aislamiento de datos | Sólida | RLS probada con usuarios reales; descargas firmadas; webhooks firmados e idempotentes |
| Motor documental | Sólido | Reglas, variables, versionado y bloqueo de plantillas no aprobadas en base de datos |
| Pagos | Sólido en lógica | Probados compra, reintentos, impagos, cancelación, reembolso y disputas con Stripe simulado; falta prueba con Stripe test real |
| Usabilidad | Buena | Formulario adaptativo, autoguardado, vista previa, guía de publicación |
| Accesibilidad | Buena | Sin infracciones graves WCAG 2.1 AA en las 44 pantallas auditadas (17 públicas, 13 del panel y 14 de administración) |
| Rendimiento | Correcto | Páginas públicas prerenderizadas; 183 KB de JS inicial comprimido |
| Preparación para vender | **No lista** | Bloqueos jurídicos y de configuración en `docs/LAUNCH_CHECKLIST.md` |

## 6. Recomendaciones siguientes (por impacto)

1. **Revisión jurídica de las plantillas** (bloqueante): es lo único que separa el producto de poder venderse.
2. Configurar staging con Supabase, Stripe test y Resend, y ejecutar `full-journey.spec.ts`.
3. Nuevo documento: **condiciones generales de contratación** para tiendas online (la carencia más señalada a ese segmento).
4. Recomendar o integrar un **gestor de consentimiento de cookies** (necesidad detectada en la mayoría de webs con analítica).
5. Textos de primera capa para formularios (consentimiento de newsletter, contacto) generados con la misma plantilla.
6. Purga programada de registros antiguos (analítica, límites, errores) y alertas de errores por email.

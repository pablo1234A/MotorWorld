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

---

# Ronda 3 · Planes, portada, documentos y nueva revisión

## Cambios
| Área | Cambio |
| --- | --- |
| Planes | Tres suscripciones: **Básico 5,99 €/mes (20 documentos/mes)**, **Medium 10,99 €/mes (50)** y **Business 30,99 €/mes (ilimitados)**, más el pago único de 39 €. Cupo por periodo de facturación de Stripe; editable en /admin/productos. La suscripción anterior de 9,99 € queda inactiva (no se borra, por si hubiera clientes). |
| Cupo | Cada documento generado cuenta 1. Los suscriptores pueden regenerar **un solo documento**. Mensajes claros al alcanzar el límite; cambio de plan desde el portal de Stripe. Medidor de uso en inicio, documentos y suscripción. |
| Portada | Cabecera con etiqueta de los tres documentos, maqueta real del producto (pregunta del formulario → documento generado con texto real), tres ventajas clave y franja de normativa (LSSI-CE, RGPD, LOPDGDD, guía AEPD). |
| Documentos | PDF: identificación del titular y del sitio web bajo el título y encabezado en cada página a partir de la segunda. HTML: línea de identificación e **índice navegable** en documentos de 5 o más apartados (anclas con prefijo para no chocar con la web del cliente). El texto jurídico no se ha modificado. |

## Defectos encontrados en esta revisión y corregidos
| Gravedad | Defecto | Corrección |
| --- | --- | --- |
| Media | El límite antiabuso (10 generaciones/hora) bloqueaba a clientes legítimos al regenerar documento a documento | 30/hora; el límite real es el cupo del plan |
| Media | «Mi suscripción»: elementos no válidos dentro de una lista de definiciones (accesibilidad) | Estructura corregida |
| Baja | Página de precios titulada «Dos formas de pagar» | Texto actualizado a los nuevos planes |
| Baja | En la precompra el pago único aparecía antes que las suscripciones | Mismo orden que la web pública, Medium recomendado |

## Resultado de las pruebas
| Suite | Resultado |
| --- | --- |
| Unitarias + base de datos + flujos (incluye cupo: 15 → 18 → error «quedan 2» → 20 → bloqueo) | **108 / 108** |
| E2E pública con accesibilidad WCAG 2.1 AA | **65 / 65** |
| E2E área privada con accesibilidad (incluye suscripción Básico: generar, regenerar un documento, 3 → 4 de 20) | **12 / 12** |

## Limitación conocida
Dos generaciones simultáneas del mismo cliente podrían superar el cupo por unos pocos documentos (la comprobación no es una transacción única). El impacto es mínimo y está acotado por el límite de frecuencia; si se quisiera exactitud absoluta, mover la comprobación a una función SQL con bloqueo.

## Recomendación de producto
Los cupos de 20 y 50 documentos al mes cobran todo su sentido si una cuenta puede gestionar **varias webs o negocios** (agencias, gestorías, consultores). Es la evolución natural para justificar Medium y Business.

---

# Ronda 4 · Precios y posicionamiento

- Precios actualizados: **Medium 9,99 €/mes** (antes 10,99) y **Business 19,99 €/mes** (antes 30,99). Migración `20261101000600_plan_prices.sql`. En Stripe hay que crear precios nuevos (son inmutables) y asignarlos en /admin/productos.
- **SEO** (detalle y pasos del propietario en `docs/SEO.md`):
  - Sección **Guías** (`/guias`) con 6 guías largas y originales: aviso legal, política de privacidad, cookies y banner, obligatoriedad de los textos legales, tiendas online y RGPD para autónomos. Índice navegable, tablas, FAQ, migas de pan y fecha de actualización.
  - Datos estructurados: `Organization` y `WebSite` en todas las páginas; `Article`, `BreadcrumbList` y `FAQPage` en guías; `CollectionPage` en el índice.
  - Título de portada orientado a la búsqueda principal y URL canónica; metaetiquetas de verificación de Google y Bing por variable de entorno; sitemap con guías y `lastmod`; logotipo PNG para Google.
  - Enlazado interno: «Guías» en el menú, columnas «Soluciones» y «Guías» en el pie, guías destacadas en portada y guías relacionadas en cada landing.
  - Corrección detectada al revisar: con cinco enlaces, el menú de escritorio se partía en dos líneas a 1024 px. Ahora el menú completo aparece desde 1024 px sin cortes y por debajo se usa el menú móvil.
- **Exportación HTML**: `scripts/export-html.mjs` genera la web pública en HTML estático (24 páginas con enlaces relativos y menú móvil sin JavaScript de Next) y una portada en un solo archivo con estilos y fuentes incrustados. Sirve para enseñar o revisar la web sin servidor; formularios, acceso, pagos y panel requieren la aplicación.

## Resultado de las pruebas (ronda 4)
| Suite | Resultado |
| --- | --- |
| Unitarias + base de datos + flujos | **108 / 108** |
| E2E pública con accesibilidad WCAG 2.1 AA (ahora incluye las 7 páginas de guías, datos estructurados, canónicas y sitemap) | **83 / 83** |
| Exportación HTML abierta desde disco | Sin enlaces rotos; fuentes y menú móvil funcionando |

El área privada no se ha modificado en esta ronda (solo precios por defecto, ya cubiertos por las pruebas unitarias).

---

# Ronda 5 · Agencias y gestorías, banner de cookies y correcciones

Objetivo: abrir el canal con más potencial (agencias web, gestorías y consultores que gestionan muchas webs) y añadir valor recurrente que justifique la suscripción.

## Nuevas funciones
| Función | Detalle |
| --- | --- |
| **Modo agencia / gestoría** | Registro como «Agencia o gestoría» o activación desde el panel. Alta de clientes (nombre y notas internas), un formulario y unos documentos por cliente, selector de cliente en todo el panel, estados por cliente (sin empezar, en curso, listo, generado), archivar y restaurar sin perder documentos. La facturación y el cupo son de la agencia y se comparten entre clientes; al contratar desde un cliente se generan sus documentos. El pago único no se ofrece para clientes. |
| **Marca blanca** | Los PDF, el HTML y el banner no muestran la marca Legalito: la agencia los entrega como parte de su trabajo. |
| **Banner de consentimiento de cookies** | Incluido en las suscripciones. Categorías deducidas del formulario (preferencias, analítica, publicidad), color y posición configurables, código autónomo para pegar en la web, página de ejemplo para probarlo, instrucciones para marcar scripts e iframes, enlace para cambiar la elección, actualización del modo de consentimiento de Google. «Rechazar» con el mismo nivel y estilo que «Aceptar». |
| **Página /agencias-y-gestorias** | Propuesta, casos de uso, pasos, funciones, planes con equivalencia en clientes al mes y FAQ con datos estructurados. Enlazada en la cabecera, el pie, precios y el sitemap. |
| Administración | Las agencias aparecen con su número de clientes; los documentos indican a qué agencia pertenece cada cliente. |

## Defectos corregidos
| Gravedad | Defecto | Corrección |
| --- | --- | --- |
| Media | **Generaciones simultáneas podían superar el cupo** (limitación conocida de la ronda 3) | Cupo comprobado en `record_document_version` con bloqueo de la suscripción. Prueba con 8 generaciones concurrentes: solo entran las que caben. |
| Media | `record_document_version` aceptaba una suscripción o compra de otra cuenta (solo lo impedía la aplicación) | Ahora lo rechaza la base de datos. |
| Baja | Al activarse una suscripción sin formulario completado se registraba un error falso | Se omite la generación inicial si no hay formulario. |
| Baja | Botones «Abrir cliente» con nombre accesible distinto del texto visible (WCAG 2.5.3) | Detectado por las pruebas de accesibilidad y corregido. |

## Resultado de las pruebas
| Suite | Resultado |
| --- | --- |
| Unitarias + base de datos + flujos (incluye jerarquía de agencias, aislamiento, cupo compartido y concurrencia, metadatos de Stripe manipulados, banner) | **125 / 125** |
| E2E área privada con accesibilidad (incluye recorrido completo de agencia, cookie de cliente manipulada y banner funcionando en el navegador: rechazar, aceptar por categoría y retirar) | **18 / 18** |
| E2E pública con accesibilidad (incluye la página de agencias y el registro como agencia) | **87 / 87** |

## Pendiente para el propietario
- Revisión jurídica de los textos del banner y de la página de agencias, y valorar una cláusula de encargo de tratamiento en las condiciones para agencias (ver `docs/LAUNCH_CHECKLIST.md`).
- Aplicar las migraciones 0700 y 0800 en Supabase.

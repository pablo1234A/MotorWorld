# Posicionamiento en Google (SEO)

> **Expectativa realista.** Nadie puede garantizar el primer puesto en Google: depende de la competencia, de la antigüedad del dominio, de los enlaces que reciba la web y de cientos de señales que Google no publica. Lo que sí se puede hacer es tener la web técnicamente impecable, publicar el mejor contenido para cada búsqueda y conseguir autoridad con constancia. Eso es lo que prepara este proyecto. Los primeros resultados suelen verse entre 3 y 6 meses después del lanzamiento.

## 1. Qué está hecho en el código

| Área | Implementación |
| --- | --- |
| Indexación | `sitemap.xml` con todas las páginas públicas (incluidas guías con `lastModified`), `robots.txt` que bloquea `/panel`, `/admin`, `/api`, `/auth` en producción y todo en entornos de prueba |
| URLs canónicas | `alternates.canonical` en portada, landings, guías y páginas legales |
| Títulos y descripciones | Únicos por página y orientados a la búsqueda principal; portada: «Generador de aviso legal, política de privacidad y cookies» |
| Datos estructurados | `Organization` + `WebSite` (todas las páginas), `SoftwareApplication` con ofertas (portada), `Article` + `BreadcrumbList` + `FAQPage` (guías), `BreadcrumbList` + `FAQPage` (landings), `CollectionPage` (índice de guías) |
| Contenido | 5 landings comerciales + 6 guías largas (`src/content/guides.ts`) con índice, tablas, FAQ y enlaces internos cruzados |
| Enlazado interno | Menú «Guías», pie con soluciones y guías, guías destacadas en portada, guías relacionadas en cada landing y cada guía enlaza a su landing y a otras guías |
| Rendimiento | Páginas públicas prerenderizadas (HTML estático), fuente autoalojada, JS mínimo: buenos Core Web Vitals |
| Accesibilidad | WCAG 2.1 AA verificado con axe en las pruebas E2E (Google lo valora indirectamente) |
| Redes sociales | Open Graph e imagen generada (`opengraph-image.tsx`) |
| Verificación | `NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION` y `NEXT_PUBLIC_BING_SITE_VERIFICATION` generan las metaetiquetas |

## 2. Mapa de palabras clave

Cada búsqueda tiene **una sola página** responsable (evita que dos páginas propias compitan entre sí).

| Búsqueda principal | Intención | Página |
| --- | --- | --- |
| generador de aviso legal, política de privacidad y cookies | Comercial | `/` |
| generador aviso legal | Comercial | `/generador-aviso-legal` |
| generador política de cookies | Comercial | `/generador-politica-de-cookies` |
| política de privacidad autónomos | Comercial | `/politica-de-privacidad-autonomos` |
| textos legales página web | Comercial | `/textos-legales-pagina-web` |
| documentos legales tienda online | Comercial | `/documentos-legales-tienda-online` |
| aviso legal qué debe incluir | Informativa | `/guias/aviso-legal-que-es-y-que-debe-incluir` |
| qué debe incluir una política de privacidad | Informativa | `/guias/politica-de-privacidad-que-debe-incluir` |
| banner de cookies / consentimiento cookies | Informativa | `/guias/politica-de-cookies-y-banner-de-consentimiento` |
| es obligatorio el aviso legal | Informativa | `/guias/es-obligatorio-aviso-legal-privacidad-cookies` |
| textos legales tienda online | Informativa | `/guias/textos-legales-tienda-online` |
| RGPD autónomos | Informativa | `/guias/rgpd-para-autonomos` |
| precio aviso legal / cuánto cuesta | Transaccional | `/precios` |

## 3. Pasos del propietario al lanzar (imprescindibles)

1. **Dominio definitivo** (idealmente `.es` o `.com` corto) y `NEXT_PUBLIC_SITE_URL` con `https://`. Con `APP_ENV=production` el `robots.txt` permite indexar.
2. **Google Search Console**: añadir la propiedad, copiar el código de la metaetiqueta en `NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION`, redesplegar, verificar y **enviar `https://tu-dominio/sitemap.xml`**. Pedir indexación manual de portada, landings y guías.
3. **Bing Webmaster Tools**: igual con `NEXT_PUBLIC_BING_SITE_VERIFICATION` (también alimenta a otros buscadores y asistentes).
4. Comprobar los datos estructurados con la [Prueba de resultados enriquecidos](https://search.google.com/test/rich-results) en portada y una guía.
5. Revisar las guías con un profesional jurídico antes de publicarlas (son divulgativas, pero deben ser exactas) y actualizar el campo `updated` cuando se revisen.

## 4. Autoridad (lo que más pesa y no se puede programar)

- **Perfil de Empresa en Google** si hay domicilio o atención al público.
- **Enlaces de calidad**: directorios de herramientas para autónomos y pymes, asociaciones de autónomos, colegios profesionales, cámaras de comercio, gestorías y agencias web asociadas (programa de afiliados con `ref`).
- **Colaboraciones**: artículos invitados en blogs de emprendimiento, WordPress, Shopify o marketing digital, enlazando a la guía correspondiente.
- **Menciones**: foros y comunidades donde se pregunte por textos legales (aportando valor, sin spam).
- **Nunca** comprar enlaces ni usar redes de blogs: Google lo penaliza.

## 5. Calendario de contenido (sugerido)

Publicar **2 guías al mes** en `src/content/guides.ts` (se añaden solas al índice, al sitemap y al pie). Ideas por orden de demanda:

1. Condiciones generales de contratación para tiendas online.
2. Cómo poner el aviso legal en WordPress / Wix / Shopify (paso a paso con capturas).
3. Google Analytics 4 y el RGPD: qué hay que hacer.
4. Formularios de contacto y RGPD: el texto de primera capa.
5. Newsletter y consentimiento: requisitos para enviar emails comerciales.
6. Sanciones de la AEPD a pequeñas webs: casos reales y cómo evitarlos (citar fuentes oficiales).
7. Derecho de desistimiento en tiendas online.
8. Píxel de Meta y cookies publicitarias.

Reglas: contenido propio y original, respuesta directa en el primer párrafo, una búsqueda principal por guía, enlaces a fuentes oficiales (BOE, AEPD), sin promesas de cumplimiento ni actualizaciones legales inventadas.

## 6. Medición

- Search Console: impresiones, clics, posición media y consultas por página (mensual).
- Analítica propia (`analytics_events`): visitas a landings/guías → registros → compras.
- Revisar cada 3 meses las páginas con muchas impresiones y pocos clics: mejorar título y descripción.

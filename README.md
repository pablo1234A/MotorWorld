# World Builder AI

Creador de webs profesionales con IA. Describes tu negocio y World Builder AI planifica las páginas, elige una dirección de arte, escribe el contenido, revisa la calidad y publica. Después lo editas en un editor visual o conversando con Claude Opus 5.5.

> Informe inicial de auditoría (skills, proveedores, arquitectura, limitaciones): [`docs/AUDIT.md`](docs/AUDIT.md)

## Puesta en marcha

```bash
npm install            # instala dependencias y copia GSAP/Three.js a public/vendor
cp .env.example .env.local
npm run dev            # http://localhost:3000
```

No hace falta ninguna cuenta externa para empezar: la base de datos es PGlite (Postgres embebido en `.data/pglite`) y, sin `ANTHROPIC_API_KEY`, la generación y el chat usan el motor local determinista. Cada clave que añadas en `.env.local` activa una integración real (ver `/integrations` dentro de la app).

| Variable | Activa |
|---|---|
| `ANTHROPIC_API_KEY` | Generación y edición por chat con **Claude Opus 5.5** (`claude-opus-5-5`) |
| `DATABASE_URL` | Postgres de Neon o Supabase en lugar de PGlite |
| `UNSPLASH_ACCESS_KEY` / `PEXELS_API_KEY` | Búsqueda de fotos de stock con atribución |
| `RESEND_API_KEY` | Aviso por email de cada envío de formulario |
| `STRIPE_SECRET_KEY` | Checkout de Stripe para carritos (los Payment Links no lo necesitan) |
| `VERCEL_TOKEN` | Despliegue del sitio en Vercel desde el editor |
| `APP_URL` | URL pública (sitemaps, formularios de sitios exportados) |

## Scripts

| Comando | Qué hace |
|---|---|
| `npm run dev` / `build` / `start` | Desarrollo, build de producción y servidor |
| `npm run typecheck` | TypeScript estricto |
| `npm test` | 38 tests unitarios (Vitest) |
| `BASE_URL=http://localhost:3000 npm run test:e2e` | Test end-to-end en Chromium real (Playwright) |

## Arquitectura

```
src/engine   Núcleo isomórfico (servidor y navegador), sin React
  schema       Modelo de documento validado con zod: Proyecto → Páginas → Secciones → Contenido
  brief        Análisis del brief: sector, nombre, ciudad, oferta, necesidades, estilo
  kb           Base de conocimiento por sector (copy, planes de página, formularios)
  styles       Motor de estilos: 9 direcciones de arte, paletas derivadas con contraste WCAG
  generate     Planificador + constructor de secciones con variantes sembradas
  validate     QA estático: enlaces, contraste, SEO, h1, formularios, contenido de ejemplo…
  autofix      Corrector automático + saneado de HTML
  ops          Operaciones atómicas de edición (la única vía para modificar un documento)
  intents      Intérprete local de instrucciones en lenguaje natural
  art          Arte generativo SVG a partir de la paleta
src/render   Documento → HTML/CSS/JS. Un único renderizador para editor, sitio publicado y ZIP
src/ai       Claude Opus 5.5: salida estructurada, streaming, fallbacks y bucle de reparación
src/server   BD (Drizzle), auth, almacenamiento, integraciones, exportación
src/app      Next.js 16: páginas del creador, API y alojamiento de sitios en /s/<slug>
src/components  UI del creador y editor visual
```

**Decisión central:** los sitios son documentos estructurados, no código suelto. Por eso la IA puede cambiar una sección sin tocar las demás: devuelve operaciones atómicas, que se validan antes de aplicarse. El editor visual y el chat trabajan sobre el mismo modelo, deshacer y rehacer es exacto, y lo que ves en el editor es exactamente lo que se publica y se exporta.

## Estado de las funcionalidades

Leyenda: ✅ funciona y está probado · 🔑 implementado; necesita una clave o cuenta para activarse y no se ha podido probar en el entorno de desarrollo · 🟡 parcial · ⬜ pendiente

| # | Funcionalidad | Estado | Notas |
|---|---|---|---|
| 1 | Describir la web en lenguaje natural | ✅ | Creación rápida en el tablero y asistente de 4 pasos |
| 2 | Seleccionar tipo de proyecto | ✅ | 12 tipos: landing, tienda, SaaS, corporativa, portfolio, restaurante, concesionario, app web, dashboard, educación, 3D, interactiva |
| 3 | Elegir estilo visual | ✅ | 9 direcciones de arte con vista previa real de tipografía y paleta, modo claro u oscuro |
| 4 | Generar estructura completa | ✅ | Multipágina, con navegación y pie sincronizados |
| 5 | Generar el frontend | ✅ | 24 tipos de sección, 54 variantes de layout |
| 6 | Crear componentes | ✅ | Biblioteca de secciones + componentes reutilizables guardados por el usuario |
| 7 | Crear páginas adicionales | ✅ | Desde el panel (con plantillas) o pidiéndolo al chat |
| 8 | Modificar cualquier elemento por instrucciones | ✅ / 🔑 | Motor local para instrucciones comunes; Claude Opus 5.5 para instrucciones libres |
| 9 | Generar animaciones | ✅ | Entradas CSS, escalonadas, parallax, contadores, GSAP ScrollTrigger (modo cinemático), respeto de `prefers-reduced-motion` |
| 10 | Imágenes y vídeos | ✅ / 🔑 | Subidas (validadas por contenido), URL, arte generativo · Unsplash/Pexels con clave |
| 11 | Formularios funcionales | ✅ | Validados contra su definición, honeypot, rate limit, CSV · email con Resend 🔑 · webhook Make/Zapier |
| 12 | Conectar bases de datos | ✅ | PGlite local o Postgres (Neon/Supabase) con `DATABASE_URL`. Los sitios guardan sus formularios en la BD. Colecciones tipo CMS: ⬜ |
| 13 | Autenticación | ✅ | Del creador: scrypt, sesiones en BD, cookies httpOnly, CSRF. Áreas de socios en los sitios generados: ⬜ |
| 14 | Pagos | ✅ / 🔑 | Carrito real, Stripe Payment Links (sin backend), Stripe Checkout con precios leídos del servidor 🔑 |
| 15 | Previsualizar | ✅ | En vivo en iframe aislado; escritorio, tablet y móvil; pestaña nueva |
| 16 | Editar visualmente | ✅ | Selección en el lienzo, edición en línea con doble clic, capas con arrastre, propiedades, tema, SEO |
| 17 | Descargar el código | ✅ | ZIP estático sin dependencias (HTML por página, CSS/JS, medios, sitemap, robots, README) + JSON |
| 18 | Publicar | ✅ / 🔑 | Alojamiento integrado `/s/<slug>` con revisión previa · Vercel con token 🔑 · Dominios propios: ⬜ |

Además: historial de versiones con restauración, deshacer/rehacer, autoguardado con detección de conflictos, gestión de fuentes (Google Fonts curadas y subida de WOFF), biblioteca de recursos, QA con puntuación y corrección automática, escenas 3D con Three.js (3 variantes con *shader* propio y *fallback* sin WebGL), datos estructurados schema.org y FAQPage.

### Pendiente y limitaciones conocidas

- **No se ha probado la IA con clave real.** El cliente de Claude Opus 5.5 está implementado siguiendo el SDK oficial: salida estructurada, streaming, *fallbacks* del servidor, reparación y validación con zod. En este entorno no había `ANTHROPIC_API_KEY`, así que todo lo verificado se hizo con el motor local.
- **Integraciones externas sin probar aquí.** Unsplash, Pexels, Resend, Stripe y Vercel están implementadas contra sus APIs documentadas, pero el proxy de este contenedor bloquea esos dominios.
- **Fuentes subidas sin aplicar.** Se pueden subir archivos WOFF/WOFF2, pero todavía no se aplican al tema. El tema usa Google Fonts.
- **Pendiente:** dominios personalizados (requiere enrutado por host y DNS), CMS/colecciones, áreas privadas en los sitios generados, colaboración en tiempo real y almacenamiento S3/R2 (la interfaz de almacenamiento ya está preparada para ello).
- **Motor local solo en español.** Sin clave de IA, el contenido se genera en español aunque el brief esté en otro idioma. Con Claude se genera en el idioma del brief.
- **PGlite es monoproceso.** Para producción, configura `DATABASE_URL`.

## Seguridad

- Las claves solo se leen en el servidor y nunca llegan al navegador.
- Las contraseñas se guardan con scrypt y salt. El token de sesión se guarda en BD como hash SHA-256, en una cookie httpOnly y SameSite=Lax.
- Toda mutación autenticada comprueba la cabecera Origin (CSRF). Hay *rate limiting* en login, registro, generación, IA, formularios y checkout.
- Las entradas se validan con zod en cada ruta. Los documentos se validan contra el esquema y el HTML personalizado se sanea en cada guardado.
- Los sitios publicados se sirven con una CSP que solo permite los scripts del runtime, identificados por su hash. Cualquier script o manejador inyectado queda bloqueado, aunque comparta origen con el creador.
- La previsualización del editor corre en un iframe `sandbox` con origen opaco.
- Las subidas se validan por su contenido real (*magic bytes*): no se acepta SVG ni HTML, y se sirven con `nosniff` y CSP `sandbox`.
- El checkout recalcula los precios en el servidor a partir del sitio publicado. El navegador solo envía identificadores y cantidades.
- La publicación exige confirmar el contenido de ejemplo (opiniones, cifras, datos de contacto), para que no salga a Internet como si fuera real.

## Skills de proyecto

`.claude/skills/` incluye skills verificadas (todas con licencia MIT) para seguir desarrollando: `threejs-*`, `awwwards-3d`, `taste`, `animation-performance`, `remove-animations` y `make-*`. El detalle está en [`docs/AUDIT.md`](docs/AUDIT.md).

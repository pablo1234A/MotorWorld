# World Builder AI — Informe de auditoría inicial (Fase 1)

Fecha: 2026-11-03 · Entorno: sesión cloud de Claude Code (contenedor Linux efímero) · Modelo configurado: `claude-opus-5-5`

> Todo lo que aparece aquí se ha comprobado en el entorno. Lo que no se ha podido verificar está marcado como tal.

---

## A. Skills encontradas (ya instaladas)

**42 skills sincronizadas** (instaladas vía plugins de tu cuenta; el manifiesto no guarda el repositorio de origen, así que la procedencia que indico se deduce por nombre y contenido) desde tu cuenta (`~/.claude/skills/synced/…`), **14 skills de plugins** (`data`, `productivity`) y **1 skill local** (`session-start-hook`). Ninguna se ha modificado.

| Skill | Función | Procedencia | Uso en World Builder AI |
|---|---|---|---|
| emil-design-eng | Filosofía de pulido UI de Emil Kowalski | Plugin sincronizado (mismo contenido que emilkowalski/skills) | Reglas de microinteracción del editor y de los sitios generados |
| animate | Construir animaciones con criterio | Plugin sincronizado (mismo contenido que emilkowalski/skills) | Presets de animación (curvas, duraciones, reduced-motion) |
| review-animations / improve-animations / find-animation-opportunities | Auditoría de motion | Plugin sincronizado (mismo contenido que emilkowalski/skills) | QA de motion (Fase 8) |
| animation-vocabulary | Glosario de efectos | Plugin sincronizado (mismo contenido que emilkowalski/skills) | Nombres de presets que entiende el chat |
| apple-design | Movimiento físico y materiales | Plugin sincronizado (mismo contenido que emilkowalski/skills) | Paneles, hojas y transiciones del editor |
| break-ui | Pruebas con datos extremos | Plugin sincronizado (mismo contenido que emilkowalski/skills) | QA de componentes con textos largos y vacíos |
| mobile-native | Detalles de web móvil | Plugin sincronizado (mismo contenido que emilkowalski/skills) | Motor responsive (100dvh, tap targets, safe areas) |
| pick-ui-library / ask-sonner / prototype | Elección de librerías, toasts, variantes | Plugin sincronizado (mismo contenido que emilkowalski/skills) | Sonner para notificaciones del editor |
| animate-expo / write-swift | React Native / Swift | Plugin sincronizado (mismo contenido que emilkowalski/skills) | No aplican a este producto |
| scroll-world | Landing con vuelo continuo al hacer scroll (Higgsfield) | Plugin sincronizado (mismo nombre que oso95/scroll-world) | Plantilla futura «experiencia inmersiva»; requiere créditos de Higgsfield/Monid |
| design-taste-frontend (+ v1) | Anti-«AI slop» para landings | Plugin sincronizado de tu cuenta | Reglas del motor de estilos |
| high-end-visual-design | Diseño de agencia premium | Plugin sincronizado de tu cuenta | Tokens de tipografía, sombras y espaciado |
| gpt-taste | GSAP + layouts editoriales | Plugin sincronizado de tu cuenta | Presets «cinematic» con GSAP ScrollTrigger |
| minimalist-ui / industrial-brutalist-ui | Direcciones de arte | Plugin sincronizado de tu cuenta | Estilos «Minimal» y «Brutalista» |
| redesign-existing-projects / stitch-design-taste | Rediseño y DESIGN.md | Plugin sincronizado de tu cuenta | Modo «mejorar esta sección» |
| imagegen-frontend-web / imagegen-frontend-mobile / brandkit | Dirección de imagen | Plugin sincronizado de tu cuenta | Generación futura de imágenes de referencia |
| impeccable | Diseño, crítica y auditoría de interfaces | Plugin sincronizado | Revisión de calidad visual final |
| full-output-enforcement | Evita truncado de código | Plugin sincronizado | Generación de código completa |
| launch-simulator | Panel de clientes simulados | Plugin sincronizado | Validación de proyectos antes de publicar |
| deep-research | Investigación con subagentes | Anthropic | Investigación de proveedores |
| docx, xlsx, pptx, pdf, docs, google-workspace | Documentos | Anthropic | No necesarios para el núcleo |
| chrome-browser, built-in-browser, computer-use | Control de navegador/escritorio | Anthropic | No disponibles en contenedor cloud |
| skill-creator, import-memory, morning | Utilidades | Anthropic | No necesarios para el núcleo |
| Plugin **data** (10 skills) | SQL, dashboards, visualización | Anthropic | Plantilla «Dashboard» de los sitios generados |
| Plugin **productivity** (4 skills) | Tareas y memoria | Anthropic | No necesarios |

**MCP servers:** `github` ✅, `Make` ✅ (conectado), `Wix` ✅, `Claude_Docs` ✅. Conectores de Amplitude, Asana, Atlassian, ClickUp, Linear, Monday, Notion y Slack **fallaron al conectar** (el proxy de red los rechaza); BigQuery falló por autenticación.

## B. Skills adicionales recomendadas

| Skill | Por qué |
|---|---|
| threejs-* (cloudai-x) | Fundamentos, animación, rendimiento, postprocesado, shaders y R3F para las secciones 3D |
| awwwards-3d (tsogjavklann) | Stack fijado Three.js + GSAP + Lenis para webs 3D con scroll |
| taste (senlindesign) | Extraer el ADN de diseño de una URL de referencia |
| animation-performance, remove-animations (Emil Kowalski) | Faltaban en tu instalación: rendimiento de animaciones y quitar motion innecesario |
| make-* (integromat/make-skills, oficial de Make) | Automatizaciones e integraciones con tu MCP de Make ya conectado |

## C. Skills instaladas y verificadas en esta sesión

Instaladas como **skills de proyecto** en `.claude/skills/` (se versionan con el repo y no tocan tus skills globales). Para cada una he revisado la licencia (todas MIT) y he buscado patrones de riesgo (`curl | sh`, exfiltración, credenciales, inyección de instrucciones). Los scripts incluidos (`awwwards-3d/scripts/*.py`) solo invocan `git init` y `gltf-transform` en local.

| Skill | Procedencia (commit HEAD) | Estado |
|---|---|---|
| threejs-animation, threejs-fundamentals, threejs-performance, threejs-postprocessing, threejs-shaders, threejs-react-three-fiber, threejs-interaction | github.com/cloudai-x/threejs-skills @ `0e18186` | ✅ Instaladas |
| awwwards-3d (sin las capturas de 6 MB) | github.com/tsogjavklann/awwwards-3d @ `01072bd` | ✅ Instalada |
| taste | github.com/senlindesign/taste-skill @ `6dce223` | ✅ Instalada (necesita el MCP de Playwright para capturar URLs) |
| animation-performance, remove-animations | github.com/emilkowalski/skills @ `f1090be` | ✅ Instaladas |
| make-scenario-reference, make-scenario-explore, make-scenario-building, make-scenario-operations, make-credential-requests | github.com/integromat/make-skills @ `9947cbe` | ✅ Instaladas |

**No instaladas, y por qué:**
- **«Milkoval»**: no existe ningún repositorio público con ese nombre (`github.com/milkoval/skills` no responde). Casi seguro se refiere a **Emil Kowalski** (e-**MIL KOWAL**-ski), cuyas skills ya tienes instaladas (`emil-design-eng`, `animate`, etc.). No he inventado ningún repositorio.
- **skills.make.com**: el proxy del contenedor bloquea el dominio. He usado el repositorio oficial equivalente `integromat/make-skills`.
- **scroll-world**: ya la tenías instalada; no la he duplicado.

## D. Proveedores seleccionados

| Función | Elegido | Por qué | Estado en el producto |
|---|---|---|---|
| Framework | **Next.js 16 + React 19 + TypeScript** | SSR, rutas API y publicación en un mismo despliegue | Implementado |
| Estilos del creador | **Tailwind CSS v4** | Tokens en CSS y sin runtime | Implementado |
| Primitivas UI | **Radix UI** (patrón shadcn) + **lucide-react** + **Sonner** | Accesibilidad resuelta; código propio y no una plantilla | Implementado |
| Motion en los sitios | CSS + IntersectionObserver por defecto; **GSAP** solo en el preset «cinematic»; **Three.js** solo en la sección 3D | No penaliza a los sitios que no los necesitan | Implementado y servido desde el propio servidor (sin depender de CDN) |
| IA | **Claude Opus 5.5** (`claude-opus-5-5`) vía `@anthropic-ai/sdk`, solo en el servidor | Modelo principal exigido | Implementado; necesita `ANTHROPIC_API_KEY` |
| ORM | **Drizzle** | Ligero, tipado y SQL-first | Implementado |
| Base de datos | **PGlite** (Postgres embebido) en local · **Neon / Supabase Postgres** en producción mediante `DATABASE_URL` | Mismo dialecto en desarrollo y producción, sin simulaciones | Implementado |
| Autenticación | Propia: scrypt + sesiones en BD + cookie httpOnly | Sin dependencias externas ni datos fuera | Implementado |
| Imágenes | **Unsplash API** / **Pexels API** (clave en el servidor, con atribución) + subidas propias | Licencias claras | Conector implementado; necesita clave |
| Tipografías | **Google Fonts** (parejas curadas) | Libres (OFL) | Implementado |
| Email | **Resend** (avisos de formularios) | Plan gratuito y API simple | Conector implementado; necesita clave |
| Pagos | **Stripe Payment Links** (sin backend) + **Stripe Checkout** (clave en el servidor) | Pagos reales sin simulaciones | Implementado; necesita cuenta de Stripe |
| Archivos | Disco local (`.data/uploads`), con interfaz preparada para S3/R2/UploadThing | Funciona sin cuentas | Implementado en local |
| Publicación | Alojamiento integrado `/s/<slug>` + **Vercel Deployments API** + ZIP para Cloudflare Pages/Render/Netlify | Publica sin cuenta; Vercel con token | Implementado |
| Automatización | **Make** (webhook de formularios) | MCP ya conectado | Webhook opcional por proyecto |

Descartados por ahora: Prisma (más pesado que Drizzle para este caso), Supabase Auth (autenticación propia es suficiente y evita dependencia), Framer Motion en sitios exportados (GSAP/CSS cubren el caso sin React).

## E. Arquitectura recomendada

```
Next.js app (creador)
├── app/(app)        Dashboard, proyectos, recursos, integraciones, ajustes
├── app/editor/[id]  Editor visual (cliente) ⇄ iframe de previsualización
├── app/api/*        Auth, proyectos, versiones, IA, subidas, formularios, export, publicar
└── app/s/[slug]     Sitios publicados (HTML estático servido desde BD)

src/engine   (TS puro, sin React; corre en servidor y navegador)
├── schema       Modelo de documento (zod): Proyecto → Páginas → Secciones → Contenido
├── planner      Detección de sector, plan de páginas y secciones
├── styles       Motor de estilos: paletas, parejas tipográficas, ritmo y radio
├── content      Generador de contenido por sector (motor local)
├── variants     Selección de layouts sembrada (evita repetir siempre la misma plantilla)
├── validate     QA estático: enlaces, alt, h1, contraste, SEO, formularios, repetición
├── autofix      Corrector automático
├── ops          Operaciones de edición atómicas (lo que usa el chat)
└── intents      Intérprete local de instrucciones (cuando no hay clave de IA)

src/render   Documento → HTML/CSS/JS (el mismo para previsualización, publicación y export)
src/ai       Cliente de Claude Opus 5.5: generación y edición con salida estructurada + bucle de reparación
src/server   BD (Drizzle), auth, almacenamiento, integraciones
```

Decisión clave: **los sitios son un documento estructurado, no código suelto.** Así la IA puede editar una sección concreta sin romper las demás, el editor visual y el chat trabajan sobre el mismo modelo, deshacer/rehacer es exacto y lo que ves en la previsualización es exactamente lo que se exporta.

## F. Funcionalidades a desarrollar

Las 18 capacidades del brief. En el README se lleva el estado de cada una (hecho / parcial / pendiente).

## G. Limitaciones técnicas detectadas

1. **No hay `ANTHROPIC_API_KEY` en este contenedor.** El motor de Claude Opus 5.5 está implementado, pero aquí no puedo ejecutarlo de extremo a extremo. Sin clave, el producto usa un **motor local determinista** (planificador + biblioteca de secciones + intérprete de instrucciones), que la interfaz identifica como tal.
2. **Red restringida en el contenedor**: Unsplash, Pexels, Vercel, unpkg y jsDelivr están bloqueados. Las integraciones correspondientes no se han podido probar aquí. GSAP y Three.js se sirven desde `node_modules` (mejor para producción en cualquier caso).
3. **PGlite** es mono-proceso: válido para desarrollo y demo; para producción se usa Postgres (Neon/Supabase) con `DATABASE_URL`.
4. Dominios personalizados: el enrutado por host requiere un despliegue propio con DNS; se deja preparado y documentado.
5. El contenedor es efímero: todo el trabajo se versiona y se sube a la rama `claude/world-builder-ai-platform-vjwvbb`.

## H. Plan de construcción

| Fase | Contenido |
|---|---|
| 1 | Auditoría (este documento) ✅ |
| 2 | Scaffold, esquema de documento, BD, auth |
| 3 | Interfaz del creador: dashboard, asistente de nuevo proyecto, galería, recursos, integraciones |
| 4 | Editor visual: capas, propiedades, iframe con selección y edición inline, dispositivos, deshacer/rehacer, autoguardado |
| 5 | Motor de generación: planner, estilos, contenido, validador, autofix, Claude Opus 5.5 |
| 6 | Subidas, formularios con almacenamiento, Resend, Stripe, imágenes |
| 7 | Exportación ZIP, publicación integrada, despliegue en Vercel |
| 8 | Tests unitarios (Vitest) + e2e (Playwright) + QA visual |
| 9 | Auditoría final y documentación |

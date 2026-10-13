# Skill MAESTRO — instalación

## Claude.ai (web / escritorio / móvil)
1. Ajustes → Capacidades (Capabilities) → activa "Skills" / ejecución de código.
2. En la sección Skills pulsa **Subir skill** y selecciona `maestro.zip` tal cual (sin descomprimir).
3. Se activa sola cuando pidas webs, apps, diseños, automatizaciones, vídeos o juegos.

## Claude Code
Descomprime en tu carpeta de skills:
- Para todos tus proyectos: `unzip maestro.zip -d ~/.claude/skills/`
- Solo para un proyecto: `unzip maestro.zip -d .claude/skills/`
Reinicia Claude Code. Opcional: copia `templates/CLAUDE.md` a la raíz del proyecto y rellénalo.

## Skills complementarias recomendadas
Esta skill dirige; para el máximo nivel en cada área instala además (si tu cuenta las ofrece en el catálogo de skills o desde sus repositorios oficiales): Impeccable, Emil Kowalski (emil-design-eng), Scroll World, Design Taste, High-End Visual Design, Apple Design, Animate, Mobile Native, Break UI. No se incluyen copiadas aquí por respeto a sus licencias y autores.

## Contenido (versión 2.1.0, ver CHANGELOG.md)
- `SKILL.md`: el director. Decide qué guía leer y cómo verificar.
- `references/`: guías de web, interacciones, animación, apps, automatizaciones, copy, SEO, branding, e-commerce, prompts, 3D, eficiencia, velocidad y checklist; carpetas `juegos/` (9 guías) y `video/` (7 guías).
- `examples/`: landing premium, scroll cinematográfico, FPS completo, minijuego, intro y subtítulos en Remotion, automatización con Claude.
- `scripts/`: `check-web.mjs` (revisión de webs), `test-juego.mjs` (prueba de juegos), `video.sh` (exportaciones de vídeo).
- `templates/`: `CLAUDE.md` (ahorro de tokens) y `settings.json` (permisos para que Claude Code no se pare en comandos seguros; cópialo a `.claude/settings.json` y revísalo).

## Requisitos de los scripts
- Node 18+ y Playwright: `npm i -D playwright && npx playwright install chromium`
- ffmpeg para `video.sh` (y Whisper opcional para subtítulos: `pip install openai-whisper`)

## Licencia
Uso libre para el propietario. Las skills de terceros recomendadas mantienen sus propias licencias.

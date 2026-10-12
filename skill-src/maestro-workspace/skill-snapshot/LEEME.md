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

## Contenido
- 15 guías en `references/` (web, animación, apps, automatizaciones, velocidad, vídeo, videojuegos, copywriting, SEO, branding, e-commerce, prompts IA, 3D web, eficiencia, checklist).
- 5 ejemplos funcionales en `examples/` (ábrelos en el navegador o ejecútalos tal cual).
- Plantillas `templates/CLAUDE.md` (ahorro de tokens) y `templates/settings.json` (permisos para que Claude Code no se pare a pedir confirmación en comandos seguros; cópialo a `.claude/settings.json` de tu proyecto y revísalo).

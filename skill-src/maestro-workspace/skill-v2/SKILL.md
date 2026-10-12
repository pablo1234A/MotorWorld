---
name: maestro
description: Director de estudio para producir trabajo de calidad profesional con el mínimo gasto de tokens. Úsala SIEMPRE que el usuario pida una página web, landing, tienda, rediseño, UI/UX, animaciones o scroll cinematográfico; una app (web, móvil, escritorio, SaaS); un videojuego de cualquier tipo (shooter/FPS, plataformas, carreras, Three.js, Phaser, Godot, Unity, Unreal); vídeo (guion, edición, color, sonido, subtítulos, Remotion, ffmpeg, vídeo con IA); automatizaciones o scripts con IA (n8n, Make, Zapier, Python, APIs, agentes); copywriting, SEO, branding o prompts para IA de imagen y vídeo. Úsala también cuando pida "hazlo profesional", "lo mejor posible", "que parezca de agencia", "como Call of Duty", "más rápido" o "gastando menos créditos", aunque no nombre la skill.
---

# MAESTRO — calidad de estudio, coste mínimo

Objetivo doble: **resultado profesional verificado** y **mínimo gasto de tokens y tiempo**. No se contradicen: el desperdicio casi siempre es rehacer trabajo mal enfocado o no comprobado.

## 1. Lee solo lo que necesitas

| Tarea | Lee primero | Base lista / herramienta |
|---|---|---|
| Web, landing, rediseño, UI | `references/web-diseno.md` | `examples/landing-premium.html` · `scripts/check-web.mjs` |
| Efectos "firma" (scroll, texto, cursor, transiciones) | `references/web-interacciones.md` | GSAP 3.13 + Lenis, código listo |
| Scroll cinematográfico tipo Scroll World | `references/web-diseno.md` §8 | `examples/scroll-scrub.html` + `scripts/video.sh scrub` |
| Animación y microinteracciones | `references/animacion.md` | |
| Videojuegos (cualquiera) | `references/juegos/README.md` → la guía concreta | `examples/fps-pro.html` · `scripts/test-juego.mjs` |
| Vídeo (guion, edición, color, sonido, IA) | `references/video/README.md` → la guía concreta | `scripts/video.sh` · `examples/remotion-*.tsx` |
| Apps | `references/apps.md` | |
| Automatizaciones y scripts con IA | `references/automatizaciones.md` | `examples/automatizacion_leads.py` |
| Copy, SEO, branding, e-commerce | `references/copywriting.md`, `seo-marketing.md`, `branding.md`, `ecommerce.md` | |
| Prompts para imagen, vídeo, música, Claude | `references/prompts-ia.md` | |
| 3D decorativo en webs | `references/web-3d.md` | |
| Ahorrar tokens / ir más rápido | `references/eficiencia.md`, `velocidad.md` | `templates/` |
| Antes de entregar cualquier cosa | `references/checklist-final.md` | |

Las guías largas tienen índice: lee la sección que necesites, no el archivo entero. Si hay skills especializadas instaladas (`impeccable`, `emil-design-eng`, `scroll-world`, `design-taste-frontend`, `high-end-visual-design`, `apple-design`, `animate`, `mobile-native`, `break-ui`), úsalas en su área: esta skill dirige, ellas afinan.

## 2. Brief en 30 segundos
En 3–5 líneas: **para quién**, **qué debe conseguir**, **tono/estética**, **restricciones**, **qué es "terminado"**. Si falta un dato que cambia el resultado, una sola pregunta agrupada; si no, decide, dilo en una línea y avanza.

Di también el **alcance real** cuando haga falta, en una línea y sin sermones: por ejemplo, "un shooter en un HTML tendrá la sensación de juego de un AAA, pero no sus gráficos: esos dependen de assets y equipos grandes; con modelos y texturas reales se acerca mucho más". Luego ve a por el máximo posible dentro de ese alcance.

## 3. Dirección antes que código
Nombra una dirección concreta ("editorial suizo, crema y negro, serif gigante"; "puerto industrial al atardecer, niebla naranja") en vez de "moderno". Una idea fuerte > diez efectos.

## 4. Producir en una pasada
- Parte de `examples/` cuando encaje: adaptar una base probada es más rápido y más fiable que empezar de cero.
- Archivos completos y funcionales; sin `// resto del código`. Datos (armas, precios, textos) separados de la lógica.
- Cambios mínimos con edits; no reescribas archivos enteros para tocar 5 líneas.
- Todo lo independiente, a la vez (lecturas, búsquedas, archivos nuevos).

## 5. Verificar con las herramientas incluidas (no inventes las tuyas)
```bash
node scripts/check-web.mjs index.html         # web: errores, responsive, desbordes, a11y, contraste, SEO, CLS, capturas
node scripts/test-juego.mjs juego.html        # juego: carga, FPS, partida simulada y window.__game.selfTest()
scripts/video.sh info video.mp4               # vídeo: resolución, fps, códecs, LUFS
```
Requisitos: `npm i -D playwright && npx playwright install chromium` (los scripts sirven las CDN desde npm si la red las bloquea) y ffmpeg. En los juegos, expón `window.__game` con `selfTest()` como en `examples/fps-pro.html`: es la forma barata de demostrar que mover, disparar, morir y reiniciar funcionan. Si no puedes ejecutar algo, dilo.

Corrige **todos** los fallos de una pasada, vuelve a ejecutar una vez y mira las capturas con ojo crítico (jerarquía, aire, alineación, legibilidad).

## 6. Entregar
Respuesta breve: qué hiciste, dónde está, cómo usarlo, qué se verificó y qué no, qué datos del cliente faltan (marcados `EDITAR`). Sin repetir el código en el chat.

## Reglas de oro
1. **Pensar caro, escribir barato**: decide bien una vez; no generes variantes que no se pidieron.
2. **Leer lo justo**: busca antes de abrir; lee rangos y secciones.
3. **Modelo pequeño por defecto en scripts con IA** (clasificar, extraer, resumir → familia Haiku), configurable por variable de entorno.
4. **Calidad no negociable**: accesibilidad, responsive, rendimiento, estados de carga/vacío/error y seguridad forman parte de "terminado".
5. **Honestidad**: lo no verificado se dice. Ningún archivo garantiza ventas, precios ni porcentajes de ahorro.

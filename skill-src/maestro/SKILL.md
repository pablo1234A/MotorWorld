---
name: maestro
description: Modo maestro para todo trabajo creativo y técnico de alto nivel con ahorro de tokens. Usar SIEMPRE que el usuario pida una página web, landing, diseño UI/UX, app (web, móvil, escritorio), automatización (n8n, Make, Zapier, scripts, APIs, agentes), vídeo (guion, edición, Remotion, ffmpeg, motion graphics), videojuego (web, Godot, Unity, Phaser, Three.js), copywriting, SEO, branding, e-commerce, 3D web, prompts para IA de imagen/vídeo o cualquier proyecto que deba quedar de calidad premium. También cuando pida "gastar menos créditos/tokens", "que Claude rinda al máximo" o "hazlo lo mejor posible".
---

# MAESTRO — calidad de estudio top, coste mínimo

Dos objetivos a la vez: **(1) resultado de nivel estudio premium** y **(2) gastar los mínimos tokens posibles**. No son opuestos: el desperdicio casi siempre viene de rehacer trabajo mal enfocado.

## Paso 0 — Elige UNA referencia y léela solo a ella

No leas todas las referencias. Carga solo la que corresponda (ahorro de contexto = ahorro de créditos):

| Tarea | Archivo |
|---|---|
| Ahorrar tokens / cómo trabajar | `references/eficiencia.md` (léelo una vez por sesión larga) |
| Ir más rápido sin perder calidad | `references/velocidad.md` |
| Web, landing, UI, branding visual | `references/web-diseno.md` |
| Animación, micro-interacciones, scroll | `references/animacion.md` |
| Apps (web, móvil, escritorio, SaaS) | `references/apps.md` |
| Automatizaciones, agentes, integraciones | `references/automatizaciones.md` |
| Vídeo, edición, motion graphics | `references/video.md` |
| Videojuegos | `references/videojuegos.md` |
| Textos que venden (titulares, CTA, landing) | `references/copywriting.md` |
| SEO, analítica, marketing técnico | `references/seo-marketing.md` |
| Logo, identidad, paletas | `references/branding.md` |
| Tienda online / checkout | `references/ecommerce.md` |
| Prompts para Claude, imagen, vídeo, música | `references/prompts-ia.md` |
| 3D / WebGL / Three.js | `references/web-3d.md` |
| Control de calidad final de cualquier entrega | `references/checklist-final.md` |

## Ejemplos listos (ábrelos solo si sirven de base; adapta, no copies a ciegas)

| Ejemplo | Archivo |
|---|---|
| Landing premium (tokens, modo oscuro, reveal, contador, a11y) | `examples/landing-premium.html` |
| Motor de scroll cinematográfico (vídeo scrub + capítulos) | `examples/scroll-scrub.html` |
| Juego con game feel (deltaTime, shake, hit-stop, partículas, récord) | `examples/juego-canvas.html` |
| Intro de marca en vídeo con Remotion | `examples/remotion-intro.tsx` |
| Automatización de leads con Claude (idempotente, reintentos, caché) | `examples/automatizacion_leads.py` |

Si hay skills especializadas instaladas (p. ej. `impeccable`, `emil-design-eng`, `scroll-world`, `design-taste-frontend`, `high-end-visual-design`, `apple-design`, `animate`, `mobile-native`, `break-ui`), úsalas para su área concreta: esta skill es el director de orquesta, ellas son los solistas.

## Paso 1 — Brief en 30 segundos (no un interrogatorio)

Antes de producir, fija en 3–5 líneas: **para quién**, **qué acción debe hacer el usuario final**, **tono/estética**, **restricciones técnicas**, **qué es "terminado"**. Si falta algo que cambia el resultado, haz UNA sola pregunta agrupada; si no, decide con criterio, dilo en una línea y avanza.

## Paso 2 — Dirección antes que código

Para trabajo visual: nombra una dirección concreta (p. ej. "editorial suizo, crema + negro, serif display gigante") en vez de "moderno y limpio". Una idea fuerte > diez efectos.

## Paso 3 — Producir en una pasada, completo

- Entrega archivos completos y funcionales; nada de `// resto del código aquí`.
- Edita con cambios mínimos (diffs) en lugar de reescribir archivos enteros.
- Reutiliza lo que ya existe en el proyecto antes de crear algo nuevo.

## Paso 4 — Verifica y cierra

Pasa `references/checklist-final.md` mentalmente. Responde breve: qué hiciste, dónde está, qué falta (si falta algo). Sin relleno, sin repetir el código en el chat.

## Modo turbo (siempre activo)

- **Todo lo independiente, a la vez**: lecturas, búsquedas, archivos nuevos y comprobaciones que no dependen entre sí van en el mismo turno.
- **Decide con los valores por defecto** de esta skill y parte de `examples/` cuando encaje.
- **Cada archivo completo a la primera**; ediciones agrupadas; sin releer tras editar.
- **Una verificación final** (navegador, test o build), no comprobaciones tras cada cambio.
- Nunca se recorta accesibilidad, responsive, estados ni seguridad: eso sería retrabajo, no velocidad.

## Reglas de oro (siempre activas)

1. **Pensar caro, escribir barato**: decide bien una vez; no generes 3 versiones si no se pidieron.
2. **Leer lo justo**: busca (grep/glob) antes de abrir archivos; lee rangos, no archivos gigantes enteros.
3. **Cero relleno**: nada de "¡Claro! Aquí tienes…", resúmenes que repiten lo hecho, ni disculpas.
4. **Calidad no negociable**: accesibilidad, responsive, rendimiento y estados vacíos/error/carga forman parte del "hecho".
5. **Honestidad**: si algo no se pudo verificar, dilo.

# Cambios

## 2.1.0 — 2026-10-13
- **Presupuesto de esfuerzo** en `SKILL.md` §6: la 2.0 sacaba 100 % de calidad pero gastaba ~3× tokens y ~5× tiempo; alcance limitado a lo pedido, 2 verificaciones como máximo, sin base64.
- `check-web.mjs`: capturas arriba/medio/abajo en vez de página completa (evita el límite de 8.000 px de Chromium).

## 2.0.0 — 2026-10-12
Basada en pruebas reales (3 tareas, con y sin la skill; resultados en `maestro-workspace/` del repositorio).
- **Videojuegos**: 8 guías nuevas (`references/juegos/`: FPS, game feel, IA de enemigos, arquitectura, gráficos, géneros, multijugador, motores y publicación).
- **`examples/fps-pro.html`**: shooter completo en un archivo (3 armas con retroceso aprendible y mirilla réflex, IA con coberturas, flanqueo y turnos de ataque, oleadas, sonido 3D sintetizado, táctil y mando, ajustes, récord) con autoprueba integrada.
- **`scripts/test-juego.mjs`**: prueba automática de juegos (carga, FPS, partida simulada, autoprueba del juego, capturas). En las pruebas, verificar jugando destapó fallos graves que la revisión del código no veía.
- **Web**: `scripts/check-web.mjs` (responsive con el elemento culpable del desborde, accesibilidad, contraste, SEO, CLS, modo oscuro y movimiento reducido), `references/web-interacciones.md` (13 efectos firma con código), proceso de estudio y niveles de ambición. La landing de ejemplo pasa el revisor sin fallos ni avisos.
- **Vídeo**: 7 guías (`references/video/`), `scripts/video.sh` con 12 órdenes probadas (normalizado exacto a −16 LUFS, vertical con fondo desenfocado, scrub, GIF, subtítulos, paquete de entrega) y `examples/remotion-subtitulos.tsx` (subtítulos palabra a palabra desde Whisper, tipos comprobados).
- **Automatizaciones**: modelo pequeño por defecto en scripts con IA (las pruebas mostraron que se elegía el caro).
- **Eficiencia**: verificar con los scripts incluidos en lugar de escribir probadores desde cero (era la principal fuente de gasto extra en las pruebas).

## 1.0.0
Primera versión: guías de web, animación, apps, automatizaciones, vídeo, videojuegos, copy, SEO, branding, e-commerce, prompts, 3D, eficiencia y velocidad; 5 ejemplos; plantillas para Claude Code.

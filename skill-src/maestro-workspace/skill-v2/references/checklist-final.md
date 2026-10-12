# Checklist final (pásalo antes de entregar)

**Objetivo**
- [ ] Cumple el criterio de "hecho" del brief.
- [ ] Tiene un concepto/idea reconocible, no aspecto de plantilla.

**Visual / UX**
- [ ] Jerarquía clara en 3 s: qué es, para quién, qué hacer.
- [ ] Tipografía: ≤ 2 familias, escala coherente, longitudes de línea legibles.
- [ ] Color en tokens, contraste AA, modo oscuro si aplica.
- [ ] Estados: hover, focus visible, active, disabled, carga, vacío, error.
- [ ] Responsive 360 → 1920 px sin scroll horizontal.

**Técnica**
- [ ] Sin errores en consola; sin placeholders ni TODOs sin avisar.
- [ ] Accesible por teclado; `alt`, labels y landmarks.
- [ ] Rendimiento: imágenes optimizadas, solo transform/opacity animados, reduced-motion respetado.
- [ ] Secretos fuera del código; entradas validadas.

**Verificación automática (usa los scripts incluidos; no escribas tu propio probador)**
- [ ] Web: `node scripts/check-web.mjs index.html` sin fallos imprescindibles + capturas revisadas.
- [ ] Juego: `node scripts/test-juego.mjs juego.html` en verde (el juego expone `window.__game.selfTest`).
- [ ] Vídeo: `scripts/video.sh info archivo.mp4` → resolución, fps y volumen correctos.
- [ ] Script/automatización: ejecutado con datos simulados.

**Entrega**
- [ ] Respuesta breve: qué se hizo, dónde, cómo ejecutarlo, qué queda pendiente.
- [ ] Lo no verificado se dice explícitamente.

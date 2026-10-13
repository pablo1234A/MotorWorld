# Interacciones "firma" de nivel Awwwards (código listo)

Elige **1–2 por página**. Todas incluyen la versión con movimiento reducido. Versiones fijadas: GSAP 3.13.0 (todos los plugins, incluido SplitText, son gratuitos desde 3.13) y Lenis 1.1.13.

## Contenido
1. Base: scroll suave + ScrollTrigger · 2. Titular que se revela por líneas · 3. Sección horizontal anclada · 4. Tarjetas apiladas · 5. Imagen que se descubre · 6. Marquee infinito · 7. Botón magnético · 8. Cursor propio · 9. Transiciones entre páginas · 10. Lista con vista previa · 11. Tarjeta con inclinación 3D · 12. Grano de película · 13. Parallax sutil solo con CSS

## 1. Base: Lenis + GSAP ScrollTrigger
```html
<script src="https://cdn.jsdelivr.net/npm/gsap@3.13.0/dist/gsap.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/gsap@3.13.0/dist/ScrollTrigger.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/gsap@3.13.0/dist/SplitText.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/lenis@1.1.13/dist/lenis.min.js"></script>
<script>
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
gsap.registerPlugin(ScrollTrigger, SplitText);
if (!reduce) {
  const lenis = new Lenis({ lerp: 0.1 });
  lenis.on('scroll', ScrollTrigger.update);
  gsap.ticker.add(t => lenis.raf(t * 1000)); gsap.ticker.lagSmoothing(0);
}
</script>
```
`gsap.matchMedia()` permite crear animaciones solo para escritorio o solo sin movimiento reducido y las limpia sola.

## 2. Titular que se revela por líneas
```js
document.fonts.ready.then(() => {
  if (reduce) return;
  SplitText.create('.reveal-lines', { type: 'lines', mask: 'lines', autoSplit: true, onSplit: s =>
    gsap.from(s.lines, { yPercent: 105, duration: 1, ease: 'expo.out', stagger: 0.08, scrollTrigger: { trigger: s.elements[0], start: 'top 85%' } }) });
});
```
Espera a las fuentes: si no, las líneas se calculan con la fuente de reserva y se descuadran.

## 3. Sección horizontal anclada
```js
const track = document.querySelector('.h-track');           // contenedor flex con los paneles
gsap.matchMedia().add('(min-width: 900px) and (prefers-reduced-motion: no-preference)', () => {
  gsap.to(track, { x: () => -(track.scrollWidth - innerWidth), ease: 'none',
    scrollTrigger: { trigger: '.h-section', pin: true, scrub: 1, end: () => '+=' + (track.scrollWidth - innerWidth), invalidateOnRefresh: true } });
});
```
En móvil, los paneles se apilan en vertical (sin anclar). La sección exterior lleva `overflow: hidden` para no provocar scroll lateral.

## 4. Tarjetas apiladas (solo CSS)
```css
.stack { display: grid; gap: 24px; }
.stack > .card { position: sticky; top: calc(80px + var(--i) * 16px); }   /* --i = índice de cada tarjeta */
```
Con GSAP se puede reducir la escala de la tarjeta de debajo (`scale: 0.94`, `filter: brightness(.8)`) mientras llega la siguiente.

## 5. Imagen que se descubre al entrar
```css
@supports (animation-timeline: view()) {
  @media (prefers-reduced-motion: no-preference) {
    .img-reveal { animation: reveal linear both; animation-timeline: view(); animation-range: entry 0% cover 40%; }
    @keyframes reveal { from { clip-path: inset(18% 12% 18% 12% round 24px); scale: 1.15; } to { clip-path: inset(0 0 0 0 round 0); scale: 1; } }
  }
}
```
Solo CSS, sin JavaScript, y fluido porque va en el hilo del compositor.

## 6. Marquee infinito
```html
<div class="marquee" aria-hidden="true"><div class="marquee__track"><span>CLIENTE · CLIENTE · CLIENTE · </span><span>CLIENTE · CLIENTE · CLIENTE · </span></div></div>
```
```css
.marquee { overflow: hidden; }                 /* imprescindible: evita el desborde lateral */
.marquee__track { display: flex; width: max-content; animation: mq 30s linear infinite; }
.marquee:hover .marquee__track { animation-play-state: paused; }
@keyframes mq { to { transform: translateX(-50%); } }
@media (prefers-reduced-motion: reduce) { .marquee__track { animation: none; } }
```
Duplica el contenido una vez: el bucle de −50 % queda perfecto. Pon el texto real también en un elemento visible para lectores de pantalla.

## 7. Botón magnético
```js
if (matchMedia('(hover: hover) and (pointer: fine)').matches && !reduce)
  document.querySelectorAll('.magnetic').forEach(el => {
    const xTo = gsap.quickTo(el, 'x', { duration: 0.4, ease: 'power3' }), yTo = gsap.quickTo(el, 'y', { duration: 0.4, ease: 'power3' });
    el.addEventListener('pointermove', e => { const r = el.getBoundingClientRect(); xTo((e.clientX - r.left - r.width / 2) * 0.3); yTo((e.clientY - r.top - r.height / 2) * 0.3); });
    el.addEventListener('pointerleave', () => { xTo(0); yTo(0); });
  });
```

## 8. Cursor propio (solo ratón)
```js
if (matchMedia('(pointer: fine)').matches && !reduce) {
  const c = document.querySelector('.cursor'); let x = 0, y = 0, cx = 0, cy = 0;
  addEventListener('pointermove', e => { x = e.clientX; y = e.clientY; });
  (function loop() { cx += (x - cx) * 0.18; cy += (y - cy) * 0.18; c.style.transform = `translate(${cx}px,${cy}px)`; requestAnimationFrame(loop); })();
  document.querySelectorAll('a, button').forEach(a => { a.addEventListener('pointerenter', () => c.classList.add('big')); a.addEventListener('pointerleave', () => c.classList.remove('big')); });
}
```
CSS: `.cursor { position: fixed; left: -6px; top: -6px; width: 12px; height: 12px; border-radius: 50%; background: #fff; mix-blend-mode: difference; pointer-events: none; transition: scale .2s; } .cursor.big { scale: 3.5; }`. Nunca ocultes el cursor del sistema en campos de texto.

## 9. Transiciones entre páginas (View Transitions)
```css
@view-transition { navigation: auto; }                       /* páginas del mismo dominio, sin JS */
.hero-img { view-transition-name: hero; }                    /* el mismo nombre en ambas páginas = morph */
::view-transition-old(root), ::view-transition-new(root) { animation-duration: .4s; }
@media (prefers-reduced-motion: reduce) { ::view-transition-group(*) { animation: none; } }
```
En una SPA: `document.startViewTransition(() => actualizarDOM())`.

## 10. Lista editorial con vista previa al pasar
Lista de proyectos grande (tipografía 6–8vw); al pasar el ratón, una imagen sigue al cursor (como el cursor del punto 8, con `quickTo`) y cambia de `src`. En táctil, la imagen va dentro de cada fila.

## 11. Tarjeta con inclinación 3D
```js
card.addEventListener('pointermove', e => { const r = card.getBoundingClientRect(), px = (e.clientX - r.left) / r.width - 0.5, py = (e.clientY - r.top) / r.height - 0.5;
  card.style.transform = `perspective(900px) rotateY(${px * 8}deg) rotateX(${-py * 8}deg)`; card.style.setProperty('--gx', `${(px + 0.5) * 100}%`); });
card.addEventListener('pointerleave', () => card.style.transform = '');
```
Añade un brillo con `background: radial-gradient(circle at var(--gx) 30%, rgb(255 255 255 / .18), transparent 40%)` en un pseudo-elemento.

## 12. Grano de película (textura premium)
```css
body::after { content: ""; position: fixed; inset: 0; pointer-events: none; z-index: 100; opacity: .06;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='2'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E"); }
```
Usa `inset: 0` (no `width: 200%` ni posiciones negativas: provocan scroll lateral).

## 13. Parallax sutil solo con CSS
```css
@supports (animation-timeline: scroll()) { @media (prefers-reduced-motion: no-preference) {
  .parallax { animation: px linear both; animation-timeline: view(); }
  @keyframes px { from { translate: 0 -8%; } to { translate: 0 8%; } }
} }
```

## Reglas de rendimiento para todo lo anterior
Anima solo `transform`, `opacity`, `clip-path` y `filter`. `will-change` solo durante la animación. Un único bucle `requestAnimationFrame`. Nada que bloquee el scroll. Comprueba el resultado con `scripts/check-web.mjs` (desbordes, CLS, movimiento reducido).

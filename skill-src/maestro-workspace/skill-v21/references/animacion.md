# Animación y motion

## Orden de decisiones
1. **¿Debe animarse?** Interacciones de alta frecuencia (teclado, menús que se abren 100 veces al día) → animación mínima o ninguna.
2. **Propósito**: orientar (de dónde viene/adónde va), confirmar una acción, mostrar relación, o deleitar (con moderación).
3. **Herramienta**: CSS transitions (estados simples) → CSS keyframes → Web Animations API → Motion (React) / GSAP (timelines, ScrollTrigger) → Three.js/WebGL (3D).
4. **Propiedades**: `transform`, `opacity`, `filter` (con cuidado), `clip-path`. Nunca width/height/top/left.
5. **Curva y duración**:
   - Entrar: `cubic-bezier(0.22, 1, 0.36, 1)` (ease-out fuerte), 200–300 ms.
   - Salir: más rápido, 150–200 ms.
   - Mover en pantalla: `ease-in-out`, 300–500 ms.
   - Springs para gestos/arrastres (Motion: `stiffness 400, damping 30`).
6. **Interrupción**: toda animación disparada por el usuario debe poder interrumpirse y revertirse desde su estado actual (transitions o springs, no keyframes).
7. **Salida y accesibilidad**: `@media (prefers-reduced-motion: reduce)` → sustituir movimiento por fundido o nada.

## Recetas
- **Reveal al hacer scroll**: IntersectionObserver o `animation-timeline: view()`; translateY 16–24 px + opacity, stagger 40–80 ms. No animar cada párrafo.
- **Botón**: `:active { transform: scale(.97) }`, transición 100 ms.
- **Modal/popover**: escala 0.96→1 + opacity desde `transform-origin` del disparador.
- **Scroll suave + pinning**: Lenis + GSAP ScrollTrigger (`pin`, `scrub: true`).
- **Transiciones de página**: View Transitions API (`document.startViewTransition`), nativa y barata.
- **Texto que aparece**: dividir en líneas/palabras con máscara (`overflow:hidden` + translateY 100%).
- **Números**: contar hacia arriba con `tabular-nums` para que no bailen.

## Errores que abaratan
Rebote en todo, duraciones > 600 ms en UI, parallax mareante, animaciones que bloquean la lectura, loaders artificiales.

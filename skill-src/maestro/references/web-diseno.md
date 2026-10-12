# Diseño web de nivel estudio premium

Síntesis de principios de los mejores sistemas de diseño y skills de referencia (Emil Kowalski, Impeccable, Apple HIG, Rauno Freiberg, estudios tipo Awwwards). Si esas skills están instaladas, delega en ellas el detalle.

## 1. Dirección (lo que separa 500 € de 50.000 €)
- Un **concepto** que se pueda decir en una frase ("la web se lee como una revista de arquitectura"). Todo se subordina a él.
- Elige un registro y comprométete: editorial, suizo/brutalista, lujo minimal, tech oscuro, cálido orgánico, retro-futurista… Prohibido el "SaaS genérico": degradado morado, tarjetas con iconos en fila de 3, emoji como iconos, Inter en todo, sombras difusas por defecto.
- **Momento firma**: una interacción o composición memorable por página (hero tipográfico enorme, scroll cinematográfico, cursor custom con sentido, transición de página). Solo uno o dos; el resto, sobrio.

## 2. Tipografía (el 70 % del diseño)
- Máx. 2 familias. Pareja clásica: display con carácter (serif de alto contraste o grotesca expresiva) + sans neutra para texto.
- Fuentes recomendables gratuitas: Instrument Serif, Fraunces, Space Grotesk, Geist, Satoshi (Fontshare), General Sans, Clash Display, Inter Tight, IBM Plex.
- Escala modular (1.25–1.333); titulares con `clamp()`; tracking negativo en display grande (-0.02 a -0.04em), positivo en versalitas pequeñas.
- Texto: 16–18 px, interlineado 1.5–1.65, 60–75 caracteres por línea. `text-wrap: balance` en titulares, `pretty` en párrafos.
- Números tabulares en datos (`font-variant-numeric: tabular-nums`).

## 3. Color
- Construye con tokens en `:root` (fondo, superficie, texto, texto-suave, borde, acento) y versión oscura.
- Neutros ligeramente tintados (no gris puro). Un acento, usado con disciplina (<10 % de superficie).
- Usa OKLCH para escalas coherentes. Contraste AA mínimo (4.5:1 texto, 3:1 UI grande).

## 4. Espacio y composición
- Sistema de 4/8 px. Espaciado generoso entre secciones (96–160 px desktop).
- Rejilla de 12 columnas, pero rómpela con intención: asimetría, sangrados, solapes.
- Jerarquía por tamaño + peso + espacio antes que por color.
- Alinea todo a algo. Bordes de 1 px con baja opacidad > sombras pesadas.
- Radios consistentes y concéntricos (radio interior = exterior − padding).

## 5. Detalles invisibles (escuela Emil Kowalski)
- Estados en todo: hover, focus-visible (anillo claro), active (scale 0.97), disabled, loading, vacío, error.
- Botones: respuesta inmediata al pulsar; nada de transiciones lentas en interacciones frecuentes.
- Animaciones de UI 150–300 ms, `ease-out` para entrar; nunca `ease-in` para algo que el usuario dispara.
- Animar solo `transform` y `opacity`. Respetar `prefers-reduced-motion`.
- Toasts, modales y menús: origen desde el disparador (`transform-origin`), salida más rápida que entrada.
- Imágenes con dimensiones fijadas (sin saltos de layout), `loading="lazy"` salvo el hero.

## 6. Estructura de landing que convierte
1. Hero: promesa clara en ≤ 8 palabras + subtítulo concreto + 1 CTA principal (+1 secundario).
2. Prueba social inmediata (logos, cifra, testimonio).
3. Problema → solución (beneficios, no features).
4. Demostración visual (producto real, vídeo, interactivo).
5. Detalle/features en bento o filas alternas, sin repetir el mismo bloque.
6. Testimonios con nombre, foto y resultado concreto.
7. Precio / oferta + FAQ que derriba objeciones.
8. CTA final + footer cuidado.
Copy: verbos concretos, cifras, voz humana. Prohibido "Revoluciona tu flujo de trabajo".

## 7. Técnica
- HTML semántico, un `h1`, landmarks, `alt` reales. Navegable por teclado.
- Mobile-first; probar a 360, 768, 1280, 1920 px. Sin scroll horizontal. Targets táctiles ≥ 44 px.
- Rendimiento: LCP < 2.5 s, CLS < 0.1. Fuentes con `font-display: swap` y preload de la principal; imágenes AVIF/WebP con `srcset`.
- Stack recomendado según caso: HTML+CSS puro (landing simple), Astro (contenido), Next.js + Tailwind + shadcn/ui (producto), GSAP/Lenis o Motion (animación), Three.js/R3F (3D).
- SEO: title/description únicos, Open Graph, datos estructurados, sitemap.

## 8. Scroll cinematográfico (estilo Scroll World)
Secuencia de vídeo o frames pre-renderizados "scrubbed" con el scroll: sección `sticky` alta (300–500vh), progreso del scroll → `currentTime` del vídeo (codificado con keyframe en cada frame: `ffmpeg -g 1`) o canvas con secuencia de imágenes. Textos que entran por capítulos. Fallback estático en móvil lento y con reduced-motion.

# Solenne — private residences (demo)

Web inmersiva de una inmobiliaria de lujo **ficticia**: un recorrido por una villa controlado por el scroll
(3D en tiempo real), catálogo con búsqueda y filtros que funcionan, ficha de cada villa (galería, día/noche,
plano interactivo, ubicación) y formulario de *Private viewing* con validación.

Todo el contenido (marca, villas, precios, direcciones) es inventado.

## Arrancar

```bash
npm install
npm run dev        # http://127.0.0.1:5173
npm run build      # genera dist/ (estático; funciona en cualquier hosting, usa rutas con #)
npm run preview
```

## Qué hay dentro

| Zona | Dónde | Qué hace |
| --- | --- | --- |
| Recorrido | `src/ui/tour.js`, `src/data/tour.js` | Recorrido fotográfico de Villa Aurelia controlado por el scroll: movimientos de cámara (acercamientos, paneos, giro de dron) sobre fotos reales y transiciones de iris, barrido y revelado. Las tomas se definen en `src/data/tour.js`. |
| Catálogo | `src/ui/catalog.js` | Búsqueda + ubicación + tipo + habitaciones + precio + superficie + orden. Animación FLIP al filtrar. |
| Ficha de villa | `src/pages/villa.js` | Hero, cifras, galería horizontal por scroll + visor a pantalla completa, control Día / Atardecer / Noche, plano interactivo (2 plantas), mapa de distancias, formulario. |
| Formulario | `src/ui/form.js` | Validación de nombre, email, teléfono, residencia, fecha y mensaje. **No hay backend**: confirma en pantalla y no envía nada. |
| Datos | `src/data/villas.js` | Las 8 villas y los parámetros del generador 3D. |

## Imágenes

Las imágenes actuales son **renders generados por el propio motor 3D** (`tools/render-all.mjs`) y están
marcadas como provisionales. No se cargan imágenes externas: todo está en `public/assets/villas/`.

Para sustituirlas por fotografías reales:

```bash
# nombra los archivos <slug>__<clave>.jpg|png|webp  (ver claves en tools/import-photos.mjs)
node tools/import-photos.mjs ./mis-fotos
```

Claves por villa: `hero`, `hero-day`, `hero-night`, `front`, `aerial`, `living`, `kitchen`, `suite`, `bath`, `terrace`, `pool`
(`hero*` comparten encuadre para que el control día/noche encaje). Cada una se exporta a 1920 px y 960 px en WebP.
Los fotogramas de respaldo del recorrido son `tour__s00 … s16` (slug `tour`).

Para regenerar los renders: `npm run dev` en una terminal y `npm run render` en otra (tarda ~30 min con GPU por software).

## Rendimiento y respaldo

- Three.js se carga bajo demanda (chunk aparte); el resto de la web pesa poco.
- Resolución adaptativa: si los fotogramas bajan de ~40 fps, el recorrido reduce el *pixel ratio* solo.
- Móvil / equipos modestos: calidad baja (sin MSAA, sombras de 1024, menos vegetación).
- Sin WebGL, o con `prefers-reduced-motion`: el recorrido pasa a **fotogramas pre-renderizados** con fundido.
- Solo se renderiza mientras el recorrido está en pantalla.

## Accesibilidad

HTML semántico, enlace "Skip to content", foco visible, `aria-live` para resultados y errores, diálogo nativo para el
visor, plano operable con teclado, `prefers-reduced-motion` respetado, contraste ≥ 4,5:1 en texto.

## Cómo encaja Scroll World

La skill `scroll-world` genera el recorrido con **vídeo** (Higgsfield / Seedance, de pago). Aquí se ha
seguido su arquitectura (escenario fijo, progreso suavizado, permanencia por escena, transición continua, respaldo
móvil / reduced-motion) pero con **3D en tiempo real**, que es gratis y editable. Si más adelante quieres clips
de vídeo, el `Tour` puede sustituirse por su motor sin tocar el resto.

## Fotografías del recorrido

Las fotos de Villa Aurelia (`public/assets/tour/`) las aportó el cliente y llevan la marca de agua de la agencia que las tomó. Antes de publicar la web hay que usar fotos propias o con licencia.

`src/world/*` y `tools/render-all.mjs` siguen generando los renders 3D provisionales del resto de villas.

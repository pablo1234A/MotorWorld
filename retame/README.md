# RÉTAME 2.0

Juego diario de retos cortos (lógica, matemáticas, palabras, memoria, trivia, estimación, observación y ordenar). Sitio **estático**: cada URL pública es un `index.html` con todo su contenido en HTML real; el JavaScript añade el juego encima. Sin dependencias de npm para generar el sitio.

## Puesta en marcha

```bash
npm run build          # genera public/ (lo que se publica)
npm run serve          # http://127.0.0.1:8080 para probarlo
npm test               # motor + SEO del HTML generado
npm run test:e2e       # juega de verdad en Chromium (necesita Playwright)
npm run og             # regenera imágenes para redes e iconos (necesita Playwright)
npm run build:single   # standalone/retame.html: todo en un archivo, se abre con doble clic
npm run test:single    # prueba ese archivo con file://
```

### Archivo único (`standalone/retame.html`)

Un solo HTML con todas las páginas, estilos, fuente e iconos dentro. Se abre con doble clic, sin servidor ni internet, y guarda el progreso igual que la web. Las páginas viajan en el hash (`retame.html#/retos/logica/`).

Sirve para probar, enseñar o jugar en local. **No sustituye a `public/` para publicar**: Google no indexa páginas separadas dentro de un hash, no hay imágenes para redes y, sin `siteUrl`, los enlaces de duelo apuntan al archivo de tu dispositivo. Con `siteUrl` configurado, los duelos creados desde el archivo apuntan a la web publicada.

Node 18 o superior. Playwright solo hace falta para `og` y `test:e2e`.

## Antes de publicar: `src/config.js`

Es el único archivo con datos del titular. Los campos vacíos nunca se muestran al usuario; `npm run build` avisa de lo que falta y `STRICT=1 npm run build` falla si falta algo.

| Campo | Para qué | Si está vacío |
|---|---|---|
| `siteUrl` | canonical, sitemap, Open Graph, datos estructurados | **todas las páginas salen con `noindex`** y no hay sitemap |
| `owner`, `ownerId`, `ownerAddress` | privacidad, «Sobre RÉTAME», pie (LSSI-CE) | se usa «el titular de este sitio web» y se omite la frase |
| `contactEmail` | contacto, privacidad | contacto dice que el canal aún no está publicado |
| `social` | enlaces en el pie | no se muestran |
| `adsense.client`, `adsense.slots.*` | anuncios y `ads.txt` | no se carga nada de publicidad |
| `consent.mode` | CMP (ver abajo) | — |

También puedes pasar el dominio sin editar el archivo: `SITE_URL=https://www.tudominio.es npm run build`.

## Publicar

`public/` funciona en cualquier hosting estático (Netlify, Cloudflare Pages, Vercel, GitHub Pages, un servidor nginx…):

- Directorio de publicación: `public` (o el comando `npm run build` y luego `public`).
- `404.html` se sirve en rutas inexistentes en Netlify, Cloudflare Pages y GitHub Pages. En nginx: `error_page 404 /404.html;`.
- Si la web no vive en la raíz del dominio, pon `basePath` (p. ej. `"/retame"`).
- Recomendado: caché larga para `/assets/*` (los nombres llevan hash) y `/fonts/*`.

Después de publicar con el dominio: da de alta la propiedad en Google Search Console y envía `https://tudominio/sitemap.xml`.

## Estructura

```
src/config.js     configuración central
src/content.js    categorías (con su texto SEO), 46 retos escritos a mano y bancos de los generadores
src/engine.js     motor puro: generadores, validación y verificación automática, reto del día, puntos
src/ui.js         plantillas HTML compartidas por el generador y el navegador
src/app.js        navegador: mecánicas, sesiones, reto del día, duelos, progreso, anuncios
src/styles.css    identidad visual
src/static/       fuente autoalojada, imágenes para redes (og/), iconos
build.mjs         genera public/
tests/            motor, SEO del sitio y E2E
```

### URLs

`/`, `/reto-del-dia/`, `/juegos/`, `/retos/`, `/retos/<categoría>/`, `/retos/<categoría>/<reto>/`, `/duelos/`, `/progreso/` (noindex), `/como-funciona/`, `/sobre-retame/`, `/contacto/`, `/privacidad/`, `/cookies/`.

Los enlaces de la versión 1 (`/#/juego/…`, `/#/duelo/…`, `/#/legal/…`…) redirigen a la URL nueva equivalente, conservando los datos del duelo.

## Añadir retos

1. Añade un objeto a `CHALLENGES` en `src/content.js` (mira los existentes).
2. Slug nuevo y estable: es la URL. Nunca reutilices uno borrado.
3. Una sola respuesta correcta. Para números, añade `check` (`expr`, `seq`, `count`, `valores`, `dias`, `edades`…) y la validación lo recalcula.
4. `npm run og` (imagen para redes del reto) y `npm run build`. El build falla si el reto no es válido o repite una pregunta.

El sitemap se actualiza solo y su `lastmod` solo cambia cuando cambia el contenido de la página (`sitemap-state.json`).

## Reto del día

4 o 5 pruebas de categorías distintas con dificultad creciente (normal → experto). La semilla sale de la fecha (`Europe/Madrid`): todo el mundo recibe el mismo reto, recargar no lo cambia y cualquier día pasado se reconstruye (los duelos del reto del día funcionan aunque se abran después). Se puntúa sobre 1000 y se comparte como cuadros 🟩🟨🟥 sin revelar respuestas. Si cambias generadores o bancos, cambian los retos de días futuros y pasados: hazlo con cuidado.

## Publicidad y consentimiento

No hay nada cargado hasta que pongas IDs reales. Pasos:

1. Rellena `owner`, `contactEmail` y `siteUrl`, publica y espera a tener tráfico y contenido indexado.
2. Solicita AdSense. Cuando te aprueben, pon `adsense.client` (`ca-pub-…`) y crea bloques de anuncio para `home`, `content` y `article`; pega sus IDs numéricos en `adsense.slots`. Un hueco vacío no se pinta. Los anuncios nunca aparecen dentro de la zona de juego.
3. Consentimiento (EEE, Reino Unido, Suiza): Google exige una CMP certificada e integrada con el TCF de IAB para servir anuncios personalizados.
   - `consent.mode: "google"` (recomendado): en AdSense → *Privacidad y mensajes* → *Mensaje para reglamentos europeos*, crea y publica el mensaje. Lo muestra el propio código de AdSense; no hace falta nada más en la web.
   - `consent.mode: "tcf"`: si usas otra CMP certificada, pon su script en `consent.cmpScript`. Los anuncios esperan a la señal TCF (`tcloaded` o `useractioncomplete`).
4. `npm run build`: se genera `ads.txt` y las políticas de privacidad y cookies pasan a describir la publicidad.

## Analítica

Desactivada. La web emite eventos como `CustomEvent("retame:event")` en `window`: `daily_started`, `daily_completed`, `challenge_started`, `challenge_completed`, `category_started`, `session_completed`, `duel_created`, `duel_opened`, `duel_completed`, `share_clicked`, `streak_extended`. Para conectarlos, pon `analytics.enabled: true` y define `window.retameTrack = function (name, props) { … }` con la herramienta que elijas, y actualiza las políticas.

## Datos del jugador

Todo en `localStorage` (`retame:v2`). Al primer arranque se migra `retame:v1` sin borrarlo. Datos corruptos se copian a `retame:v2:corrupto` antes de empezar de cero. «Borrar mi progreso» elimina ambas versiones.

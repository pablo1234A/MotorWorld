# Restaurante Puerto Rico · Madrid — sitio web

Web estática, ligera y sin dependencias, lista para cualquier hosting (Apache, Nginx, Netlify,
Cloudflare Pages, GitHub Pages…). Sube **el contenido de esta carpeta** a la raíz del dominio.

## Antes de publicar (checklist)

1. **Dominio** → `bash scripts/configurar-dominio.sh www.tu-dominio-real.es`
   (actualiza canonical, Open Graph, JSON-LD, `robots.txt`, `sitemap.xml` y `.htaccess`).
2. **Fotografías reales** → sigue `assets/img/LEEME.md`. Sin fotos, la web se ve completa
   (los huecos se ocultan solos), pero con fotos propias gana muchísimo.
3. **Aviso legal** → completa los campos `[pendiente]` de `legal/index.html` (titular, NIF, email).
4. **Google Search Console** → verifica la propiedad (meta etiqueta comentada en el `<head>`
   de `index.html` o por DNS) y envía `https://tu-dominio/sitemap.xml`.
5. **Ficha de Google Business Profile** → enlaza la web desde la ficha. Es el factor más
   importante del SEO local: mismo nombre, dirección y teléfono (NAP) que en la web.

## Cambiar el horario

El horario aparece en varios sitios. Si cambia, edita:

| Dónde | Qué |
|---|---|
| `index.html` → tabla `#horario` | `data-abre` / `data-cierra` (24 h) y el texto visible. Día cerrado: añade `data-cerrado` y escribe «Cerrado». El aviso «Abierto ahora / Cerrado» se calcula solo (hora de Madrid). |
| `index.html` → JSON-LD (`<head>`) | `openingHours` y `openingHoursSpecification` |
| `index.html` → textos | franja bajo la portada, sello de «Descubre», menú móvil y pie (busca `13:00`) |

## Reseñas

No se muestran puntuaciones ni reseñas copiadas: las cifras públicas varían según la
plataforma y cambian a diario. La sección enlaza a Google y Tripadvisor. Para destacar
fragmentos de reseñas reales (con permiso), usa la plantilla comentada en la sección `#resenas`.

## Información pendiente de verificar

- **Coordenadas GPS** (`geo` en JSON-LD): no se incluyen porque no se pudieron verificar.
  Cópialas de la ficha de Google Business Profile y añade al bloque `Restaurant`:
  `"geo": { "@type": "GeoCoordinates", "latitude": 40.4…, "longitude": -3.7… }`.
- **Precios de la carta**: no se publican precios individuales (no hay carta oficial actualizada).
- **Web oficial / redes sociales**: no se han encontrado; no se enlaza ninguna.

## Estructura

```
index.html              Página principal (todas las secciones)
legal/index.html        Aviso legal, privacidad y cookies
404.html                Página de error
assets/css/styles.css   Estilos (mobile-first)
assets/js/main.js       Interacción (≈ 8 KB, sin librerías)
assets/fonts/           Fraunces e Instrument Sans (SIL Open Font License), autoalojadas
assets/img/             Fotografías optimizadas + imagen para redes (og)
scripts/                Optimización de imágenes y cambio de dominio
robots.txt, sitemap.xml, site.webmanifest, favicon.*, .htaccess, _headers
```

Si cambias `styles.css` o `main.js`, sube el número `?v=1` en `index.html` para que
los navegadores descarguen la versión nueva.

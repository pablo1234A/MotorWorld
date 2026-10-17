# Richard Mille — web concepto

Web de presentación (no es una tienda) con estética oscura y animaciones ligadas al scroll:
despiece interactivo del RM 002-V2, historia de la marca, ingeniería, materiales, colección,
mapa de boutiques y reserva de cita privada **simulada**.

## Cómo verla

**Versión de un solo archivo:** `dist/richard-mille.html` lleva dentro estilos, código e imágenes.
Se puede descargar, enviar y abrir con doble clic sin ninguna carpeta al lado. Se regenera con
`npm run build`. Las tipografías se cargan de Google Fonts, así que conviene tener internet.

**Opción 1. Sin instalar nada:** abra `index.html` en el navegador. Todo funciona; la lógica de
reservas se ejecuta en el propio navegador.

**Opción 2. Con el backend** (Node.js 18 o superior, sin dependencias):

```bash
cd richard-mille
npm start          # http://localhost:3000  (PORT=8080 npm start para otro puerto)
npm test           # 7 tests de la API y del núcleo
```

Servida así, la web detecta la API y consulta en el servidor la disponibilidad de horas y la
validación de la cita.

## Idiomas (traducción automática)

La web se muestra en el idioma del visitante: **español, inglés, francés, alemán o italiano**; cualquier
otro idioma recibe la versión en inglés. Hay un selector en la barra (y en el menú móvil) y la elección
se recuerda en el navegador.

- **Con el servidor:** cada idioma tiene su propia URL (`/`, `/en/`, `/fr/`, `/de/`, `/it/`), servida ya
  traducida. La portada redirige a cada visitante a su idioma (nunca a los buscadores).
- **Sin servidor** (archivo `index.html` o `dist/richard-mille.html`): se traduce en el propio navegador.
- Las traducciones están en `assets/js/i18n.js` (tabla `[es, en, fr, de, it]`): 399 textos por idioma,
  incluidos formulario, mensajes de error y páginas legales.

## SEO

- Una página por idioma, indexable, con `<html lang>`, título y descripción traducidos.
- URL canónica, `hreflang` para los 5 idiomas + `x-default`, Open Graph y Twitter Card con URLs absolutas.
- Datos estructurados schema.org (`WebSite` + `WebPage`) en JSON-LD.
- `robots.txt` y `sitemap.xml` (con alternativas de idioma) generados por el servidor.
- Listado de boutiques escrito en el HTML para los buscadores.
- Pantalla de carga que solo espera al reloj de portada y las tipografías (mejor LCP).

**En producción define la URL pública** para que canónicas y sitemap sean correctas:

```bash
SITE_URL=https://www.tudominio.com npm start
```

## Publicada en Wix

La web está alojada como sitio **Wix Headless** (estático) en la cuenta del propietario:

- En vivo: https://headless-saobftrkqwx-pablogrcab1023-140e.wix-site-host.com
- Panel: https://manage.wix.com/dashboard/0bac41b8-4481-4530-bf84-040f8872f7f2
  (desde ahí se conecta un dominio propio).

Diferencias con la versión con servidor Node:

- Las imágenes se sirven desde la biblioteca de medios del sitio (`scripts/wix-media.json`).
- Los idiomas se enlazan con `?lang=en|fr|de|it` en lugar de `/en/`…; la detección automática funciona igual.
- La reserva usa la lógica del navegador (el formulario sigue siendo una demostración que no envía nada).
- `robots.txt`, `sitemap.xml`, `hreflang`, Open Graph y JSON-LD se generan con la URL pública.

Para regenerar los archivos (por ejemplo, tras conectar un dominio):

```bash
SITE_URL=https://www.tudominio.com npm run build:wix   # genera dist-wix/
# opcional, archivos más ligeros:
npx esbuild dist-wix/assets/js/main.js --minify --charset=utf8 --outfile=dist-wix/assets/js/main.js --allow-overwrite
```

y se vuelven a subir todos los archivos de `dist-wix/` al mismo sitio.

## Secciones

| # | Sección | Animación |
|---|---------|-----------|
| 01 | **Despiece** | El reloj ensamblado se abre y sus 24 piezas se separan siguiendo el scroll; contador de piezas, fases y etiquetas técnicas. |
| 02 | **Manifiesto** | Las palabras se iluminan al ritmo de la lectura. |
| 03 | **Historia** | El scroll vertical recorre una línea de tiempo horizontal (1951 → hoy). En móvil pasa a vertical. |
| 04 | **Ingeniería** | Zoom progresivo hasta el tourbillon, con una retícula que se dibuja sobre él. |
| 05 | **Materiales** | Tarjetas con inclinación 3D y reflejo que sigue al cursor (texturas generadas por código). |
| 06 | **La pieza** | Ficha del RM 002-V2 con puntos interactivos sobre la imagen. |
| 07 | **Colección** | Lista de familias con imagen flotante que sigue al cursor. |
| 08 | **Boutiques** | Mapa de puntos, filtros por región y estado abierta/cerrada calculado en la zona horaria de cada boutique. |
| 09 | **Cita** | Formulario en 4 pasos: boutique y motivo → calendario y horas → datos → revisión. Genera referencia y archivo `.ics`. |

Se respeta `prefers-reduced-motion`: sin animaciones, con el despiece final visible.

## El formulario no envía nada

Es un entorno de prueba. Ningún dato sale del navegador hacia terceros:

- **Sin servidor:** valida en el navegador y genera la referencia en local.
- **Con servidor:** `POST /api/appointments` valida y responde con una referencia, pero **no
  guarda ni envía** la solicitud. En el log solo aparece la referencia, sin datos personales.

## API

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/api/health` | Estado del servicio |
| GET | `/api/boutiques?region=europa` | Boutiques (filtro opcional por región) |
| GET | `/api/boutiques/:id` | Una boutique |
| GET | `/api/availability?boutique=paris&date=2026-10-20` | Horas del día (ocupación estable por día) |
| POST | `/api/appointments` | Valida la cita y devuelve `{ reference, status: "simulated" }`. Responde 422 si hay errores, 409 si la hora está ocupada, 415, 413 o 429 |

El servidor incluye cabeceras de seguridad (CSP, nosniff, frame-ancestors), compresión
brotli/gzip, ETag/caché, límite de tamaño del cuerpo y de peticiones, y solo sirve
`index.html` y `assets/`.

## Estructura

```
richard-mille/
├── index.html
├── assets/
│   ├── css/styles.css         sistema de diseño completo
│   ├── js/core.js             datos y lógica compartidos entre navegador y servidor (UMD)
│   ├── js/scene-data.js       coordenadas del despiece y máscara del mapa mundial
│   ├── js/main.js             interacción y animaciones (vanilla JS, sin librerías)
│   └── img/                   imágenes WebP + 24 piezas recortadas del reloj
├── dist/richard-mille.html    versión de un solo archivo (npm run build)
├── scripts/build-single.js    genera la versión de un solo archivo
├── scripts/build-wix.js       genera dist-wix/ para el alojamiento en Wix
├── scripts/wix-media.json     imágenes → URLs de la biblioteca de medios de Wix
├── server/server.js           backend Node sin dependencias
├── server/api.test.js         tests (node --test)
└── package.json
```

## Notas

- Es un concepto de diseño **no oficial** y sin afiliación con Richard Mille SA.
- Las direcciones de las boutiques son orientativas (ciudad y zona) y los horarios, ilustrativos:
  compruébelos antes de usarlos en producción.
- Las piezas del despiece se extrajeron por segmentación de la imagen despiezada proporcionada,
  así que cada pieza se mueve de forma independiente.

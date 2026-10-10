# Angolatiens

IA práctica para autónomos y pequeños negocios de España. Sitio estático generado con Node.js, **sin dependencias**.

## Uso

```bash
cd angolatiens
npm run build     # genera ./site
npm test          # genera y comprueba enlaces internos, títulos, descripciones, h1, JSON-LD y sitemap
npm run serve     # sirve ./site en http://localhost:8080
node scripts/e2e.mjs   # pruebas de navegador (Playwright) con el servidor arrancado
```

Despliegue: sube la carpeta `site/` a cualquier alojamiento estático (Cloudflare Pages, Netlify, GitHub Pages). Comando de build: `node src/build.mjs`; carpeta de salida: `site`. El servidor debe servir `404.html` para las rutas que no existen.

## Estructura

```
src/data/       contenido editable: herramientas, guías, negocios, plantillas, novedades y configuración
src/assets/     CSS, JS (buscador, comparador, calculadoras, copiar) y tipografías propias (OFL)
src/build.mjs   generador: plantillas HTML, SEO, sitemap y robots
scripts/        check.mjs (comprobaciones estáticas) y e2e.mjs (navegador)
docs/           investigación, estrategia, plan de 30 días y pendientes
site/           salida generada (se versiona para poder desplegarla directamente)
```

## Reglas editoriales del catálogo
- `price.level`: `oficial`, `terceros` o `sin-verificar`. En `sin-verificar` no se muestra ninguna cifra.
- `affiliateUrl: null` hasta tener un enlace real aprobado. Cuando se rellena, el enlace se marca como «Enlace de afiliado» y lleva `rel="sponsored"`.
- `ease` es una valoración editorial preliminar, y así se indica en el sitio.

Para añadir una guía, añade un objeto a `src/data/guides.mjs`. Aparece sola en la portada, en el listado, en el sitemap y en los enlaces de las herramientas que menciona.

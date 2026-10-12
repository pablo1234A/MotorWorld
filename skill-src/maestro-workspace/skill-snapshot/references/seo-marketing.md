# SEO y marketing técnico

## SEO on-page (checklist)
- `<title>` único, 50–60 caracteres, palabra clave al principio. `meta description` 140–160 con beneficio + CTA.
- Un `h1` con la intención de búsqueda; `h2/h3` como índice lógico.
- URLs cortas y legibles (`/reformas-cocina-madrid`).
- Imágenes: nombre descriptivo, `alt`, AVIF/WebP, `width/height`.
- Enlazado interno con anclas descriptivas.
- Datos estructurados JSON-LD (Organization, LocalBusiness, Product, FAQPage, Article).
- `sitemap.xml`, `robots.txt`, canonical, Open Graph + Twitter Card (imagen 1200×630).
- Core Web Vitals: LCP < 2,5 s, INP < 200 ms, CLS < 0,1.

## Contenido
- Una página por intención de búsqueda. Responder la pregunta en las primeras 2 líneas, luego profundizar.
- Negocio local: Google Business Profile completo, NAP idéntico en toda la web, reseñas.

## Ejemplo JSON-LD (negocio local)
```html
<script type="application/ld+json">
{"@context":"https://schema.org","@type":"LocalBusiness","name":"Taller Ejemplo",
 "address":{"@type":"PostalAddress","streetAddress":"Calle Mayor 1","addressLocality":"Madrid","postalCode":"28001","addressCountry":"ES"},
 "telephone":"+34 600 000 000","openingHours":"Mo-Fr 09:00-19:00","url":"https://ejemplo.com"}
</script>
```

## Medición
Analítica sin cookies (Plausible, Umami) o GA4; eventos en cada CTA; Search Console; pruebas A/B de titular y CTA antes que de colores.

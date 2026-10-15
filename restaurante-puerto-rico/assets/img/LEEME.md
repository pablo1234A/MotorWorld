# Fotografías del Restaurante Puerto Rico

La web está preparada para mostrar **solo fotografías reales** del restaurante.
No se incluyen fotos de stock, de otros restaurantes ni imágenes generadas por IA.

Mientras falte una foto, su hueco se oculta automáticamente (o se muestra un
fondo de diseño), así que la web nunca enseña imágenes rotas.

## Cómo añadirlas

1. Haz o reúne fotos propias (o con permiso expreso del autor). Horizontal salvo
   donde se indica vertical. Luz natural, sin filtros fuertes.
2. Renómbralas con el **nombre base** de la tabla y ponlas en `fotos-originales/`.
3. Ejecuta `bash scripts/optimizar-imagenes.sh`. Se generan en esta carpeta las
   versiones `-800` y `-1600` en `.avif`, `.webp` y `.jpg`.

| Nombre base | Dónde aparece | Formato |
|---|---|---|
| `restaurante-puerto-rico-madrid-portada` | Fondo del hero (plato estrella o fachada) | Horizontal 16:10 |
| `interior-restaurante-puerto-rico-madrid` | «Descubre» y galería | Vertical 4:5 |
| `restaurante-puerto-rico-madrid-fachada-calle-chinchilla` | Galería · Exterior | Vertical 4:5 |
| `comedor-restaurante-puerto-rico-madrid` | Galería · Ambiente | Vertical 4:5 |
| `paella-restaurante-puerto-rico-madrid` | Platos destacados y galería | Horizontal 4:3 |
| `tapas-restaurante-puerto-rico-madrid` | Galería · Tapas | Horizontal 4:3 |
| `carnes-restaurante-puerto-rico-madrid` | Galería · Carnes | Horizontal 4:3 |
| `postres-restaurante-puerto-rico-madrid` | Galería · Postres | Horizontal 4:3 |
| `cocina-casera-restaurante-puerto-rico-madrid` | Galería · Cocina casera | Horizontal 4:3 |
| `callos-a-la-madrilena-restaurante-puerto-rico-madrid` | Platos destacados | Horizontal 4:3 |
| `pollo-al-ajillo-restaurante-puerto-rico-madrid` | Platos destacados | Horizontal 4:3 |
| `tortilla-espanola-restaurante-puerto-rico-madrid` | Platos destacados | Horizontal 4:3 |

Cuando tengas una foto real buena de la fachada o de un plato, puedes sustituir
`og-restaurante-puerto-rico-madrid.jpg` (1200 × 630) para que aparezca al
compartir la web en WhatsApp o redes.

**Importante:** las fotos de clientes publicadas en Google Maps o Tripadvisor
tienen derechos de autor de quien las hizo. No las copies sin su permiso.

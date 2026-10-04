# Flanagan’s — propuesta web

Landing premium para **Flanagans Burguer** (C/ Casiopea 12, esq. C/ Andrómeda · 28938 Móstoles).
Hero con hamburguesa 3D interactiva (Three.js) que se desmonta capa a capa con el cursor, y una
landing editorial con GSAP.

## Ejecutar

Usa módulos ES, así que necesita servirse por HTTP (no abrir con doble clic):

```bash
cd flanagans
python3 -m http.server 8080      # o: npx serve .
# → http://localhost:8080
```

Se puede publicar tal cual en cualquier hosting estático (Netlify, Vercel, GitHub Pages…).
No hay build: todo (Three.js r186, GSAP 3, fuentes) va incluido en `vendor/` y `assets/fonts/`,
sin peticiones a terceros salvo el mapa de Google embebido.

## Interacción

| Entrada | Efecto |
| --- | --- |
| Cursor arriba / abajo | La burger se desmonta progresivamente; la cámara sube o baja |
| Cursor a los lados | Órbita, inclinación y desplazamiento lateral de las capas |
| Cursor al centro / fuera | Vuelve a montarse con muelles (inercia real por capa) |
| Scroll en el hero | También la desmonta mientras el hero sale de pantalla |
| Móvil: tocar | Monta / desmonta · arrastrar = girar con inercia · inclinar el móvil = perspectiva (iOS pide permiso con el botón “Activar inclinación”) |
| “Desmontar en 3D” en cada burger | Carga esa receta en el hero |

Respeta `prefers-reduced-motion`. Si el dispositivo no tiene WebGL, la página sigue funcionando sin el 3D.

## Estructura

```
index.html            maquetación y contenido
css/styles.css        sistema visual (tokens, tipografía, responsive)
js/config.js          enlaces reales, modelo del hero y huecos para fotos
js/main.js            UI: nav, reveals GSAP, carta, mapa, renders de las tarjetas
js/hero.js            escena, cámara, entrada (ratón / táctil / giroscopio), etiquetas
js/snapshots.js       “fotos de estudio” de cada burger generadas con la misma luz
js/burger/            motor de la burger
  Burger.js           pila de capas + física de muelles + adaptador GLB
  recipes.js          recetas (solo ingredientes publicados en la carta)
  ingredients.js      geometría procedural de cada ingrediente
  textures.js         texturas procedurales (pan, carne, queso, tomate…)
  stage.js            luces, entorno y sombra de contacto compartidos
```

## Sustituir por un modelo 3D real (GLB)

1. Exporta el modelo con un nodo por capa llamado `layer_<nombre>`
   (`layer_bun_top`, `layer_sauce`, `layer_lettuce`, `layer_patty`, `layer_bun_bottom`…).
2. Cópialo a `assets/models/burger.glb`.
3. En `js/config.js`:

```js
export const HERO_MODEL = {
  type: 'glb',
  url: 'assets/models/burger.glb',
  labels: { bun_top: 'Pan brioche', patty: 'Carne a la brasa', /* … */ },
};
```

El orden de las capas se deduce de su altura y la escala se normaliza sola; desmontaje, física,
etiquetas y sombras siguen funcionando. Si el GLB falla, vuelve al modelo procedural.

## Fotografía real

Las tarjetas de burgers usan renders 3D generados en el navegador. Para usar fotos del restaurante,
rellena `PHOTOS` en `js/config.js` (por burger y/o una galería del local, que aparece
automáticamente en la sección “El local”).

## Fuentes de los datos

Dirección, horario, carta, precios, enlaces y reseñas proceden de la web oficial
(flanagansburguer.com), su Instagram (@flanagansburguer), Uber Eats, Just Eat, Restaurant Guru
y Sluurpy (consultados en octubre de 2026). Conviene que el restaurante confirme precios y
horario de cierre de comidas antes de publicar.

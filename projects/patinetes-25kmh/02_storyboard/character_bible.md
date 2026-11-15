# Biblia de personajes

Todos los personajes comparten un *rig* vectorial (`drawBody` en `render.html`): cabeza circular, cuello, torso en cápsula, brazos y piernas de 2 huesos resueltos con IK. Color de relleno `#0a1119` y contorno de luz `#3f6f80` desplazado (-3, -2) px.

| Personaje | Escenas | Escala | Rasgos invariantes | Acciones |
|---|---|---|---|---|
| **Piloto** | 1, 2, 4, 5, 7 | 1,0–1,25 | Silueta adulta, de pie sobre la plataforma, manos en el manillar y cuerpo inclinado hacia delante según la velocidad (`lean`). En la escena 7 lleva **casco** con brillo naranja. | Acelerar, inclinarse, pasar un bache, caer (rotación del cuerpo a partir de la cadera) |
| **Peatón** | 2, 4 | 0,82–0,95 | Silueta adulta caminando con ciclo senoidal de piernas y brazos | Caminar por la acera y cruzar por el paso de cebra |
| **Profesor** | 3 | 1,05 | Silueta adulta de pie mirando a la izquierda | Levantar el brazo y señalar la pizarra (interpolación de la mano hacia la fórmula) |
| **Patinete fantasma** | 2, 4 | — | Mismo *rig* con relleno `#2b3f47` y 35–55 % de opacidad | Muestra comparaciones o conductas prohibidas |

## Objetos narrativos

| Objeto | Escenas | Continuidad |
|---|---|---|
| Patinete | 1, 2, 4, 5, 7 | Batalla de 165 px por unidad de escala, ruedas de 20 px de radio con 3 radios que giran según la distancia, faro cálido con haz y piloto trasero rojo |
| Velocímetro | 1, 7 | 0–60 km/h; arco verde de 6 a 25 y rojo por encima de 25; la aguja se vuelve roja al pasar de 25 |
| Señal de 25 | 2 | Señal circular blanca con borde rojo y «25» |
| Pizarra | 3 | Marco de madera, fórmula en tiza blanca y bloques de energía (dorado = 25, rojo = 50) |
| Tarjeta del seguro | 7 | Papel crema con «SEGURO OBLIGATORIO · Ley 5/2025» y sello rojo «VIGENTE» |

# Motores, producción y publicación

## Elegir motor
| Motor | Cuándo | Ventajas | Para un shooter |
|---|---|---|---|
| **Three.js / web** | Se juega con un enlace, prototipos, juegos medianos | Sin instalación, se comparte al instante | Hasta escalón B (ver `README.md`) |
| **Godot 4** | Indie 2D/3D, gratis y ligero | Open source, GDScript sencillo, exporta a web/PC/móvil | `CharacterBody3D` + `move_and_slide`, `RayCast3D` para hitscan, `NavigationAgent3D`, `AnimationTree` |
| **Unity** | Móvil comercial, 3D medio, gran ecosistema | Asset Store, mucha documentación | URP, Character Controller, Input System, NavMesh, Cinemachine, Addressables |
| **Unreal 5** | Máxima calidad gráfica | Nanite, Lumen, MetaHuman, Blueprints | Empezar desde **Lyra** (proyecto de ejemplo de Epic: shooter completo con armas, IA, menús y multijugador) |

Para algo con aspecto de shooter AAA, la vía realista es **Unreal 5 + Lyra + assets de Fab/Quixel**: Claude puede escribir C++/Blueprints-como-texto, configurar sistemas y guiar, pero el editor lo maneja una persona.

## Godot 4: puntos clave para Claude
- Escenas como archivos `.tscn` de texto y scripts `.gd`: Claude puede crearlos directamente.
- Física en `_physics_process(delta)`, input con el Input Map (`Input.is_action_pressed("fire")`).
- Exportación web: plantilla HTML5 (requiere cabeceras COOP/COEP para hilos, o exportar sin hilos).

## Unity: puntos clave
- Scripts C# con `MonoBehaviour`; datos en `ScriptableObject` (armas, enemigos).
- Pools con `UnityEngine.Pool.ObjectPool<T>`; nunca `Instantiate` por bala en móvil.

## Producción profesional
1. **GDD de una página**: fantasía, bucle, controles, mecánicas, contenido mínimo, estilo, plataformas.
2. **Hitos**: prototipo (bucle divertido) → vertical slice → alpha (todo el contenido en bruto) → beta (pulido, sin bugs graves) → lanzamiento.
3. **Playtests** con personas que no han visto el juego: observa sin ayudar, anota dónde se atascan.
4. **Telemetría**: dónde mueren los jugadores, cuánto dura una partida, en qué punto abandonan.
5. **Control de versiones** con Git (+ Git LFS para assets).

## Publicar
- **Web**: itch.io (gratis, HTML5), CrazyGames y Poki (portales con ingresos por anuncios), tu propio dominio.
- **PC**: Steam (cuota por juego, página de tienda con 6 meses de antelación para listas de deseos), itch.io, Epic.
- **Móvil**: Google Play (cuota única) y App Store (cuota anual).
- **Material**: tráiler de 30–60 s (lo mejor en los primeros 5 s, sin logos al inicio), 5 capturas, GIF del bucle central, cápsula/portada legible en pequeño.

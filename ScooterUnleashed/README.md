# Scooter Unleashed

Juego móvil 3D (Android/iOS) de scooter freestyle con mundo abierto. Unity 6 (6000.0 LTS) + C# + URP.

## Cómo ejecutarlo
1. Abre la carpeta `ScooterUnleashed/` con Unity Hub (Unity 6000.0.x LTS).
2. La primera vez se ejecuta solo **Scooter Unleashed > Setup Project**: crea el asset de URP, las plantillas de shaders, la escena `Assets/ScooterUnleashed/Scenes/Main.unity` y los ajustes de Android/iOS.
3. Abre `Main.unity` y pulsa Play. El mundo, el rider, la UI y el audio se generan por código.
4. Compilar: **Scooter Unleashed > Build > Android APK** o **iOS Xcode Project**.

## Controles
| Acción | Táctil | Teclado (editor) |
|---|---|---|
| Impulso / freno / dirección | Stick izquierdo ↑ ↓ ← → | WASD / flechas |
| Agacharse y saltar | Mantén y suelta la zona derecha | Espacio |
| Barspin / Tailwhip / X-Up / Bri flip | En el aire, desliza ← → / ↓ / ↑ / ↘ ↙ | J L / K / I / U O |
| Superman / No-footed / Can-can | En el aire, mantén y desliza ↑ / ↓ / ← → | Shift + I / K / J L |
| Rotación 180° | Stick ← → en el aire o dibuja medio círculo | Q / E |
| Backflip / Frontflip | Stick ↓ / ↑ en el aire | S / W en el aire |
| Manual / Nose manual | En el suelo, desliza ↓ / ↑ (equilibrio con el stick) | K / I en el suelo |
| Grind | Automático al caer sobre un raíl (o botón GRIND) | F |
| Pausa / Mapa / Volver al punto seguro | Botones arriba a la derecha | Esc / M / R |

Hay un esquema alternativo con botones, modo zurdo, sensibilidad, tamaño/opacidad y posición de controles en Ajustes.

## Qué incluye
- **Física** (`Runtime/Vehicle`): dos ruedas por raycast con suspensión, transiciones cóncavas/convexas, impulso, freno, carving, salto con carga, rotación medida en el aire, predicción y asistencia de aterrizaje, caídas, respawn en punto seguro.
- **Trucos** (`Core/Tricks`, `Runtime/Tricks`): 28 trucos con canales físicos (manillar/deck/piernas), dobles y triples, poses sostenidas, rotaciones y flips reales, 7 grinds, 3 manuals, reverts, combos con multiplicador, variedad, repetición penalizada y calidad de aterrizaje.
- **Mundo**: ciudad de ~600×600 m con plaza, skatepark (bowl, vert, mini rampa, funbox), parque, zona industrial, paseo marítimo con muelle, barrio residencial, arena de competición, 2 spots secretos, mapa con zoom, minimapa y viaje rápido.
- **Modos**: mundo libre, tutorial interactivo de 10 pasos, sesión freestyle (3 min), mejor línea (2 min), duelo 1 vs 1 local por turnos, 11 desafíos.
- **Personalización**: taller con 24 piezas en 10 categorías, estadísticas equilibradas con comparación antes/después, colores y 3 montajes guardados; editor de rider (2 modelos, piel, pelo, ropa, casco, protecciones) con desbloqueos cosméticos.
- **Progresión**: XP, niveles, reputación, créditos (sin pagos reales), récords, libro de trucos con maestría, historial y clasificaciones locales. Guardado atómico con copia de seguridad.
- **Audio** sintetizado (rodadura según superficie, grind de metal y de hormigón, aterrizajes, viento, ambiente, UI, música) y **efectos** (polvo, chispas, marcas de frenada).
- **Rendimiento**: perfiles bajo/medio/alto con detección automática, resolución dinámica medida, static batching por zona, GPU instancing, partículas agrupadas, física a 60 Hz.
- **Online**: solo arquitectura (`Core/Network`: identidad, salas, snapshots con interpolación, validación de puntuaciones). Se usa un servicio offline que dice claramente que no hay servidor: no se simula multijugador.

## Verificación (`tools/`)
`tools/check-all.sh` funciona sin Unity:
- **73 tests unitarios** del núcleo (xUnit): gestos, trucos, rotaciones, aterrizajes, combos, equilibrio, piezas, progresión, guardado, desafíos, duelo, red. Todos pasan.
- **Compila el Runtime** contra los ensamblados reales de UnityEngine 2021.3, y el **Editor + tests de Unity** contra UnityEditor y NUnit.

`Assets/ScooterUnleashed/Tests/EditMode` contiene tests de física con PhysX real (asentarse, acelerar, frenar, girar, saltar y aterrizar, sin doble salto, medir 180°, quarter pipe, grind). Se ejecutan desde **Window > General > Test Runner**.

## Limitaciones conocidas (sin ocultar)
- En este entorno no había Unity: **el juego no se ha ejecutado ni se han medido los FPS**. Los tests de PhysX están escritos y compilan, pero no se han ejecutado. El ajuste fino de la física necesita pruebas en el editor y en móvil.
- Se compiló contra la API de Unity 2021.3; las rutas específicas de Unity 6 (`linearVelocity`, `PhysicsMaterial`) están aisladas en `Util/Compat.cs`.
- Geometría, rider, animaciones, texturas y sonidos son **provisionales y procedurales**, con pivotes y puntos de enganche listos para sustituirlos. Ver `Docs/ASSETS_NEEDED.md`.
- UI en IMGUI (integrado en el motor, verificable aquí). Para producción conviene migrarla a uGUI o UI Toolkit.
- Caídas: el cuerpo cae como una pieza rígida, no como un ragdoll articulado.

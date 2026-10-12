# Recetas por género

Para cada uno: bucle central, sistemas clave y el detalle que lo hace sentir profesional.

## Plataformas 2D
- Bucle: correr, saltar, evitar, llegar a la meta. Sistemas: física con aceleración, coyote time, salto en búfer, altura variable, cámara con zona muerta y anticipación en la dirección de movimiento.
- Detalle pro: partículas de polvo al aterrizar, squash & stretch, checkpoints frecuentes, reinicio instantáneo (< 0,5 s).
- Herramientas: Phaser 3 o Canvas; niveles en Tiled (JSON).

## Carreras / conducción
- Bucle: vuelta rápida, adelantar, mejorar tiempos. Sistemas: modelo arcade (velocidad, giro dependiente de la velocidad, derrape con pérdida de agarre lateral), checkpoints para detectar vueltas, IA que sigue una línea ideal (spline) con "rubber banding" suave.
- Detalle pro: FOV y desenfoque con la velocidad, cámara con retraso, sonido del motor por RPM (oscilador + filtro), marcas de neumático, fantasma de la mejor vuelta.
- Herramientas: Three.js + Rapier (vehículo con raycasts por rueda) o Godot `VehicleBody3D`.

## Shooter top-down / twin-stick
- Bucle: moverse, apuntar con ratón o stick derecho, sobrevivir oleadas. Detalle pro: retroceso que empuja, sacudida, balas enemigas legibles, mejoras entre oleadas.

## Roguelike / roguelite
- Bucle: partida corta → morir → desbloquear → volver. Sistemas: generación procedural (salas prefabricadas conectadas, no ruido puro), semilla reproducible, objetos que se combinan (sinergias), meta-progresión.
- Detalle pro: cada partida debe permitir al menos una "build" memorable.

## Puzzle
- Una mecánica, muchas variaciones. Enseña sin texto con niveles de introducción; deshacer ilimitado; reinicio instantáneo; dificultad en dientes de sierra.

## Terror
- Ritmo tensión–alivio, sonido por encima de la imagen, luz limitada (linterna con batería), el monstruo visto poco. Niebla, ruido de película, latido que se acelera.

## Estrategia / gestión / idle
- Números claros, información visible, decisiones con coste de oportunidad. Idle: progresión exponencial con números grandes formateados (1,2 M), recompensa por volver, prestigio.

## RPG / aventura
- Diálogos con datos (árbol en JSON/Ink), inventario, misiones con estados, guardado robusto. Detalle pro: el mundo reacciona a lo que haces.

## Juego hiper-casual móvil
- Un solo gesto, partida de 30–60 s, feedback exagerado, reintento instantáneo, vertical 9:16.

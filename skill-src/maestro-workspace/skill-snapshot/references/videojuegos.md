# Videojuegos

## Motor según proyecto
- **Navegador 2D rápido**: Phaser 3 o Canvas/PixiJS. **3D web**: Three.js / React Three Fiber (+ Rapier para físicas).
- **Indie 2D/3D multiplataforma**: Godot 4 (GDScript, gratis, ligero). **3D ambicioso / móvil comercial**: Unity (C#). **Gráficos AAA**: Unreal 5.
- Prototipo de un fin de semana → HTML5 en un solo archivo.

## Diseño que engancha
- **Bucle central** definible en una frase y divertido en 30 s sin progresión.
- **Game feel** ("juice"): screen shake breve, hit-stop (2–5 frames), partículas, squash & stretch, sonido en cada acción, coyote time (≈100 ms) y jump buffer en plataformas, aceleración/deceleración en vez de movimiento instantáneo.
- Curva de dificultad: enseñar sin texto (nivel 1-1 de Mario), introducir una mecánica nueva cada pocos niveles y combinarlas.
- Feedback claro: el jugador siempre sabe por qué ha perdido.
- Sesiones cortas en móvil; "una partida más" (reintento instantáneo).

## Arquitectura de código
- Bucle con `deltaTime` (movimiento independiente de FPS); físicas a paso fijo.
- Máquina de estados para jugador/enemigos y para escenas (menú, juego, pausa, game over).
- Datos separados del código (niveles en JSON/Tiled, stats en tablas).
- Object pooling para balas/partículas; evitar crear objetos por frame.
- Entrada abstraída (teclado, mando, táctil) con remapeo.
- Guardado (localStorage / archivo) desde el principio.

## Pulido y entrega
- Pantalla de título, pausa, ajustes (volumen, controles), créditos.
- Audio: música en bucle sin corte + SFX con ligera variación de pitch.
- Rendimiento: 60 FPS estables; spritesheets/atlas; LOD en 3D.
- Publicación: itch.io (web/escritorio), Steam, Google Play/App Store; tráiler de 30–60 s con lo mejor en los primeros 5 s.

## Assets
Kenney.nl (CC0), OpenGameArt, itch.io assets; audio con sfxr/jsfxr y Freesound. Respeta siempre la licencia.

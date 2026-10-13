# Multijugador online

## Arquitectura
- **Servidor autoritativo**: el servidor simula el juego y decide (impactos, vida, puntuación). El cliente solo envía entradas. Es la única forma de evitar trampas.
- Tick del servidor 20–60 Hz; el cliente envía entradas numeradas en cada tick.
- Herramientas: **Colyseus** (Node, salas y sincronización de estado, recomendado para empezar), Socket.IO (simple), **Geckos.io / WebRTC DataChannels** (UDP, menor latencia para shooters), Nakama (backend completo: cuentas, matchmaking). Motores: Netcode for GameObjects / Mirror (Unity), multijugador integrado de Godot y Unreal.

## Técnicas para que no se note la latencia
1. **Predicción en el cliente**: el jugador mueve su personaje al instante con su propia entrada.
2. **Reconciliación**: cuando llega el estado del servidor, el cliente lo corrige y vuelve a aplicar las entradas aún no confirmadas.
3. **Interpolación de entidades**: los demás jugadores se dibujan ~100 ms en el pasado, interpolando entre dos estados recibidos (movimiento suave).
4. **Compensación de latencia** en disparos: el servidor "rebobina" las posiciones de los objetivos al momento en que el tirador disparó.

## Datos
- Envía solo lo que cambia (delta), cuantiza (posiciones a centímetros, ángulos a 16 bits), agrupa mensajes por tick.
- Interés por zona: cada cliente recibe solo lo que tiene cerca.

## Infraestructura
- Hosting: Fly.io, Railway, Hetzner, AWS GameLift / Edgegap para escalar. Salas por región.
- Matchmaking por región y nivel; reconexión si se cae la conexión; anti-trampas básico (validar velocidad y cadencia en el servidor).

## Empieza simple
Primero un juego local completo y divertido. Después, cooperativo con 2–4 jugadores en Colyseus. El competitivo con compensación de latencia es el último paso.

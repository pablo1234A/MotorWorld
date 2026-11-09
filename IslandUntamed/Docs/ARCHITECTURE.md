# Arquitectura técnica — Island Untamed

## 1. Principio rector: reglas probadas + motor como presentación

```
Content/Data/*.json ──► Sim/ (C++ puro, sin Unreal) ──► Capa UE5 (actores, componentes, IA, HUD)
                         ▲                                   │
                         └──── Tests/ (CMake, headless) ◄────┘ (las mismas fuentes)
```

* **`Source/IslandUntamed/Sim/`** contiene todas las reglas: supervivencia, inventario,
  fabricación, construcción (encaje y validación), agricultura, pesca, facciones, misiones,
  IA (decisión), clima y día/noche, generador de la isla, persistencia, combate y síntesis de
  audio. No incluye cabeceras de Unreal, así que se compila y prueba sin el motor (`Tests/`) y
  podría reutilizarse en un servidor dedicado o en herramientas.
* La capa UE5 traduce entre unidades (m ↔ cm, `std::string` ↔ `FString`) en `Core/IUTypes.h`
  y se ocupa de la presentación, la física, la entrada, el render y el audio.
* Restricciones del código Sim para que también compile dentro de UE: sin excepciones ni RTTI,
  sin identificadores que choquen con macros de UE (`PI`, `check`…), apto para compilación
  unificada (helpers en espacios de nombres con nombre propio) y sin sombras de variables. La
  compilación de pruebas usa los mismos flags.

## 2. Módulos y carpetas (módulo `IslandUntamed`)

| Carpeta | Contenido |
|---|---|
| `Core/` | GameInstance (carga y valida los datos), GameMode (flujo), PlayerController (Enhanced Input creado en tiempo de ejecución, máquina de estados de la UI), guardado, ajustes gráficos y recursos visuales |
| `World/` | Subsistema del mundo (isla, reloj, eventos, descubrimiento), subsistema de historia (misiones, tribus, lore), actor de la isla (streaming de terreno, vegetación, agua), constructor de puntos de interés, cuevas, entorno (cielo y clima), población de fauna e intro |
| `Gameplay/` | Interfaz `IIUInteractable`, objetos en el suelo, contenedores, estructuras y sus componentes (fuego, huerto, puerta, trampa), flechas y documentos |
| `Player/` | Personaje en primera persona y sus componentes: supervivencia, inventario, interacción, combate, construcción, pesca y fabricación |
| `Creatures/` | Criaturas base (cuerpo y animación procedurales), animales, habitantes de las tribus, controlador de IA y aldeas |
| `Audio/` | Director de audio procedural |
| `UI/` | HUD y pantallas (Canvas en modo inmediato) |
| `Testing/` | Pruebas de automatización de UE |

## 3. Decisiones importantes

**Mundo generado en tiempo de ejecución en lugar de un mapa hecho a mano.** No había editor ni
assets. El generador (`SimIsland`) produce una isla determinista de 4,1 × 4,1 km con unos
8,7 km² de tierra, 11 biomas, ríos que siempre bajan hasta el mar, cascadas, lagos con orilla
contenida y 25 puntos de interés colocados con sentido geográfico. `AIUIslandWorld` lo convierte
en:
* **Terreno en bloques** de 128 m (32×32 bloques) con 4 LOD (2, 4, 8 y 32 m), **faldones** que
  ocultan grietas entre LOD, mallas calculadas en **hilos de fondo** (`AsyncTask`), con un
  presupuesto de subidas por fotograma y colisión solo en LOD 0-1 (cocinado asíncrono). Los
  bloques de océano profundo nunca se generan.
* **Recursos y vegetación con HISM globales** (uno por tipo de recurso y pieza). Los huecos
  de instancia se **reciclan** mediante listas libres, así los bloques entran y salen sin
  reordenar índices, y `Hit.Item` → nodo es O(1). La vegetación tiene tres niveles por
  distancia.
* Equivale en tiempo de ejecución a World Partition + HLOD. `Scripts/setup_content.py` crea
  también un mapa World Partition (`L_Island`) para cuando haya contenido hecho a mano.

**Arte provisional sin assets.** Todo lo visual se ensambla con las formas básicas del motor
(`IUVisuals`): árboles, rocas, edificios, aldeas, restos del avión y criaturas con animación
procedural (ciclo de patas, alas, golpe, sueño, muerte). Sustituir una descripción por una malla
real no toca la jugabilidad. No se han usado assets de terceros.

**IA = percepción de UE + cerebro puro + ejecución con dirección local.** `UAIPerceptionComponent`
(vista y oído; el jugador hace ruido al correr, luchar o talar) alimenta `AnimalBrain` y
`NpcBrain` (funciones puras y probadas). El controlador ejecuta el estado moviéndose sobre el
campo de alturas analítico: sondeo de obstáculos, evita el agua y los acantilados, correa al
hogar y vuelo para aves. No requiere navmesh, que aún no existe para un mundo generado en tiempo
de ejecución. **LOD de IA**: decide cada 0,25 s, 0,6 s o 1,5 s según la distancia y reduce el
tick a 5 Hz lejos del jugador. **LOD de simulación**: la fauna solo existe en una burbuja de unos
160 m (máx. 26 animales) y los habitantes solo cuando el jugador está a menos de 260 m de la
aldea (máx. 12 por aldea). El estado abstracto (población, alarma, reservas, incursiones entre
tribus) sigue avanzando en `FactionSystem` aunque nadie mire.

**Datos en JSON** (`Content/Data`), cargados y validados al arrancar, con referencias cruzadas
y mensajes de error con número de línea; `iu.ReloadData` los recarga en caliente. Los
diseñadores añaden objetos, recetas, edificios, peces, animales, recursos, tribus, misiones y
documentos sin compilar.

**Bus de eventos.** `UIUWorldSubsystem::BroadcastEvent` (Acquire, Craft, Build, Discover, Kill,
Talk, Consume, Catch, Harvest, Sleep, Read, Deliver…). Las misiones escuchan el bus y ningún
sistema conoce al de misiones.

**Guardado.** `UIUSaveGame` contiene un JSON versionado (`version`) con jugador, reloj y clima,
persistencia (nodos agotados y su rebrote, descubrimientos, niebla en RLE, desbloqueos, documentos),
contenedores generados (por id persistente), estructuras con sus componentes, objetos sueltos,
misiones y tribus. La fauna y los habitantes no se guardan a propósito: se regeneran a partir
del estado de las facciones. Hay autoguardado cada 5 minutos y al terminar la intro, 3 ranuras
manuales y guardado/carga rápidos.

**Interfaz.** HUD con Canvas en modo inmediato y zonas clicables registradas en cada fotograma;
sin assets UMG. Incluye todas las pantallas pedidas (menú, partida nueva, continuar, ajustes,
inventario, fabricación, construcción, mapa con niebla y marcas, diario de misiones, tribus y
documentos, pausa, guardar/cargar, diálogo con comercio y regalos, muerte).

**Gráficos adaptativos.** `DefaultEngine.ini` activa Lumen (GI y reflejos), Virtual Shadow Maps,
Nanite en el proyecto, niebla volumétrica y TSR. En el primer arranque se ejecuta
`RunHardwareBenchmark` y se aplican sus resultados; la escalabilidad «Baja» desactiva Lumen y
VSM. El cielo es físico (SkyAtmosphere, SkyLight con captura en tiempo real y nubes volumétricas)
con sol y luna movidos por el reloj. El postproceso refleja el estado del superviviente (viñeta
de salud, tinte de frío, enfermedad, golpe y bajo el agua).

**Audio procedural.** `AudioSynth` genera bucles (viento, lluvia, oleaje, río, insectos, fuego,
cueva y música) y 37 efectos. `AIUAudioDirector` mezcla las capas según el bioma, la altitud, la
hora, el clima, el refugio y la cercanía al agua o al fuego, y reproduce efectos espaciales con
una reserva de voces.

## 4. Rendimiento (diseño)

* Generación de la isla: ~300 ms (rejilla de 513², ríos, lagos y PDI), medido en las pruebas.
* Terreno cercano síncrono al cargar (~100 ms estimado) y el resto asíncrono.
* Unas 55 componentes HISM para toda la vegetación y los recursos.
* Nunca hay miles de NPC: como máximo 26 animales + 12 habitantes activos cerca.
* La caché de dispersión crece hasta unos 13 MB si se recorre toda la isla (pendiente: LRU).

## 5. Riesgos conocidos

* La capa UE no se ha compilado (ver README). Las API más delicadas: `USoundWaveProcedural`
  (callback en el hilo de audio, solo lectura de búferes inmutables), reciclado de instancias
  HISM y `ProceduralMeshComponent` con colisión asíncrona.
* Sin navmesh la IA puede atascarse en geometría compleja (la detección de atasco invierte el
  lado de esquiva).

# Registro de desarrollo — Jornada 1

Leyenda de estados:

* ✅ **Probado**: compilado y verificado con pruebas automáticas (núcleo `Sim/`).
* 🟡 **Implementado, sin compilar**: código de UE5 completo y revisado, pero no compilado ni
  ejecutado, porque en el entorno no había Unreal Engine.
* ⬜ **Pendiente**: no implementado.

## Fase 1 — Auditoría

* Repositorio: solo había `index__1_.html` (una web de coches «MotorWorld», sin relación). No se
  ha tocado. El juego vive en `IslandUntamed/`.
* Entorno: contenedor Linux con 4 vCPU, 15 GB de RAM, 31 GB de disco libre y **sin GPU**.
  **Unreal Engine no está instalado y no se puede instalar**: el repositorio de Epic es privado
  (403), unrealengine.com está bloqueado por el proxy y compilar UE desde el código fuente
  necesita más de 100 GB.
* Herramientas disponibles: clang 18, gcc 13, cmake 3.28 y Python 3 (con PIL).
* **Decisión**: separar las reglas en un núcleo C++ sin dependencias de Unreal (que sí se puede
  compilar y probar aquí) y escribir encima la capa UE5, que genera el mundo en tiempo de
  ejecución para no depender de assets binarios creados en el editor.

## Funciones terminadas

### Probadas ✅ (núcleo de simulación: 22 pruebas, 2639 comprobaciones, 0 fallos)
| Sistema | Qué cubren las pruebas |
|---|---|
| JSON | Análisis con comentarios y comas finales, Unicode, errores con número de línea, ida y vuelta |
| Datos | Los 10 archivos cargan; referencias cruzadas válidas; todos los recursos y edificios del documento de diseño existen; densidades < 1 por bioma |
| Inventario | Apilamiento, límite de peso duro (sobrecarga), durabilidad y rotura, mover/fusionar/dividir, transferencia a cofres, consumo atómico, guardado |
| Fabricación | Materiales que faltan, estación requerida, herramienta requerida, recetas bloqueadas, desbordamiento |
| Supervivencia | Hambre/sed hasta la muerte, lluvia + viento → hipotermia, hoguera + refugio → secado y calor, sueño, comida, envenenamiento probabilístico, vendas, cataplasmas, hemorragia → infección, fracturas por caída, resistencia y sprint, sobrecarga |
| Agricultura | Arar → plantar → regar/abonar → crecer → cosechar → semillas; sequía mata; la lluvia riega; cultivos perennes |
| Tribus | Reputación por robo visto/no visto, agresión, asesinato; propagación a tribus enemigas; alianzas; caída de la alarma; incursiones entre tribus con noticias; guardado |
| Misiones | Cadena principal por eventos, objetivos secuenciales, misiones iniciadas por evento, objetivos de reputación, **decisiones excluyentes** (aliarse con una tribu cierra la otra), cascadas, guardado |
| Pesca | Tablas por zona y hora; minijuego de tensión (una política sensata pesca; forzar rompe el sedal; perder la picada) |
| Construcción | Encaje de paredes, suelos y techos, rejilla, validación (pendiente, flotante, solapamiento, agua, territorio tribal, coste), prefabricados |
| IA (decisión) | Huida, defensa al recibir daño, depredador nocturno, correa, sueño diurno/nocturno, rutinas de rol, turnos de guardia, aviso a intrusos, civiles que huyen |
| Combate | Bloqueo, rotura de guardia, esquiva, armadura, ataque por la espalda |
| Recolección | Herramienta incorrecta, recogida a mano, multiplicador de herramienta |
| Reloj y clima | Fases del día, sol, los 5 climas en 2 semanas, determinismo tras guardar y cargar |
| Isla | 3 aldeas, 4 cuevas, 3 ruinas, cascadas, PDI clave; 11 biomas presentes; ríos que bajan hasta el mar; lagos; aldeas en llano; dispersión determinista; montaña más fría que la playa |
| Persistencia | Niebla en RLE, rebrote de recursos, descubrimientos, desbloqueos |
| Audio | 8 capas y 37 efectos generados, sin saturación, deterministas |

### Implementado en UE5 🟡 (sin compilar ni ejecutar)
1. **Arranque y flujo**: carga y validación de datos, generación de la isla, menú principal
   con cámara orbital, nueva partida, continuar, cargar, muerte y vuelta al menú.
2. **Secuencia inicial**: cabina del avión en la tormenta con turbulencias, fallo de luces,
   alarma y truenos → impacto → despertar en la playa frente a los restos. Se puede saltar.
3. **Personaje** en primera persona: caminar, correr, agacharse, saltar, nadar (flotación propia
   sobre el agua del modelo), daño por caída con fractura y objeto en la mano con animación.
4. **Supervivencia** completa conectada al entorno real (bioma, altitud, hora, lluvia, viento,
   refugio, hogueras, ropa), con indicadores, estados y efectos de pantalla.
5. **Recolección** de 26 tipos de recurso en el mundo (talar, minar, recoger a mano), con
   rebrote persistente; agua potable de ríos y lagos (el agua de mar deshidrata) y cantimplora.
6. **Inventario** de 30 huecos, peso, barra rápida (1-8), equipo (cabeza, torso, piernas),
   soltar, dividir, transferencias con cofres y almacenes de aldea.
7. **Fabricación** con cola y tiempos reales, estaciones cercanas (hoguera, banco, secadero,
   horno), herramientas requeridas y recetas que se desbloquean con misiones.
8. **Construcción** modular: 21 piezas (refugio, cama, hoguera, antorcha, banco, secadero, horno,
   cofre, almacén, suelo, pared de madera y de piedra, puerta, techo, escalera, valla, trampa,
   torre, huerto, cabaña y casa prefabricadas), vista previa verde/roja, encaje, validación y
   desmontaje con reembolso.
9. **Hogueras y cocina**: combustible, encendido, la lluvia gasta más combustible, luz con
   parpadeo, calor (temperatura corporal) y cocción por huecos con tiempo real.
10. **Agricultura** en huertos, con visual por fase y crecimiento ligado a la lluvia y la
    temperatura del lugar.
11. **Pesca** con caña (zona real de agua, flotador, minijuego) y con lanza en aguas someras.
12. **Fauna** (10 especies): pastar, deambular, dormir según su ciclo, huir, defenderse,
    acechar y cazar, morder con veneno, miedo al fuego, despiece con o sin cuchillo y población
    por biomas alrededor del jugador.
13. **Tribus y aldeas**: 3 culturas con distribución propia (palafitos Kairu, empalizada
    Vesh'ka, muralla de piedra Ceniza), jefe, guardias con turnos, cazadores, cocineros,
    recolectores y ancianos; rutinas por hora; conversaciones con bocadillos; avisos a intrusos
    → hostilidad; robo visto o no visto; alarma de la aldea; tótem destructible; diálogo con
    normas, comercio por trueque y regalos; reputación con consecuencias entre tribus.
14. **Combate**: puños y 9 armas cuerpo a cuerpo, arco con tensado y flechas recuperables,
    bloqueo con gasto de resistencia, esquiva con invulnerabilidad, durabilidad, armadura y ruido
    que oye la IA.
15. **Exploración**: 25 PDI (restos del avión, cola, 3 ruinas, 4 cuevas jugables con interior,
    estación Meridian con acceso por tarjeta, faro, campamento, volcán con caldera secreta,
    gruta azul, cascadas y lagos), botín, 11 documentos, descubrimiento con niebla de guerra,
    mapa y brújula con marcas.
16. **Historia**: actos I-II jugables y un adelanto del III (8 misiones principales con
    decisión entre dos tribus) y 6 secundarias.
17. **Entorno**: ciclo de día y noche, 5 climas, lluvia visible, relámpagos con trueno retardado
    por distancia, niebla volumétrica y postproceso de estado.
18. **Audio procedural** ambiental y de efectos, música ambiental y latido con poca salud.
19. **Guardado/carga** completo, autoguardado y 3 ranuras.
20. **Interfaz** completa (ver Arquitectura). **Ajustes** de calidad gráfica, pantalla
    completa, FPS, sensibilidad, FOV, volumen, inversión del eje Y y pistas.
21. **Gráficos adaptativos** con benchmark en el primer arranque.
22. Script de contenido para el editor y pruebas de automatización de UE.

## Pendiente ⬜ / parcial

* **Compilar la capa UE5 y corregir errores** (prioridad absoluta en la jornada 2).
* Arte final: personajes con esqueleto y animaciones, árboles con Nanite, texturas PBR y agua
  con el plugin Water. Ahora todo usa primitivas (es un sustituto honesto, no calidad AAA).
* Navmesh dinámico para la IA (ahora usa dirección local sobre el campo de alturas).
* Incursiones tribales en tiempo real (ahora son abstractas, con noticias).
* Misiones de encargo dinámicas, compañeros y misiones de liberación.
* Acto III completo (núcleo bajo el volcán, finales según alianzas).
* Clima: parámetros de cobertura de las nubes volumétricas (ahora el clima cambia la luz, la
  niebla, la lluvia y el sonido, pero no la forma de las nubes).
* Zonas volcánicas con peligros (gases, lava que daña).
* Pesca: cebos y caña mejorada; spawn visual de bancos de peces.
* Animales: crías, manadas con líder, domesticación.
* Ropa visible (vista en primera persona) y daño localizado.
* Reparación de estructuras, daño estructural por tormentas y asaltos a la base.
* Caché de dispersión con LRU; precarga del terreno en un hilo propio.
* Localización (textos ya centralizados en JSON y HUD; falta pasarlos a tablas de cadenas).

## Problemas detectados

1. **No hay Unreal Engine en el entorno**: no se pudo compilar, ejecutar ni empaquetar. Todo
   lo marcado con 🟡 puede tener errores de compilación (nombres de API entre versiones 5.x,
   includes que faltan).
2. Fuentes del motor: el HUD usa las fuentes Roboto incluidas; los glifos especiales se han
   sustituido por ASCII.
3. Sin materiales del proyecto, la vegetación no se mueve con el viento y la vista previa de
   construcción es opaca (ejecutar `Scripts/setup_content.py`).
4. El modelo de colores de vértice depende de `VertexColorMaterial` del motor si no se crea
   `M_IU_Terrain`.

## Próximas fases

1. **J2 — Estabilización**: compilar en UE 5.4/5.5, corregir errores, primera partida completa
   del recorrido inicial (despertar → hacha → hoguera → refugio → dormir → caja negra),
   perfilado (Unreal Insights) y ajuste de presupuestos de streaming.
2. **J3 — Arte**: integrar assets gratuitos con licencia compatible (Megascans/Fab gratuitos,
   Quixel con licencia UE, Paragon con licencia UE) sustituyendo las descripciones de
   `IUVisuals`; personajes con Control Rig y Motion Matching.
3. **J4 — Mundo**: World Partition con una versión «horneada» del mundo procedural (la
   herramienta existe: `IslandModel` + `ScatterRegion`), PCG para la vegetación densa y el
   plugin Water.
4. **J5 — Contenido**: Acto III, finales, 20 misiones secundarias más y eventos dinámicos.

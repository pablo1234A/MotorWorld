# Velocidad: terminar antes sin bajar la calidad

El tiempo se pierde en cuatro sitios: **esperar** (pasos en serie que podrían ir a la vez), **dudar** (preguntas y decisiones de más), **repetir** (rehacer, releer, reverificar) y **aprobar** (permisos que paran el trabajo). Se ataca cada uno sin tocar el resultado.

## 1. Paralelizar (el mayor acelerador)
- Lanza **en un mismo turno** todas las acciones que no dependen entre sí: leer varios archivos, varias búsquedas, crear varios archivos independientes, ejecutar lint + typecheck + tests a la vez (`cmd1 & cmd2 & wait`).
- Solo espera cuando el paso siguiente necesita el resultado del anterior.
- Trabajos grandes con piezas independientes (p. ej. 6 secciones de una web, 10 niveles): repártelos en subagentes en paralelo **solo si el usuario acepta el coste extra**; para tareas pequeñas es más lento que hacerlo directo.

## 2. Decidir rápido
- Brief de 3–5 líneas y a producir. Si falta un dato que no cambia la estructura, elige un valor razonable, dilo en una línea y sigue.
- Usa los **valores por defecto** de esta skill (stack, tipografías, curvas, paletas) en vez de deliberar cada vez.
- Arranca desde `examples/` cuando encaje: adaptar una base probada es mucho más rápido que empezar de cero.

## 3. No repetir
- Escribe cada archivo **completo a la primera** (planificado), no en 5 iteraciones.
- Agrupa ediciones: todos los cambios de un archivo en una pasada.
- No releas un archivo justo después de editarlo: la herramienta ya habría fallado si el cambio no se aplicó.
- Verifica **una vez al final** con los scripts incluidos (`scripts/check-web.mjs`, `scripts/test-juego.mjs`, `scripts/video.sh info`): ya están hechos y probados, así que no gastas tiempo ni tokens escribiendo tu propio probador.
- Si el script encuentra fallos, corrige todos de una pasada y vuelve a ejecutarlo una vez.
- Si algo falla, lee el error completo y corrige la causa; no pruebes cambios al azar.

## 4. Quitar fricción (Claude Code)
- Permite de antemano los comandos seguros y frecuentes (`templates/settings.json` → copiar a `.claude/settings.json` del proyecto). Cada permiso pedido es una pausa.
- Modo "aceptar ediciones" (Shift+Tab) cuando confíes en la tarea.
- `CLAUDE.md` con los comandos exactos: Claude no tiene que averiguar cómo se compila o se testea.
- Modelo rápido para tareas mecánicas; el potente solo para diseño/arquitectura.
- Tareas largas y desatendidas: `claude -p "tarea"` en modo headless o en segundo plano mientras haces otra cosa.

## 5. Quitar fricción (Claude.ai)
- Proyecto con instrucciones + archivos de referencia: cero contexto que repetir.
- Pide todo el paquete en un mensaje ("landing + copy + SEO + favicon") en vez de por partes.
- Para cambios, señala exactamente qué ("el botón del hero, más contraste") en vez de "mejóralo".

## Medido en pruebas reales
Con instrucciones de "verifica y pule todo" sin límite, una landing pasó de 5 a 34 minutos y de 83.000 a 314.000 tokens con una mejora de calidad pequeña. El límite de §6 de `SKILL.md` (2 verificaciones, sin extras no pedidos) existe por eso.

## Lo que NUNCA se recorta para ir más rápido
Accesibilidad, responsive, estados de error/vacío/carga, seguridad y la verificación final. Saltarse esto no es velocidad: es retrabajo después.

## Cuánto se gana (honesto)
En tareas con muchas lecturas/comandos independientes, paralelizar y quitar pausas de permisos suele recortar una parte grande del tiempo de espera; en tareas cortas o muy secuenciales, poco. No existe un porcentaje garantizado: depende de la tarea.

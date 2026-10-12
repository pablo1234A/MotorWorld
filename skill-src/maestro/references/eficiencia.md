# Eficiencia de tokens — cómo hacer más con menos créditos

Lo que más créditos consume, por orden: (1) contexto acumulado en conversaciones largas, (2) leer archivos/resultados enormes, (3) rehacer trabajo mal enfocado, (4) respuestas largas con relleno. Ataca en ese orden.

## En Claude Code
- **Sesiones cortas y temáticas**: una tarea = una sesión. Usa `/clear` al cambiar de tema y `/compact` cuando la conversación crezca. Cada mensaje reenvía todo el historial: el historial largo es el mayor gasto oculto.
- **CLAUDE.md corto** (ver `templates/CLAUDE.md`): comandos de build/test, convenciones, rutas clave. Evita que Claude re-explore el proyecto en cada sesión. Mantenlo < 100 líneas.
- **Buscar antes de leer**: `grep`/`glob` para localizar, luego leer solo el rango de líneas útil.
- **No volcar salidas gigantes**: `| head -50`, `--quiet`, filtrar logs, tests de un solo archivo antes que toda la suite.
- **Modelo según tarea**: el modelo más potente para arquitectura y diseño; uno rápido/económico (Haiku/Sonnet) para tareas mecánicas (renombrar, formatear, boilerplate). `/model` para cambiar.
- **Plan primero en tareas grandes** (modo plan, Shift+Tab): un plan aprobado evita reescrituras caras.
- **Subagentes solo para búsquedas amplias**: arrancan sin contexto y lo re-derivan; para tareas pequeñas, mejor hacerlo directo.
- **Edits, no rewrites**: modificar 5 líneas cuesta mucho menos que reescribir un archivo de 800.
- **Skills con carga progresiva**: SKILL.md corto que apunta a referencias; solo se lee lo necesario.

- **Reutiliza las herramientas de la skill**: en las pruebas, gran parte del gasto extra venía de escribir probadores desde cero. `scripts/` ya los trae.
- **Lee solo la sección que necesitas** de cada guía (tienen índice); no cargues todas las guías "por si acaso".

## En Claude.ai (chat)
- **Proyectos** con instrucciones y archivos de conocimiento: no re-pegues el mismo contexto en cada chat.
- **Chat nuevo por tarea**: cuando un chat se alarga, pide un resumen de 10 líneas y empieza otro pegándolo.
- **Edita tu mensaje** en vez de añadir correcciones: la rama corregida no arrastra el intento fallido.
- **Pide formatos concretos**: "solo el código", "máx. 5 viñetas", "solo el diff".
- **Artefactos**: pide cambios puntuales ("cambia solo el hero") en vez de "rehazlo".
- Desactiva herramientas (búsqueda web, etc.) que no necesites en esa conversación.

## Cómo pedir (plantilla de prompt eficiente)
```
Objetivo: <qué y para quién>
Contexto: <solo lo imprescindible / rutas>
Restricciones: <stack, estilo, límites>
Hecho = <criterio verificable>
Formato de respuesta: <p. ej. solo archivos cambiados + 3 líneas de resumen>
```

## Expectativas realistas
El ahorro real depende de tus hábitos; aplicando /clear, CLAUDE.md, búsqueda dirigida y prompts concretos es habitual reducir mucho el consumo en sesiones largas, pero ninguna skill puede garantizar un porcentaje fijo ni cambiar los límites de tu plan.

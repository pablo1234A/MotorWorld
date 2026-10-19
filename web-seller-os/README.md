# WEB SELLER OS

Aplicación privada para vender páginas web de forma profesional: CRM, calendario, seguimientos,
generador de mensajes, auditorías, calculadora de precios, entrenador de ventas y asistente
contextual, todo en un mismo sitio. Responde a tres preguntas: **¿a quién contacto?, ¿qué le digo?,
¿qué hago ahora?**

## Arrancar

```bash
npm install
npm run dev        # desarrollo
npm run build      # typecheck + build de producción en dist/
npm run preview    # servir el build
```

`dist/` es estático (rutas con hash): se puede publicar en Netlify, Vercel, GitHub Pages o
cualquier hosting. Se puede instalar en el móvil como app ("Añadir a pantalla de inicio").

## Arquitectura

```
src/
  data/        types.ts (modelo), store.tsx (estado + acciones de negocio),
               storage.ts (adaptadores de persistencia), defaults.ts (estado inicial, plan)
  lib/         motores puros: insights (prioridades, riesgo, estadísticas), progress (XP,
               niveles, racha, misiones), assistant, roleplay, messages, audit, pricing…
  content/     contenido de ventas: objeciones, entrenamientos, problemas web, plantillas
  components/  sistema de UI (ui.tsx, charts.tsx), formularios, Shell (navegación, ⌘K,
               ¿Qué hago ahora?, modo concentración)
  pages/       una pantalla por sección
```

- **Fuente de verdad: el registro de actividad.** Cada acción real (contacto, seguimiento,
  respuesta, auditoría, reunión, propuesta, venta) se guarda como `Activity`. Estadísticas,
  objetivos, racha, XP y misiones se calculan a partir de él: nunca se inventan métricas, y las
  que no tienen muestra suficiente muestran "Necesitamos más datos".
- **Persistencia intercambiable.** La app solo habla con `StorageAdapter`. Por defecto usa
  `LocalStorageAdapter`; para un backend real, implementa la interfaz (hay un `RemoteAdapter`
  REST de ejemplo) y pásala a `<StoreProvider adapter={…}>`. Ajustes → Exportar/Importar JSON
  para copias de seguridad.
- **Auditoría automática.** Usa la API pública de Google PageSpeed Insights (rendimiento, SEO,
  accesibilidad). Clave opcional en Ajustes. El resto del checklist es comercial y manual.
- **Asistente y roleplay** funcionan en local con reglas sobre tus datos (sin enviar nada a
  terceros).

## Atajos

`⌘/Ctrl+K` comandos · `.` ¿Qué hago ahora? · `N` prospecto · `T` tarea · `E` evento ·
`F` modo concentración · `G` + `H/P/S/C/T/M/A` navegar · `?` ayuda

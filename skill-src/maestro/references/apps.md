# Apps de nivel producto

## Arquitectura por defecto (elige lo mínimo que resuelva)
- **Web app / SaaS**: Next.js (App Router) + TypeScript + Tailwind + shadcn/ui; datos con Supabase (auth + Postgres + storage) o Postgres + Drizzle; pagos con Stripe; despliegue en Vercel.
- **Móvil**: Expo (React Native) + Expo Router + Reanimated + Gesture Handler; nativo puro solo si hace falta (Swift/SwiftUI, Kotlin/Compose).
- **Escritorio**: Tauri (ligero) o Electron.
- **Backend/API**: Node (Hono/Fastify) o Python (FastAPI). Validación con Zod/Pydantic en los bordes.
- **IA dentro de la app**: SDK oficial de Anthropic, streaming, prompt caching para prompts de sistema largos, modelo pequeño para clasificación y grande para razonamiento.

## Principios
- Empieza por el **flujo principal** de punta a punta (vertical slice), luego amplía.
- Tipos estrictos, nada de `any`. Errores manejados en los bordes, no `try/catch` vacíos.
- Estados obligatorios en cada pantalla: carga (skeleton), vacío (con acción), error (con reintento), éxito.
- Formularios: validación inline al salir del campo, mensajes concretos, no borrar lo escrito al fallar.
- Seguridad: secretos en variables de entorno, RLS/permisos en servidor, nunca confiar en el cliente, sanitizar entradas, rate limiting en endpoints públicos.
- Rendimiento: paginar, cachear, cargar perezosamente, optimizar imágenes.
- Móvil "nativo": safe areas (`env(safe-area-inset-*)`), `100dvh`, inputs ≥ 16 px (evita zoom iOS), sin hover pegajoso (`@media (hover:hover)`), feedback háptico en acciones clave.

## Calidad
- Tests del camino crítico (Vitest/Jest + Playwright para e2e). Lint + typecheck en CI.
- Prueba con datos extremos: nombres larguísimos, 0 elementos, 10.000 elementos, emoji, árabe/RTL, números gigantes.
- README con cómo arrancar en 3 comandos.

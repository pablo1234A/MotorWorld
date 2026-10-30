# Frontend (fase 2)

## Arquitectura

- **React 19 + Vite + TypeScript estricto.** Rutas con React Router 7, datos con TanStack Query y estilos con CSS propio basado en tokens (`apps/web/DESIGN.md`).
- **Un único cliente HTTP** (`src/api/client.ts`):
  - Siempre usa `credentials: 'include'` y JSON.
  - Convierte cualquier error en `ApiError`, con código, mensaje en español, errores por campo y `requestId`.
  - Cubre también los errores sin JSON (proxy caído, 502…) y la falta de conexión.
- **Tipos** (`src/api/types.ts`): reflejan las respuestas reales de la fase 1. Una prueba compara las etiquetas de estados, roles y canales con los tipos del backend para que el frontend no invente ni olvide valores.
- **Caché** (`src/api/queries.ts`):
  - Las peticiones se deduplican y se cancelan al salir de la pantalla.
  - Tras cada operación confirmada por el servidor se invalidan las vistas afectadas.
  - Cualquier `401` marca la sesión como cerrada y lleva a «Iniciar sesión».
- **Carga por pantalla:** las rutas secundarias se descargan al visitarlas. La carga inicial pesa unos 127 kB comprimidos.

## Conexión con el backend

El navegador habla siempre con **el mismo origen** (`/api/v1`):

- **Desarrollo:** el proxy de Vite (`vite.config.ts`) reenvía `/api` a `PRESUPIO_API_PROXY`, por defecto `http://localhost:3000`.
- **Producción:** los estáticos de `apps/web/dist` y `/api/` en el mismo origen, detrás de HTTPS. Tres opciones con **las mismas cabeceras**:
  1. **Servidor incluido** (`npm run start -w apps/web`, que es `server/serve.mjs`). No tiene dependencias. Variables: `PORT` (8080), `HOST`, `API_URL` (la API) y `WEB_ROOT` (por defecto `dist/`). Pon delante un terminador TLS. Es el que usan las pruebas E2E.
  2. **nginx:** `ops/nginx/presupio-web.conf`. Está generado; no lo edites a mano. Se regenera con `node apps/web/server/hosting-config.mjs --nginx > ops/nginx/presupio-web.conf`. Se ha comprobado con `nginx -t` (1.24) y sirviendo la compilación por HTTPS.
  3. **Alojamiento estático** (Netlify, Cloudflare Pages): `npm run build` genera `dist/_headers`. La API debe quedar en el mismo origen (redirección o proxy de `/api/*` del alojamiento).

  En la API, usa `TRUST_PROXY=loopback` (o la IP del proxy, nunca un número de saltos) y `APP_WEB_URL=https://tu-dominio`.

El mismo origen evita CORS y permite la cookie `__Host-`. Si la API vive en otro dominio, define `VITE_API_BASE_URL=https://api.dominio/api/v1` al compilar, `CORS_ORIGINS` con el origen del frontend y `COOKIE_SECURE=true`.

**Nunca hay secretos en el frontend.** Las variables `VITE_*` se incrustan en el código del navegador. La sesión es una cookie `HttpOnly`: el JavaScript no puede leerla y no se guarda nada en `localStorage`.

### Cabeceras de seguridad

**Una sola fuente:** `apps/web/server/security-headers.mjs`. De ahí salen `vite preview`, el servidor incluido, `dist/_headers` y la configuración de nginx. Una prueba falla si la configuración de nginx se desincroniza.

| Cabecera | Valor y motivo |
|---|---|
| `Content-Security-Policy` | Solo recursos propios, sin scripts en línea, sin marcos (`frame-ancestors 'none'`) |
| `Strict-Transport-Security` | `max-age=31536000; includeSubDomains`. Solo actúa por HTTPS. Sin `preload`: es una decisión del dominio. |
| `X-Frame-Options` | `DENY` |
| `X-Content-Type-Options` | `nosniff` |
| `Referrer-Policy` | `no-referrer`: los tokens de los enlaces de los emails (`?token=`) no se filtran a terceros |
| `Permissions-Policy` | Sin cámara, micrófono, ubicación ni Payment Request |
| `Cross-Origin-Opener-Policy` / `Cross-Origin-Resource-Policy` | `same-origin` |

**Caché:** `/assets/*` (con huella) se marca como `immutable` durante un año, solo en respuestas correctas. El HTML va con `no-cache`.

**Pruebas:**

- `apps/web/test/production-server.test.ts` (7 pruebas) arranca el servidor real y comprueba:
  - las cabeceras en la aplicación, las rutas, los archivos, los 404, los 405 y los 502;
  - que nada se sirve fuera de `dist/` (`..` codificado);
  - el reenvío de `/api` (método, cookie, cuerpo y `Set-Cookie`);
  - que `_headers` y la configuración de nginx coinciden con la fuente.
- La E2E comprueba en Chromium que las cabeceras llegan y que la CSP **bloquea** un script en línea inyectado.

**Importante:** esto demuestra la configuración, **no el alojamiento real**. Tras desplegar, comprueba las cabeceras en el dominio de verdad (`curl -sI https://tu-dominio/`, o un analizador de cabeceras).

## Pantallas

| Ruta | Acceso | Contenido |
|---|---|---|
| `/iniciar-sesion`, `/registro`, `/recuperar-contrasena`, `/restablecer-contrasena` | Sin sesión | Acceso, alta de empresa y recuperación de contraseña |
| `/verificar-email`, `/aceptar-invitacion` | Con o sin sesión | Enlaces que llegan por email |
| `/` | Privada | Panel: estado de la cartera, plano de la cartera pendiente, próximos seguimientos y actividad reciente |
| `/presupuestos`, `/presupuestos/nuevo`, `/presupuestos/:id` | Privada | Listado con filtros, búsqueda y archivo; alta; ficha con estados, seguimientos e historial |
| `/seguimientos` | Privada | Pendientes, realizados y cancelados; filtro «asignados a mí» |
| `/contactos`, `/contactos/:id` | Privada | Contactos, sus presupuestos y la lista de exclusión |
| `/configuracion/*` | Privada | Empresa, reglas de seguimiento, equipo e invitaciones, plan (solo lectura) y perfil |

## Seguridad en la interfaz

- **Rutas privadas** protegidas por `RequireAuth`. Sin sesión se redirige a «Iniciar sesión» conservando el destino.
- **Redirecciones tras el acceso** filtradas por `safeRedirect`: solo se permiten rutas internas, nunca `//dominio` ni `https://…`.
- **La interfaz oculta las acciones** que el rol no permite, pero **la protección real la hace el servidor**. Los recursos de otra empresa se muestran como «no encontrado».
- **La caché se vacía por completo** al entrar, salir o cambiar de empresa: nunca quedan datos de otra cuenta en memoria.
- **La confirmación de email exige un clic.** Así, los filtros de correo que abren enlaces automáticamente no consumen el token.

## Pendiente para otras fases

- **Integración con herramientas de presupuestos o CRM:** no incluida. El envío automático de emails (fase 3) tiene sus pantallas en *Configuración → Envío automático*, en la ficha de cada presupuesto, en *Seguimientos* y en la página pública `/baja`; ver [`automatizacion.md`](automatizacion.md).
- **Métricas con periodos, límites de plan y monitorización de errores del frontend:** fase 4.
- **Contratación y gestión de la suscripción:** fase 5. La pantalla «Plan» es hoy solo informativa.
- **Textos legales** (términos del servicio, política de privacidad y cookies): no existen todavía. La casilla de aceptación los menciona, pero no hay páginas que enlazar; deben redactarse con asesoramiento antes de abrir el registro al público.

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
- **Producción:** un proxy inverso sirve los estáticos de `apps/web/dist` y reenvía `/api/` a la API. Ejemplo con nginx:

  ```nginx
  location /api/ { proxy_pass http://127.0.0.1:3000; proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for; proxy_set_header X-Forwarded-Proto $scheme; }
  location / { root /srv/presupio/web; try_files $uri /index.html; }
  ```

  Con esta configuración, en la API se usa `TRUST_PROXY=1` y `APP_WEB_URL=https://tu-dominio`.

El mismo origen evita CORS y permite la cookie `__Host-`. Si la API vive en otro dominio, define `VITE_API_BASE_URL=https://api.dominio/api/v1` al compilar, `CORS_ORIGINS` con el origen del frontend y `COOKIE_SECURE=true`.

**Nunca hay secretos en el frontend.** Las variables `VITE_*` se incrustan en el código del navegador. La sesión es una cookie `HttpOnly`: el JavaScript no puede leerla y no se guarda nada en `localStorage`.

### Cabeceras de seguridad recomendadas

Las define `securityHeaders` en `vite.config.ts`, y `vite preview` (usado en las pruebas E2E) ya las aplica. Configura las mismas en el servidor de producción:

```
Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'
X-Content-Type-Options: nosniff · Referrer-Policy: no-referrer · X-Frame-Options: DENY
```

`Referrer-Policy: no-referrer` impide que los tokens de los enlaces de los emails (`?token=`) se filtren a terceros.

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

- **Envío real de mensajes, automatización e integración con herramientas de presupuestos o CRM:** fase 3.
- **Métricas con periodos, límites de plan y monitorización de errores del frontend:** fase 4.
- **Contratación y gestión de la suscripción:** fase 5. La pantalla «Plan» es hoy solo informativa.
- **Textos legales** (términos del servicio, política de privacidad y cookies): no existen todavía. La casilla de aceptación los menciona, pero no hay páginas que enlazar; deben redactarse con asesoramiento antes de abrir el registro al público.

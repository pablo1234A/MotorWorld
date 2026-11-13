# Pruebas

## Cómo ejecutarlas

```bash
pnpm test                         # unitarias (sin dependencias)
pnpm db:start                     # Supabase local (Postgres, Auth, Storage, Mailpit)
pnpm build && pnpm start          # servidor de producción en 127.0.0.1:3000 (otra terminal)
pnpm test:integration             # integración: base de datos + API HTTP
pnpm test:e2e                     # E2E con Playwright (escritorio y móvil)
pnpm test:load                    # prueba de carga local (autocannon)
```

Las pruebas de integración y E2E crean usuarios de prueba (`*@pruebas.anunciapro.test`) y los eliminan al terminar. El correo se comprueba en el buzón local Mailpit. La CI (`.github/workflows/ci.yml`) ejecuta las tres capas.

## Resultado de la última ejecución

Ejecutadas en local contra Supabase CLI 3.1.0 (PostgreSQL 17) y el build de producción:

| Capa | Archivos | Pruebas | Resultado |
|---|---|---|---|
| Unitarias (Vitest) | 9 | 80 | ✅ todas superadas |
| Integración (Vitest) | 7 | 78 | ✅ todas superadas |
| E2E (Playwright, Chromium) | 5 | 8 | ✅ todas superadas (dos ejecuciones seguidas) |
| Tipos (`tsc --noEmit`) y lint (ESLint) | — | — | ✅ sin errores |
| Build de producción (`next build`) | — | — | ✅ correcto |

## Qué cubren

### Unitarias (`tests/unit`)
- **Generación**: todos los bloques del anuncio; los defectos siempre aparecen; **no inventa** especificaciones, garantías ni marcas ausentes; avisa de la información que falta; límites de Wallapop; HTML seguro en eBay; hashtags en Vinted; tonos; inglés; variantes de título; plantillas personalizadas.
- **Matriz de no invención**: 432 combinaciones de tono × extensión × plataforma × variación sobre un producto sin datos; en ninguna aparecen garantías, envíos, motivos de venta, adjetivos de calidad ni especificaciones.
- **Redacción**: atributos en lenguaje natural sin repetir lo dicho, marca según categoría, nombres como «iPhone» respetados, otra redacción al regenerar (determinista), texto del usuario pulido sin cambiar sus palabras.
- **Medidor de calidad**: puntuación, consejos, límites por plataforma, HTML medido por su texto.
- **Proveedor de IA (SDK simulado)**: qué datos se envían, defensa ante inyección de instrucciones en el texto del usuario, saneamiento y límites de la respuesta, rechazos y errores convertidos en errores del sistema.
- **Categorías**: herencia de atributos, validación de tipos (número, selección, sí/no), obligatorios ausentes, claves libres no válidas, formato con unidades, números con formato español/inglés.
- **Planes y consumo**: restante, límites, generación masiva por plan, formatos de exportación, características mal formadas, estados de suscripción.
- **CSV**: mapeo automático, destinos válidos, estados, errores por fila, duplicados, saneamiento, monedas, plantilla.
- **Marketplaces y exportación**: recortes, HTML, hashtags sin duplicar, campos obligatorios, inyección de fórmulas, JSON/TXT/Shopify.
- **Seguridad**: XSS, filtros de búsqueda, tipos de archivo por contenido, nombres de archivo, texto vs. binario, configuración de entorno.
- **Esquemas**: productos, registro, generación, lotes, mapeo, anuncios; campos de propiedad ignorados.

### Integración (`tests/integration`)
- `rls-isolation`: alta de usuario completa; dos usuarios no ven, editan, borran ni insertan datos del otro; claves foráneas compuestas; no se puede mover un producto de espacio; favoritos ajenos; tablas de sistema protegidas; privilegios por columna del perfil; consumo y resumen ajenos; estadísticas; visitante anónimo; cuenta desactivada; versionado inmutable; SKU por espacio; categorías personalizadas ajenas; límite de productos del plan; borrado en cascada.
- `usage-and-jobs`: idempotencia; **25 peticiones simultáneas** → exactamente el límite; devolución única; trabajos según plan; filas máximas; reparto concurrente sin duplicados (`SKIP LOCKED`); conservación de correctos; reintentos de errores del sistema; devolución de cuota; idempotencia del informe; reintento manual; trabajos ajenos.
- `storage`: fotos y avatares privados por espacio/usuario; carpetas ajenas; tipos no permitidos; buckets no públicos.
- `api` (HTTP real): registro → correo → confirmación → panel; validación de registro; recuperación de contraseña por correo; enlaces manipulados; login/logout con cookies httpOnly; rutas privadas; 401 en endpoints; **CSRF**; admin oculto; webhook y cron protegidos; checkout desactivado; producto con atributos validados e identificadores del cliente ignorados; búsqueda con intento de inyección; **acceso por ID a datos ajenos**; generación idempotente; guardado, saneamiento, versiones, restauración, favoritos, adaptación, duplicado; exportación según plan; imágenes por contenido real; borrado en cascada con archivos; límite mensual con peticiones simultáneas; importación CSV completa con lotes y exportación; archivos no válidos; **fuerza bruta en login → 429**.
- `admin`: acceso a todas las secciones; no se desactiva a sí mismo; desactivación con causa, bloqueo inmediato y auditoría; plan manual; edición de límites; revocación inmediata.
- `teams`: límite de miembros por plan; invitación y aceptación solo por la cuenta invitada (un enlace reenviado no sirve); editor, solo lectura y administrador con sus permisos exactos; el consumo es del espacio; expulsión con pérdida de acceso inmediata; flujo HTTP con cambio de espacio activo y cookie manipulada; **cambio de correo** con contraseña y confirmación doble por correo.
- `stripe-webhooks`: firma válida/inválida/manipulada; checkout → plan; idempotencia; impago; cambio de plan; evento antiguo fuera de orden; cancelación → Free; evento fallido reprocesable.

### E2E (`tests/e2e`, Playwright)
- **Recorrido completo**: web pública → registro → confirmación de correo → bienvenida → crear producto con atributos → generación automática → cambio de tono → edición → guardado → recuperación desde «Mis anuncios» → versiones → dashboard con datos reales → importación CSV con mapeo y errores por fila → generación masiva con progreso → exportación descargada → cierre de sesión → rutas privadas protegidas.
- **Equipo**: el propietario invita desde Configuración, la persona invitada acepta desde su panel, ve el catálogo compartido y cambia entre espacios.
- **Dos usuarios** en navegadores separados: cada uno ve solo lo suyo; manipular IDs en la URL no muestra datos ajenos; el panel de administración no existe para ellos.
- **Público y errores**: páginas informativas y legales, formulario de contacto real, errores de login, validación de registro, 404.
- **Móvil** (Pixel 7): web y panel sin desbordamiento horizontal; menú lateral en cajón.

## Prueba de carga (local)

`pnpm test:load` crea un usuario con 2.000 productos y lanza 25 conexiones simultáneas durante 10 s por escenario contra el build de producción. Resultado en la máquina de desarrollo (4 núcleos, con PostgreSQL, Auth y la aplicación compartiendo la misma máquina):

| Escenario | Peticiones/s | Latencia media | p99 | Errores |
|---|---|---|---|---|
| Landing (prerenderizada) | 360 | 69 ms | 159 ms | 0 |
| `/api/health` | 511 | 48 ms | 72 ms | 0 |
| API: listado paginado (2.000 productos) | 79 | 312 ms | 613 ms | 0 |
| API: búsqueda en catálogo | 102 | 242 ms | 467 ms | 0 |
| Página «Mis productos» (SSR + sesión) | 35 | 708 ms | 1111 ms | 0 |
| Dashboard (SSR + estadísticas) | 43 | 574 ms | 1247 ms | 0 |

Esta prueba detectó dos cuellos de botella que se corrigieron: las políticas RLS evaluadas por fila (el dashboard daba ~2 peticiones/s y errores de tiempo de espera; el listado, ~33) y la landing renderizada en cada visita (~82 peticiones/s).

**Cómo leer estas cifras**: miden una sola instancia en un equipo modesto con todo en la misma máquina. Sirven para comparar antes/después y detectar regresiones. **No son una cifra de capacidad en producción**, que dependerá del plan de Supabase y del hosting; no se ha hecho prueba de carga sobre infraestructura real.

## Lo que no se ha probado

- Stripe contra su API real (sin credenciales) — ver STRIPE.md.
- El proveedor de IA de Anthropic contra la API real (sin clave); se ha comprobado la compilación y el manejo de errores, no la calidad de las respuestas.
- Pruebas de carga sobre infraestructura real (solo en local).
- Navegadores distintos de Chromium y lectores de pantalla reales.
- Despliegue real en Vercel y Supabase en la nube.

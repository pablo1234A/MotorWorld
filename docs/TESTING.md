# Pruebas

## Cómo ejecutarlas

```bash
pnpm test                         # unitarias (sin dependencias)
pnpm db:start                     # Supabase local (Postgres, Auth, Storage, Mailpit)
pnpm build && pnpm start          # servidor de producción en 127.0.0.1:3000 (otra terminal)
pnpm test:integration             # integración: base de datos + API HTTP
pnpm test:e2e                     # E2E con Playwright (escritorio y móvil)
```

Las pruebas de integración y E2E crean usuarios de prueba (`*@pruebas.anunciapro.test`) y los eliminan al terminar. El correo se comprueba en el buzón local Mailpit. La CI (`.github/workflows/ci.yml`) ejecuta las tres capas.

## Resultado de la última ejecución

Ejecutadas en local contra Supabase CLI 3.1.0 (PostgreSQL 17) y el build de producción:

| Capa | Archivos | Pruebas | Resultado |
|---|---|---|---|
| Unitarias (Vitest) | 7 | 66 | ✅ todas superadas |
| Integración (Vitest) | 6 | 69 | ✅ todas superadas |
| E2E (Playwright, Chromium) | 4 | 7 | ✅ todas superadas |
| Tipos (`tsc --noEmit`) y lint (ESLint) | — | — | ✅ sin errores |
| Build de producción (`next build`) | — | — | ✅ correcto |

## Qué cubren

### Unitarias (`tests/unit`)
- **Generación**: todos los bloques del anuncio; los defectos siempre aparecen; **no inventa** especificaciones, garantías ni marcas ausentes; avisa de la información que falta; límites de Wallapop; HTML seguro en eBay; hashtags en Vinted; tonos; inglés; variantes de título; plantillas personalizadas.
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
- `stripe-webhooks`: firma válida/inválida/manipulada; checkout → plan; idempotencia; impago; cambio de plan; evento antiguo fuera de orden; cancelación → Free; evento fallido reprocesable.

### E2E (`tests/e2e`, Playwright)
- **Recorrido completo**: web pública → registro → confirmación de correo → bienvenida → crear producto con atributos → generación automática → cambio de tono → edición → guardado → recuperación desde «Mis anuncios» → versiones → dashboard con datos reales → importación CSV con mapeo y errores por fila → generación masiva con progreso → exportación descargada → cierre de sesión → rutas privadas protegidas.
- **Dos usuarios** en navegadores separados: cada uno ve solo lo suyo; manipular IDs en la URL no muestra datos ajenos; el panel de administración no existe para ellos.
- **Público y errores**: páginas informativas y legales, formulario de contacto real, errores de login, validación de registro, 404.
- **Móvil** (Pixel 7): web y panel sin desbordamiento horizontal; menú lateral en cajón.

## Lo que no se ha probado

- Stripe contra su API real (sin credenciales) — ver STRIPE.md.
- El proveedor de IA de Anthropic contra la API real (sin clave); se ha comprobado la compilación y el manejo de errores, no la calidad de las respuestas.
- Pruebas de carga y rendimiento.
- Navegadores distintos de Chromium y lectores de pantalla reales.
- Despliegue real en Vercel y Supabase en la nube.

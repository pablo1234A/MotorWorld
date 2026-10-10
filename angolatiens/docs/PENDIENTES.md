# Pendientes por dependencias externas

| Pendiente | Qué hace falta | Dónde se cambia |
|---|---|---|
| Dominio definitivo | Comprar el dominio | `src/data/site.mjs` → `url` |
| Datos del titular (LSSI art. 10) | Nombre o razón social, NIF, domicilio y correo | `src/data/site.mjs` → `owner` |
| Correo de contacto | Un buzón real | `src/data/site.mjs` → `contactEmail` (activa los formularios con mailto) |
| Proveedor de alojamiento en la política de privacidad | Elegir el alojamiento | `src/build.mjs` → `trustPages()` |
| Enlaces de afiliado | Aprobación en cada programa | `src/data/tools.mjs` → `affiliateUrl` (el sitio lo etiqueta solo) |
| Precios oficiales de Make, ChatGPT, Holded y otros | Consultarlos en las webs oficiales (inaccesibles desde este entorno) | `src/data/tools.mjs` → `price` |
| Formulario con backend (sin mailto) | Servicio de formularios (Formspree, Netlify Forms…) o una función serverless | `form[data-mailto]` en `src/build.mjs` |
| Boletín | Cuenta en Brevo u otro, doble opt-in y actualización de la política de privacidad | Nueva sección |
| Analítica | Herramienta sin cookies o banner de consentimiento | `layout()` en `src/build.mjs` y la política de privacidad |
| Imágenes reales y capturas | Capturas propias de las pruebas de herramientas | Sustituir las portadas tipográficas en las guías |
| Buscador con IA real (opcional) | API de un modelo con clave en el servidor, nunca en el navegador; coste por consulta; límites de uso | Función serverless que devuelva los slugs del catálogo. El buscador de reglas actual se queda como alternativa |
| Productos prémium | Crear los productos y elegir la pasarela (Lemon Squeezy, Gumroad, Stripe) teniendo en cuenta el IVA de productos digitales en la UE | Sección `#premium` de `/plantillas/` |

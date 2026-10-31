# Registro de correcciones prelanzamiento

Problemas de la auditoría integral (octubre de 2026) y de lo descubierto al corregirlos.

Para cada problema se recoge la causa, la corrección, la prueba que la demuestra y lo que queda pendiente. Los estados son los de la auditoría:

- **CORREGIDO Y VERIFICADO**
- **CORREGIDO PERO NO VERIFICADO COMPLETAMENTE**
- **PENDIENTE POR DEPENDENCIA EXTERNA**
- **PENDIENTE DE REVISIÓN LEGAL O FISCAL**
- **NO RESUELTO**

## P1-02 · Pruebas intermitentes en paralelo

- **Causa:** todos los archivos de prueba compartían una base de datos. `runCycle` recorre todas las empresas con envío automático, así que un archivo planificaba y cancelaba pasos de empresas de otro archivo que se ejecutaba a la vez. En la auditoría fallaron 3 de 6 ejecuciones.
- **Corrección:**
  - `test/global-setup.ts` migra la base plantilla `*_test` y clona una base por trabajador de Vitest (`*_test_w1…wN`, con `CREATE DATABASE … TEMPLATE`).
  - `test/worker-db.ts` (archivo de arranque de cada prueba) apunta cada archivo a la base de su trabajador.
  - Sin `DATABASE_ADMIN_URL`, las pruebas usan una sola base y se ejecutan en serie.
- **Prueba:** 10 ejecuciones consecutivas en paralelo, todas en verde. Se comprobó que la plantilla queda vacía y que cada base tiene sus propias empresas.

## P1-01 · La API y el worker terminaban si PostgreSQL cerraba conexiones

- **Causa:** el `pg.Pool` emite `error` cuando el servidor cierra una conexión inactiva (código 57P01 en un reinicio, o un corte de red). No había manejador, así que Node terminaba el proceso.
- **Corrección:**
  - `createDb` siempre registra un manejador. La API y el worker lo conectan a su registro de errores.
  - Las promesas rechazadas sin capturar se registran.
  - El envío anota `provider_call_started_at` justo antes de llamar al proveedor. Si la base de datos falla a mitad de un lote, lo no enviado se distingue de lo que pudo salir (ver P2-07).
- **Prueba:** `test/resilience.test.ts`, con un proxy TCP que «tumba» la base sin parar el servidor real.
  - `/health/ready` responde 503 durante el corte y 200 al volver, sin reiniciar.
  - Un login durante el corte responde 503 con `SERVICE_UNAVAILABLE`.
  - Con `pg_terminate_backend` (el error 57P01 exacto de la auditoría), el proceso sigue vivo.
  - Un ciclo del motor durante el corte falla sin efectos y el siguiente envía una sola vez.
  - El **proceso real del worker** (`src/worker.ts`) sigue vivo durante el corte y vuelve a completar ciclos al restablecerse.

## P2-07 · Envíos de resultado desconocido

- **Causa:**
  - Un envío interrumpido quedaba como «fallido», cosa que no se podía demostrar.
  - No se distinguía «no llegó a llamarse al proveedor» de «puede haber salido».
  - No había reconciliación ni revisión.
  - **Fallo nuevo descubierto:** si la llamada colgada volvía después de darse por desconocida, su resultado sobrescribía el estado sin contar el intento.
- **Corrección** (migraciones 0006 y 0007, `automation/unknown.ts`):
  - Nuevo estado de seguimiento `unknown` («Por revisar»).
  - Si el proveedor nunca se llamó, el seguimiento vuelve a la cola y el intento se libera.
  - Si el proveedor se llamó, queda en `unknown` y el intento como `unverified`: no se cobra y no se reenvía.
  - **Reconciliación:** Mailgun se consulta en el Events API, y los webhooks de Mailgun sobre ese envío demuestran que salió.
  - **Revisión manual** con `POST /follow-ups/:id/resolve` (propietario o administrador), registrando quién y qué decidió. La interfaz añade la pestaña «Por revisar».
  - Alerta `deliveries_unknown_review` en `/ops/status`.
  - Un intento `unverified` solo pasa a contado si cabe en el límite de su periodo.
  - Un resultado tardío resuelve el desconocido, o se ignora si ya estaba resuelto.
- **Prueba:**
  - `test/resilience.test.ts`, 4 pruebas: corte a mitad de lote, reconciliación, resultado tardío, «no enviado» y protección del intento contado.
  - `automation.test.ts`: webhook sobre un envío desconocido.
  - `automation-units.test.ts`: consulta del Events API contra un servidor local.
- **Pendiente:** comprobar la consulta del Events API con una cuenta real de Mailgun. No se pudo consultar su documentación desde este entorno; el diseño usa los filtros `recipient` y fechas y la variable `presupio_delivery_id`.

## P2-08 · Una reducción manual del límite se deshacía

- **Causa:** `ensureUsagePeriod` subía el límite al del plan siempre que el del plan fuera mayor, también cuando soporte lo había bajado.
- **Corrección:**
  - Solo se sube cuando el plan del periodo cambia.
  - Nuevo comando auditado `npm run ops -- set-limit` (no admite un límite menor que lo ya consumido, exige un motivo y queda en el historial).
- **Prueba:** `plans.test.ts › un ajuste de soporte del límite se mantiene…`. El ajuste se mantiene tras varios cálculos y un cambio de plan lo recalcula.

## P1-03 · Supresión de un contacto o de un presupuesto

- **Causa:** no había forma de borrar ni anonimizar un contacto o un presupuesto concreto; solo se podía borrar la empresa entera con `ops`.
- **Corrección** (migración 0008, `modules/privacy/service.ts`):
  - `POST /contacts/:id/anonymize` con `{ confirm: "ANONIMIZAR" }` y `POST /quotes/:id/erase` con `{ confirm: "ELIMINAR" }`.
  - Nuevo permiso `data:erase`, solo para propietarios y administradores.
  - Disponible en solo lectura: una petición de supresión debe atenderse aunque la cuenta no tenga plan activo.
- **Qué se hace** (anonimización irreversible):
  - Se borran:
    - nombre, email, teléfono, organización y notas del contacto;
    - destinatario, asunto y cuerpo de los emails;
    - notas de los seguimientos y la instantánea de un email aprobado (sustituida por un marcador);
    - evidencias de venta y motivos de rechazo;
    - notas libres del historial (función acotada `app_scrub_activity_notes`);
    - en un presupuesto: título, descripción y referencia.
  - Se cancelan los seguimientos pendientes y se desactiva el envío automático de esos presupuestos.
  - El presupuesto queda oculto y no se puede modificar: responde 404.
- **Qué se conserva:**
  - las filas sin datos personales, para los intentos ya facturados, las métricas y el historial;
  - las exclusiones **activas**, con solo el dato de su canal, para seguir respetando una baja.
- **Interfaz:** «Suprimir datos» en la ficha del contacto y «Eliminar definitivamente» en la del presupuesto, con confirmación escrita.
- **Prueba:** `test/privacy.test.ts`, 4 pruebas.
  - Permisos (un comercial recibe 403), aislamiento (otra empresa recibe 404) y confirmación obligatoria.
  - Ningún dato personal queda en la exportación completa.
  - El intento facturado y la exclusión activa minimizada se conservan.
  - La API oculta lo suprimido y el motor no programa ni envía nada a esa persona.
  - Funciona en solo lectura.
- **Pendiente de revisión legal:**
  - si la conservación de la exclusión activa y de la fila anonimizada es adecuada;
  - si alguna obligación exige conservar algún dato concreto (`docs/legal/README.md`).

## P1-04 · Detección de respuestas de clientes

- **Causa:** Presupio no lee el buzón. Si la empresa no registraba la respuesta, el cliente podía seguir recibiendo seguimientos.
- **Corrección** (migración 0009, `modules/inbound/`):
  - Una **dirección de entrada por empresa** (`respuestas+<token>@INBOUND_EMAIL_DOMAIN`).
  - Un **adaptador de Mailgun** (`POST /webhooks/inbound/mailgun`, formulario multipart o urlencoded) con verificación de firma y antirrepetición por token y por `Message-Id`.
  - **Emparejamiento solo dentro de la empresa del token**: primero por `In-Reply-To`/`References` y, si no, por remitente.
  - Las respuestas automáticas y los rebotes se descartan.
  - Si el presupuesto seguía pendiente, se registra la respuesta (cancela los seguimientos y anota la recuperación).
  - No se guarda el contenido. El registro manual se mantiene.
  - La interfaz solo presenta la detección como disponible si está configurada.
- **Fallo nuevo descubierto:** la fecha `Date` del email la pone el reloj del cliente; si iba retrasada, la respuesta quedaba como «anterior al seguimiento» y no contaba como recuperación. Si la respuesta cita nuestro email, la fecha se acota para que sea posterior a ese envío.
- **Prueba:** `test/inbound.test.ts`, 9 pruebas:
  - respuesta auténtica: el presupuesto pasa a respondido, el paso pendiente se cancela y la recuperación queda registrada;
  - firma no válida o caducada (401);
  - entrega repetida y mensaje repetido (`duplicate`);
  - otra empresa: no se empareja y no toca nada;
  - token desconocido;
  - respuestas automáticas y rebotes: los seguimientos continúan;
  - emparejamiento por remitente, por id propio (SMTP) y formato urlencoded;
  - presupuesto ya respondido a mano;
  - configuración y unidades.
- **Pendiente por dependencia externa:** comprobar el formato exacto de la ruta `forward()` con una cuenta real de Mailgun, los registros MX del dominio de entrada y la regla de reenvío del buzón de cada empresa. La documentación de Mailgun no era accesible desde este entorno.

## P2-04 · Rebotes, quejas y bajas comunicados por el proveedor

- **Estado previo:** con Mailgun ya se procesaban los rebotes permanentes (exclusión), las quejas, las bajas, los duplicados y las firmas no válidas. Con SMTP no hay forma estándar de recibir rebotes.
- **Corrección:**
  - Los fallos **temporales** quedan anotados (`follow_up.delivery_delayed`).
  - Cualquier evento del proveedor sobre un envío «Por revisar» demuestra que salió y lo reconcilia (P2-07).
- **Prueba** (`automation.test.ts`):
  - la baja del proveedor excluye al contacto y no se programan más pasos;
  - el fallo temporal queda anotado sin cambiar el estado;
  - un evento sobre un envío desconocido lo reconcilia y lo cuenta una vez;
  - las pruebas previas de rebote permanente, queja, duplicados y firmas siguen en verde.
- **Pendiente por dependencia externa:** webhooks reales de Mailgun. Para tener rebotes hay que usar Mailgun o un proveedor con webhooks; con SMTP no hay rebotes automáticos (documentado).

## P2-02 · Límites de peticiones en memoria

- **Causa:** los límites (global por IP, login y recuperación por email, registro…) estaban en la memoria de cada proceso. Con varias instancias cada una tenía los suyos, y un reinicio los borraba.
- **Corrección** (migración 0010, `lib/rate-limiter.ts`):
  - Tabla `rate_limit_counters` en PostgreSQL. Cada golpe es una sola sentencia atómica (`INSERT … ON CONFLICT DO UPDATE`).
  - La usan tanto `@fastify/rate-limit` (almacén propio, un espacio de claves por ruta) como los límites por email.
  - Claves resumidas con SHA-256: ni IPs ni emails en claro.
  - Si el almacén falla, la petición responde 503 (`skipOnError: false`): nunca se deja pasar sin límite.
  - `/health` (vivo) queda sin límite, para que una caída de la base de datos no haga reiniciar la API. `/health/ready` sí depende de ella.
  - El trabajo de retención borra los contadores caducados.
- **Coste:** una escritura en PostgreSQL por petición. Es asumible con el volumen previsto. Si crece, el almacén se puede cambiar por Redis sin tocar las rutas.
- **Prueba:** `test/limits-trials.test.ts`.
  - Dos instancias comparten el límite, y una instancia nueva («reinicio») lo mantiene.
  - 20 peticiones simultáneas con límite 5 dan exactamente 5 aceptadas, y 50 golpes simultáneos dan exactamente 1…50.
  - La ventana caduca y la retención limpia.
  - Con la base de datos caída, la petición responde 503 y `/health` sigue en 200.

## Fallo nuevo · Una conexión en uso cerrada por PostgreSQL terminaba el proceso

- **Causa:** el manejador de P1-01 cubría las conexiones **inactivas** del pool. Si PostgreSQL cierra una conexión **prestada** a una consulta en curso, `pg` emite `error` sin oyentes. En producción, `server.ts` termina el proceso ante una excepción no capturada. Apareció al añadir los límites compartidos, que hacen una consulta en cada petición.
- **Corrección:** `createDb` añade un oyente a cada conexión nueva. La consulta en curso ya falla con su error (503) y el pool descarta la conexión.
- **Prueba:** `limits-trials.test.ts › si el almacén de límites falla…`. Una transacción con `pg_sleep` en curso cuando cae la base de datos se rechaza sin excepciones no capturadas. Se comprobó que la prueba **falla** sin la corrección.

## P2-01 · Abuso de la prueba gratuita

- **Causa:** cualquiera podía encadenar pruebas gratuitas registrándose con otra dirección.
- **Corrección** (migración 0010, `modules/auth/trial.ts`):
  - Una prueba por email normalizado (minúsculas, sin `+etiqueta`, Gmail sin puntos).
  - Una por dominio de empresa al año (`TRIAL_DOMAIN_RULE_DAYS`).
  - Ninguna con correo desechable conocido.
  - Quien no cumple se registra igualmente, sin plan (solo lectura, puede contratar). El panel lo explica.
  - Solo se guardan huellas SHA-256, que se borran a los 24 meses. La migración crea las de las cuentas existentes.
  - Con RLS, cada empresa solo ve sus huellas. La comprobación entre empresas usa la función acotada `app_trial_claimed`, que solo responde sí o no.
- **Cambio comercial documentado:** antes toda alta tenía prueba. Las reglas y sus falsos positivos están en `docs/facturacion.md`, junto con cómo conceder una prueba a mano.
- **Prueba:** `limits-trials.test.ts`, 7 pruebas:
  - normalización;
  - misma bandeja (con puntos o `+etiqueta`): sin prueba, en solo lectura y anotado en el historial;
  - dos usuarios de Gmail distintos sí obtienen su prueba;
  - dominio de empresa con altas **simultáneas**: solo una prueba, y vuelve a haberla pasado el plazo;
  - correo desechable;
  - huellas sin datos en claro, reconocimiento de las huellas de la migración, borrado a los 24 meses, y la aplicación no puede borrarlas;
  - aislamiento entre empresas.

  `apps/web/test/app.test.tsx`: el aviso del panel.
- **Pendiente:** la lista de dominios gratuitos y desechables no es exhaustiva.

## P2-05 · Aviso antes del fin de la prueba

- **Causa:** solo había avisos de conservación **después** de perder el acceso.
- **Corrección** (migración 0010, `modules/billing/trial-reminders.ts`):
  - Avisos a los propietarios N días antes del fin (`TRIAL_REMINDER_DAYS`, por defecto 3 y 1).
  - Una vez por etapa (`trial_notices`). Si el worker estuvo parado, solo se envía la etapa vigente.
  - No se avisa a quien ya contrató ni a una prueba terminada.
  - La fecha va en la zona horaria de la empresa.
  - El texto explica qué pasa al terminar: solo lectura, automatización detenida, exportación disponible y 90 días de conservación.
- **Además:** los avisos de conservación usaban siempre la hora de Madrid. Ahora usan la zona de la empresa.
- **Prueba:** `limits-trials.test.ts`, 4 pruebas:
  - etapas;
  - una vez por etapa y sin duplicar al repetir el trabajo, con la zona horaria de la empresa y la plantilla distinta de la de conservación;
  - sin aviso a quien pagó o ya terminó, y sin avisos si no hay días configurados;
  - zona horaria del aviso de conservación.

## P1-05 · Cabeceras de seguridad del frontend en producción

- **Causa:** las cabeceras solo las aplicaba `vite preview` (pruebas). Para producción había un ejemplo de nginx incompleto, sin las cabeceras, y nada comprobaba que el servidor real las enviara.
- **Corrección:**
  - Una sola fuente: `apps/web/server/security-headers.mjs`. Se añaden HSTS (sin `preload`), COOP y CORP.
  - Servidor de producción sin dependencias (`server/serve.mjs`): estáticos, aplicación, proxy de `/api` y protección contra rutas fuera de `dist/`.
  - Configuración generada para nginx (`ops/nginx/presupio-web.conf`) y para alojamientos estáticos (`dist/_headers`).
  - La E2E se ejecuta ahora sobre el servidor de producción, no sobre `vite preview`.
- **Fallo encontrado al probar con nginx real:** un 404 de `/assets/` quedaba en caché un año (`immutable` con `always`). Corregido.
- **Prueba:**
  - `apps/web/test/production-server.test.ts`, 7 pruebas.
  - `nginx -t` y nginx 1.24 sirviendo la compilación por HTTPS con un certificado de prueba: cabeceras en `/`, en las rutas, en `/assets` y en los 404; caché solo en respuestas 200; redirección de HTTP a HTTPS.
  - E2E: 15/15 sobre el servidor de producción, y la CSP bloquea un script en línea en Chromium.
- **Pendiente por dependencia externa:** comprobar las cabeceras en el alojamiento y dominio reales tras desplegar. No se afirma que el alojamiento real esté protegido.

## P1-06 / P2-06 · Revisión de Stripe y E2E con pagos simulados

- **Revisión:** ya estaban bien cubiertos:
  - firma de los webhooks con tolerancia de 5 minutos;
  - eventos en modo real ignorados;
  - claves live rechazadas al arrancar;
  - precio comprobado contra el catálogo antes de cobrar;
  - el estado solo cambia por webhook, leyendo la suscripción actual en Stripe;
  - deduplicación de eventos;
  - aislamiento por cliente de Stripe.
- **Correcciones:**
  - El servidor aceptaba **cualquier URL `https://`** como página de pago o de portal. Ahora solo `https://checkout.stripe.com/` y `https://billing.stripe.com/`, como ya hacía el frontend.
  - **Interfaz:** tras pedir un cambio de plan, una cancelación o una reanudación, la página no se actualizaba hasta recargar, porque el webhook llega segundos después. Ahora espera la confirmación de Stripe consultando cada 2 s (como mucho 90 s) y lo indica. Lo descubrió la nueva E2E.
  - `STRIPE_API_BASE`, solo para pruebas: la librería oficial apunta a un simulador local. Se rechaza en producción y fuera de local.
  - `RATE_LIMIT_REGISTER_PER_HOUR`: ajuste operativo del límite de altas, ahora compartido entre instancias (por defecto 10).
- **Prueba:**
  - `e2e/billing.spec.ts`, 3 pruebas: contratar, activar, cambio de plan, cancelación, fin del periodo, solo lectura, portal, cobro fallido, gracia, recuperación, impago, aislamiento, firma falsa y evento repetido.
  - `billing.test.ts`: dos pruebas nuevas (redirecciones ajenas → 503; `STRIPE_API_BASE` restringido).
- **Pendiente por dependencia externa:** probar con una cuenta de Stripe en modo de prueba, que requiere credenciales. El simulador **no equivale** a Stripe real.

## P0 · Documentos legales

- **Causa:**
  - El alta y las invitaciones pedían aceptar «los términos del servicio y la política de privacidad», pero esos documentos no existían ni se enlazaban.
  - No había un texto de encargo del tratamiento para los datos de los clientes de cada empresa.
- **Corrección:**
  - **Borradores** en `docs/legal/`: términos, privacidad, encargo del tratamiento, cookies y aviso legal.
    - Están marcados como **BORRADOR — PENDIENTE DE REVISIÓN JURÍDICA (Y FISCAL). NO PUBLICAR**.
    - Usan solo hechos comprobados en el código: datos, plazos, proveedores, cookie única, precios y límites.
    - Lo que falta queda como `[PENDIENTE: …]`, sin inventar obligaciones ni afirmar que se cumple ninguna norma.
  - `docs/legal/README.md`: lista de 19 puntos que debe revisar un profesional y tabla de datos y plazos reales.
  - **En producción la API no arranca** sin `LEGAL_TERMS_URL` y `LEGAL_PRIVACY_URL` (https): las versiones publicadas tras la revisión.
  - Los formularios enlazan a esas direcciones (`GET /public/legal`). Fuera de producción dicen «Documentos pendientes de publicar en este entorno», y nunca enlazan a los borradores.
- **Prueba:**
  - `test/legal.test.ts`, 2 pruebas: producción exige ambas URLs https, y el endpoint indica pendiente o publicado.
  - `protection.test.ts`: la ruta pública está en la lista revisada.
  - `apps/web/test/app.test.tsx`: enlaces con `rel="noopener noreferrer"` o aviso de pendiente.
- **Estado: PENDIENTE DE REVISIÓN LEGAL O FISCAL.**
  - Los textos no están validados. No se publica nada ni se presenta como definitivo.
  - Falta guardar la versión aceptada, si la revisión lo pide.

## P2-03 · Comandos de producción sin dependencias de desarrollo

- **Causa:** las migraciones, `ops` y el proceso de envío en modo `--once` solo se podían ejecutar con `tsx`, que es una dependencia de desarrollo. Tras `npm ci --omit=dev` no funcionaban.
- **Corrección:**
  - `db:migrate:prod`, `db:bootstrap:prod` y `ops:prod` ejecutan el código compilado (`dist/scripts`).
  - En la raíz: `start:worker`, `start:web` y `db:migrate:prod`.
  - README y `docs/operacion.md`: compilar con todas las dependencias y ejecutar solo con las de producción.
- **Prueba** (copia limpia sin `.env` ni `node_modules`):
  - `npm ci` y `npm run build`.
  - Después se borran los `node_modules` y se ejecuta `npm ci --omit=dev`: 101 paquetes, sin `tsx`, `tsc`, `vitest` ni `vite`.
  - Con `NODE_ENV=production` sobre una base nueva:
    - migraciones (10) y una segunda pasada idempotente;
    - `ops:prod companies`;
    - API (`/health/ready` 200);
    - proceso de envío (ciclos de planner, dispatcher, recovery y retention registrados en `job_runs`);
    - servidor web (`/` 200 y proxy de `/api` 200);
    - un registro a través del servidor web (201).
  - La base de comprobación se borró al terminar.

## P3 · Mantenimiento

| Problema | Corrección | Prueba |
|---|---|---|
| Sin lint | ESLint 10 con configuración plana (`eslint.config.mjs`): JS, typescript-eslint y reglas de React Hooks. `npm run lint` en la CI. Se corrigieron los 26 errores encontrados, sin desactivar reglas en bloque; las excepciones van en su línea con el motivo. | `npm run lint` sin errores |
| Fallos reales que encontró el lint | <ul><li>`Date.now()` durante el render en 4 pantallas (estados «vencido» que no se actualizaban): nuevo `useNow()`, que se refresca cada minuto;</li><li>un `setState` síncrono en un efecto;</li><li>acceso a un objeto con `ref` durante el render;</li><li>error de migración sin `cause`;</li><li>`any` sustituido por tipos en `/ops/status`</li></ul> | Pruebas web 77/77 y API en verde |
| Sin cobertura | `@vitest/coverage-v8`; `npm run test:coverage` en la CI con umbrales por debajo de lo medido | API: 91,7 % sentencias, 79,7 % ramas, 94,8 % funciones, 95 % líneas. Web (unitarias): 27,3 % / 18,4 % / 22,3 % / 27,2 %. La web se cubre sobre todo con las 18 pruebas E2E, que no se miden aquí. |
| Acciones de GitHub sobre Node 20 (obsoleto) | `actions/checkout`, `setup-node` y `upload-artifact` pasan a **v7** (Node 24). Se comprobaron sus notas de cambios incompatibles: no afectan. Se añade `persist-credentials: false`. La aplicación sigue en Node 22 (`.nvmrc`, `engines`). | Se verifica en la ejecución de la CI tras el push |
| Email transaccional sin tiempos máximos (por defecto, hasta 2 min para conectar y 10 min con el socket inactivo) | `SMTP_TIMEOUTS`: conexión 15 s, saludo 15 s, socket 30 s, como el proveedor de seguimientos | `automation-units.test.ts › un servidor SMTP que acepta la conexión pero no responde…`: falla como `failed` en menos de 5 s |
| **Fallo nuevo:** con `NODE_ENV=development` en el entorno (el `.env` local que cargan las E2E), `vite build` generaba un paquete de desarrollo con rutas absolutas del equipo (18 archivos) | `vite build` fuerza producción. `server/check-build.mjs` falla si encuentra JSX de desarrollo, rutas absolutas o mapas de código. | Con `NODE_ENV=development`: 0 archivos afectados. La comprobación falla con un archivo de desarrollo inyectado y pasa con la compilación real. |
| Documentación con «recuperaciones» como unidad del plan | `arquitectura.md` y `PRODUCT.md`: intentos al mes; las recuperaciones, como métrica. Descripción del paquete raíz corregida. | Revisión de texto |
| Contraseña fija en `docker-compose.yml` | `PRESUPIO_LOCAL_PG_PASSWORD` (por defecto `postgres`, solo local) | YAML válido |
| Referencias a MotorWorld | No hay ninguna en el código de Presupio. Solo aparecían en el paquete compilado en local (rutas absolutas; corregido arriba). El repositorio se llama MotorWorld; cambiarle el nombre corresponde a su propietario. | `grep` sin resultados fuera de `dist/` |
| HTML ajeno en la raíz (`index__1_.html`, página de MotorWorld subida por el propietario en `217fa26`) | **No se borra sin su confirmación.** Queda fuera de Presupio: la CI solo se ejecuta con cambios en `presupio/**` y ninguna compilación lo incluye. | — |

## Validación final (30 de octubre de 2026, en este entorno)

| Comprobación | Resultado |
|---|---|
| Comprobación de tipos (API y web) | Correcta |
| Lint (`npm run lint`) | 0 errores |
| Compilación (API y web, con la comprobación de producción) | Correcta |
| Pruebas de la API, **10 ejecuciones consecutivas en paralelo** | 10/10 en verde, 233/233 cada una (17 archivos) |
| Cobertura de la API | 91,96 % sentencias, 79,79 % ramas, 95,09 % funciones, 95,35 % líneas (umbrales cumplidos) |
| Pruebas web | 77/77. Cobertura unitaria 27 % (umbral cumplido) |
| E2E (Chromium, servidor de producción, Mailgun y Stripe simulados en local) | 18/18 |
| `npm audit` (todas las dependencias y solo producción) | 0 vulnerabilidades |
| Migraciones nuevas (0001→0010) y sobre datos existentes (0005→0010, 0004→0005, 0002→0003) | Correctas e idempotentes |
| Instalación de producción limpia (`npm ci --omit=dev`) | Migraciones, `ops`, API, proceso de envío y web en funcionamiento |
| nginx real (1.24) con la configuración generada | `nginx -t` correcto y cabeceras servidas |
| Secretos en los cambios | Ninguno. El único `whsec_` es el valor inventado del simulador de E2E. |
| Cambios fuera de `presupio/` y `.github/` | Ninguno |

No se ha desplegado nada, no se ha contactado con Stripe, Mailgun ni ningún proveedor real, no se ha enviado ningún email real y no se han tocado datos de producción.

## Revisión de preparación para el lanzamiento (30 de octubre de 2026)

Se comprobó el informe anterior contra el código; el detalle está en `docs/PLAN-LANZAMIENTO.md`, apartado 2.

| Problema | Demostración | Corrección | Prueba |
|---|---|---|---|
| nginx rechazaba con 413 el correo entrante de más de 1 MB (respuestas con adjuntos sin detectar) | nginx 1.24 real con la configuración generada: 2 MB → 413 | `client_max_body_size 11m` solo en `/api/v1/webhooks/inbound/` | nginx real: 2 MB y 9 MB → 200; `login` con 2 MB → 413. `production-server.test.ts` comprueba el bloque. |
| `ops/restore.sh` y `operacion.md` indicaban `db:migrate` (necesita dependencias de desarrollo) | Lectura | `db:migrate:prod` | Restauración con el esquema actual: recuentos idénticos, RLS activo |
| Alerta `deliveries_unknown_review` sin documentar | `ops/routes.ts` frente a `operacion.md` | Documentada | — |
| Faltaba indicar la versión de la API del webhook de Stripe | `normalizeEvent` lee `invoice.parent.subscription_details` | `2026-09-30.endive` en `facturacion.md` y en el plan | — |

## Auditoría final de producción · `TRUST_PROXY=1` no funcionaba: todos los clientes compartían la IP del proxy

- **Causa:** Fastify 5.12 dejó de confiar en un **número de saltos** (`trustProxy: 1`), por seguridad: no puede validar al vecino inmediato. La configuración seguía aceptando `TRUST_PROXY=1` y la guía de despliegue lo recomendaba. Detrás de nginx, `req.ip` era siempre la IP de nginx, así que los límites por IP eran comunes a todos los clientes (10 altas por hora y 20 inicios de sesión cada 15 minutos en total).
- **Demostración:**
  - Con la API compilada en producción, `TRUST_PROXY=1` y 221 altas desde 221 IPs distintas (`X-Forwarded-For`), todas cayeron en **una sola** clave de límite. Después, cualquier inicio de sesión respondía 429.
  - Fastify aislado: `trustProxy: 1` → `ip = 127.0.0.1`; `'127.0.0.1'` o `'loopback'` → la IP del cliente.
- **Corrección** (`config.ts`, `app.ts`):
  - `TRUST_PROXY` acepta `true`, `false` o una lista de IPs, redes CIDR y `loopback`/`linklocal`/`uniquelocal`.
  - Un número **detiene el arranque** con un mensaje claro, en lugar de fallar en silencio.
  - Documentación: `TRUST_PROXY=loopback` cuando nginx está en la misma máquina.
- **Prueba:**
  - `limits-trials.test.ts`, 2 pruebas nuevas: validación de la configuración, límite propio por cliente detrás del proxy, y un cliente directo no puede falsificar su IP.
  - En vivo, con `TRUST_PROXY=loopback`: tres inicios de sesión desde tres IPs → tres claves distintas.

## Auditoría final · Listado de seguimientos lento con RLS (índice 0011)

- **Causa:** `GET /follow-ups` (también en el panel) filtra por empresa y estado y ordena por `created_at DESC, id DESC`. Con RLS, PostgreSQL no puede usar la condición de estado en un índice, porque la igualdad de un `enum` (`enum_eq`) no es `leakproof`. Así que unía y ordenaba **todos** los seguimientos pendientes de la empresa para devolver 26.
- **Demostración** (`EXPLAIN ANALYZE` como el rol de la aplicación, empresa con 5.000 seguimientos):
  - 19 ms, con barrido completo de `quotes` y `contacts`.
  - Un índice `(company_id, status, created_at, id)` **no se usaba** con RLS (sí sin RLS), por el motivo anterior.
- **Corrección:** migración `0011`, índice `(company_id, created_at DESC, id DESC)`. `company_id` sí es `leakproof`: recorre en orden y se detiene en el límite.
- **Prueba:** mismo `EXPLAIN ANALYZE` con RLS:
  - pendientes: 19 ms → **0,8–1,1 ms**;
  - realizados: 19 → **2,5–3,3 ms**;
  - un estado sin filas: → **2,5 ms**.

## Auditoría final · El migrador fallaba si el proveedor tiene extensiones en el esquema

- **Causa:** tras migrar, el migrador concedía permisos con `GRANT … ON ALL TABLES/FUNCTIONS IN SCHEMA`. Si el PostgreSQL gestionado tiene funciones de otro rol en `public` (`pg_stat_statements` es habitual), el `GRANT` falla con `permission denied` y el despliegue se interrumpe.
- **Demostración:** con `pg_stat_statements` instalado en la base de rendimiento, `db:migrate:prod` terminó con `permission denied for function pg_stat_statements_reset`.
- **Corrección:** solo se conceden permisos sobre las tablas, vistas y funciones cuyo propietario es el rol de migraciones (las de Presupio).
- **Prueba:** `database.test.ts › migrar no falla si el proveedor tiene funciones propias en el esquema`.
  - Falla con el migrador anterior (el mismo `permission denied`) y pasa con el nuevo.
  - El rol de la aplicación no recibe permiso sobre la función ajena y sí sobre las de Presupio.
  - `db:migrate:prod` sobre la base de rendimiento: correcto.

## Auditoría final · `ops/backup.sh` fallaba de forma intermitente

- **Causa:** la comprobación final `pg_restore --list | grep -q` con `set -o pipefail`. `grep -q` termina en la primera coincidencia; si `pg_restore` escribía después, recibía `SIGPIPE` y el script daba por fallida una copia correcta.
- **Demostración:** 14 fallos de 200 comprobaciones (7 %) sobre una copia real de la base de rendimiento. Durante el simulacro de desastre, la copia falló así.
- **Corrección:** `grep -c`, que lee todo el listado.
- **Prueba:** 0 fallos de 200 comprobaciones y 0 fallos de 20 copias completas con `backup.sh`.

## Auditoría final · `ops/restore.sh` no restauraba copias con extensiones del proveedor

- **Causa:** si la base de origen tiene extensiones (`pg_stat_statements` es habitual en un PostgreSQL gestionado), `pg_dump` incluye `CREATE EXTENSION`. Al restaurar con el rol propietario fallaba con `permission denied to create extension`, y con `--single-transaction --exit-on-error` **no se restauraba nada**.
- **Demostración:** el simulacro de desastre se detuvo en ese error.
- **Corrección:** `restore.sh` omite las entradas de extensiones del índice de la copia (`--use-list`). Presupio no usa ninguna extensión: ninguna migración crea una.
- **Prueba:** `test/backup.test.ts`, que ejecuta los scripts reales:
  - copia de una base migrada con 50 presupuestos y `pg_stat_statements`;
  - restauración en una base vacía, migración, recuento, RLS activo, y rechazo de restaurar encima de una base con datos.
  - Falla con el `restore.sh` anterior y pasa con el nuevo.

## Auditoría final · Importes con céntimos mostrados con un solo decimal

- **Causa:** `formatMoney` usaba `minimumFractionDigits: 0` para no mostrar «,00» en importes redondos. Con céntimos terminados en cero quitaba también ese cero: 7.450,50 € se mostraba «7.450,5 €».
- **Demostración:** recorrido real en WebKit (motor de Safari): la ficha del presupuesto creado con «7.450,50» mostraba «7.450,5 €». La propia prueba E2E esperaba el formato incorrecto («18.500,5 €»).
- **Corrección:** los importes redondos se muestran sin decimales («7.450 €»). Con céntimos, siempre dos («7.450,50 €»).
- **Prueba:**
  - `lib.test.ts › con céntimos muestra siempre dos decimales`;
  - E2E corregida a «18.500,50 €»;
  - WebKit: «7.450,50 €».

## Auditoría final · Diseño adaptable: revisión en 8 dispositivos y en WebKit

Revisión automática de las 18 pantallas en Chromium con emulación de 8 dispositivos: Android de 320 px, Pixel 7, iPhone SE, iPhone 13, iPad vertical y horizontal, y escritorio de 1024 y 1440 px. Se comprobó lo siguiente:

- desborde horizontal;
- título y `h1`;
- huecos en las cifras;
- objetivos táctiles;
- letra de los campos (zoom de iOS);
- barra inferior;
- navegación, menú de cuenta y cierre de sesión;
- errores de JavaScript.

Problemas encontrados y corregidos:

- **`/resultados` desbordaba 20 px a 320–375 px.**
  - Causa: el selector de mes (`nowrap`) y la etiqueta «En curso» ensanchaban la columna.
  - Corrección: la etiqueta baja de línea.
- **Las cifras dejaban celdas huérfanas** (en tableta, 4 + 1 con una fila casi vacía; en móvil, 2 + 2 + 1).
  - Corrección: reparto por el ancho real del bloque (container queries), con `auto-fit` como respaldo:
    - en móvil, 2 columnas y la última impar a lo ancho;
    - en tamaños intermedios, 3 + 2 o 2 + 2;
    - en pantallas anchas, una sola fila.
- **La página 404 y la de error no tenían `h1`** (eran `h3`). `EmptyState` admite ahora `heading="h1"`.
- **La barra inferior pegaba «Presupuestos» y «Seguimientos» a 320 px** (1 px de separación).
  - Causa: con `1fr` a secas, las etiquetas largas ensanchaban su columna.
  - Corrección: `minmax(min-content, 1fr)`, relleno lateral en la etiqueta y letra de 10 px por debajo de 360 px.
  - Ahora queda como mínimo a 6 px. Las cinco caben desde 280 px.
- **Enlaces sueltos de 15–20 px de alto en pantallas táctiles** (miga de pan, «¿Has olvidado tu contraseña?», títulos de las cifras, seguimientos, emails) y la casilla «Solo los asignados a mí».
  - Corrección: con `pointer: coarse`, al menos 24 px (WCAG 2.2, 2.5.8), con relleno compensado. El diseño no se mueve.

Resultado: **469/469** comprobaciones en Chromium (dos ejecuciones seguidas) y **23/23** en WebKit 2.52 (MiniBrowser):

- registro y creación de un presupuesto;
- formato de importes;
- 6 pantallas de escritorio;
- móvil estrecho y tableta;
- menú de cuenta y cierre de sesión;
- sin CSP ni errores de JavaScript.

Única excepción aceptada: en el plano de la cartera, las parcelas de importes pequeños pueden medir menos de 24 px. Su tamaño es el dato, y los mismos presupuestos están en la lista.

## Auditoría final · Servidor web de producción (`server/serve.mjs`): fallos que podían tumbarlo o dejar peticiones colgadas

- **Contexto:** al ejecutar la batería E2E en Firefox, una navegación quedó colgada 5 minutos contra `serve.mjs`. Revisé el servidor y encontré cuatro defectos reales. **No está demostrado que alguno de ellos causara ese bloqueo** (en el registro no hubo errores del servidor), pero los cuatro se reproducen y se han corregido.
- **Fallos y demostración** (`production-server.test.ts`, que fallaba con el servidor anterior):
  1. Un error al leer un archivo (`EIO` simulado con `/proc/self/mem`, como un archivo que desaparece durante un despliegue) lanzaba una **excepción no capturada que tumbaba el proceso**.
  2. Si la API cortaba una respuesta a medias, **el navegador esperaba para siempre**.
  3. Si el navegador abandonaba una petición, la petición a la API **seguía abierta**.
  4. Si la API no contestaba, **no había límite de espera**.
- **Corrección:**
  1. Las cabeceras se envían cuando el archivo ya está abierto: si falla antes, `500`; si falla a mitad, se corta la respuesta.
  2. Un corte de la API se propaga al navegador.
  3. Si el navegador se va, se cancela la petición a la API.
  4. Tras 60 s sin respuesta de la API, `504`. Es el mismo valor que `proxy_read_timeout` de nginx.
- **Prueba:**
  - 4 pruebas nuevas, que fallaban antes y pasan ahora;
  - la batería web completa (82);
  - la E2E completa en Chromium (18/18).
- **Diagnóstico añadido:**
  - límite de 30 s por navegación en las E2E;
  - tiempos por pantalla en la prueba de accesibilidad;
  - registros de la API en la CI cuando algo falla.

  Así, si el bloqueo de Firefox se repite, quedará localizado.

## Auditoría final · E2E en Firefox: Playwright pierde la primera navegación de una página nueva (no es un fallo de Presupio)

- **Síntoma:** en 5 de 9 ejecuciones de Firefox en la CI (21, 23, reejecución de la 24, 25 y 26), una navegación de una página recién creada no terminaba según Playwright.
  - Es siempre la primera navegación de esa página.
  - Chromium, WebKit y Edge nunca fallaron.
- **Hipótesis descartadas, con datos:**
  1. `localhost` frente a `127.0.0.1`: falló igual con `127.0.0.1`. El cambio se mantiene porque es inocuo.
  2. Que faltara el evento `load`: con `waitUntil: 'commit'`, el primer aviso que hay, tampoco llegó nada (ejecución 26).
- **Lo que está demostrado:** con el registro de accesos de `serve.mjs` (`ACCESS_LOG`, añadido para esto), en los fallos de las ejecuciones 25 y 26 el servidor recibió y respondió **todas** las peticiones de esa navegación en unos 130 ms. Incluyen las que hace la aplicación después de pintar la pantalla, como `GET /api/v1/public/legal` del formulario de alta.

  Firefox navegó y Presupio funcionó. Lo que se pierde es el seguimiento de esa navegación en Playwright. Hay problemas parecidos conocidos (microsoft/playwright#21430).
- **Medida:** **un reintento solo en el proyecto de Firefox** (`playwright.config.ts`):
  - un fallo real de la aplicación falla en los dos intentos y la CI se pone en rojo;
  - los recuperados aparecen como «flaky» en la salida de la CI;
  - Chromium, WebKit y Edge siguen sin reintentos.
- **Descartado:** el `navigate()` probado en la ejecución 26 (esperar a `commit` y comprobar `readyState`) no lo evitaba y se ha retirado.
- **Verificación:** tres ejecuciones consecutivas de la CI en verde en los cuatro navegadores (ver `AUDITORIA-PRODUCCION.md` §7.1).

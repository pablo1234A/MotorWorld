# Auditoría final de producción

> **Objetivo:** demostrar con pruebas reales, antes de contratar alojamiento, dominio, Mailgun o activar Stripe, que Presupio puede lanzarse. **Regla:** nada se da por correcto sin medirlo. Cada fallo encontrado se corrigió, se volvió a probar y quedó cubierto por una prueba automática.
>
> **Fecha:** 30 de octubre de 2026. **Rama:** `claude/trusting-faraday-s9knnv`.

## 0. Entorno de medición

- **Máquina:** 4 núcleos y 16 GB de RAM. El generador de carga corría en la misma máquina y competía por la CPU, así que **las cifras de capacidad son conservadoras**.
- **Software:**
  - API y worker **compilados**, con `NODE_ENV=production`, Node 22.22, Fastify 5.12 y `TRUST_PROXY=loopback`;
  - frontend servido por `server/serve.mjs`, con las cabeceras de producción;
  - PostgreSQL 16 con RLS, accediendo con el rol de la aplicación (sin privilegios);
  - `pg_stat_statements` activado solo para medir.
- **Proveedor de email:** simulador HTTPS de la API de Mailgun, con certificado propio, 20 ms por mensaje e ids únicos. Detecta duplicados por envío y por destinatario y asunto.
- **Datos, creados a través de la API** (no con SQL), en 112 s: 221 empresas, 16.000 presupuestos, 11.000 seguimientos y 43.482 entradas de historial.
  - Al final de las pruebas: 284 empresas, 45.903 presupuestos, 18.881 seguimientos, 155.883 entradas de historial y 5.000 envíos. En total, **139 MB**.
  - Durante la siembra, con 32 en paralelo: crear un presupuesto, p50 101 ms y p95 151 ms; alta de empresa, p50 239 ms.

## 1. Recuperación ante desastres

Simulacro completo con los scripts reales (`ops/backup.sh`, `ops/restore.sh` y `db:migrate:prod`), mientras el worker enviaba:

| Paso | Resultado |
|---|---|
| Copia en caliente | **1,24 s**, 6,8 MB, con SHA-256 y comprobación del índice |
| Envíos después de la copia | 400 |
| PostgreSQL detenido (8 s) | API y worker **vivos**. `/health` 200 y `/health/ready` 503 |
| Base de datos **borrada** | Confirmado: no existe |
| Restauración | **2,71 s** |
| Migración | **0,17 s** |
| API lista | **0,87 s** |
| **Total desde la caída** (incluye los 8 s de caída simulada) | **16,75 s** |
| Datos | Iguales a la copia: 281 empresas, 16.180 presupuestos y 1.500 envíos |
| Inicio de sesión / presupuesto de otra empresa | `200` / `404` (aislamiento intacto) |
| Worker en **modo seguro** (`FOLLOWUP_EMAIL_PROVIDER=disabled`) | **0 envíos** |
| Al reactivar el envío | 3.500 envíos pendientes. **Exactamente 400 reenvíos** al mismo destinatario y con el mismo paso: los posteriores a la copia. 0 seguimientos con dos envíos dentro de la base |

**Conclusión:**
- La restauración funciona y es rápida.
- **La pérdida de datos posterior a la copia (RPO) se traduce en reenvíos.**
- Mitigación documentada en `HOSTING-READY.md` §9:
  - PITR del proveedor (ventana de minutos);
  - arranque del worker en modo seguro tras restaurar;
  - revisión de los registros de Mailgun desde la hora de la copia.

**Fallos encontrados durante el simulacro, corregidos y con prueba:**
- `backup.sh` fallaba el 7 % de las veces (`SIGPIPE` con `grep -q` y `pipefail`). Ahora: 0 de 200.
- `restore.sh` no restauraba copias con extensiones del proveedor: con `pg_stat_statements`, la restauración entera se abortaba.
- `test/backup.test.ts` ejecuta en cada CI los scripts reales: copia, restauración en una base vacía, migración, recuento, RLS y rechazo de restaurar sobre una base con datos.
  - Comprobado en la CI: `✓ test/backup.test.ts (1 test) 2278 ms`.

## 2. Rendimiento (un usuario, 60 repeticiones)

Empresa pequeña (~20 presupuestos) y empresa grande (5.165 presupuestos), con el índice 0011 aplicado:

| Operación | Pequeña p50 / p95 | Grande p50 / p95 |
|---|---|---|
| Iniciar sesión (incluye argon2) | 57 / 74 ms | 50 / 63 ms |
| Alta de empresa | 56 / 73 ms | — |
| Panel completo (8 peticiones en paralelo) | 34 / 51 ms | **29 / 41 ms** (antes, 41 / 65) |
| Listar presupuestos, 1.ª página | 9 / 20 ms | 9 / 14 ms |
| Página siguiente | 8 / 11 ms | 10 / 14 ms |
| Buscar | 9 / 13 ms | 25 / 39 ms |
| Ficha | 8 / 23 ms | 8 / 12 ms |
| Crear presupuesto | 15 / 25 ms | 16 / 22 ms |
| Editar presupuesto | 13 / 16 ms | 13 / 20 ms |
| Seguimientos pendientes | 11 / 14 ms | **11 / 17 ms** (antes, 29 / 43) |
| Contactos | 9 / 15 ms | 6 / 14 ms |
| Métricas del mes | 22 / 33 ms | 41 / 58 ms |
| Exportación completa (límite: 5 por hora) | 91 / 100 ms | 710 / 798 ms |
| **Worker** | 17 envíos/s con 1 worker; 30/s con 2 | — |

## 3. Consultas lentas

`EXPLAIN (ANALYZE, BUFFERS)` como **el rol de la aplicación, con RLS**: así se ejecutan en producción.

| Consulta | Antes | Después | Qué se hizo |
|---|---|---|---|
| Listado de seguimientos (panel y página), empresa con 5.000 | **19 ms**: recorría y ordenaba todos los pendientes | **0,8–1,1 ms** (pendientes), 2,5–3,3 ms (otros estados) | **Migración `0011`**: índice `(company_id, created_at DESC, id DESC)` |
| Búsqueda de presupuestos (5.000) | ~17 ms | Sin cambio | Se mantiene: el `OR` cruza dos tablas y un índice trigram no compensa a este volumen. Revisar con más de 50.000 por empresa |
| Consultas del worker | < 0,4 ms de media | — | Nada que corregir |

**Por qué el primer índice no servía:** el índice obvio `(company_id, status, created_at, id)` **no se usaba con RLS**. La igualdad sobre un `enum` (`enum_eq`) no es `leakproof`, y PostgreSQL no puede aplicar antes de la política de seguridad una condición que no sea `leakproof`. El índice sin la columna de estado sí se usa, porque `company_id` es `uuid` y su igualdad sí es `leakproof`. El detalle está en `registro-correcciones.md`.

**Bajo carga (`pg_stat_statements`):** el 65 % del tiempo de PostgreSQL es el contador de límites por IP, que hace una escritura por petición y se comparte entre instancias.
- Se probó como tabla `UNLOGGED` y **no mejoró**: se revirtió.
- No limita el lanzamiento (§4). Si la base llegara a ser el cuello de botella con varias APIs, la alternativa es Redis.

## 4. Prueba de carga progresiva

Usuarios virtuales con sesión propia y una IP distinta cada uno. Cada usuario repite: panel completo (8 peticiones), listar, ficha, **crear**, **editar** y seguimientos. Se mide en una ventana estable de 60 s, después de la subida. **0 errores en todas las pruebas.**

**Uso intenso (5 s entre acciones), 1 API:**

| Usuarios | Pet/s | Panel p50 / p95 | Listar p50 / p95 | Crear p50 / p95 | CPU API media (máx.) | RAM API | CPU PostgreSQL media | RAM máquina |
|---|---|---|---|---|---|---|---|---|
| 50 | 10 | 45 / 101 ms | 12 / 19 ms | 20 / 30 ms | 10 % (86 %) | 233 MB | 8 % | 1,2 GB |
| 100 | 19 | 46 / 105 ms | 11 / 16 ms | 18 / 25 ms | 15 % (82 %) | 303 MB | 16 % | 1,3 GB |
| 250 | 45 | **47 / 103 ms** | 12 / 57 ms | 18 / 26 ms | 34 % (100 %) | 312 MB | 38 % | 1,4 GB |
| 500 | 84 | 98 / 532 ms | 31 / 193 ms | 25 / 366 ms | 56 % (122 %) | 334 MB | 68 % | 1,7 GB |
| 1000 | 118 | 4,5 / 6,1 s | 2,3 / 6,0 s | 0,98 / 6,4 s | 82 % (152 %) | 461 MB | 98 % | 2,0 GB |
| 1000 (**2 APIs**) | 133 | 1,2 / 3,9 s | 0,86 / 3,7 s | 0,67 / 4,0 s | 48 % + 48 % | 355 MB cada una | 119 % | 2,4 GB |

**Uso extremo (1 s entre acciones), 1 API:**

| Usuarios | Pet/s | Panel p50 / p95 | CPU API media | RAM API |
|---|---|---|---|---|
| 50 | 44 | 37 / 65 ms | 45 % | 230 MB |
| 100 | 84 | 65 / 247 ms | 67 % | 243 MB |
| 250 | 138 | 682 ms / 1,7 s | 111 % | 356 MB |
| 500 | 143 | 2,8 / 3,9 s | 126 % | 428 MB |
| 250 (**2 APIs**) | 157 | 387 ms / 1,1 s | 71 % + 72 % | 321 MB cada una |
| 500 (**2 APIs**) | 164 | 1,9 / 3,5 s | 78 % + 77 % | 359 MB cada una |

CPU en % de un núcleo.

**Miles de presupuestos y seguimientos:**
- la siembra creó 16.000 presupuestos y 11.000 seguimientos a través de la API;
- la carga añadió unos 30.000 presupuestos más;
- el worker envió 5.000 seguimientos vencidos de golpe (§5).

**Conclusiones:**
- **Una API sostiene 250 usuarios de uso intenso sin degradarse** (panel p95 ~100 ms), y unos 500 con colas puntuales.
- El límite es la CPU. Con 1000 usuarios, la máquina estaba al 87–95 %, con el generador incluido.
- **Perfil de CPU con 500 usuarios, sin un punto caliente propio:** sockets ~20 %, Kysely ~18 %, Fastify ~6,5 % y GC ~6 %. No hay una optimización pendiente que cambie el dimensionado.
- Subir el pool de conexiones a 20 no mejoró nada.

## 5. Escalabilidad, reinicios y concurrencia: sin duplicados

| Prueba | Resultado |
|---|---|
| **1 worker**, 5.000 envíos vencidos | 294 s (17/s). **0 duplicados**, 0 atascados. 166 MB y 24 % de CPU |
| **2 workers** a la vez, 5.000 envíos | 166 s (30/s). **0 duplicados**, 0 atascados |
| 2 workers y **`SIGKILL` de uno a mitad de lote**, rearrancado al segundo | 4.982 enviados al momento, **0 duplicados** y 18 interrumpidos. A los 15 min, la recuperación reencoló y envió **una sola vez** los 17 que no habían llegado al proveedor y dejó en «sin verificar» el que sí había salido. **5.000 de 5.000, sin duplicados** |
| **2 APIs** sobre la misma base | 0 errores con 250, 500 y 1000 usuarios. Límites por IP compartidos |
| Sesión entre APIs | Inicio de sesión en la API A, lectura y alta en la B (`200`/`201`), cierre en la B → la A rechaza la sesión (`401`) |
| Caída de PostgreSQL | API y worker vivos y recuperación automática (§1) |
| Unicidad en la base | Un id de proveedor duplicado (provocado por un fallo del simulador durante la auditoría, no de Presupio) fue **rechazado por la restricción única**. La recuperación posterior resolvió los envíos afectados sin reenviar |

## 6. Experiencia de uso (revisión como cliente)

Recorrido de registro → panel → presupuesto → ficha → seguimientos → contactos → resultados → configuración → cierre de sesión, con capturas revisadas en escritorio, móvil y tableta.

**Problemas encontrados y corregidos:**

| # | Problema (lo que vería un cliente) | Corrección | Prueba |
|---|---|---|---|
| 1 | Un presupuesto de 7.450,50 € se mostraba **«7.450,5 €»** (la E2E esperaba el formato incorrecto) | Importes redondos sin decimales; con céntimos, siempre dos | `lib.test.ts`, E2E y WebKit |
| 2 | En `/resultados`, a 320–375 px, la página **se desplazaba en horizontal** 20 px | La etiqueta «En curso» baja de línea | Chromium a 320 y 375 px |
| 3 | Bloques de cifras con **celdas huérfanas** (tableta: 4 + 1 con una fila casi vacía) | Reparto según el ancho real (container queries) | Comprobación automática «cifras sin huecos» en 8 dispositivos |
| 4 | La barra inferior del móvil **pegaba «Presupuestos» y «Seguimientos»** a 320 px | Columnas de al menos el ancho de su etiqueta | Separación medida ≥ 6 px |
| 5 | Enlaces sueltos de **15–20 px de alto** en pantallas táctiles | ≥ 24 px con `pointer: coarse` (WCAG 2.2, 2.5.8) | Comprobación de objetivos táctiles |
| 6 | La página 404 y la de error **sin `h1`** (lectores de pantalla) | `EmptyState heading="h1"` | Comprobación «título y encabezado» |

Revisado y correcto:
- textos claros y en español de España;
- botones con nombre;
- formularios con etiquetas y ayudas («Indica al menos un email o un teléfono», «En euros, por ejemplo 18.500,50»);
- errores de la API mostrados sin inventar datos (E2E);
- estados vacíos que explican el siguiente paso;
- campos de 16 px en móvil (iOS no amplía la página).

**Excepción aceptada:** en el plano de la cartera, las parcelas de presupuestos pequeños pueden medir menos de 24 px. Su tamaño es el dato, y los mismos presupuestos están en la lista.

## 7. Navegadores y dispositivos

| Motor / dispositivo | Cómo | Resultado |
|---|---|---|
| **Chrome** (Chromium 153) | E2E completa (18 pruebas) + 8 dispositivos emulados (469 comprobaciones) | **18/18** y **469/469** (dos ejecuciones seguidas) |
| **Android** (Pixel 7; Android pequeño de 320 px) | Emulación en Chromium: táctil, `isMobile` y su agente de usuario | Incluido arriba: 0 desbordes, navegación, menú y cierre de sesión |
| **iPhone** (SE de 320 px, 13 de 390 px) | Emulación de tamaño y táctil en Chromium + **WebKit real** a 447 px (ancho mínimo de la ventana de MiniBrowser) | Incluido arriba + WebKit **23/23** |
| **iPad** (vertical y horizontal) | Emulación en Chromium + WebKit real a 820 px | Incluido arriba + WebKit |
| **Safari** (motor WebKit) | WebKitGTK 2.52 (MiniBrowser) por WebDriver: registro, alta de presupuesto, importes, 6 pantallas, móvil, tableta, menú, cierre de sesión, sin CSP ni errores de JavaScript | **23/23** |
| **Firefox, WebKit de Playwright y Edge** | E2E completa en la CI (trabajo `navegadores`) | **18/18 en cada uno** (§7.1) |

### 7.1 Resultado en la CI (ejecución 22, commit `c1fa54c`)

Batería E2E completa, la misma en los cuatro motores: registro, presupuestos, seguimientos, envío automático, recuperación de contraseña, aislamiento, errores, solo lectura, enlaces internos, accesibilidad (axe) en 3 tamaños, teclado, cabeceras de seguridad y contratación con Stripe simulado.

| Navegador | Versión | Resultado |
|---|---|---|
| Chromium (Chrome) | 153 | **18/18**, más tipos, lint y pruebas con cobertura |
| **Firefox** | 155 | **18/18** |
| **WebKit** (Safari) | Playwright | **18/18** |
| **Microsoft Edge** | estable | **18/18** |

**Hasta llegar ahí, en Firefox:**

1. **Ejecución 19:** las páginas *simuladas* de Stripe de la prueba no declaraban su codificación y Firefox lo registra como error. Presupio sí la declara. Se corrigió la prueba.
2. **Ejecución 21:** una navegación quedó bloqueada 5 minutos contra el servidor web de producción (`serve.mjs`).
   - La causa exacta **no se ha podido determinar**: Firefox no se puede descargar en este entorno y los artefactos de la CI tampoco.
   - Al revisar el servidor aparecieron **cuatro defectos reales**, que se corrigieron con pruebas que fallaban antes (§9, puntos 12–15).
   - Desde entonces la batería pasa. Además, una navegación colgada falla a los 30 s indicando la URL y la CI imprime los registros de la API. Si se repite, quedará localizada.
3. **Ejecución 23:** se repitió, y gracias al diagnóstico quedó localizado. Las dos veces fue **la primera navegación de un contexto de navegador nuevo contra `localhost:4174`**.
   - El servidor de la batería de pagos (`127.0.0.1:4175`) también crea contextos nuevos en cada prueba y **nunca** se ha colgado.
   - `localhost` tiene dos direcciones (`::1` y `127.0.0.1`), Firefox lo resuelve por su cuenta y el servidor escucha en una sola.
   - **Cambio, solo en la configuración de las pruebas:** las E2E usan `127.0.0.1`, como la batería de pagos.
   - En producción no aplica: nginx atiende al nombre de dominio real y reenvía a `127.0.0.1:3000`.

_Pendiente de verificar con ejecuciones de la CI consecutivas en verde (se completa abajo)._

**Lo que no puede probarse sin hardware de Apple:** Safari de macOS y Safari de iOS **en dispositivos reales**. WebKitGTK y el WebKit de Playwright usan el mismo motor, pero no la misma integración con el sistema (teclado virtual, barra de direcciones, gestos). Queda como **pendiente externo**: 15 minutos con un iPhone y un Mac reales antes de abrir (§10).

## 8. Seguridad (comprobado en esta auditoría)

| Comprobación | Resultado |
|---|---|
| **IP real del cliente tras el proxy** | **Fallo encontrado y corregido.** Con `TRUST_PROXY=1`, Fastify 5.12 ignora el número de saltos: **todos los clientes compartían la IP de nginx** en los límites por IP. Por ejemplo, 10 altas por hora para todo el mundo. Ahora se indica la IP o red del proxy (`loopback`) y un número detiene el arranque. Pruebas: límite por cliente detrás del proxy, e IP falsificada sin proxy rechazada |
| Aislamiento entre empresas | `404` al pedir un presupuesto de otra empresa, también tras restaurar (§1). RLS activo en la base restaurada |
| Cabeceras de producción y CSP | 0 violaciones de CSP y 0 errores de JavaScript en WebKit y Chromium. Cabeceras comprobadas en E2E |
| Límite de inicios de sesión | Funciona: la repetición de la auditoría desde una misma IP lo activó (20 cada 15 min). Es intencionado |
| Dependencias | `npm audit`: **0 vulnerabilidades** (producción y desarrollo) |
| Secretos en el repositorio | Ninguna clave de Stripe, Mailgun ni privada en el historial actual. Ningún `.env` versionado |
| Migrador con extensiones del proveedor | **Fallo encontrado y corregido:** el `GRANT ON ALL FUNCTIONS` fallaba con `pg_stat_statements` y paraba el despliegue. Ahora solo concede sobre objetos propios. Hay prueba |
| Stripe en modo real | Imposible por diseño: 4 salvaguardas con pruebas (`ACTIVAR-PRODUCCION-STRIPE.md` §1) |
| Unidades systemd | `systemd-analyze security`: 7,5 → **3,2 («OK»)** tras el endurecimiento |

## 9. Fallos corregidos en esta auditoría

1. `TRUST_PROXY` con número de saltos: límites por IP compartidos entre todos los clientes (seguridad y disponibilidad).
2. Listado de seguimientos lento con RLS: índice `0011`, de 19 ms a ~1 ms.
3. Migrador incompatible con extensiones del proveedor.
4. `backup.sh` fallaba de forma intermitente.
5. `restore.sh` no restauraba copias con extensiones.
6. Importes con céntimos con un solo decimal.
7. Desborde horizontal en `/resultados` en móviles pequeños.
8. Celdas huérfanas en los bloques de cifras.
9. Etiquetas pegadas en la barra inferior a 320 px.
10. Objetivos táctiles pequeños.
11. 404 y pantalla de error sin `h1`.
12. `serve.mjs`: un error de lectura de un archivo tumbaba el proceso.
13. `serve.mjs`: un corte de la API a medias dejaba la petición del navegador colgada.
14. `serve.mjs`: las peticiones abandonadas por el navegador seguían abiertas contra la API.
15. `serve.mjs`: no había límite de espera a la API. Ahora, `504` a los 60 s.

Cada uno tiene su entrada en `registro-correcciones.md` y su prueba automática o comprobación repetible.

## 10. Informe final

| Área | Estado | Evidencia | Pendiente |
|---|---|---|---|
| **Bloqueadores técnicos** | **Ninguno abierto** | 15 fallos encontrados en la auditoría, corregidos y con prueba (§9). CI en verde en los cuatro navegadores | — |
| **Recuperación ante desastres** | Lista | Base borrada y recuperada en 16,75 s (restauración 2,71 s). Datos íntegros. Modo seguro sin envíos | Repetir el simulacro en staging con el proveedor real (PITR) |
| **Rendimiento** | Bueno | Operaciones típicas entre 8 y 41 ms (p50) en una empresa con 5.165 presupuestos. Panel completo en 29 ms | Revisar la búsqueda con más de 50.000 presupuestos por empresa |
| **Consultas** | Optimizadas | Seguimientos de 19 a ~1 ms (índice 0011, válido con RLS). Ninguna consulta del worker pasa de 0,4 ms | — |
| **Carga** | Medida | 1 API: 250 usuarios intensos sin degradación (p95 ~100 ms) y 500 con colas puntuales. 0 errores hasta 1000 | — |
| **Escalabilidad** | Demostrada | 2 APIs y 2 workers. Caída brusca de un worker: **0 duplicados en 5.000 envíos**. Sesiones y límites compartidos | — |
| **Experiencia de uso** | Revisada | 6 problemas visibles corregidos. 469/469 comprobaciones en 8 dispositivos y 23/23 en WebKit | — |
| **Navegadores** | Probados | Chrome, Firefox, Safari (WebKit) y Edge: 18/18 cada uno. Android, iPhone y iPad emulados | **Safari en iPhone y Mac reales** (15 min, necesita hardware de Apple) |
| **Seguridad** | Revisada | IP real tras el proxy (corregido), aislamiento, CSP, 0 vulnerabilidades, sin secretos en el repositorio, Stripe real imposible por diseño, systemd con exposición 3,2 | Revisión legal y fiscal profesional |
| **Producción** | Documentada | `HOSTING-READY.md`, `MAILGUN-READY.md` y `ACTIVAR-PRODUCCION-STRIPE.md` | Arrancar las unidades systemd en staging (aquí no hay systemd) |
| **Pendientes externos** | — | — | Alojamiento y PostgreSQL gestionado (UE, PITR) · dominio y DNS · cuenta de Mailgun UE (SPF, DKIM, DMARC, MX y webhooks) · Stripe: cuenta, modo de prueba real y luego el cambio a modo real · textos legales revisados y publicados · decisión sobre el IVA · prueba en dispositivos Apple reales |

**Riesgos residuales conocidos (no son fallos):**
- **Tras restaurar una copia, los emails enviados después de esa copia se reenvían** si se reactiva el envío sin revisar. Por eso existe el procedimiento en modo seguro (`HOSTING-READY.md` §9).
- En la CI hubo un bloqueo de una navegación en Firefox cuya causa no se pudo aislar. No se ha repetido tras corregir el servidor web, y queda instrumentado (§7.1).
- El contador de límites por IP es el 65 % del trabajo de PostgreSQL bajo carga. No limita el lanzamiento; si hiciera falta, la salida es Redis.

**Veredicto:** _pendiente_. La ejecución 23 falló en Firefox (§7.1, punto 3). Se emite cuando la CI confirme la corrección.

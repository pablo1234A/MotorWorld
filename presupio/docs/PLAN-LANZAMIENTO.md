# Plan de lanzamiento de Presupio

**Fecha de la revisión:** 30 de octubre de 2026
**Base revisada:** rama `claude/trusting-faraday-s9knnv`, commit `db6c7be` y los cambios de esta revisión (apartado 2.2)
**CI en el último commit revisado:** en verde (ejecución 13: tipos, lint, compilación, pruebas con cobertura y E2E)

> **Qué es y qué no es este documento**
>
> - Describe el estado **real** del repositorio, comprobado contra el código y con pruebas ejecutadas en esta revisión, no copiado de informes anteriores.
> - Las guías de servicios externos son **instrucciones preparadas**. No se ha contratado, activado ni conectado ningún servicio, no se ha desplegado nada, no se ha enviado ningún email real y no se ha activado ningún pago.
> - Los precios son **estimaciones no verificadas**. Compruébalos en la web de cada proveedor antes de contratar.
> - Nada de lo aquí escrito declara que Presupio cumpla ninguna norma legal o fiscal. Eso lo debe validar un profesional (apartado 11).

---

## 1. Resumen ejecutivo

**El software está listo para un entorno de preproducción. No está listo para aceptar clientes de pago.**

| Área | Estado |
|---|---|
| Código de la aplicación (API, worker, frontend) | Terminado. 233 pruebas de API, 77 de frontend y 18 E2E en verde, también en la CI |
| Infraestructura (alojamiento, dominio, base de datos, copias) | **No existe.** Hay instrucciones, plantillas y scripts probados en local |
| Email (Mailgun) | Integración terminada y probada contra simuladores locales. **Nunca probada con Mailgun real** |
| Pagos (Stripe) | Integración terminada y probada con un simulador local y la librería oficial. **Nunca probada contra Stripe**, ni en modo de prueba. **El código rechaza a propósito el modo real**: cobrar exige un cambio de código revisado (apartado 7.4.4) |
| Documentos legales | **Borradores** pendientes de revisión profesional. En producción la API no arranca sin las URLs de los documentos publicados |
| IVA | **Pendiente de decisión fiscal.** La interfaz muestra «pendiente de validación fiscal» |

**Bloqueos para aceptar clientes**, en este orden de dependencia:

1. revisión legal y publicación de los términos y la política de privacidad;
2. decisión fiscal sobre el IVA;
3. alojamiento, dominio y base de datos con copias;
4. Mailgun configurado y verificado con envíos reales a direcciones propias;
5. Stripe en modo de prueba verificado y, para cobrar, el cambio de código revisado para el modo real (o lanzar un piloto sin cobro, apartado 7.4.5);
6. las pruebas de aceptación del apartado 10.

---

## 2. Auditoría: el informe anterior frente al código actual

### 2.1 Comprobado y coincide

| Afirmación del informe | Cómo se ha comprobado en esta revisión | Resultado |
|---|---|---|
| Pruebas en verde | `npm run typecheck`, `npm run lint`, `vitest` (API y web), `npm audit` | 233/233, 77/77, lint sin errores, 0 vulnerabilidades |
| CI en verde con lint, cobertura y E2E | Ejecuciones 12 y 13 en GitHub Actions | Correctas |
| 10 migraciones aplicables sobre datos existentes | Archivos `0001`…`0010`; prueba de 0005→0010 con datos | Correcto |
| Variables de entorno documentadas | Comparación automática del esquema de `config.ts` con `.env.example` | Las 47 variables del esquema están documentadas, salvo `STRIPE_API_BASE`, que es solo para pruebas y está en `docs/facturacion.md` |
| El rol de la aplicación no puede saltarse el aislamiento | Consulta a `pg_roles` y a los privilegios en la base de pruebas | Sin superusuario, sin `BYPASSRLS` ni `CREATEROLE`. Sin `UPDATE`/`DELETE` en el historial, las suscripciones, los intentos, las huellas de prueba y los avisos. Sin acceso a `schema_migrations` |
| Funciones `SECURITY DEFINER` acotadas | Consulta a `pg_proc` | Las 18 tienen `search_path` fijo y ninguna es ejecutable por `PUBLIC` |
| Sin secretos en el repositorio | Búsqueda de patrones de claves en **todos** los archivos versionados | Solo valores ficticios de prueba (`…Ficticio…`, `…simulador…`) y marcadores de `.env.example`. `.env` está ignorado |
| Webhooks de Mailgun y Stripe firmados y sin repeticiones | Lectura de `webhooks/routes.ts`, `inbound/routes.ts` y `billing/routes.ts`, y sus pruebas | Correcto |
| Comandos de producción sin dependencias de desarrollo | Comprobado en la fase anterior en una copia limpia. En esta revisión se usó de nuevo `db:migrate:prod` | Correcto |
| Copias de seguridad | **Repetido en esta revisión con el esquema actual:** copia de una base de pruebas con datos, restauración en una base vacía y `db:migrate:prod` | Recuentos idénticos (8 empresas, 10 presupuestos, 9 intentos, 16 huellas, 10 migraciones), RLS activo y las 18 funciones restauradas |
| `docs/legal/` con 19 puntos de revisión | Recuento | Correcto. Además hay 44 marcadores `[PENDIENTE: …]` en los cinco borradores |

### 2.2 Problemas encontrados en esta revisión

| # | Problema | Demostración | Corrección |
|---|---|---|---|
| 1 | **nginx rechazaba el correo entrante con adjuntos.** Su límite por defecto es 1 MB. Mailgun reenvía el mensaje completo y la API admite 10 MB, así que una respuesta del cliente con un adjunto de más de 1 MB no se detectaba. | nginx 1.24 real con la configuración generada: `POST` de 2 MB a `/api/v1/webhooks/inbound/mailgun` → **413** | `location /api/v1/webhooks/inbound/` con `client_max_body_size 11m` en `server/hosting-config.mjs` (regenerado `ops/nginx/presupio-web.conf`). Comprobado: 2 MB y 9 MB → 200; el resto de la API sigue en 1 MB (`login` con 2 MB → 413). Prueba de sincronización ampliada. |
| 2 | La restauración indicaba `npm run db:migrate`, que en producción no funciona (necesita dependencias de desarrollo) | Lectura de `ops/restore.sh` y `docs/operacion.md` | Ahora indican `npm run db:migrate:prod` |
| 3 | La alerta `deliveries_unknown_review` existía en el código pero no en la tabla de supervisión | `ops/routes.ts` frente a `docs/operacion.md` | Añadida |
| 4 | No se indicaba la **versión de la API** del webhook de Stripe. Con una versión anterior a la de la librería (`2026-09-30.endive`), los eventos de factura llegan sin `parent.subscription_details` y Presupio los ignora. | Lectura de `normalizeEvent` y de `node_modules/stripe` | Indicado en `docs/facturacion.md` y en el apartado 7.3 |
| 5 | El encargo pedía revisar `docs/architecture.md`, que no existe | — | El documento es `docs/arquitectura.md` (revisado) |

### 2.3 Riesgos residuales conocidos (no son fallos, pero hay que asumirlos)

- **Tablas sin RLS:** `users`, `sessions`, `user_tokens`, `webhook_events`, `job_runs` y `rate_limit_counters` no tienen `company_id`. No son datos de una empresa, pero un error de código podría leerlas sin el filtro de empresa. Los tokens y claves se guardan resumidos.
- **Correo entrante de más de 10 MB:** no se procesa (413 en la API). Esa respuesta habría que registrarla a mano.
- **Detección de respuestas:** solo funciona si cada empresa crea en su buzón una regla de reenvío. Si no, las respuestas se registran a mano. La interfaz lo indica.
- **Cobertura unitaria del frontend:** 27 %. Las pantallas se cubren sobre todo con las 18 E2E.
- **Quejas por spam:** solo se pueden simular con pruebas automatizadas; con Mailgun real no hay una forma fiable de provocarlas.
- **Listas de dominios** gratuitos y desechables (prueba gratuita): no son exhaustivas.

---

## 3. Funcionalidades críticas: qué está probado y qué necesita servicios reales

«Local» significa probado de forma automática en este repositorio: PostgreSQL real, API real y Chromium, con simuladores **locales** de Mailgun y Stripe.

| Funcionalidad | Probado localmente (evidencia) | Necesita servicio real para validarse |
|---|---|---|
| Registro e inicio de sesión | `auth.test.ts` (16): Argon2id, sesiones resumidas, bloqueo tras fallos, límite por IP, recuperación de contraseña. E2E de registro, cierre de sesión y recuperación. | Que lleguen de verdad los emails de verificación y recuperación (SMTP real) |
| Aislamiento entre empresas | `tenancy.test.ts` (11), incluido RLS directo en PostgreSQL. E2E de aislamiento, también en pagos. | — |
| Presupuestos | `quotes.test.ts` (17) y E2E | — |
| Automatizaciones de los días 3, 7 y 14 | `automation.test.ts` (30): programación 3/7/14, franjas, 48 h entre contactos, aprobación, concurrencia y reinicios. E2E con envío por el adaptador real contra el simulador. | Entrega real por Mailgun |
| Detección de respuestas | `inbound.test.ts` (9): firma, repeticiones, aislamiento, respuestas automáticas y rebotes. nginx con 2 y 9 MB. | Ruta de Mailgun real, MX del dominio de entrada y la regla de reenvío del cliente |
| Cancelación de seguimientos | `automation.test.ts`: respuesta, aceptación, rechazo, baja y desactivación. `quotes.test.ts`: exclusiones. | — |
| Rebotes, quejas y bajas | `automation.test.ts`: webhooks firmados de rebote permanente o temporal, queja y baja. E2E de la baja de un clic. | Webhooks reales de Mailgun |
| Límites de los tres planes | `plans.test.ts` (33): 25, 65 y 300 intentos; 400 emails al día; qué cuenta; concurrencia; la base de datos lo impide. | — |
| Prueba gratuita y avisos | `limits-trials.test.ts` (15): una por persona o dominio, avisos a 3 y 1 día, zona horaria. E2E de fin de la prueba y solo lectura. | Entrega real de los avisos (SMTP) |
| Eliminación de datos | `privacy.test.ts` (4): anonimizar y eliminar, permisos, exportación sin datos personales | Validación legal de lo que se conserva |
| Suscripciones, cambios y cancelaciones | `billing.test.ts` (23) y `stripe-gateway.test.ts` (6). E2E `billing.spec.ts` (3) con la librería oficial contra el simulador. | **Stripe en modo de prueba** (nunca ejecutado) y, para cobrar, el cambio a modo real |
| Caída de PostgreSQL | `resilience.test.ts` (8) con un proxy TCP; el proceso real del worker sobrevive | Comportamiento del proveedor gestionado (conmutación por error) |
| Cabeceras de seguridad | Servidor incluido, nginx real y Chromium (la CSP bloquea scripts en línea) | Comprobación en el dominio real |

---

## 4. Estado por categorías

### 4.1 Terminado y verificado (en este repositorio)

- Multiempresa con RLS y roles: propietario, administrador, comercial, solo lectura.
- Presupuestos, contactos, seguimientos, exclusiones, historial, métricas y exportación.
- Motor de seguimiento:
  - programación, aprobación, franjas y reintentos;
  - semántica «como mucho una vez», con estado `unknown` y revisión manual;
  - intentos facturables idempotentes.
- Límites de planes (Starter, Pro y Business), límites diarios, solo lectura y conservación de 90 días con avisos.
- Prueba gratuita protegida contra abusos y avisos de fin de prueba.
- Supresión de datos: anonimizar un contacto y eliminar un presupuesto.
- Límites de peticiones compartidos en PostgreSQL.
- Resiliencia ante caídas de PostgreSQL.
- Servidor web de producción, cabeceras de seguridad y configuración de nginx (comprobada con nginx 1.24).
- Comandos de producción compilados; copia y restauración probadas con el esquema actual.
- CI: tipos, lint, compilación, pruebas con umbrales de cobertura y E2E.

### 4.2 Terminado, pero necesita validación con servicios reales

| Elemento | Qué falta |
|---|---|
| Envío por Mailgun (API HTTP, región UE) | Dominio verificado y envíos reales a direcciones propias |
| Webhooks de Mailgun (entrega, rebote, queja, baja) | Configurarlos y ver eventos reales llegar firmados |
| Correo entrante (detección de respuestas) | Formato real de `forward()`, MX y regla de reenvío de un buzón |
| Reconciliación por Events API de Mailgun | Consulta real |
| SMTP transaccional (verificación, recuperación, invitaciones, avisos) | Credenciales SMTP reales y recepción en Gmail y Outlook |
| Stripe (Checkout, portal, webhooks, cambios de plan, cobros fallidos) | Cuenta en **modo de prueba** y los pasos del apartado 7.3 |
| Cabeceras de seguridad | Comprobación en el dominio real |
| Copias automáticas y PITR | Depende del proveedor de PostgreSQL |

### 4.3 Pendiente

| Pendiente | Tipo | Bloquea el lanzamiento |
|---|---|---|
| Revisión y publicación de términos y privacidad; encargo de tratamiento; aviso legal; cookies | Legal | **Sí** (la API no arranca en producción sin las URLs) |
| Precios con o sin IVA, intracomunitarios, Canarias, Ceuta y Melilla, facturación | Fiscal | **Sí, para cobrar** |
| Base jurídica de los emails de seguimiento y reparto de responsabilidades | Legal | **Sí** |
| Días de gracia ante un cobro fallido (hoy 7) y prueba gratuita durante el pago | Comercial | Recomendable antes de cobrar |
| Activar Stripe en modo real: cambio de código revisado (apartado 7.4.4) | Técnico y comercial | **Sí, para cobrar** |
| Alojamiento, dominio, PostgreSQL gestionado, copias externas | Infraestructura | **Sí** |
| Monitor externo, alertas y retención de registros | Operación | **Sí** |
| Guardar la versión aceptada de los términos (hoy solo la fecha) | Técnico, si lo pide la revisión legal | Según la revisión |
| `index__1_.html` en la raíz del repositorio (página de MotorWorld) | Decisión del propietario | No (no forma parte de Presupio) |

---

## 5. Servicios necesarios y coste estimado

> **Todas las cifras son estimaciones no verificadas, en orden de magnitud, sin IVA.** No se han consultado precios actuales desde este entorno. Compruébalas en la web de cada proveedor antes de decidir.

| Servicio | Para qué | Requisitos técnicos | Coste mensual estimado |
|---|---|---|---|
| Servidor o plataforma para API, worker y frontend (UE) | API (Node 22), proceso de envío y nginx o servidor estático | Node 22, 1–2 vCPU, 2 GB de RAM; dos procesos persistentes; HTTPS | 5–30 € (VPS) / 15–50 € (PaaS) |
| PostgreSQL gestionado (UE) | Datos | **PostgreSQL 15 o superior** (probado con 16); permite crear roles sin `BYPASSRLS`; copias diarias y **PITR ≥ 7 días** | 15–60 € |
| Mailgun (región UE) | Emails automáticos, webhooks y correo entrante (y, si se quiere, el SMTP transaccional) | Dominio verificado; plan con webhooks y rutas de recepción | 0–35 € según volumen (`docs/automatizacion.md` ya advierte que las fuentes no coinciden) |
| SMTP transaccional | Verificación, recuperación, invitaciones y avisos | Puede ser el SMTP de Mailgun u otro proveedor | 0 € si va incluido en Mailgun |
| Stripe | Cobros y suscripciones | Cuenta en la UE; Billing y Checkout | Sin cuota fija; comisiones por cobro, aproximadamente 1,5 % + 0,25 € por tarjeta del EEE más alrededor del 0,7 % de Billing. **No verificado** |
| Dominio | `app.`, `envios.` y `respuestas.` | Gestión de DNS (TXT, MX, CNAME) | 1–2 € (10–20 € al año) |
| Certificados HTTPS | TLS | Let's Encrypt o los del alojamiento | 0 € |
| Almacenamiento de copias externas (UE, cifrado) | Copias lógicas semanales fuera del proveedor | Compatible con S3 o similar | < 5 € |
| Monitor externo | Disponibilidad y `/ops/status` | Comprobación HTTP con cabecera `Authorization` | 0–20 € |
| Registros (logs) | Errores y auditoría operativa | Recibir JSON por salida estándar; retención de unos 30 días | 0–20 € |
| Asesoría legal y fiscal | Revisión de textos, IVA y protección de datos | — | Honorarios puntuales: **pedir presupuesto** |

**Total técnico orientativo:** unos **40–200 € al mes** antes de las comisiones de Stripe y de la asesoría. Es una estimación no verificada.

---

## 6. Orden exacto de configuración

Cada paso depende de los anteriores. **Primero un entorno de preproducción (staging) completo**; producción se monta igual después.

1. **Decisiones previas:** proveedor de alojamiento y de PostgreSQL (UE); dominio; si el lanzamiento será un piloto sin cobro o con pagos (apartado 7.4.5).
2. **Revisión legal y fiscal en marcha** (es lo que más tarda): enviar `docs/legal/` y el apartado 11.
3. **Dominio y DNS base** (7.1): subdominios `app.`, `envios.`, `respuestas.` y `staging.`.
4. **PostgreSQL gestionado** (7.5.1): base, roles propietario y aplicación, copias y PITR.
5. **Servidor:** Node 22, nginx y usuario de sistema (7.5.2).
6. **HTTPS** (7.2).
7. **Secretos** en el gestor del alojamiento o en `/etc/presupio/*.env` con permisos 600 (apartado 8).
8. **Primer despliegue** (apartado 9) con `PAYMENTS_ENABLED=false`, `FOLLOWUP_EMAIL_PROVIDER=disabled` y `MAIL_TRANSPORT=disabled`. Comprobar `/health/ready`.
9. **Mailgun** (7.3): dominio de envío, DNS, webhooks y SMTP. Después `FOLLOWUP_EMAIL_PROVIDER=mailgun` y `MAIL_TRANSPORT=smtp`.
10. **Correo entrante** (7.3, «Correo entrante»): MX de `respuestas.`, ruta e `INBOUND_EMAIL_DOMAIN`.
11. **Stripe en modo de prueba** (7.4): producto, precios, clave restringida, portal y webhook. Después `PAYMENTS_ENABLED=true`.
12. **Monitorización y alertas** (7.7).
13. **Copia y simulacro de restauración** (7.6).
14. **Pruebas de aceptación** (apartado 10) en staging.
15. **Publicación de los textos legales revisados** y `LEGAL_TERMS_URL` / `LEGAL_PRIVACY_URL`.
16. **Producción:** repetir 3–13 con sus propias credenciales; pruebas de humo (10.3).
17. **Lista de autorización** (apartado 12) firmada → aceptar los primeros clientes.

---

## 7. Guías de configuración

Ejemplos con el dominio `tudominio.es`. Sustituye todos los valores entre `<…>`.

### 7.1 Dominio y DNS

**Subdominios recomendados:**

| Nombre | Uso |
|---|---|
| `app.tudominio.es` | Frontend y API (mismo origen: `/api/`) |
| `envios.tudominio.es` | Dominio de envío de Mailgun (no lo uses para correo personal) |
| `respuestas.tudominio.es` | Dominio de recepción de Mailgun (detección de respuestas) |
| `staging.tudominio.es` | Preproducción (con sus propios `envios-staging.`/`respuestas-staging.` si se prueba el correo allí) |

**Registros:**

| Registro | Tipo | Valor |
|---|---|---|
| `app` | A / AAAA (o CNAME si es PaaS) | IP del servidor o destino del alojamiento |
| `envios` (SPF) | TXT | `v=spf1 include:mailgun.org ~all`. **Usa exactamente el que muestre Mailgun.** |
| `<selector>._domainkey.envios` (DKIM) | TXT | Clave pública que genera Mailgun. Copia nombre y valor del panel. |
| `envios` | MX (prioridad 10) | Los servidores MX de Mailgun UE que indique el panel (habitualmente `mxa.eu.mailgun.org` y `mxb.eu.mailgun.org`) |
| `respuestas` | MX (prioridad 10) | Los mismos servidores MX de Mailgun UE |
| `_dmarc` (dominio principal) | TXT | Empieza con `v=DMARC1; p=none; rua=mailto:<buzón-de-informes>`. Tras 2–4 semanas de informes limpios, pasa a `p=quarantine`. |
| Seguimiento de clics de Mailgun (CNAME `email.envios`) | — | **No hace falta:** Presupio envía con `o:tracking=no` |

Los valores de Mailgun se verifican en su panel. Los indicados son los habituales, no comprobados desde este entorno.

### 7.2 HTTPS

1. Certificado para `app.tudominio.es`: Let's Encrypt con `certbot --nginx`, o el del alojamiento. La renovación debe ser automática y comprobada (`certbot renew --dry-run`).
2. `ops/nginx/presupio-web.conf`: sustituye `server_name`, `ssl_certificate` y `ssl_certificate_key`, y `root`. **No edites las cabeceras a mano:** se generan con `node apps/web/server/hosting-config.mjs --nginx`.
3. Redirección de HTTP a HTTPS: ya está en la configuración (`return 301`).
4. **HSTS** (`max-age=31536000; includeSubDomains`) se envía desde el primer día. Antes, comprueba que HTTPS funciona en `app.` y en sus subdominios. **No añadas `preload`** sin una decisión expresa.
5. Comprobación: `curl -sI https://app.tudominio.es/` debe mostrar `content-security-policy`, `strict-transport-security`, `x-frame-options: DENY` y `referrer-policy: no-referrer`.

### 7.3 Mailgun

**Cuenta**

1. Crea la cuenta en la **región UE**. La API es `https://api.eu.mailgun.net`, valor por defecto de `MAILGUN_API_BASE`.
2. Firma el acuerdo de tratamiento de datos (DPA) de Mailgun: Mailgun es subencargado del tratamiento.

**Dominio de envío**

3. Añade `envios.tudominio.es`.
4. Crea los registros SPF, DKIM y MX de 7.1 y espera a que el panel los marque como verificados.
5. Desactiva el seguimiento de aperturas y clics (Presupio ya lo desactiva en cada envío).

**Claves**

6. `MAILGUN_API_KEY`: clave de API privada. Si el panel permite claves por dominio, que se limite a `envios.`. Es un **secreto**.
7. `MAILGUN_WEBHOOK_SIGNING_KEY`: *HTTP webhook signing key*. Es un **secreto** y es **obligatoria en producción** (la API no arranca sin ella).

**Webhooks (dominio `envios.`)**

8. URL: `https://app.tudominio.es/api/v1/webhooks/mailgun`, para los eventos **Delivered**, **Permanent failure**, **Temporary failure**, **Spam complaints** y **Unsubscribes**.
9. Comprobación:
   - el botón de prueba del panel enviará un evento sin envío asociado: la API responde `{"status":"ignored"}` o, si la firma no coincide, `401`;
   - un envío real debe pasar a «Entregado» en la ficha.

**Correo entrante (detección de respuestas, opcional)**

10. Añade `respuestas.tudominio.es` como dominio de recepción, con los MX de 7.1.
11. **Ruta** (*Receiving → Routes*):
    - expresión `match_recipient("respuestas\+.*@respuestas.tudominio.es")`;
    - acciones `forward("https://app.tudominio.es/api/v1/webhooks/inbound/mailgun")` y `stop()`.
12. Variable `INBOUND_EMAIL_DOMAIN=respuestas.tudominio.es`. Exige `FOLLOWUP_EMAIL_PROVIDER=mailgun` y `MAILGUN_WEBHOOK_SIGNING_KEY`.
13. Cada empresa ve su dirección `respuestas+<token>@…` en «Envío automático» y debe crear en su buzón una regla que reenvíe allí las respuestas de sus clientes.
14. Límite: mensajes de hasta 10 MB. nginx ya admite 11 MB en esa ruta (apartado 2.2, problema 1).

**Email transaccional (SMTP)**

15. Con el SMTP de Mailgun:
    - `MAIL_TRANSPORT=smtp`;
    - `SMTP_HOST` = el servidor SMTP de la región UE que indique el panel (habitualmente `smtp.eu.mailgun.org`);
    - `SMTP_PORT=587` (STARTTLS obligatorio);
    - `SMTP_USER` y `SMTP_PASSWORD` de unas credenciales SMTP del dominio;
    - `MAIL_FROM="Presupio <no-reply@envios.tudominio.es>"`.

**Variables del envío automático**

16. `FOLLOWUP_EMAIL_PROVIDER=mailgun`, `FOLLOWUP_FROM_EMAIL=seguimiento@envios.tudominio.es`, `MAILGUN_DOMAIN=envios.tudominio.es` y `PUBLIC_API_URL=https://app.tudominio.es`.

**Prueba controlada (solo a direcciones propias)**

17. Comprueba que el envío llega, pasa a «Entregado», la baja funciona en un clic desde Gmail y desde el enlace, y un rebote excluye la dirección (envía a un buzón inexistente de un dominio propio).

### 7.4 Stripe

> El código actual **solo funciona en modo de prueba**: rechaza claves `sk_live_`/`rk_live_`/`pk_live_` al arrancar e ignora eventos, suscripciones y precios en modo real. Esta guía configura el **modo de prueba**. El paso a modo real está en 7.4.4.

**7.4.1 Cuenta y catálogo (modo de prueba)**

1. Crea la cuenta de Stripe: datos de la empresa y cuenta bancaria; verificación de identidad cuando se vaya a cobrar.
2. Con **«Modo de prueba»** activado:
   - un producto «Presupio»;
   - **tres precios recurrentes mensuales en EUR: 27,99, 57,99 y 127,99**.

   Antes de mandar a nadie a pagar, Presupio comprueba importe, moneda, intervalo, que el precio esté activo y que sea de prueba. Si no coincide, no se inicia el pago.
3. **No actives Stripe Tax** hasta la decisión fiscal (apartado 11).
4. **Clave restringida** `rk_test_…`:
   - escritura en *Customers*, *Checkout Sessions*, *Subscriptions* y *Customer portal*;
   - lectura en *Prices*;
   - nada más.

**7.4.2 Portal de cliente**

5. Configúralo así:
   - permite actualizar el método de pago, ver facturas y cancelar **al final del periodo**;
   - **desactiva el cambio de plan en el portal** (Presupio lo gestiona con sus reglas);
   - opcional: `STRIPE_PORTAL_CONFIGURATION_ID=bpc_…`.

**7.4.3 Webhook**

6. Endpoint:
   - URL: `https://app.tudominio.es/api/v1/webhooks/stripe`;
   - **versión de la API: `2026-09-30.endive`** (la de la librería `stripe` 23.0.0).
7. Eventos (son exactamente los que procesa `HANDLED_EVENTS`; el resto se registra como ignorado):
   - `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`;
   - `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `customer.subscription.paused`, `customer.subscription.resumed`;
   - `invoice.paid`, `invoice.payment_failed`, `invoice.payment_action_required`.
8. Secreto `whsec_…` → `STRIPE_WEBHOOK_SECRET`.
9. Variables:
   - `PAYMENTS_ENABLED=true`;
   - `STRIPE_SECRET_KEY=rk_test_…`;
   - `STRIPE_PRICE_STARTER`, `STRIPE_PRICE_PRO` y `STRIPE_PRICE_BUSINESS` (los ids `price_…`);
   - `PRICES_TAX_DISPLAY=pending` hasta la decisión fiscal.
10. Pruebas (apartado 10.2):
    - tarjeta `4242 4242 4242 4242`;
    - cobro fallido con `4000 0000 0000 0341` y relojes de prueba (*test clocks*);
    - cambio de plan, cancelación y portal.

**7.4.4 Paso a modo real (no realizado; requiere cambio de código)**

Requisitos previos: revisión legal y fiscal cerrada, IVA decidido (y Stripe Tax o precios con IVA según esa decisión), y el apartado 10 superado en modo de prueba.

Cambio de código a revisar y probar en una rama propia. Son las salvaguardas actuales:

- `apps/api/src/config.ts`: `STRIPE_LIVE` y `STRIPE_TEST_SECRET` rechazan claves live;
- `apps/api/src/modules/billing/gateway.ts`: el constructor exige `sk_test_`/`rk_test_`;
- `apps/api/src/modules/billing/service.ts`:
  - `assertPriceMatchesCatalog` exige `!price.livemode`;
  - `processWebhookEvent` ignora los eventos y las suscripciones con `livemode`.

La propuesta es sustituirlas por una variable explícita (p. ej. `STRIPE_MODE=test|live`) que exija la coherencia entre clave, precios y eventos en ambos sentidos. Después:

- recrear en modo real el producto, los precios, la clave restringida, el portal y el webhook;
- hacer una compra real de importe mínimo con una tarjeta propia;
- reembolsarla.

**7.4.5 Alternativa: piloto sin cobro**

Con `PAYMENTS_ENABLED=false`, Presupio funciona con la prueba gratuita, y el personal autorizado asigna los planes:

```bash
npm run ops:prod -w @presupio/api -- plan --company <id> --plan pro --status active
```

Permite empezar con clientes piloto sin activar pagos. Requiere igualmente los textos legales publicados y la decisión comercial de no cobrar.

### 7.5 Alojamiento

**7.5.1 PostgreSQL (gestionado, UE, versión ≥ 15)**

Con el usuario administrador del proveedor, crea los roles y la base. Equivale a `scripts/db-bootstrap.ts`, que se niega a ejecutarse en producción:

```sql
CREATE ROLE presupio_owner WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS PASSWORD '<secreto-owner>';
CREATE ROLE presupio_app   WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS PASSWORD '<secreto-app>';
CREATE DATABASE presupio OWNER presupio_owner ENCODING 'UTF8' TEMPLATE template0;
REVOKE ALL ON DATABASE presupio FROM PUBLIC;
GRANT CONNECT, TEMPORARY ON DATABASE presupio TO presupio_app;
```

```sql
-- Conectado a la base presupio:
ALTER SCHEMA public OWNER TO presupio_owner;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
```

- Las migraciones conceden al rol `presupio_app` solo los permisos de datos. El migrador **se niega a continuar** si ese rol es superusuario o tiene `BYPASSRLS`.
- Activa las copias diarias y la **PITR ≥ 7 días**, y **TLS** en las conexiones (`?sslmode=require` o la opción que indique el proveedor).
- Si el proveedor no permite `ALTER SCHEMA public OWNER`, crea un esquema propio y pon `search_path` en las URL de conexión. Pruébalo primero en staging.

**7.5.2 Servidor (API, worker y frontend)**

- Usuario de sistema sin privilegios (`presupio`), Node 22 (`.nvmrc`) y nginx.
- La API escucha **solo en local**: `HOST=127.0.0.1`, `PORT=3000`. nginx es el único punto de entrada.
- **`TRUST_PROXY=loopback`** (nginx en la misma máquina; si el proxy está en otra, su IP o red, p. ej. `10.0.0.5`). **Imprescindible:** sin él, todos los clientes compartirían la IP de nginx en los límites por IP (por ejemplo, 10 altas por hora en total). **No uses un número de saltos** (`1`): Fastify 5.12 lo ignora y la API se niega a arrancar con él. Nunca uses `true` si la API es accesible sin pasar por nginx: aceptaría IPs falsas en `X-Forwarded-For`.
- Frontend: nginx sirve `apps/web/dist` con `ops/nginx/presupio-web.conf`. Alternativa sin nginx para los estáticos: `npm run start:web`, que es `server/serve.mjs` con las mismas cabeceras; en ese caso `TRUST_PROXY` debe incluir también la IP de ese servidor.
- Plantillas de servicio (systemd). Son plantillas: ajusta rutas y pruébalas en staging.

```ini
# /etc/systemd/system/presupio-api.service
[Unit]
Description=Presupio API
After=network-online.target
Wants=network-online.target

[Service]
User=presupio
WorkingDirectory=/srv/presupio/current/presupio
EnvironmentFile=/etc/presupio/runtime.env
ExecStart=/usr/bin/node apps/api/dist/src/server.js
Restart=always
RestartSec=5
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
PrivateTmp=true

[Install]
WantedBy=multi-user.target
```

```ini
# /etc/systemd/system/presupio-worker.service: igual que el anterior, cambiando:
Description=Presupio worker (envío automático, recuperación, retención)
ExecStart=/usr/bin/node apps/api/dist/src/worker.js
```

- El worker puede tener varias instancias: los trabajos exclusivos usan bloqueos consultivos de PostgreSQL. Con una basta.
- Alternativa al worker persistente: `node apps/api/dist/src/worker.js --once` desde un cron cada minuto.

### 7.6 Copias de seguridad y recuperación

| Capa | Qué | Frecuencia | Retención |
|---|---|---|---|
| Proveedor | Copias automáticas y PITR | Continua o diaria | ≥ 7 días (PITR), 30 días (diarias) |
| Copia lógica externa | `ops/backup.sh` (pg_dump `custom` + SHA-256 + comprobación) | Semanal y **antes de cada migración** | Según la revisión legal (las copias contienen datos personales) |

**Hacer una copia:**

```bash
BACKUP_DATABASE_URL="<url-del-rol-owner>" ops/backup.sh /ruta/segura
```

Guárdala **cifrada y fuera** del servidor de la base de datos.

**Restaurar** (siempre en una base **nueva y vacía**):

```bash
RESTORE_DATABASE_URL="<url-owner-de-la-base-nueva>" ops/restore.sh presupio-AAAAmmdd-HHMMSS.dump
```

```bash
MIGRATION_DATABASE_URL="<url-owner-de-la-base-nueva>" DATABASE_URL="<url-app-de-la-base-nueva>" npm run db:migrate:prod
```

Después: `GET /api/v1/health/ready`, revisar una empresa de prueba y cambiar `DATABASE_URL` de la API y del worker.

**Prueba realizada en esta revisión (local):** copia de una base con datos y 10 migraciones → restauración → `db:migrate:prod`. Los recuentos coinciden, RLS está activo y las funciones restauradas. **Hay que repetirla en staging con el proveedor real y luego cada trimestre.**

**Objetivos orientativos:** pérdida máxima de 5 minutos con PITR (24 h solo con copias diarias) y restauración en menos de 2 horas.

### 7.7 Monitorización, registros y alertas

| Comprobación | Cómo | Frecuencia | Alerta si |
|---|---|---|---|
| Disponibilidad | `GET https://app.tudominio.es/api/v1/health/ready` | 1 min | 2 fallos seguidos |
| Proceso vivo (sin base de datos) | `GET …/api/v1/health` | 1 min | Fallo |
| Estado operativo | `GET …/api/v1/ops/status` con `Authorization: Bearer <OPS_STATUS_TOKEN>` | 5 min | `status ≠ ok`. Alertas posibles: `worker_not_running`, `deliveries_stuck_sending`, `deliveries_unknown_review`, `approved_emails_delayed`, `job_errors_last_24h`, `attempts_reserved_stuck`, `billing_events_failed`, `billing_duplicate_subscription` |
| Certificado | Caducidad TLS | Diaria | Menos de 14 días |
| Copias | Que exista la copia del día en el proveedor | Diaria | Falta |
| Stripe | Panel de webhooks: entregas fallidas | Diaria | Más de 0 |
| Mailgun | Panel: rebotes y quejas del dominio | Semanal | Quejas > 0,1 % |

- `OPS_STATUS_TOKEN`: al menos 32 caracteres (`openssl rand -hex 32`). Sin él, `/ops/status` responde 404.
- **Registros:** la API y el worker escriben JSON en la salida estándar (pino). Envíalos a un servicio de logs con retención de unos 30 días.
  - Ya se redactan cookies, cabeceras de autorización, tokens de URL y el `detail` de PostgreSQL, y se enmascaran emails en los errores.
  - Configura alertas por `level ≥ 50` (error) repetidos.
- **Procedimientos ante cada alerta:** `docs/operacion.md`, apartado 8.

---

## 8. Variables de entorno

**Dónde va cada una:**

- **Runtime:** fichero o gestor de secretos que comparten la API y el worker (`/etc/presupio/runtime.env`).
- **Despliegue:** solo para migrar (`/etc/presupio/deploy.env`). **La API no debe tener `MIGRATION_DATABASE_URL`**: así un fallo de la aplicación no puede usar el rol propietario.

Valores de ejemplo, **nunca reales**. Secreto = sí: va al gestor de secretos, nunca al repositorio.

| Variable | Dónde | Producción | Ejemplo o valor recomendado | Secreto |
|---|---|---|---|---|
| `NODE_ENV` | Runtime y despliegue | Obligatoria | `production` | No |
| `HOST` / `PORT` | Runtime | Recomendada | `127.0.0.1` / `3000` | No |
| `LOG_LEVEL` | Runtime | Opcional | `info` | No |
| `DATABASE_URL` | Runtime y despliegue | **Obligatoria** | `postgres://presupio_app:<…>@<host>:5432/presupio?sslmode=require` | **Sí** |
| `DB_POOL_MAX` | Runtime | Opcional | `10` | No |
| `MIGRATION_DATABASE_URL` | **Solo despliegue** | Para migrar | `postgres://presupio_owner:<…>@<host>:5432/presupio?sslmode=require` | **Sí** |
| `APP_WEB_URL` | Runtime | **Obligatoria (https)** | `https://app.tudominio.es` | No |
| `CORS_ORIGINS` | Runtime | Solo si la API va en otro dominio | — | No |
| `TRUST_PROXY` | Runtime | **Obligatoria tras nginx** | `loopback` (o la IP/red del proxy) | No |
| `COOKIE_SECURE` | Runtime | `true` por defecto en producción (no se admite `false`) | — | No |
| `SESSION_TTL_HOURS` / `SESSION_IDLE_TIMEOUT_HOURS` | Runtime | Opcional | `720` / `168` | No |
| `TRIAL_DAYS` | Runtime | Opcional | `14` | No |
| `TRIAL_DOMAIN_RULE_DAYS` | Runtime | Opcional | `365` | No |
| `TRIAL_REMINDER_DAYS` | Runtime | Opcional | `3,1` | No |
| `RATE_LIMIT_PER_MINUTE` | Runtime | Opcional | `600` | No |
| `RATE_LIMIT_REGISTER_PER_HOUR` | Runtime | Opcional | `10` | No |
| `LEGAL_TERMS_URL` / `LEGAL_PRIVACY_URL` | Runtime | **Obligatorias (https)** | `https://tudominio.es/terminos` / `…/privacidad` (versiones **revisadas**) | No |
| `MAIL_TRANSPORT` | Runtime | Necesaria para enviar (`log` prohibido) | `smtp` | No |
| `MAIL_FROM` | Runtime | Con SMTP | `Presupio <no-reply@envios.tudominio.es>` | No |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_SECURE` | Runtime | Con SMTP | `smtp.eu.mailgun.org` (verificar) / `587` / `false` | No |
| `SMTP_USER` / `SMTP_PASSWORD` | Runtime | Con SMTP | — | **Sí** (la contraseña) |
| `FOLLOWUP_EMAIL_PROVIDER` | Runtime | Para el envío automático | `mailgun` | No |
| `FOLLOWUP_FROM_EMAIL` | Runtime | Con proveedor | `seguimiento@envios.tudominio.es` | No |
| `MAILGUN_API_KEY` | Runtime | Con Mailgun | — | **Sí** |
| `MAILGUN_DOMAIN` | Runtime | Con Mailgun | `envios.tudominio.es` | No |
| `MAILGUN_API_BASE` | Runtime | Opcional (https en producción) | `https://api.eu.mailgun.net` | No |
| `MAILGUN_WEBHOOK_SIGNING_KEY` | Runtime | **Obligatoria con Mailgun en producción** | — | **Sí** |
| `INBOUND_EMAIL_DOMAIN` | Runtime | Opcional (detección de respuestas) | `respuestas.tudominio.es` | No |
| `PUBLIC_API_URL` | Runtime | Recomendada | `https://app.tudominio.es` | No |
| `WORKER_INTERVAL_SECONDS` | Runtime | Opcional | `60` | No |
| `FOLLOWUP_MAX_ATTEMPTS` | Runtime | Opcional | `3` | No |
| `MESSAGE_CONTENT_RETENTION_DAYS` | Runtime | Opcional (revisión legal) | `90` | No |
| `OPS_STATUS_TOKEN` | Runtime | **Recomendada** (supervisión) | ≥ 32 caracteres aleatorios | **Sí** |
| `PAYMENTS_ENABLED` | Runtime | Opcional | `false` (piloto) o `true` | No |
| `STRIPE_SECRET_KEY` | Runtime | Con pagos | `rk_test_…` (live: ver 7.4.4) | **Sí** |
| `STRIPE_WEBHOOK_SECRET` | Runtime | Con pagos | `whsec_…` | **Sí** |
| `STRIPE_PRICE_STARTER` / `_PRO` / `_BUSINESS` | Runtime | Con pagos | `price_…` | No |
| `STRIPE_PORTAL_CONFIGURATION_ID` | Runtime | Opcional | `bpc_…` | No |
| `PRICES_TAX_DISPLAY` | Runtime | Opcional | `pending` hasta la decisión fiscal | No |
| `STRIPE_API_BASE` | — | **Prohibida en producción** (solo pruebas) | — | — |
| `BACKUP_DATABASE_URL` / `RESTORE_DATABASE_URL` | Solo al ejecutar las copias | — | URL del rol propietario | **Sí** |
| `API_URL` / `PORT` / `HOST` / `WEB_ROOT` | Solo si se usa `server/serve.mjs` | — | `http://127.0.0.1:3000` | No |
| `VITE_API_BASE_URL` | Compilación del frontend | Solo si la API va en otro dominio | — | No |

---

## 9. Procedimiento de despliegue

### 9.1 Compilación (en la CI o en una máquina de compilación, nunca con secretos de producción)

1. CI en verde en el commit que se va a desplegar.
2. Compilar:

   ```bash
   cd presupio && npm ci && npm run build
   ```

   `npm run build` falla si el frontend no es la compilación de producción (`check-build.mjs`) y genera `apps/web/dist/_headers`.
3. Empaquetar en un archivo versionado con el commit:
   - `presupio/package*.json`;
   - `apps/*/package.json`;
   - `apps/api/dist`, `apps/api/migrations`;
   - `apps/web/dist`, `apps/web/server`;
   - `ops/`.

### 9.2 Primer despliegue

1. Copiar el paquete a `/srv/presupio/releases/<commit>`, enlazar `/srv/presupio/current` y ejecutar `npm ci --omit=dev` dentro.
2. Migrar con el fichero de despliegue:

   ```bash
   set -a; . /etc/presupio/deploy.env; set +a; npm run db:migrate:prod
   ```
3. Arrancar `presupio-api` y `presupio-worker`; recargar nginx (`nginx -t && systemctl reload nginx`).
4. Comprobar:
   - `GET /api/v1/health/ready` → 200;
   - `GET /api/v1/ops/status` → `ok`;
   - `curl -sI https://app.tudominio.es/` con las cabeceras de 7.2.

### 9.3 Actualizaciones

1. Copia lógica (`ops/backup.sh`) y comprobación de que la PITR está activa.
2. Nuevo release en un directorio nuevo y `npm ci --omit=dev`.
3. `npm run db:migrate:prod`. Las migraciones son **aditivas**: la versión anterior sigue funcionando con el esquema nuevo.
4. Cambiar el enlace `current` y reiniciar la API y el worker **juntos**.
5. Comprobaciones de 9.2.4 y revisión de los registros durante 15 minutos.

### 9.4 Vuelta atrás

- **Fallo de código:** volver a enlazar el release anterior y reiniciar. No hace falta tocar la base de datos.
- **Migración o datos dañados:** restaurar (7.6) en una base nueva y apuntar la aplicación a ella. **Nunca se edita una migración aplicada.**

---

## 10. Pruebas antes de aceptar clientes

### 10.1 Automáticas (en cada versión)

- CI en verde: tipos, lint, compilación, pruebas con cobertura y E2E.
- Para cambios sensibles, además, en local:
  - `npm run test -w @presupio/api` 10 veces seguidas en paralelo;
  - `npm audit`.

### 10.2 Aceptación en staging con servicios reales (Mailgun real, Stripe en modo de prueba)

Solo con **direcciones y empresas de prueba propias**. Marca cada punto con la fecha y quién lo comprobó.

| # | Prueba | Cómo | Resultado esperado |
|---|---|---|---|
| 1 | Registro y verificación | Alta con un email propio | Llega el email de verificación; el enlace confirma |
| 2 | Recuperación de contraseña | «He olvidado mi contraseña» | Llega el email; el enlace caduca tras usarlo |
| 3 | Aislamiento | Dos empresas; intentar abrir una URL de la otra | 404; no se ve nada ajeno |
| 4 | Presupuestos | Crear, editar, archivar, estados | Correcto, con historial |
| 5 | Seguimiento del día 3 | Presupuesto con fecha de envío de hace 3 días y 1 hora (para que el paso ya esté vencido), contacto propio y aprobación activada → aprobar | Llega el email; pasa a «Entregado» (webhook); cuenta 1 intento |
| 6 | Días 7 y 14 | Igual, con envíos de hace 7 y 14 días | Llega el paso correspondiente; no se envían de golpe los pasos pasados |
| 7 | Detección de respuestas | Responder desde el buzón propio y reenviar a `respuestas+<token>@…`, también con un adjunto de más de 1 MB | Presupuesto «respondido», seguimientos cancelados |
| 8 | Respuesta automática | Respuesta de «fuera de la oficina» | No cuenta como respuesta |
| 9 | Cancelación | Registrar respuesta a mano o rechazar | Se cancelan los pasos pendientes |
| 10 | Rebote | Envío a un buzón inexistente de un dominio propio | Intento fallido; contacto excluido |
| 11 | Baja | Enlace del email y botón de baja de Gmail | Contacto excluido; no se envía más |
| 12 | Límites | `npm run ops:prod -w @presupio/api -- set-limit --company <id> --attempts 1 --reason "prueba"` y dos envíos | El segundo no sale; aviso de límite |
| 13 | Prueba gratuita | Segunda alta con la misma bandeja (`+etiqueta`) | Sin prueba; cuenta en solo lectura con aviso |
| 14 | Aviso de fin de prueba | `ops:prod plan --company <id> --plan starter --status trialing --trial-days 2` y esperar al trabajo horario | Llega un aviso, una sola vez |
| 15 | Supresión | Anonimizar un contacto y eliminar un presupuesto | Desaparecen de la interfaz y de la exportación |
| 16 | Contratar | Plan Pro con la tarjeta `4242…` | Activo tras el webhook; límite de 65 |
| 17 | Cambio de plan | Pro → Business, y Business → Starter | La subida se aplica al confirmarse; la bajada, en la renovación |
| 18 | Cobro fallido | Tarjeta `4000 0000 0000 0341` y reloj de prueba | Aviso durante la gracia; solo lectura al agotarla |
| 19 | Cancelación de la suscripción | «Cancelar suscripción» y avanzar el reloj | Acceso hasta el fin del periodo; después, solo lectura y exportación |
| 20 | Portal | «Método de pago y facturas» | Abre `billing.stripe.com` |
| 21 | Alertas | Parar el worker 10 minutos | Llega `worker_not_running` |
| 22 | Restauración | 7.6 en una base nueva del proveedor | Recuentos correctos; la API arranca contra ella |
| 23 | Cabeceras | `curl -sI` y un analizador de cabeceras | Las de 7.2 |

### 10.3 Pruebas de humo en producción (tras cada despliegue)

`/health/ready`, `/ops/status`, inicio de sesión con la cuenta interna, apertura de un presupuesto de prueba y cabeceras. **No se envían emails a clientes reales para probar.**

---

## 11. Seguridad y privacidad

### 11.1 Revisión técnica (resultado)

| Aspecto | Estado |
|---|---|
| Secretos en el repositorio | Ninguno (búsqueda en todos los archivos versionados) |
| Rutas privadas sin autorización | `protection.test.ts` recorre todas las rutas registradas: solo las públicas conocidas responden sin sesión (registro, login, recuperación, invitaciones, baja, webhooks firmados, salud, documentos legales y `/ops/status` con token) |
| CSRF / CORS | Las escrituras con una cabecera `Origin` ajena se rechazan (403); solo JSON; cookie `SameSite=Lax`; CORS limitado a `APP_WEB_URL` |
| Sesiones | Cookie `__Host-`, `HttpOnly`, `Secure`, `SameSite=Lax`; resumidas en la base; caducidad absoluta y por inactividad |
| Permisos en la base de datos | Ver 2.1. Tablas sin RLS: ver 2.3 |
| Límites | Globales por IP y por email en login y recuperación; compartidos entre instancias. **Requiere `TRUST_PROXY=loopback`** (o la IP del proxy) |
| Webhooks | Firmados (Mailgun HMAC, Stripe con el cuerpo original y 5 minutos de tolerancia); antirrepetición; 404 si no están configurados |
| Pagos | Solo redirige a `checkout.stripe.com` y `billing.stripe.com`; el navegador nunca elige el precio; el modo real está bloqueado |
| Dependencias | `npm audit`: 0 vulnerabilidades |
| Registros | Sin cookies, tokens ni datos de PostgreSQL con emails |
| Cabeceras | CSP estricta, HSTS, `X-Frame-Options`, COOP/CORP y `Referrer-Policy: no-referrer` |

### 11.2 Puntos que necesitan revisión profesional

La lista completa (19 puntos) está en `docs/legal/README.md`. Resumen:

**Jurídica**

1. Identidad del titular (aviso legal, términos y privacidad).
2. Si el servicio es solo para empresas y profesionales, o también para consumidores.
3. Condiciones de contratación: renovación, cambios de plan, cancelación y días de gracia.
4. Responsabilidad, disponibilidad, ley aplicable y jurisdicción.
5. Texto de uso razonable de Business y regla de una prueba gratuita.

**Protección de datos**

6. Roles: responsable de los datos de las cuentas; encargado de los datos de los clientes de cada empresa.
7. **Base jurídica de los emails de seguimiento** (incluido si son comunicaciones comerciales según la LSSI-CE) y qué garantiza cada parte.
8. Subencargados (alojamiento, Mailgun y Stripe), sus contratos y las transferencias internacionales.
9. Plazos de conservación: cuenta (90 días tras el acceso), contenido de los emails (90 días), huellas de prueba (24 meses), copias de seguridad y obligaciones legales.
10. Supresión: qué se conserva (fila anonimizada para lo facturado y exclusión activa).
11. Metadatos de las respuestas recibidas (sin contenido).
12. Registro de actividades, evaluación de impacto y delegado de protección de datos.
13. Notificación de brechas: procedimiento y plazos.
14. Cookie de sesión (técnica): texto informativo.
15. Versión aceptada de los términos (hoy solo se guarda la fecha).

**Fiscal**

16. Precios con o sin IVA y en qué casos; intracomunitarios; Canarias, Ceuta y Melilla.
17. Facturación (Stripe emite las facturas) y conservación de la documentación contable.
18. Si se usa Stripe Tax.

> Presupio **no declara** cumplir el RGPD, la LOPDGDD, la LSSI-CE ni la normativa fiscal. Los textos de `docs/legal/` son borradores y no deben publicarse sin esta revisión.

---

## 12. Lista de comprobación para autorizar el lanzamiento

Cada punto con responsable, fecha y evidencia. **El lanzamiento solo se autoriza con todos los puntos obligatorios marcados.**

**Legal y fiscal (obligatorio)**

- [ ] Términos y política de privacidad revisados por un profesional y publicados. URLs en `LEGAL_TERMS_URL` / `LEGAL_PRIVACY_URL`.
- [ ] Encargo de tratamiento revisado y disponible para las empresas cliente.
- [ ] Aviso legal y política de cookies publicados.
- [ ] Base jurídica de los emails de seguimiento validada; texto de la confirmación al activar el envío revisado.
- [ ] Decisión de IVA tomada y `PRICES_TAX_DISPLAY` configurado (o piloto sin cobro).
- [ ] Contratos (DPA) con el alojamiento, Mailgun y Stripe firmados.

**Infraestructura (obligatorio)**

- [ ] Dominio, DNS y HTTPS con renovación automática comprobada.
- [ ] PostgreSQL gestionado en la UE, roles según 7.5.1, TLS, copias diarias y PITR ≥ 7 días.
- [ ] Copia externa cifrada y **simulacro de restauración** superado en el proveedor real.
- [ ] `TRUST_PROXY=loopback` (o la IP del proxy); la API solo escucha en `127.0.0.1`; nginx con la configuración generada.
- [ ] Secretos solo en el gestor o en ficheros con permisos 600; `MIGRATION_DATABASE_URL` fuera del entorno de la API.

**Servicios (obligatorio)**

- [ ] Mailgun: dominio verificado (SPF, DKIM, MX), DMARC publicado y webhooks con firma comprobados con eventos reales.
- [ ] SMTP transaccional: verificación y recuperación recibidas en Gmail y Outlook.
- [ ] Stripe en modo de prueba: pruebas 16–20 del apartado 10.2 superadas.
- [ ] **Para cobrar:** cambio a modo real (7.4.4) revisado, probado en staging y con una compra real mínima reembolsada. Si no, `PAYMENTS_ENABLED=false` y piloto documentado.

**Operación (obligatorio)**

- [ ] Monitor de `/health/ready` y `/ops/status` con alertas a una persona de guardia.
- [ ] Registros centralizados con retención definida.
- [ ] Pruebas de aceptación 1–23 (10.2) superadas y documentadas.
- [ ] CI en verde en el commit que se despliega.
- [ ] Persona responsable de soporte y de incidentes, y buzón de contacto publicado.

**Recomendado**

- [ ] Detección de respuestas (correo entrante) probada con al menos un buzón real.
- [ ] Decisión sobre `index__1_.html` en la raíz del repositorio.
- [ ] DMARC en `quarantine` tras 2–4 semanas de informes limpios.
- [ ] Revisión trimestral de copias y permisos programada.

---

## 13. Anexo: comprobaciones ejecutadas en esta revisión

| Comprobación | Resultado |
|---|---|
| `npm run typecheck` | Correcto |
| `npm run lint` | Sin errores (tras corregir una expresión regular de la prueba nueva) |
| Pruebas de la API | 233/233 |
| Pruebas web | 77/77 (incluida la nueva comprobación de nginx) |
| `npm audit` | 0 vulnerabilidades |
| CI (GitHub Actions, ejecución 13, `db6c7be`) | Correcta |
| nginx 1.24 real: 2 MB al correo entrante | 413 antes de la corrección; 200 después (también con 9 MB); `login` con 2 MB sigue en 413 |
| Copia, restauración y `db:migrate:prod` con el esquema actual | Recuentos idénticos, RLS activo, 18 funciones `SECURITY DEFINER` restauradas |
| Permisos del rol de aplicación | Sin superusuario ni `BYPASSRLS`; restricciones por tabla correctas |
| Variables de entorno: esquema frente a `.env.example` | Coinciden (salvo `STRIPE_API_BASE`, solo para pruebas) |
| Secretos en archivos versionados | Ninguno real |

No se ha desplegado nada, no se ha contratado ni conectado ningún servicio, no se ha enviado ningún email real, no se ha activado ningún pago y no se han tocado datos de producción.

# RevisaYa — Seguridad y protección de datos

> Estado: implementado de forma transversal desde la Fase 1 y **auditado en la Fase 11** (§9).
> Aviso: este diseño busca facilitar el cumplimiento del RGPD, la LOPDGDD y la LSSI, pero **no constituye ni sustituye una revisión jurídica**. No se afirmará cumplimiento legal certificado sin esa revisión.

## 1. Modelo de amenazas (resumen)

| Amenaza | Control principal |
|---|---|
| Un taller accede a datos de otro (IDOR, manipulación de `organization_id`) | RLS en todas las tablas + FK compuestas + organización activa resuelta en servidor contra membresías + `organization_id` inmutable. |
| Un operario ejecuta acciones de administrador | `requireRole`/`requirePermission` en cada Server Action/Route Handler + RLS por permiso. La UI oculta botones, pero nunca es el control. |
| Sobrepasar límites del plan (incluida concurrencia) | Triggers con bloqueo por organización + reserva atómica de correos. |
| Robo de sesión / CSRF | Cookies httpOnly, `Secure`, `SameSite=Lax`; Server Actions con comprobación de `Origin` incorporada; Route Handlers mutantes exigen `Origin` válido o firma (webhooks). |
| XSS (plantillas de correo, notas, nombres) | React escapa por defecto; prohibido `dangerouslySetInnerHTML` salvo HTML generado por nosotros; variables de plantilla escapadas antes de insertar; CSP estricta con nonces. |
| SQL injection | Consultas parametrizadas (Kysely / supabase-js); sin SQL dinámico concatenado; funciones `plpgsql` con `format('%I', …)` si fuera necesario. |
| Webhooks falsificados o repetidos | Verificación de firma (Stripe `constructEvent`, Svix para Resend) sobre el cuerpo en bruto + tabla de eventos procesados. |
| Abuso de formularios públicos (cita, contacto, registro) | Turnstile + rate limiting por IP/organización/email + honeypot + límites de solicitudes pendientes. **Página de citas (Fase 7)**: 5/h por IP y 60/h por taller, campo trampa, Turnstile si está configurado, una solicitud abierta por aviso; enlaces del aviso firmados (HMAC) que no sirven para otro taller. |
| Archivos subidos por el taller (logo) | Solo PNG/JPEG/WebP ≤ 1 MB **comprobados por su firma** (nunca SVG); bucket privado; la ruta pública solo sirve el logo ACTUAL de una organización activa, con `nosniff` y CSP `sandbox`. La clave de Storage (`SUPABASE_SECRET_KEY`) solo existe en el servidor. |
| Escrituras con la conexión del sistema (alta de dominio, logo, correo de prueba) | Se comprueba en la base de datos que el usuario es administrador de ese taller (`assertOrgAdmin`), sin fiarse del contexto (ADR-047). |
| Enumeración de matrículas/clientes en la página pública | La página genérica nunca confirma si una matrícula existe; los enlaces de los correos usan token aleatorio de 256 bits (se guarda solo su hash) con caducidad. |
| Archivos maliciosos (importación, logos) | Validación de extensión + *magic bytes* + tamaño; .xlsx con límite de descompresión (zip bomb) y de filas; logos PNG/JPEG/WebP ≤ 1 MB, **sin SVG**; buckets privados con URLs firmadas de corta duración. |
| Inyección de fórmulas en CSV exportados | Prefijar con `'` las celdas que empiezan por `= + - @ \t \r`. |
| Fuga de secretos | Variables de entorno de servidor, nunca `NEXT_PUBLIC_*` salvo URL y clave pública de Supabase; módulos con `import 'server-only'`; validación del entorno al arrancar; escaneo de secretos (gitleaks) en CI. |
| Fuga de datos en logs | Logger con redacción (`password`, `token`, `authorization`, `cookie`, `email`, `phone`, `*_secret`); errores de proveedores saneados antes de guardarse en BD. |
| Tokens de Google robados de la BD | Cifrado AES-256-GCM en aplicación con clave fuera de la BD, versionada y rotable; tabla sin acceso para `authenticated`. |
| Fuerza bruta en login | Rate limiting de Supabase Auth + rate limiting propio en las rutas de auth; captcha tras varios intentos. |
| API keys filtradas | Solo se muestra la clave una vez; se guarda HMAC-SHA-256; prefijo identificable para escáneres; scopes, caducidad y revocación; rate limiting por clave. |

## 2. Autenticación (implementada en la Fase 2)

- **Supabase Auth** con email y contraseña. Política: ≥ 10 caracteres con minúsculas, mayúsculas y números (configurada en Auth y validada también con zod). La contraseña nunca se devuelve al formulario ni se registra.
- **Verificación de email obligatoria** antes de poder entrar (`enable_confirmations`); crear un taller o aceptar una invitación exige además el email confirmado (comprobado en SQL).
- **Enlaces de correo** (verificación y recuperación) con `token_hash` de un solo uso hacia `/auth/confirm`; un enlace inventado, caducado o reutilizado se rechaza con un mensaje único (no se revela cuál de los tres es).
- **Sesión** en cookies httpOnly gestionadas por `@supabase/ssr`; el proxy la refresca en cada petición. En servidor se usa siempre `getClaims()` (JWT verificado), nunca la cookie sin verificar.
- **Sin enumeración de cuentas**: registro, recuperación y reenvío de verificación responden igual exista o no la cuenta; el login da un mensaje genérico.
- **Cambio de contraseña** con la contraseña actual (reautenticación); "cerrar sesión en todos los dispositivos" revoca todas las sesiones.
- **Redirecciones** tras login/registro solo a rutas internas (`safeNextPath`): sin redirecciones abiertas (probado en unit y E2E).
- **Invitaciones**: token de 256 bits (solo se guarda su SHA-256), caducidad de 7 días, un solo uso, ligado al email invitado; la página pública muestra el email enmascarado.
- **Rate limiting** propio (ADR-027) además del de Supabase Auth.
- **Auditoría**: inicio y cierre de sesión, cambios de contraseña, alta de taller, invitaciones y cambios de miembros.
- **Verificación en dos pasos (TOTP)** para todos los usuarios, muy recomendada para los administradores (aviso en Configuración). Se implementó en la Fase 11 (ADR-075):
  - se activa en *Mi cuenta* con una app de autenticación (QR o clave) y un primer código;
  - para desactivarla hace falta un código actual;
  - con ella activada, una sesión que solo tiene la contraseña (`aal1`) **no cuenta como sesión** en ninguna parte (páginas, acciones, rutas internas): el acceso pide el código;
  - 10 intentos cada 15 minutos por usuario;
  - quedan auditados la activación, la desactivación, los códigos correctos y los fallidos;
  - el cambio de contraseña comprueba la actual con un cliente aparte, para no rebajar la sesión.

## 3. Autorización en tres capas

1. **Servicio** (`src/server/auth`): `requireMember`, `requireRole('admin')`, `requirePermission('vehicles.write')`, `requireBranchAccess(branchId)`, `entitlements.assertFeature('google_calendar')`.
2. **RLS** en PostgreSQL (matriz en BASE-DE-DATOS §5), activa también en las consultas del servidor gracias al contexto por transacción.
3. **Restricciones e triggers**: FK compuestas, límites del plan, inmutabilidad de tenencia, estados válidos.

El rol de sistema (jobs, webhooks) evita RLS; por eso su código vive aislado en `src/server/jobs` y `src/server/webhooks`, filtra siempre por `organization_id` y se revisa en cada auditoría.

## 4. Cabeceras y transporte

- HTTPS obligatorio (HSTS en producción).
- `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy` restrictiva y `Cross-Origin-Opener-Policy`; sin `X-Powered-By`.
- **Content-Security-Policy** (`next.config.ts`, ADR-074):
  - `default-src 'self'`, `object-src 'none'`, `base-uri 'self'`, `frame-ancestors 'none'`;
  - `form-action` limitado a la app, Stripe Checkout/portal y Google OAuth;
  - scripts solo propios y de Cloudflare Turnstile.
- **Sin nonces**: el prerenderizado parcial de Next 16 es incompatible con ellos, así que `script-src` necesita `'unsafe-inline'` para las scripts de carga de Next.
  - La defensa contra XSS es que React escapa siempre;
  - no se usa `dangerouslySetInnerHTML` (comprobado);
  - la vista previa de los correos va en un `iframe` con `sandbox` vacío;
  - el logo se sirve con `nosniff` y `sandbox`.

## 5. Gestión de secretos y entornos

- Tres entornos separados: **local** (Supabase CLI en Docker), **staging** y **producción**, cada uno con su propio proyecto de Supabase, claves de Stripe TEST y proveedor de correo con dominio de pruebas.
- Secretos solo en el gestor del hosting; `.env.example` documenta las variables sin valores.
- Guardas de pago: el arranque falla si `STRIPE_SECRET_KEY` empieza por `sk_live_` y `PAYMENTS_LIVE_ENABLED` no es `true`. Ese flag solo lo activará el responsable adulto del proyecto tras la revisión fiscal y legal.
- Rotación documentada de: clave de cifrado de integraciones, *pepper* de API keys, secreto de cron, secretos de webhooks.

## 6. Protección de datos (RGPD / LOPDGDD)

- **Roles**: el taller es **responsable** de los datos de sus clientes; RevisaYa es **encargado del tratamiento** (art. 28 RGPD) mediante un acuerdo de tratamiento (DPA) que se acepta al contratar y queda registrado en `legal_acceptances`. RevisaYa es responsable de los datos de sus propios usuarios (los talleres).
- **Residencia**: proyecto de Supabase en región UE; funciones del hosting en región UE; proveedor de correo con región UE si está disponible. Los proveedores con sede en EE. UU. (Stripe, Google, Vercel, Sentry) se cubren con sus DPA y cláusulas contractuales tipo / Marco de Privacidad de Datos; queda documentado en la lista de subencargados.
- **Minimización**: solo los campos del producto; las notas internas avisan de no guardar datos de categorías especiales.
- **Derechos de los interesados** (implementado; solo administradores):
  - **acceso y portabilidad**: «Descargar sus datos (JSON)» en la ficha del cliente;
  - rectificación: editando la ficha;
  - **supresión inmediata**: «Borrar definitivamente ahora» (`app.erase_customer`). Borra ficha, vehículos, historial, citas, avisos y presupuestos (con sus PDF) y anonimiza los registros de correo. Se conserva la dirección en la lista de bajas para no volver a escribirle;
  - limitación y oposición: «sin avisos» y la baja de los avisos.
- Todo queda registrado en `data_subject_requests` (visible en *Configuración → Datos y privacidad*) y en la auditoría, sin datos personales.
- **Exportación de todo el taller** (implementado): un Excel con clientes, vehículos, historial, citas y presupuestos, también en solo lectura (durante los 60 días tras cancelar). Se descarga en el momento: para el tamaño de los planes no hace falta un proceso en segundo plano.
- **Retención** (propuesta, pendiente de aprobación, P9):
  - Cuenta cancelada: datos conservados **60 días** (reactivación y exportación) → purga definitiva y aviso previo por email a los 7 días del borrado.
  - Borrado lógico de clientes y vehículos: restaurables desde la papelera 30 días; después purga definitiva diaria (`private.purge_expired_data`, pg_cron). **Implementado.**
  - Staging de importaciones: 7 días (incluido en la purga diaria). Los archivos subidos no se guardan: solo las filas en staging.
  - `email_logs`, `audit_logs` y `stripe_events`: 24 meses (`private.purge_old_logs`, a diario); `api_request_logs`: 30 días (`private.purge_api_data`). **Implementado.**
- **Comunicaciones**: los recordatorios de un servicio ya contratado se tratan como avisos de servicio (según el PDF, normalmente sin consentimiento específico, **pendiente de revisión jurídica**). Aun así, cada correo incluye enlace de baja y cabecera `List-Unsubscribe` + `List-Unsubscribe-Post` (también exigidas por Gmail/Yahoo a remitentes masivos). Si el taller quisiera enviar promociones, eso sería otra funcionalidad con consentimiento explícito: queda fuera del alcance actual.
- **Seguimiento de aperturas**: el píxel de apertura puede requerir consentimiento (art. 22.2 LSSI / criterio de la AEPD). Propuesta: **desactivado por defecto**, activable solo tras la revisión jurídica (P8).
- **Brechas**: procedimiento de notificación (72 h a la AEPD por parte del responsable; RevisaYa avisa al taller sin dilación indebida) documentado en DESPLIEGUE.

## 7. Copias de seguridad y recuperación

- Supabase Pro: backups diarios gestionados (retención según plan). PITR como mejora cuando haya clientes de pago (coste adicional, ver costes).
- Copia lógica semanal adicional (`pg_dump` cifrado) a un almacenamiento externo en la UE.
- Prueba de restauración trimestral documentada. Objetivos iniciales: RPO ≤ 24 h (≤ 5 min con PITR), RTO ≤ 4 h.
- Las migraciones nunca son destructivas sin autorización explícita; cambios de columna en dos pasos (expandir → migrar → contraer).

## 8. Registro de acciones críticas (`audit_logs`)

Se registran: inicio/cierre de sesión y fallos repetidos, invitaciones y cambios de rol, cambios de plan y cancelaciones, borrado de clientes/vehículos/historial, importaciones confirmadas, cambios de plantilla y dominio, conexión/desconexión de integraciones, creación/revocación de API keys, exportaciones y solicitudes RGPD. Nunca se guardan contraseñas, tokens ni contenido de los correos.

## 9. Auditoría de seguridad (Fase 11, 2026-11-08)

Revisión del código y pruebas automáticas. **No sustituye a una prueba de intrusión externa**: se recomienda una antes de tener muchos clientes de pago.

| Área | Qué se ha comprobado | Resultado |
|---|---|---|
| Aislamiento entre talleres (IDOR) | RLS en todas las tablas (pgTAP `010`–`030`, 310 pruebas). Cada uso de la conexión del sistema (`withSystem`) se revisó a mano: o va detrás de un servicio con RLS que ya ha validado el recurso (correos de citas y presupuestos, invitaciones), o comprueba el administrador en la BD (`assertOrgAdmin`), o es un proceso del sistema sin datos del usuario. Informes y API: funciones o comprobaciones propias, con pruebas que cambian el id del taller o de la sucursal. | OK |
| `organization_id` manipulado | El taller activo sale de las membresías verificadas (cookie comprobada contra la BD); la API lo saca de la clave; las funciones SQL comprueban `member_orgs()` y `admin_orgs()`. | OK (probado) |
| Permisos de operario | Guardas en cada acción y página + RLS por permiso + `reports.read` en SQL. | OK (probado) |
| Autenticación | Verificación de email, sin enumeración de cuentas, límites de intentos, redirecciones internas, 2FA con enforcement en el servidor y el cambio de contraseña sin rebajar la sesión. | OK (E2E `auth`, `security`) |
| CSRF | Server Actions (comprobación de `Origin` de Next); rutas que escriben: webhooks firmados, procesos con Bearer, API con Bearer sin cookies, OAuth con `state` firmado más cookie. | OK |
| Límites de peticiones | Registro, acceso, recuperación, reenvío, cambio de contraseña, códigos 2FA, invitaciones, importaciones, correos de prueba, dominios, página de citas (IP y taller) y API (clave y taller). | OK |
| Cabeceras | CSP y cabeceras de §4 en páginas y API (E2E `security`, prueba unitaria de la CSP). | OK |
| Secretos | Ninguno en el repositorio (búsqueda de patrones de claves de Stripe, Resend, AWS, Google y JWT); `.env.local` ignorado; validación del entorno al arrancar; claves live de Stripe bloqueadas. | OK |
| Registros | Redacción de claves sensibles y de correos en el logger; la API no guarda cuerpos; los proveedores, sin direcciones. | OK |
| Dependencias | `pnpm audit`: 0 vulnerabilidades conocidas. | OK |
| Reputación del correo | Rebotes > 4 % o quejas > 0,1 % (7 días, mínimo 50 envíos): aviso a los administradores y alerta en el registro (`email_reputation_alert`). Crítico con ≥ 8 % o ≥ 0,3 % (límite de Gmail). Panel en *Configuración → Correo*. | Implementado |

**Riesgos que quedan (documentados)**
- `'unsafe-inline'` en `script-src` (ADR-074).
- La pausa automática de los envíos de un taller con reputación crítica **no** se hace sola: hoy se avisa al taller y a la plataforma. Decidirlo es cosa del responsable, porque afecta al servicio contratado.
- Recuperar el acceso de alguien que pierde el móvil con 2FA: por ahora, manual (soporte de Supabase o un administrador de la plataforma). No hay códigos de recuperación propios.
- El límite de peticiones está en PostgreSQL; con mucho tráfico conviene pasarlo a Redis (Upstash).

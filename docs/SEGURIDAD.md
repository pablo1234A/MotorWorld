# RevisaYa — Seguridad y protección de datos

> Estado: **diseño (Fase 0)**. Se implementa de forma transversal desde la Fase 1 y se audita en la Fase 11.
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
| Abuso de formularios públicos (cita, contacto, registro) | Turnstile + rate limiting por IP/organización/email + honeypot + límites de solicitudes pendientes. |
| Enumeración de matrículas/clientes en la página pública | La página genérica nunca confirma si una matrícula existe; los enlaces de los correos usan token aleatorio de 256 bits (se guarda solo su hash) con caducidad. |
| Archivos maliciosos (importación, logos) | Validación de extensión + *magic bytes* + tamaño; .xlsx con límite de descompresión (zip bomb) y de filas; logos PNG/JPEG/WebP ≤ 1 MB, **sin SVG**; buckets privados con URLs firmadas de corta duración. |
| Inyección de fórmulas en CSV exportados | Prefijar con `'` las celdas que empiezan por `= + - @ \t \r`. |
| Fuga de secretos | Variables de entorno de servidor, nunca `NEXT_PUBLIC_*` salvo URL y clave pública de Supabase; módulos con `import 'server-only'`; validación del entorno al arrancar; escaneo de secretos (gitleaks) en CI. |
| Fuga de datos en logs | Logger con redacción (`password`, `token`, `authorization`, `cookie`, `email`, `phone`, `*_secret`); errores de proveedores saneados antes de guardarse en BD. |
| Tokens de Google robados de la BD | Cifrado AES-256-GCM en aplicación con clave fuera de la BD, versionada y rotable; tabla sin acceso para `authenticated`. |
| Fuerza bruta en login | Rate limiting de Supabase Auth + rate limiting propio en las rutas de auth; captcha tras varios intentos. |
| API keys filtradas | Solo se muestra la clave una vez; se guarda HMAC-SHA-256; prefijo identificable para escáneres; scopes, caducidad y revocación; rate limiting por clave. |

## 2. Autenticación

- Supabase Auth con email + contraseña (mínimo 10 caracteres y comprobación contra contraseñas filtradas si el plan de Supabase lo permite), verificación obligatoria de email, recuperación por enlace de un solo uso.
- Sesión validada en servidor con `supabase.auth.getClaims()`/`getUser()` (verificación de la firma del JWT), **nunca** con `getSession()` sin verificar.
- Cambio de contraseña exige reautenticación reciente. Cerrar sesión en todos los dispositivos disponible.
- Invitaciones: token de un solo uso (hash en BD), caducidad de 7 días, vinculado al email invitado.
- 2FA (TOTP de Supabase) recomendado para administradores; se ofrecerá como opción en la Fase 11.

## 3. Autorización en tres capas

1. **Servicio** (`src/server/auth`): `requireMember`, `requireRole('admin')`, `requirePermission('vehicles.write')`, `requireBranchAccess(branchId)`, `entitlements.assertFeature('google_calendar')`.
2. **RLS** en PostgreSQL (matriz en BASE-DE-DATOS §5), activa también en las consultas del servidor gracias al contexto por transacción.
3. **Restricciones e triggers**: FK compuestas, límites del plan, inmutabilidad de tenencia, estados válidos.

El rol de sistema (jobs, webhooks) evita RLS; por eso su código vive aislado en `src/server/jobs` y `src/server/webhooks`, filtra siempre por `organization_id` y se revisa en cada auditoría.

## 4. Cabeceras y transporte

HTTPS obligatorio (HSTS), `Content-Security-Policy` con nonce, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy` restrictiva, `frame-ancestors 'none'`.

## 5. Gestión de secretos y entornos

- Tres entornos separados: **local** (Supabase CLI en Docker), **staging** y **producción**, cada uno con su propio proyecto de Supabase, claves de Stripe TEST y proveedor de correo con dominio de pruebas.
- Secretos solo en el gestor del hosting; `.env.example` documenta las variables sin valores.
- Guardas de pago: el arranque falla si `STRIPE_SECRET_KEY` empieza por `sk_live_` y `PAYMENTS_LIVE_ENABLED` no es `true`. Ese flag solo lo activará el responsable adulto del proyecto tras la revisión fiscal y legal.
- Rotación documentada de: clave de cifrado de integraciones, *pepper* de API keys, secreto de cron, secretos de webhooks.

## 6. Protección de datos (RGPD / LOPDGDD)

- **Roles**: el taller es **responsable** de los datos de sus clientes; RevisaYa es **encargado del tratamiento** (art. 28 RGPD) mediante un acuerdo de tratamiento (DPA) que se acepta al contratar y queda registrado en `legal_acceptances`. RevisaYa es responsable de los datos de sus propios usuarios (los talleres).
- **Residencia**: proyecto de Supabase en región UE; funciones del hosting en región UE; proveedor de correo con región UE si está disponible. Los proveedores con sede en EE. UU. (Stripe, Google, Vercel, Sentry) se cubren con sus DPA y cláusulas contractuales tipo / Marco de Privacidad de Datos; queda documentado en la lista de subencargados.
- **Minimización**: solo los campos del producto; las notas internas avisan de no guardar datos de categorías especiales.
- **Derechos de los interesados**: exportación por cliente (JSON/CSV), rectificación (edición), supresión (anonimización/borrado inmediato), limitación (marcar y excluir de avisos), oposición (baja de avisos). Registro en `data_subject_requests` con plazo de un mes.
- **Exportación de toda la organización**: job asíncrono que genera un ZIP en Storage con URL firmada de 24 h.
- **Retención** (propuesta, pendiente de aprobación, P9):
  - Cuenta cancelada: datos conservados **60 días** (reactivación y exportación) → purga definitiva y aviso previo por email a los 7 días del borrado.
  - Borrado lógico de registros: purga a los 30 días.
  - Staging de importaciones: 7 días. Archivos subidos: 7 días.
  - `email_logs`: 24 meses; `audit_logs`: 24 meses; `api_request_logs`: 30 días.
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

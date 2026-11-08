# RevisaYa — Despliegue y entornos

> Estado: **completo (Fase 12)**. La guía paso a paso para publicar está en §6; la lista de lanzamiento, en [LANZAMIENTO.md](LANZAMIENTO.md).

## 1. Entornos

| Entorno | Web | Base de datos | Pagos | Correo |
|---|---|---|---|---|
| Local | `next dev` | Supabase CLI (Docker) | Stripe TEST + Stripe CLI | SMTP hacia Mailpit (Docker) |
| Staging | Vercel Preview (rama `main`) | Proyecto Supabase *staging* (UE) | Stripe TEST | Resend + subdominio de pruebas |
| Producción | Vercel Production | Proyecto Supabase *prod* (UE) | Stripe **TEST** hasta autorización | Resend + dominio verificado |

Región de funciones: UE (Frankfurt o París) junto a la región de Supabase, para que la latencia sea baja y los datos se queden en la UE.

## 2. Entorno local (desde la Fase 1)

Requisitos: Node ≥ 22, pnpm 10, Docker.

```bash
pnpm install
cp .env.example .env.local      # rellenar con los valores que muestra el paso siguiente
pnpm db:start                   # levanta PostgreSQL, Auth, Storage y Mailpit en Docker
pnpm db:reset                   # aplica las migraciones
pnpm check                      # verifica que todo está en verde
pnpm dev
```

`pnpm db:start` usa por defecto imágenes de Docker Hub (`SUPABASE_INTERNAL_IMAGE_REGISTRY=docker.io`); en otros entornos se puede cambiar a `public.ecr.aws`. Studio, Realtime, PostgREST y otros servicios que el proyecto no usa no se levantan.

### Configuración de Supabase Auth en staging/producción

`supabase/config.toml` solo aplica en local. En cada proyecto remoto hay que configurar en el panel de Supabase:

- **Site URL** = `APP_URL` del entorno, y **Redirect URLs** = `https://<dominio>/**`.
- **Email confirmations** activadas; **Secure password change** activado; longitud mínima 10 y requisitos "minúsculas, mayúsculas y números"; **Leaked password protection** activada (si el plan lo incluye).
- **Plantillas** "Confirm signup" y "Reset password": copiar `supabase/templates/confirmation.html` y `recovery.html` con sus asuntos.
- **SMTP propio** (Resend u otro, dominio de RevisaYa verificado): el SMTP por defecto de Supabase no es apto para producción por sus límites de envío.

### Correo y procesos programados en local (Fase 5)

Mailpit recibe todo el correo local (interfaz en http://127.0.0.1:54324). Su puerto SMTP no se publica en el host con esta versión de la CLI, así que se usa la IP del contenedor:

```bash
pnpm -s mailpit:smtp-url        # → smtp://172.18.0.x:1025
```

En `.env.local`: `EMAIL_PROVIDER=smtp`, `SMTP_URL=<la URL anterior>`, `EMAIL_SHARED_DOMAIN=avisos.revisaya.test`, `EMAIL_LINK_SECRET` y `CRON_SECRET` (cada uno ≥ 32 caracteres, `openssl rand -base64 48`). El planificador y la recuperación ya corren con `pg_cron` dentro de la base de datos local; el dispatcher se lanza a mano:

```bash
curl -X POST -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/internal/jobs/plan-reminders
curl -X POST -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/internal/jobs/dispatch-reminders
```

## 3. Procesos programados en staging/producción

| Proceso | Quién lo lanza | Frecuencia |
|---|---|---|
| Planificador de avisos | `pg_cron` (migración `20261106000100`) | cada hora, minuto 5 |
| Recuperación de leases | `pg_cron` | cada 5 min |
| Purga por retención | `pg_cron` | diario 03:17 |
| Caducidad de presupuestos | `pg_cron` (`private.expire_quotes`) | diario 03:37 |
| Reconciliación de suscripciones con Stripe | Vercel Cron → `/api/internal/jobs/billing-reconcile` | diario 04:41 |
| Dispatcher de avisos | Vercel Cron → `/api/internal/jobs/dispatch-reminders` (`vercel.json`) | cada minuto |
| Mantenimiento del correo (dominios, avisos de consumo, resúmenes) | Vercel Cron → `/api/internal/jobs/email-maintenance` | cada 30 min |
| Estado (dead-man switch) | Vercel Cron → `/api/internal/jobs/status`; un monitor externo debe alertar si responde 503 | cada hora |
| Google Calendar: reintentos y citas pendientes | Vercel Cron → `/api/internal/jobs/calendar-sync` | cada 15 min |
| Conservación tras la baja: aviso 7 días antes y borrado a los 60 días (P9) | Vercel Cron → `/api/internal/jobs/retention` | diario 03:53 |
| Purga de registros de correo, auditoría y eventos de Stripe (24 meses) | `pg_cron` (`private.purge_old_logs`) | diario 03:47 |
| Purga de registros de la API (30 días) e idempotencia (24 h) | `pg_cron` (`private.purge_api_data`) | diario 03:27 |

- Vercel Cron envía `Authorization: Bearer $CRON_SECRET` si la variable `CRON_SECRET` está definida en el proyecto. Sin ella los endpoints responden 401.
- La frecuencia de un minuto requiere un plan de Vercel que la permita; si no, el dispatcher puede lanzarse desde `pg_cron` + `pg_net` con el mismo secreto, o con menos frecuencia (los avisos se envían igualmente, algo más tarde).
- Variables de correo: `EMAIL_PROVIDER` (`resend` o `smtp`), `RESEND_API_KEY` o `SMTP_URL`, `EMAIL_SHARED_DOMAIN` (subdominio de RevisaYa con SPF/DKIM/DMARC), `EMAIL_LINK_SECRET` y `RESEND_WEBHOOK_SECRET` (webhook de entregas, ver INTEGRACIONES §2.6). **Sin `EMAIL_PROVIDER` no se envía ningún aviso**: quedan programados. Los dominios propios de los talleres requieren `EMAIL_PROVIDER=resend`.
- Almacenamiento (logos y PDF de presupuestos): `SUPABASE_SECRET_KEY` (solo servidor). En local se obtiene con `supabase status` (`SECRET_KEY`); el CI lo genera igual.
- Pagos (**solo TEST**): `STRIPE_SECRET_KEY=sk_test_…`, `STRIPE_WEBHOOK_SECRET`, opcional `STRIPE_AUTOMATIC_TAX`. Puesta en marcha del catálogo, el webhook y el portal en [FACTURACION §4](FACTURACION.md). `PAYMENTS_LIVE_ENABLED` se queda en `false` hasta la autorización expresa del responsable adulto.
- Página pública de citas: `NEXT_PUBLIC_TURNSTILE_SITE_KEY` y `TURNSTILE_SECRET_KEY` (Cloudflare Turnstile). Recomendado en producción.
- Antes de enviar a clientes reales: dominio de envío verificado y calentado, pruebas en Gmail y Outlook (checklist §5). No se activan envíos comerciales masivos sin autorización.

## 4. Procedimiento de despliegue

1. PR → CI verde (TESTING §4) → revisión.
2. Merge a `main` → `supabase db push` a staging → despliegue de Vercel en staging → comprobaciones rápidas (§6.7).
3. Paso a producción (manual):
   - copia de seguridad (§7);
   - `supabase db push` contra producción;
   - despliegue;
   - comprobaciones rápidas;
   - vigilar 30 minutos los registros de Vercel y `/api/health`.
4. Las migraciones van siempre hacia delante y son compatibles con la versión anterior del código (expandir → migrar → contraer). Ninguna es destructiva sin autorización.

## 5. Monitorización

| Qué | Cómo |
|---|---|
| ¿La web y la BD responden? | `GET /api/health` → 200 `{"status":"ok"}` o 503. Configura un monitor externo (UptimeRobot, Better Stack…) cada 5 min. |
| ¿Funcionan los procesos programados? | `GET /api/internal/jobs/status` con `Authorization: Bearer $CRON_SECRET` → 503 si el planificador lleva más de 26 h sin ejecutarse correctamente. Vercel Cron lo llama cada hora; conviene también un monitor externo con el Bearer. |
| Errores | Registros JSON en la salida estándar (Vercel → Logs), con datos personales redactados. Eventos a vigilar: `job_failed`, `api_request_failed`, `email_reputation_alert`, `organization_purge_failed`, `stripe_livemode_blocked`, `health_db_failed`. Para alertas, un *log drain* de Vercel (Better Stack, Axiom, Datadog). **Sentry no está integrado** (se puede añadir; hoy no hay SDK ni DSN). |
| Correo | *Configuración → Correo* de cada taller y el evento `email_reputation_alert` (rebotes > 4 %, quejas > 0,1 %). Panel de Resend. |
| Pagos | Panel de Stripe (modo TEST) → Webhooks: entregas fallidas. Reconciliación diaria `billing-reconcile`. |

## 6. Publicar RevisaYa paso a paso (Supabase en la nube + Vercel)

> Lo que sigue lo hace el responsable con sus cuentas. Nada de esto se ha podido hacer desde aquí: no hay credenciales de esos servicios en este entorno.

### 6.1 Supabase (base de datos, acceso y archivos)
1. Crea un proyecto en https://supabase.com en una **región de la UE** (Frankfurt o París). Apunta la contraseña de la base de datos.
2. Desde el repositorio:
   ```bash
   pnpm dlx supabase@3.0.0 login
   pnpm dlx supabase@3.0.0 link --project-ref <ref-del-proyecto>
   pnpm dlx supabase@3.0.0 db push          # aplica TODAS las migraciones (esquema, RLS, planes, pg_cron)
   ```
   Las migraciones crean también los buckets privados de Storage y los procesos de `pg_cron`: planificador de avisos, purgas y caducidad de presupuestos.
3. *Authentication → URL Configuration*: **Site URL** = `https://<tu-dominio>`; **Redirect URLs** = `https://<tu-dominio>/**`.
4. *Authentication → Providers → Email*:
   - confirmación de email activada;
   - *Secure password change* activado;
   - contraseña de 10 caracteres como mínimo, con minúsculas, mayúsculas y números;
   - *Leaked password protection* activada (si el plan lo incluye).
5. *Authentication → Multi-Factor*: **TOTP activado** (verificación en dos pasos, gratis en todos los planes).
6. *Authentication → Email Templates*: copia `supabase/templates/confirmation.html` («Confirma tu correo en RevisaYa») y `recovery.html` («Restablece tu contraseña de RevisaYa»).
7. *Authentication → SMTP Settings*: SMTP propio. Con Resend: host `smtp.resend.com`, puerto 465, usuario `resend`, contraseña = la API key, remitente `no_reply@<dominio de envío>`. El SMTP por defecto de Supabase no sirve para producción.
8. *Project Settings → API*:
   - `NEXT_PUBLIC_SUPABASE_URL` (Project URL);
   - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (publishable);
   - `SUPABASE_SECRET_KEY` (secret, **solo en el servidor**).
9. *Project Settings → Database → Connection string → Transaction pooler* (puerto 6543): `DATABASE_URL`, con `DATABASE_POOL_MAX=5`.

### 6.2 Correo (Resend)
1. Cuenta en https://resend.com, **región UE**. Añade el dominio de envío compartido (p. ej. `avisos.<tu-dominio>`) y crea en tu DNS los registros SPF, DKIM y MX que te indique. Añade también DMARC: `_dmarc.avisos` TXT `v=DMARC1; p=none; rua=mailto:<tu-correo>`.
2. API key con permiso de envío y de dominios → `RESEND_API_KEY`. `EMAIL_PROVIDER=resend`, `EMAIL_SHARED_DOMAIN=avisos.<tu-dominio>`.
3. *Webhooks* → `https://<tu-dominio>/api/webhooks/email/resend` con `email.delivered`, `email.delivery_delayed`, `email.bounced` y `email.complained` → secreto en `RESEND_WEBHOOK_SECRET`.
4. Calienta el dominio y prueba en Gmail y en Outlook antes de enviar a clientes reales (riesgo nº 1 del PDF).

### 6.3 Stripe (SIEMPRE en modo TEST hasta la autorización del responsable)
- Sigue [FACTURACION §4](FACTURACION.md):
  - claves `sk_test_…`;
  - `stripe-sync-catalog` para crear los productos y los precios del PDF;
  - webhook hacia `/api/webhooks/stripe` con los eventos de §3;
  - portal de cliente.
- `PAYMENTS_LIVE_ENABLED=false`. Con una clave `sk_live_` la aplicación **no arranca**.

### 6.4 Google Calendar (opcional, plan Max)
Sigue [INTEGRACIONES §4](INTEGRACIONES.md). Hasta que Google verifique la app, solo funciona con los usuarios de prueba que añadas.

### 6.5 Vercel
1. Importa el repositorio en https://vercel.com (framework: Next.js; comandos por defecto; Node 22).
2. *Settings → Functions*: región `fra1`, que ya fija `vercel.json`.
3. *Settings → Environment Variables* (Production):

| Variable | Valor |
|---|---|
| `APP_ENV` | `production` |
| `APP_URL` | `https://<tu-dominio>` |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`, `DATABASE_URL`, `DATABASE_POOL_MAX` | §6.1 |
| `CRON_SECRET`, `EMAIL_LINK_SECRET`, `API_KEY_PEPPER` | `openssl rand -base64 48`, uno distinto para cada una |
| `INTEGRATIONS_ENCRYPTION_KEY` | `openssl rand -base64 32` (**no se puede cambiar** sin volver a conectar las agendas) |
| `EMAIL_PROVIDER`, `RESEND_API_KEY`, `RESEND_WEBHOOK_SECRET`, `EMAIL_SHARED_DOMAIN` | §6.2 |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_AUTOMATIC_TAX`, `PAYMENTS_LIVE_ENABLED=false` | §6.3 |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | §6.4 (opcional) |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY` | Cloudflare Turnstile (recomendado) |
| `LEGAL_OWNER_NAME`, `LEGAL_OWNER_TAX_ID`, `LEGAL_OWNER_ADDRESS`, `LEGAL_OWNER_EMAIL`, `LEGAL_OWNER_REGISTRY` | Titular de RevisaYa (textos legales). **Tras cambiarlas, vuelve a desplegar.** |

   **No pongas nunca** `STRIPE_API_BASE`, `GOOGLE_OAUTH_BASE` ni `GOOGLE_API_BASE` en producción (son solo para pruebas; la app no arranca con ellas).
4. Antes de desplegar, comprueba la configuración: copia las variables a un archivo local **que no se sube** (por ejemplo `.env.production.local`) y ejecuta `pnpm check:env .env.production.local`. Corrige todo lo marcado con ✖.
5. Dominio: *Settings → Domains* → añade `<tu-dominio>` y crea el registro DNS que indique Vercel.
6. **Procesos programados** (`vercel.json`):
   - el dispatcher de avisos va **cada minuto**, lo que exige un plan de Vercel que lo permita (Pro);
   - con el plan Hobby, Vercel solo admite procesos diarios. En ese caso, programa en tu monitor externo una llamada `POST https://<tu-dominio>/api/internal/jobs/dispatch-reminders` con `Authorization: Bearer $CRON_SECRET` cada 1–5 min, y otra a `email-maintenance` cada 30 min.

### 6.6 Primer arranque
1. Despliega y abre `https://<tu-dominio>/api/health`: tiene que dar `{"status":"ok"}`.
2. Crea el catálogo de Stripe: `curl -X POST -H "Authorization: Bearer $CRON_SECRET" https://<tu-dominio>/api/internal/jobs/stripe-sync-catalog`.
3. Regístrate, crea un taller de prueba, contrata un plan con la tarjeta de prueba `4242 4242 4242 4242` y comprueba que la suscripción aparece en *Facturación*.

### 6.7 Comprobaciones rápidas tras cada despliegue
- `/api/health` responde 200 y `/api/internal/jobs/status` (con el Bearer) también.
- Acceso, registro (llega el correo de confirmación) y panel.
- Correo de prueba desde *Configuración → Plantillas* y su entrega en el panel de Resend.
- Página pública de citas de un taller de prueba.

## 7. Copias de seguridad y recuperación
- Supabase hace copias diarias automáticas (en el plan Pro, 7 días). **PITR** (recuperación a un momento concreto) es un complemento de pago recomendable cuando haya clientes de pago.
- Copia lógica semanal adicional, cifrada y fuera de Supabase (por ejemplo, en un almacenamiento de la UE):
  ```bash
  pg_dump "$DATABASE_URL_DIRECT" --format=custom --no-owner --file=revisaya-$(date +%F).dump
  gpg --symmetric --cipher-algo AES256 revisaya-$(date +%F).dump
  ```
  Usa la conexión directa (puerto 5432), no el pooler.
- **Prueba de restauración trimestral** en un proyecto de Supabase aparte: `pg_restore --no-owner -d <url-del-proyecto-de-prueba> revisaya-AAAA-MM-DD.dump`. Comprueba que se puede entrar y que los datos están.
- Los archivos (logos y PDF de presupuestos) están en Supabase Storage, que **no** entra en `pg_dump`. Los PDF se pueden regenerar desde los datos guardados del presupuesto. Para una copia propia, descárgalos desde el panel de Storage o con la API de Storage.
- Objetivos iniciales: RPO ≤ 24 h (≤ 5 min con PITR) y RTO ≤ 4 h.

## 8. Incidentes
- **Brecha de datos**:
  - se avisa a los talleres afectados sin dilación indebida, porque son los responsables y tienen 72 h para notificar a la AEPD;
  - se revocan las claves comprometidas en este orden: `SUPABASE_SECRET_KEY`, `CRON_SECRET`, claves de API, webhooks;
  - se revisan `audit_logs` y los registros.
- **Rotación de secretos**:
  - `CRON_SECRET`, `EMAIL_LINK_SECRET` y los secretos de webhooks se pueden cambiar en cualquier momento. Con otro `EMAIL_LINK_SECRET`, los enlaces de baja y de cita de correos ya enviados dejan de valer;
  - `API_KEY_PEPPER` invalida todas las claves de API;
  - `INTEGRATIONS_ENCRYPTION_KEY` obliga a reconectar Google.

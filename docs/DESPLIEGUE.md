# RevisaYa — Despliegue y entornos

> Estado: **diseño (Fase 0)**. Se completa en la Fase 12 (preparación para producción).

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
| Dispatcher de avisos | Vercel Cron → `/api/internal/jobs/dispatch-reminders` (`vercel.json`) | cada minuto |
| Estado (dead-man switch) | Vercel Cron → `/api/internal/jobs/status`; un monitor externo debe alertar si responde 503 | cada hora |

- Vercel Cron envía `Authorization: Bearer $CRON_SECRET` si la variable `CRON_SECRET` está definida en el proyecto. Sin ella los endpoints responden 401.
- La frecuencia de un minuto requiere un plan de Vercel que la permita; si no, el dispatcher puede lanzarse desde `pg_cron` + `pg_net` con el mismo secreto, o con menos frecuencia (los avisos se envían igualmente, algo más tarde).
- Variables de correo: `EMAIL_PROVIDER` (`resend` o `smtp`), `RESEND_API_KEY` o `SMTP_URL`, `EMAIL_SHARED_DOMAIN` (subdominio de RevisaYa con SPF/DKIM/DMARC), `EMAIL_LINK_SECRET`. **Sin `EMAIL_PROVIDER` no se envía ningún aviso**: quedan programados.
- Antes de enviar a clientes reales: dominio de envío verificado y calentado, pruebas en Gmail y Outlook (checklist §5). No se activan envíos comerciales masivos sin autorización.

## 4. Procedimiento de despliegue (borrador)

1. PR → CI verde (ver TESTING §4) → revisión.
2. Merge a `main` → migraciones aplicadas a staging (`supabase db push`) → despliegue a staging → smoke tests.
3. Promoción a producción manual: backup previo, `supabase db push` a prod, despliegue, smoke tests, vigilancia de Sentry 30 min.
4. Migraciones solo hacia delante y compatibles con la versión anterior del código (expandir → migrar → contraer). Ninguna destructiva sin autorización.
5. Rollback: redeploy de la versión anterior en Vercel (instantáneo); la BD no se revierte salvo incidente grave (restauración desde backup/PITR).

## 5. Checklist de lanzamiento (se completará en la Fase 12)

Incluye lo que pide el PDF (§11) más lo técnico:

- [ ] Nombre comprobado en el registro de marcas y dominio comprado.
- [ ] Alta de actividad (autónomo) y asesoría fiscal para IVA y facturación.
- [ ] Textos legales revisados: aviso legal, privacidad, términos, DPA, cookies, lista de subencargados.
- [ ] Cuenta de Stripe a nombre del titular legal; cuenta bancaria; autorización expresa del responsable adulto para activar LIVE.
- [ ] Dominio de correo de RevisaYa verificado (SPF/DKIM/DMARC) y probado en Gmail y Outlook.
- [ ] App de Google OAuth verificada (si se lanza Calendar).
- [ ] Backups verificados con una restauración real; PITR decidido.
- [ ] Monitorización y alertas (Sentry, dead-man switch, cuotas de correo, tasa de rebote).
- [ ] Plantilla Excel, guía con capturas, vídeo de 3 min de importación, correo de bienvenida y de primer aviso de prueba.
- [ ] Procedimiento de respuesta ante brechas de seguridad y de solicitudes RGPD.
- [ ] Pruebas críticas en verde sobre producción (con una organización de pruebas).

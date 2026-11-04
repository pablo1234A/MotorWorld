# RevisaYa — Despliegue y entornos

> Estado: **diseño (Fase 0)**. Se completa en la Fase 12 (preparación para producción).

## 1. Entornos

| Entorno | Web | Base de datos | Pagos | Correo |
|---|---|---|---|---|
| Local | `next dev` | Supabase CLI (Docker) | Stripe TEST + Stripe CLI | Resend test / Inbucket local |
| Staging | Vercel Preview (rama `main`) | Proyecto Supabase *staging* (UE) | Stripe TEST | Resend + subdominio de pruebas |
| Producción | Vercel Production | Proyecto Supabase *prod* (UE) | Stripe **TEST** hasta autorización | Resend + dominio verificado |

Región de funciones: UE (Frankfurt o París) junto a la región de Supabase, para que la latencia sea baja y los datos se queden en la UE.

## 2. Procedimiento (borrador)

1. PR → CI verde (ver TESTING §3) → revisión.
2. Merge a `main` → migraciones aplicadas a staging (`supabase db push`) → despliegue a staging → smoke tests.
3. Promoción a producción manual: backup previo, `supabase db push` a prod, despliegue, smoke tests, vigilancia de Sentry 30 min.
4. Migraciones solo hacia delante y compatibles con la versión anterior del código (expandir → migrar → contraer). Ninguna destructiva sin autorización.
5. Rollback: redeploy de la versión anterior en Vercel (instantáneo); la BD no se revierte salvo incidente grave (restauración desde backup/PITR).

## 3. Checklist de lanzamiento (se completará en la Fase 12)

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

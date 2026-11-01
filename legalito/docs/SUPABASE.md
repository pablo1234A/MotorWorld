# Configurar Supabase

## 1. Proyecto
1. Crea un proyecto en https://supabase.com en la **región UE (Frankfurt o Irlanda)**.
2. Plan recomendado para producción: **Pro** (copias de seguridad diarias; añade **PITR** para recuperación a un punto en el tiempo).
3. Crea **dos proyectos**: `legalito-staging` (pruebas) y `legalito-prod`.

## 2. Migraciones y datos iniciales
Con Supabase CLI:
```bash
npx supabase login
npx supabase link --project-ref <ref>
npx supabase db push                      # aplica supabase/migrations
psql "$DATABASE_URL" -f supabase/seed/base.sql
psql "$DATABASE_URL" -f supabase/seed/templates.sql   # plantillas DEMO (solo staging, o como borrador)
```
O pega cada archivo de `supabase/migrations/` en orden en el editor SQL.

## 3. Variables
En Settings → API: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` (clave pública/anon) y `SUPABASE_SERVICE_ROLE_KEY` (secreta, solo servidor).

## 4. Autenticación
Authentication → Providers → Email:
- Confirm email: **activado**. Secure email change: **activado**.
- Longitud mínima de contraseña: 10, con letras y números.

Authentication → URL Configuration:
- Site URL: `https://tudominio.es`
- Redirect URLs: `https://tudominio.es/auth/confirm`

Authentication → Email Templates: copia el HTML de `supabase/templates/` (confirmación, recuperación, cambio de email). Los enlaces usan `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=…`.

Authentication → SMTP Settings: usa **Resend** como SMTP (`smtp.resend.com`, puerto 465, usuario `resend`, contraseña = API key) con el mismo remitente verificado. Sin SMTP propio Supabase limita mucho los envíos.

## 5. Storage
La migración `…0400_storage.sql` crea el bucket privado `documents` (5 MB, PDF/HTML). Comprueba en Storage que **no es público**.

## 6. Primer administrador
Regístrate en la web y ejecuta en SQL:
```sql
insert into public.user_roles (user_id, role)
select id, 'admin' from auth.users where email = 'tu@email.es';
```
Los roles solo se conceden por SQL (no hay interfaz) para minimizar riesgos.

## 7. Copias de seguridad
- Plan Pro: copias diarias automáticas (7 días) + PITR recomendado.
- Exportación adicional periódica: `pg_dump` cifrado a un almacenamiento externo (p. ej. semanal).
- Prueba una restauración en staging antes del lanzamiento.

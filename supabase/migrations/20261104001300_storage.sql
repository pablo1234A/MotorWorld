-- =============================================================================
-- RevisaYa · 1300 · Almacenamiento (Supabase Storage). Todos los buckets son
-- privados. Ruta obligatoria: <organization_id>/<...>.
--   org-assets: logos (≤ 1 MB, PNG/JPEG/WebP; sin SVG por riesgo de XSS)
--   imports:    archivos de importación (≤ 5 MB, CSV/XLSX), purgados a 7 días
--   documents:  PDFs de presupuestos y exportaciones RGPD (≤ 50 MB)
-- imports y documents solo los maneja el servidor; los usuarios descargan con
-- URLs firmadas de corta duración.
-- =============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('org-assets', 'org-assets', false, 1048576, array['image/png', 'image/jpeg', 'image/webp']),
  ('imports', 'imports', false, 5242880,
   array['text/csv', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']),
  ('documents', 'documents', false, 52428800, array['application/pdf', 'application/zip'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Los miembros pueden ver los recursos de marca de su organización; los
-- administradores, subirlos y reemplazarlos.
create policy org_assets_select on storage.objects for select to authenticated
  using (bucket_id = 'org-assets'
         and (storage.foldername(name))[1] in (select o::text from app.member_orgs() o));
create policy org_assets_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'org-assets'
              and (storage.foldername(name))[1] in (select o::text from app.admin_orgs() o));
create policy org_assets_update on storage.objects for update to authenticated
  using (bucket_id = 'org-assets'
         and (storage.foldername(name))[1] in (select o::text from app.admin_orgs() o))
  with check (bucket_id = 'org-assets'
              and (storage.foldername(name))[1] in (select o::text from app.admin_orgs() o));
create policy org_assets_delete on storage.objects for delete to authenticated
  using (bucket_id = 'org-assets'
         and (storage.foldername(name))[1] in (select o::text from app.admin_orgs() o));

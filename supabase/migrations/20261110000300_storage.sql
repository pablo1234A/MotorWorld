-- =============================================================================
-- AnunciaPro · 0003 · Supabase Storage: buckets privados y políticas
-- Convención de rutas (nunca predecibles: el nombre final es un UUID aleatorio):
--   product-images/{workspace_id}/{product_id}/{uuid}.{ext}
--   avatars/{user_id}/{uuid}.{ext}
--   imports/{workspace_id}/{uuid}.csv
--   exports/{workspace_id}/{uuid}.{ext}
-- =============================================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('product-images', 'product-images', false, 5242880, array['image/jpeg', 'image/png', 'image/webp']),
  ('avatars', 'avatars', false, 2097152, array['image/jpeg', 'image/png', 'image/webp']),
  ('imports', 'imports', false, 5242880, array['text/csv', 'text/plain', 'application/vnd.ms-excel']),
  ('exports', 'exports', false, 20971520, array['text/csv', 'application/json', 'text/plain'])
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

-- Fotografías de producto: miembros del workspace (primera carpeta de la ruta).
create policy "product_images_read" on storage.objects for select to authenticated
  using (bucket_id = 'product-images'
         and public.is_workspace_member(public.try_uuid((storage.foldername(name))[1])));
create policy "product_images_write" on storage.objects for insert to authenticated
  with check (bucket_id = 'product-images'
              and public.can_edit_workspace(public.try_uuid((storage.foldername(name))[1])));
create policy "product_images_remove" on storage.objects for delete to authenticated
  using (bucket_id = 'product-images'
         and public.can_edit_workspace(public.try_uuid((storage.foldername(name))[1])));

-- Avatares: solo el propio usuario (primera carpeta = su id).
create policy "avatars_read" on storage.objects for select to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "avatars_write" on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "avatars_remove" on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- CSV temporales de importación.
create policy "imports_read" on storage.objects for select to authenticated
  using (bucket_id = 'imports'
         and public.can_edit_workspace(public.try_uuid((storage.foldername(name))[1])));
create policy "imports_write" on storage.objects for insert to authenticated
  with check (bucket_id = 'imports'
              and public.can_edit_workspace(public.try_uuid((storage.foldername(name))[1])));
create policy "imports_remove" on storage.objects for delete to authenticated
  using (bucket_id = 'imports'
         and public.can_edit_workspace(public.try_uuid((storage.foldername(name))[1])));

-- Exportaciones.
create policy "exports_read" on storage.objects for select to authenticated
  using (bucket_id = 'exports'
         and public.is_workspace_member(public.try_uuid((storage.foldername(name))[1])));
create policy "exports_write" on storage.objects for insert to authenticated
  with check (bucket_id = 'exports'
              and public.can_edit_workspace(public.try_uuid((storage.foldername(name))[1])));
create policy "exports_remove" on storage.objects for delete to authenticated
  using (bucket_id = 'exports'
         and public.can_edit_workspace(public.try_uuid((storage.foldername(name))[1])));

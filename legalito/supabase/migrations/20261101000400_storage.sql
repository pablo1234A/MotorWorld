-- =============================================================================
-- Legalito · Almacenamiento privado de documentos
-- -----------------------------------------------------------------------------
-- Bucket privado `documents`. Ruta: {organization_id}/{document_type}/{version_id}.{pdf|html}
-- Las subidas solo las hace el servidor (service_role). Las descargas se sirven
-- mediante URLs firmadas de corta duración tras verificar permisos en servidor.
-- La política de lectura es una defensa adicional en profundidad.
-- =============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('documents', 'documents', false, 5242880, array['application/pdf', 'text/html'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

create policy documents_bucket_member_read on storage.objects
  for select to authenticated
  using (
    bucket_id = 'documents'
    and public.is_org_member(public.try_uuid((storage.foldername(name))[1]))
  );

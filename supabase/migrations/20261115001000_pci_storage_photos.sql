-- PCI: el bucket privado «documents» guarda también las fotos de
-- instalaciones, equipos, órdenes e incidencias. Antes solo admitía PDF y ZIP
-- (presupuestos y exportaciones) y las fotos fallaban al subir. La app valida
-- el tipo real por su firma (magic bytes) y el tamaño (10 MB) antes de subir.
update storage.buckets
   set allowed_mime_types = array['application/pdf', 'application/zip', 'image/jpeg', 'image/png', 'image/webp']
 where id = 'documents';

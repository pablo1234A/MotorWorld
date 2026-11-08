-- PCI: importación de clientes, instalaciones y equipos (plantillas separadas).
-- Aditiva: los lotes existentes quedan como importaciones de vehículos.
alter table public.import_batches
  add column kind text not null default 'vehicles' check (kind in ('vehicles', 'customers', 'installations', 'equipment'));

alter table public.import_rows drop constraint import_rows_action_check,
  add constraint import_rows_action_check check (action in (
    'create_customer_and_vehicle', 'attach_to_existing_customer', 'update_existing_vehicle',
    'skip_duplicate', 'skip_empty', 'skip_excluded',
    'create_customer', 'create_installation', 'create_equipment'));
alter table public.import_rows add column matched_installation_id uuid;

-- Trazabilidad: qué lote creó cada instalación y equipo (la columna existe
-- desde la migración 100; aquí se enlaza con el lote).
alter table public.installations
  add constraint installations_import_batch_fk foreign key (organization_id, branch_id, import_batch_id)
    references public.import_batches (organization_id, branch_id, id) on delete set null (import_batch_id);
alter table public.equipment
  add constraint equipment_import_batch_fk foreign key (organization_id, branch_id, import_batch_id)
    references public.import_batches (organization_id, branch_id, id) on delete set null (import_batch_id);
create index installations_import_batch_idx on public.installations (import_batch_id) where import_batch_id is not null;
create index equipment_import_batch_idx on public.equipment (import_batch_id) where import_batch_id is not null;
grant insert (import_batch_id) on public.installations, public.equipment to authenticated;

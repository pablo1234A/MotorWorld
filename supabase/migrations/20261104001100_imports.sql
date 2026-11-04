-- =============================================================================
-- RevisaYa · 1100 · Importación Excel/CSV: staging y trazabilidad.
-- La confirmación atómica (una transacción) se implementa en la Fase 4.
-- =============================================================================

create table public.import_batches (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null,
  branch_id        uuid not null,
  uploaded_by      uuid references public.profiles (id) on delete set null,
  file_name        text not null check (char_length(file_name) <= 255),
  file_sha256      bytea not null check (octet_length(file_sha256) = 32),
  storage_path     text,
  row_count        integer not null default 0 check (row_count between 0 and 2000),
  status           text not null default 'uploaded' check (status in (
                     'uploaded', 'parsing', 'validated', 'has_errors', 'committing',
                     'committed', 'failed', 'canceled', 'expired')),
  summary          jsonb not null default '{}'::jsonb,
  error_count      integer not null default 0 check (error_count >= 0),
  warning_count    integer not null default 0 check (warning_count >= 0),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  committed_at     timestamptz,
  expires_at       timestamptz not null default now() + interval '7 days',
  foreign key (organization_id, branch_id) references public.branches (organization_id, id) on delete restrict,
  constraint import_batches_tenant_key unique (organization_id, branch_id, id),
  constraint import_batches_committed check (status <> 'committed' or (committed_at is not null and error_count = 0))
);
create index import_batches_branch_idx on public.import_batches (organization_id, branch_id, created_at desc);
create index import_batches_hash_idx on public.import_batches (branch_id, file_sha256) where status = 'committed';
create trigger import_batches_updated_at before update on public.import_batches
  for each row execute function app.set_updated_at();
create trigger import_batches_tenant_immutable before update on public.import_batches
  for each row execute function app.forbid_tenant_change();

create table public.import_rows (
  batch_id             uuid not null,
  organization_id      uuid not null,
  branch_id            uuid not null,
  row_number           integer not null check (row_number between 1 and 2001),
  raw                  jsonb not null,
  normalized           jsonb,
  errors               jsonb not null default '[]'::jsonb,
  warnings             jsonb not null default '[]'::jsonb,
  action               text check (action in (
                         'create_customer_and_vehicle', 'attach_to_existing_customer', 'skip_duplicate', 'skip_empty')),
  matched_customer_id  uuid,
  matched_vehicle_id   uuid,
  updated_at           timestamptz not null default now(),
  primary key (batch_id, row_number),
  foreign key (organization_id, branch_id, batch_id)
    references public.import_batches (organization_id, branch_id, id) on delete cascade
);
create trigger import_rows_tenant_immutable before update on public.import_rows
  for each row execute function app.forbid_tenant_change();

-- Trazabilidad: qué lote creó cada ficha.
alter table public.customers
  add constraint customers_import_batch_fk
  foreign key (organization_id, branch_id, import_batch_id)
  references public.import_batches (organization_id, branch_id, id) on delete set null (import_batch_id);
alter table public.vehicles
  add constraint vehicles_import_batch_fk
  foreign key (organization_id, branch_id, import_batch_id)
  references public.import_batches (organization_id, branch_id, id) on delete set null (import_batch_id);
create index customers_import_batch_idx on public.customers (import_batch_id) where import_batch_id is not null;
create index vehicles_import_batch_idx on public.vehicles (import_batch_id) where import_batch_id is not null;

-- RLS: requiere 'imports.run'. Confirmar una importación además escribe
-- clientes, vehículos e historial bajo RLS, por lo que exige también
-- customers.write, vehicles.write y maintenance.write.
alter table public.import_batches enable row level security;
alter table public.import_batches force row level security;
alter table public.import_rows enable row level security;
alter table public.import_rows force row level security;

create policy import_batches_select on public.import_batches for select to authenticated
  using (organization_id in (select app.member_orgs())
         and branch_id in (select app.branches_with_permission('imports.run', false)));
create policy import_batches_write on public.import_batches for all to authenticated
  using (organization_id in (select app.member_orgs())
         and branch_id in (select app.branches_with_permission('imports.run', true)))
  with check (organization_id in (select app.member_orgs())
              and branch_id in (select app.branches_with_permission('imports.run', true)));

create policy import_rows_select on public.import_rows for select to authenticated
  using (organization_id in (select app.member_orgs())
         and branch_id in (select app.branches_with_permission('imports.run', false)));
create policy import_rows_write on public.import_rows for all to authenticated
  using (organization_id in (select app.member_orgs())
         and branch_id in (select app.branches_with_permission('imports.run', true)))
  with check (organization_id in (select app.member_orgs())
              and branch_id in (select app.branches_with_permission('imports.run', true)));

revoke all on public.import_batches, public.import_rows from anon, authenticated;
grant select, insert, update, delete on public.import_batches, public.import_rows to authenticated;
grant update (import_batch_id) on public.customers, public.vehicles to service_role;

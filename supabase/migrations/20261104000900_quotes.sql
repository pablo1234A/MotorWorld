-- =============================================================================
-- RevisaYa · 0900 · Presupuestos. Importes en numeric (sin coma flotante).
-- El servidor calcula con decimal.js y la base de datos VERIFICA:
--   línea: subtotal = round(cantidad × precio, 2); IVA = round(subtotal × tipo/100, 2)
--   presupuesto: sumas de las líneas (constraint trigger diferido al COMMIT).
-- Numeración por sucursal y año sin colisiones bajo concurrencia.
-- =============================================================================

create table public.document_sequences (
  organization_id  uuid not null,
  branch_id        uuid not null,
  doc_type         text not null check (doc_type in ('quote')),
  year             smallint not null check (year between 2000 and 2999),
  last_value       integer not null default 0 check (last_value >= 0),
  primary key (branch_id, doc_type, year),
  foreign key (organization_id, branch_id) references public.branches (organization_id, id) on delete restrict
);

create table public.quotes (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null,
  branch_id        uuid not null,
  customer_id      uuid not null,
  vehicle_id       uuid,
  series_year      smallint not null,
  sequence         integer not null check (sequence > 0),
  number           text not null,
  issue_date       date not null default current_date,
  valid_until      date not null,
  status           text not null default 'draft'
                   check (status in ('draft', 'sent', 'accepted', 'rejected', 'expired')),
  subtotal         numeric(12,2) not null default 0 check (subtotal >= 0),
  tax_total        numeric(12,2) not null default 0 check (tax_total >= 0),
  total            numeric(12,2) not null default 0 check (total >= 0),
  currency         text not null default 'EUR' check (currency = 'EUR'),
  notes            text check (char_length(notes) <= 5000),
  pdf_path         text,
  snapshot         jsonb,  -- datos de taller/cliente/vehículo congelados al emitir
  created_by       uuid references public.profiles (id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  foreign key (organization_id, branch_id, customer_id)
    references public.customers (organization_id, branch_id, id) on delete restrict,
  foreign key (organization_id, branch_id, vehicle_id)
    references public.vehicles (organization_id, branch_id, id) on delete restrict,
  constraint quotes_tenant_key unique (organization_id, branch_id, id),
  constraint quotes_number_unique unique (branch_id, series_year, sequence),
  constraint quotes_validity check (valid_until >= issue_date),
  constraint quotes_total_sum check (total = subtotal + tax_total)
);
create index quotes_panel_idx on public.quotes (organization_id, branch_id, issue_date desc);
create index quotes_customer_idx on public.quotes (customer_id);
create index quotes_vehicle_idx on public.quotes (vehicle_id) where vehicle_id is not null;

create trigger quotes_updated_at before update on public.quotes
  for each row execute function app.set_updated_at();
create trigger quotes_tenant_immutable before update on public.quotes
  for each row execute function app.forbid_tenant_change();

create table public.quote_items (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null,
  branch_id        uuid not null,
  quote_id         uuid not null,
  position         smallint not null check (position between 1 and 200),
  description      text not null check (char_length(btrim(description)) between 1 and 300),
  quantity         numeric(12,3) not null check (quantity > 0),
  unit_price       numeric(12,2) not null check (unit_price >= 0),  -- sin IVA
  tax_rate         numeric(5,2) not null check (tax_rate in (0, 4, 10, 21)),
  line_subtotal    numeric(12,2) not null,
  line_tax         numeric(12,2) not null,
  line_total       numeric(12,2) not null,
  foreign key (organization_id, branch_id, quote_id)
    references public.quotes (organization_id, branch_id, id) on delete cascade,
  constraint quote_items_position_unique unique (quote_id, position),
  constraint quote_items_math check (
    line_subtotal = round(quantity * unit_price, 2)
    and line_tax = round(line_subtotal * tax_rate / 100, 2)
    and line_total = line_subtotal + line_tax)
);
create index quote_items_quote_idx on public.quote_items (quote_id);
create trigger quote_items_tenant_immutable before update on public.quote_items
  for each row execute function app.forbid_tenant_change();

-- Numeración: P-AAAA-NNNN por sucursal y año. El UPSERT bloquea la fila del
-- contador, así que dos presupuestos simultáneos nunca reciben el mismo número.
create function app.assign_quote_number()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_seq integer;
begin
  new.series_year := extract(year from new.issue_date)::smallint;
  insert into public.document_sequences (organization_id, branch_id, doc_type, year, last_value)
  values (new.organization_id, new.branch_id, 'quote', new.series_year, 1)
  on conflict (branch_id, doc_type, year)
  do update set last_value = public.document_sequences.last_value + 1
  returning last_value into v_seq;
  new.sequence := v_seq;
  new.number := format('P-%s-%s', new.series_year, lpad(v_seq::text, 4, '0'));
  return new;
end;
$$;
create trigger quotes_assign_number before insert on public.quotes
  for each row execute function app.assign_quote_number();

-- Solo se editan borradores. Transiciones: draft -> sent -> accepted|rejected|expired
-- (draft también puede pasar a expired).
create function app.guard_quote_changes()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.number is distinct from old.number or new.sequence is distinct from old.sequence
     or new.series_year is distinct from old.series_year then
    raise exception 'quote_number_immutable' using errcode = '23514';
  end if;
  if old.status <> 'draft' and (
       new.customer_id is distinct from old.customer_id
    or new.vehicle_id is distinct from old.vehicle_id
    or new.issue_date is distinct from old.issue_date
    or new.valid_until is distinct from old.valid_until
    or new.subtotal is distinct from old.subtotal
    or new.tax_total is distinct from old.tax_total
    or new.total is distinct from old.total) then
    raise exception 'quote_not_editable' using errcode = '23514';
  end if;
  if new.status is distinct from old.status and not (
       (old.status = 'draft' and new.status in ('sent', 'expired'))
    or (old.status = 'sent' and new.status in ('accepted', 'rejected', 'expired'))) then
    raise exception 'invalid_quote_transition'
      using errcode = '23514', detail = format('%s -> %s', old.status, new.status);
  end if;
  return new;
end;
$$;
create trigger quotes_guard_changes before update on public.quotes
  for each row execute function app.guard_quote_changes();

create function app.guard_quote_items()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (select 1 from public.quotes q
             where q.id = coalesce(new.quote_id, old.quote_id) and q.status <> 'draft') then
    raise exception 'quote_not_editable' using errcode = '23514';
  end if;
  return coalesce(new, old);
end;
$$;
create trigger quote_items_guard before insert or update or delete on public.quote_items
  for each row execute function app.guard_quote_items();

-- Verificación de totales al confirmar la transacción.
create function app.verify_quote_totals()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_quote uuid;
  v_sub numeric(12,2);
  v_tax numeric(12,2);
  q record;
begin
  -- Ramas separadas: PL/pgSQL no permite leer new.quote_id en la tabla quotes.
  if tg_table_name = 'quotes' then
    v_quote := new.id;
  elsif tg_op = 'DELETE' then
    v_quote := old.quote_id;
  else
    v_quote := new.quote_id;
  end if;
  select id, subtotal, tax_total into q from public.quotes where id = v_quote;
  if not found then
    return null;  -- presupuesto borrado en la misma transacción
  end if;
  select coalesce(sum(line_subtotal), 0), coalesce(sum(line_tax), 0)
    into v_sub, v_tax
  from public.quote_items where quote_id = v_quote;
  if q.subtotal <> v_sub or q.tax_total <> v_tax then
    raise exception 'quote_totals_mismatch'
      using errcode = '23514', detail = format('%s: %s/%s vs %s/%s', v_quote, q.subtotal, q.tax_total, v_sub, v_tax);
  end if;
  return null;
end;
$$;
create constraint trigger quotes_verify_totals
  after insert or update on public.quotes
  deferrable initially deferred
  for each row execute function app.verify_quote_totals();
create constraint trigger quote_items_verify_totals
  after insert or update or delete on public.quote_items
  deferrable initially deferred
  for each row execute function app.verify_quote_totals();

-- RLS
alter table public.document_sequences enable row level security;
alter table public.document_sequences force row level security;
alter table public.quotes enable row level security;
alter table public.quotes force row level security;
alter table public.quote_items enable row level security;
alter table public.quote_items force row level security;

create policy quotes_select on public.quotes for select to authenticated
  using (organization_id in (select app.member_orgs())
         and branch_id in (select app.branches_with_permission('quotes.manage', false)));
create policy quotes_insert on public.quotes for insert to authenticated
  with check (organization_id in (select app.member_orgs())
              and branch_id in (select app.branches_with_permission('quotes.manage', true))
              and status = 'draft');
create policy quotes_update on public.quotes for update to authenticated
  using (organization_id in (select app.member_orgs())
         and branch_id in (select app.branches_with_permission('quotes.manage', true)))
  with check (organization_id in (select app.member_orgs())
              and branch_id in (select app.branches_with_permission('quotes.manage', true)));
create policy quotes_delete_draft on public.quotes for delete to authenticated
  using (organization_id in (select app.member_orgs())
         and branch_id in (select app.branches_with_permission('admin', true))
         and status = 'draft');

create policy quote_items_select on public.quote_items for select to authenticated
  using (organization_id in (select app.member_orgs())
         and branch_id in (select app.branches_with_permission('quotes.manage', false)));
create policy quote_items_write on public.quote_items for all to authenticated
  using (organization_id in (select app.member_orgs())
         and branch_id in (select app.branches_with_permission('quotes.manage', true)))
  with check (organization_id in (select app.member_orgs())
              and branch_id in (select app.branches_with_permission('quotes.manage', true)));

revoke all on public.document_sequences, public.quotes, public.quote_items from anon, authenticated;
grant select, delete on public.quotes to authenticated;
grant insert (organization_id, branch_id, customer_id, vehicle_id, issue_date, valid_until, status,
              subtotal, tax_total, total, notes, created_by)
  on public.quotes to authenticated;
grant update (customer_id, vehicle_id, issue_date, valid_until, status, subtotal, tax_total, total,
              notes, pdf_path, snapshot)
  on public.quotes to authenticated;
grant select, insert, delete on public.quote_items to authenticated;
-- Una línea no puede cambiar de presupuesto (quote_id no es actualizable).
grant update (position, description, quantity, unit_price, tax_rate, line_subtotal, line_tax, line_total)
  on public.quote_items to authenticated;

-- =============================================================================
-- RevisaYa PCI · 6 · Ajustes compatibles.
--  · Número de orden: valores por defecto vacíos; el trigger de numeración los
--    sustituye siempre (igual que en los presupuestos).
-- =============================================================================
alter table public.work_orders
  alter column number set default '',
  alter column series_year set default 0,
  alter column sequence set default 0;

--  · Google Calendar: enlace orden de trabajo ↔ evento (como el de las citas).
create table public.work_order_calendar_links (
  work_order_id       uuid primary key references public.work_orders (id) on delete cascade,
  organization_id     uuid not null references public.organizations (id) on delete cascade,
  integration_id      uuid not null,
  google_calendar_id  text not null,
  google_event_id     text not null,
  sync_status         text not null default 'synced' check (sync_status in ('synced', 'pending', 'deleted')),
  last_synced_at      timestamptz,
  last_error          text check (char_length(last_error) <= 1000),
  foreign key (organization_id, integration_id) references public.integrations (organization_id, id) on delete cascade
);
alter table public.work_order_calendar_links enable row level security;
alter table public.work_order_calendar_links force row level security;
create policy work_order_calendar_links_select on public.work_order_calendar_links for select to authenticated
  using (organization_id in (select app.member_orgs()));
revoke all on public.work_order_calendar_links from anon, authenticated;
grant select on public.work_order_calendar_links to authenticated;

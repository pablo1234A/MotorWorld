-- =============================================================================
-- RevisaYa · API pública v1 (Fase 9, plan Excelencia).
--  · Idempotency-Key en POST (24 h), en el esquema privado.
--  · Purga diaria: registros de peticiones (30 días) e idempotencia (24 h).
-- Solo añade objetos (no destructiva).
-- =============================================================================

create table private.api_idempotency (
  api_key_id    uuid not null references public.api_keys (id) on delete cascade,
  idem_key      text not null check (char_length(idem_key) between 1 and 200),
  request_hash  bytea not null check (octet_length(request_hash) = 32),
  status        smallint check (status between 100 and 599),  -- null = en curso
  response      jsonb,
  created_at    timestamptz not null default now(),
  primary key (api_key_id, idem_key)
);
revoke all on private.api_idempotency from public, anon, authenticated;
grant select, insert, update, delete on private.api_idempotency to service_role;

create function private.purge_api_data()
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_logs integer;
  v_idem integer;
begin
  delete from public.api_request_logs where created_at < now() - interval '30 days';
  get diagnostics v_logs = row_count;
  delete from private.api_idempotency where created_at < now() - interval '24 hours';
  get diagnostics v_idem = row_count;
  return jsonb_build_object('api_request_logs', v_logs, 'api_idempotency', v_idem);
end;
$$;
revoke all on function private.purge_api_data() from public, anon, authenticated;

select cron.schedule('revisaya-purge-api-data', '27 3 * * *', $$select private.purge_api_data()$$);

-- Las citas creadas por la API quedan marcadas con su origen ('api'); el
-- resto de condiciones de la política no cambian.
alter policy appointments_insert on public.appointments
  with check (organization_id in (select app.member_orgs())
              and branch_id in (select app.branches_with_permission('appointments.manage', true))
              and source in ('manual', 'api'));

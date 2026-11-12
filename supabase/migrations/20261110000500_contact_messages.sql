-- =============================================================================
-- AnunciaPro · 0005 · Mensajes del formulario de contacto
-- Solo se escriben mediante la función (con validación) y solo los lee
-- administración con service_role.
-- =============================================================================
create table public.contact_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles (id) on delete set null,
  name text not null check (char_length(name) between 1 and 120),
  email text not null check (char_length(email) between 3 and 320),
  subject text not null check (char_length(subject) between 1 and 160),
  message text not null check (char_length(message) between 10 and 4000),
  handled_at timestamptz,
  created_at timestamptz not null default now()
);
create index contact_messages_created_idx on public.contact_messages (created_at desc);
alter table public.contact_messages enable row level security;
revoke all on public.contact_messages from anon, authenticated;
grant all on public.contact_messages to service_role;

create or replace function public.submit_contact_message(p_name text, p_email text, p_subject text, p_message text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  insert into public.contact_messages (user_id, name, email, subject, message)
  values ((select auth.uid()), btrim(p_name), lower(btrim(p_email)), btrim(p_subject), btrim(p_message))
  returning id into v_id;
  return v_id;
end;
$$;
revoke all on function public.submit_contact_message(text, text, text, text) from public;
grant execute on function public.submit_contact_message(text, text, text, text) to anon, authenticated, service_role;

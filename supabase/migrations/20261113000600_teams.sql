-- =============================================================================
-- AnunciaPro · 0006 · Equipos: invitaciones y gestión de miembros
-- Las membresías solo se modifican mediante funciones que comprueban permisos
-- y el límite de miembros del plan de forma atómica.
-- =============================================================================

-- Límite de miembros por plan (incluye al propietario).
update public.plans set features = features - 'team_ready' || jsonb_build_object('max_members', 1) where code in ('free', 'starter');
update public.plans set features = features - 'team_ready' || jsonb_build_object('max_members', 3) where code = 'pro';
update public.plans set features = features - 'team_ready' || jsonb_build_object('max_members', 10) where code = 'business';

create table public.workspace_invitations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  email text not null check (email = lower(email) and char_length(email) between 3 and 320),
  role text not null default 'editor' check (role in ('admin', 'editor', 'viewer')),
  -- Identificador secreto del enlace de invitación (no adivinable).
  token uuid not null unique default gen_random_uuid(),
  invited_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '14 days',
  unique (workspace_id, email)
);
create index workspace_invitations_email_idx on public.workspace_invitations (email);

alter table public.workspace_invitations enable row level security;
revoke all on public.workspace_invitations from anon, authenticated;
grant all on public.workspace_invitations to service_role;
grant select on public.workspace_invitations to authenticated;

-- Los gestores del espacio ven sus invitaciones pendientes (incluido el enlace).
create policy workspace_invitations_select on public.workspace_invitations for select to authenticated
  using (public.can_manage_workspace(workspace_id));

create or replace function public.current_user_email()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select lower(email) from public.profiles where id = (select auth.uid()) and disabled_at is null;
$$;

create or replace function public.workspace_member_limit(p_workspace uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(((public.workspace_plan(p_workspace)).features ->> 'max_members')::integer, 1);
$$;

create or replace function public.invite_member(p_workspace uuid, p_email text, p_role text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_limit integer;
  v_used integer;
  v_invitation public.workspace_invitations;
begin
  if not public.can_manage_workspace(p_workspace) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if p_role not in ('admin', 'editor', 'viewer') or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or char_length(v_email) > 320 then
    raise exception 'INVALID_INVITATION' using errcode = '22023';
  end if;
  -- Solo el propietario puede nombrar administradores.
  if p_role = 'admin' and not exists (
    select 1 from public.workspace_members where workspace_id = p_workspace and user_id = (select auth.uid()) and role = 'owner'
  ) then
    return jsonb_build_object('ok', false, 'reason', 'owner_required');
  end if;

  perform 1 from public.subscriptions where workspace_id = p_workspace for update;

  if exists (
    select 1 from public.workspace_members m join public.profiles p on p.id = m.user_id
    where m.workspace_id = p_workspace and lower(p.email) = v_email
  ) then
    return jsonb_build_object('ok', false, 'reason', 'already_member');
  end if;

  delete from public.workspace_invitations where workspace_id = p_workspace and (email = v_email or expires_at < now());

  v_limit := public.workspace_member_limit(p_workspace);
  select (select count(*) from public.workspace_members where workspace_id = p_workspace)
       + (select count(*) from public.workspace_invitations where workspace_id = p_workspace)
    into v_used;
  if v_used >= v_limit then
    return jsonb_build_object('ok', false, 'reason', 'member_limit', 'limit', v_limit);
  end if;

  insert into public.workspace_invitations (workspace_id, email, role, invited_by)
  values (p_workspace, v_email, p_role, (select auth.uid()))
  returning * into v_invitation;

  insert into public.audit_logs (workspace_id, actor_id, action, resource_type, resource_id, metadata)
  values (p_workspace, (select auth.uid()), 'team.member_invited', 'invitation', v_invitation.id::text, jsonb_build_object('role', p_role));

  return jsonb_build_object('ok', true, 'id', v_invitation.id, 'token', v_invitation.token, 'email', v_invitation.email, 'role', v_invitation.role, 'expires_at', v_invitation.expires_at);
end;
$$;

create or replace function public.revoke_invitation(p_invitation uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_workspace uuid;
begin
  select workspace_id into v_workspace from public.workspace_invitations where id = p_invitation;
  if not found or not public.can_manage_workspace(v_workspace) then
    return false;
  end if;
  delete from public.workspace_invitations where id = p_invitation;
  return true;
end;
$$;

-- Invitaciones pendientes dirigidas al correo del usuario autenticado.
create or replace function public.my_invitations()
returns table (token uuid, workspace_name text, role text, invited_by_name text, expires_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select i.token, w.name, i.role, coalesce(nullif(p.full_name, ''), p.email), i.expires_at
  from public.workspace_invitations i
  join public.workspaces w on w.id = i.workspace_id
  left join public.profiles p on p.id = i.invited_by
  where i.email = public.current_user_email() and i.expires_at > now()
  order by i.created_at desc;
$$;

-- Datos mínimos de una invitación a partir de su enlace (para la página de aceptación).
create or replace function public.get_invitation(p_token uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'workspace_name', w.name,
    'role', i.role,
    'for_current_user', i.email = public.current_user_email(),
    'expired', i.expires_at <= now()
  )
  from public.workspace_invitations i
  join public.workspaces w on w.id = i.workspace_id
  where i.token = p_token;
$$;

create or replace function public.accept_invitation(p_token uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_invitation public.workspace_invitations;
  v_email text := public.current_user_email();
begin
  if v_email is null then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  select * into v_invitation from public.workspace_invitations where token = p_token for update;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;
  -- El enlace solo sirve para la persona invitada: evita que un enlace reenviado dé acceso a otro.
  if v_invitation.email <> v_email then
    return jsonb_build_object('ok', false, 'reason', 'wrong_account');
  end if;
  if v_invitation.expires_at <= now() then
    delete from public.workspace_invitations where id = v_invitation.id;
    return jsonb_build_object('ok', false, 'reason', 'expired');
  end if;

  perform 1 from public.subscriptions where workspace_id = v_invitation.workspace_id for update;
  if (select count(*) from public.workspace_members where workspace_id = v_invitation.workspace_id)
     >= public.workspace_member_limit(v_invitation.workspace_id) then
    return jsonb_build_object('ok', false, 'reason', 'member_limit');
  end if;

  insert into public.workspace_members (workspace_id, user_id, role)
  values (v_invitation.workspace_id, (select auth.uid()), v_invitation.role)
  on conflict (workspace_id, user_id) do nothing;
  delete from public.workspace_invitations where id = v_invitation.id;

  insert into public.audit_logs (workspace_id, actor_id, action, resource_type, resource_id, metadata)
  values (v_invitation.workspace_id, (select auth.uid()), 'team.member_joined', 'user', (select auth.uid())::text, jsonb_build_object('role', v_invitation.role));

  return jsonb_build_object('ok', true, 'workspace_id', v_invitation.workspace_id);
end;
$$;

create or replace function public.decline_invitation(p_token uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.workspace_invitations where token = p_token and email = public.current_user_email();
  return found;
end;
$$;

create or replace function public.set_member_role(p_workspace uuid, p_user uuid, p_role text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_role text;
  v_target_role text;
begin
  select role into v_actor_role from public.workspace_members where workspace_id = p_workspace and user_id = (select auth.uid());
  select role into v_target_role from public.workspace_members where workspace_id = p_workspace and user_id = p_user;
  if v_actor_role is null or v_actor_role not in ('owner', 'admin') or not public.can_manage_workspace(p_workspace) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if v_target_role is null then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;
  if p_role not in ('admin', 'editor', 'viewer') then
    raise exception 'INVALID_ROLE' using errcode = '22023';
  end if;
  -- El propietario no cambia de rol; solo él gestiona a los administradores.
  if v_target_role = 'owner' or ((v_target_role = 'admin' or p_role = 'admin') and v_actor_role <> 'owner') then
    return jsonb_build_object('ok', false, 'reason', 'owner_required');
  end if;
  update public.workspace_members set role = p_role where workspace_id = p_workspace and user_id = p_user;
  insert into public.audit_logs (workspace_id, actor_id, action, resource_type, resource_id, metadata)
  values (p_workspace, (select auth.uid()), 'team.role_changed', 'user', p_user::text, jsonb_build_object('from', v_target_role, 'to', p_role));
  return jsonb_build_object('ok', true);
end;
$$;

-- Expulsar a un miembro o abandonar un espacio (p_user = el propio usuario).
create or replace function public.remove_member(p_workspace uuid, p_user uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_actor_role text;
  v_target_role text;
begin
  select role into v_actor_role from public.workspace_members where workspace_id = p_workspace and user_id = v_actor;
  select role into v_target_role from public.workspace_members where workspace_id = p_workspace and user_id = p_user;
  if v_actor_role is null then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if v_target_role is null then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;
  if v_target_role = 'owner' then
    return jsonb_build_object('ok', false, 'reason', 'owner_cannot_leave');
  end if;
  if p_user <> v_actor and (v_actor_role not in ('owner', 'admin') or (v_target_role = 'admin' and v_actor_role <> 'owner')) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  delete from public.workspace_members where workspace_id = p_workspace and user_id = p_user;
  insert into public.audit_logs (workspace_id, actor_id, action, resource_type, resource_id, metadata)
  values (p_workspace, v_actor, case when p_user = v_actor then 'team.member_left' else 'team.member_removed' end, 'user', p_user::text, '{}'::jsonb);
  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function
  public.current_user_email(), public.workspace_member_limit(uuid), public.invite_member(uuid, text, text),
  public.revoke_invitation(uuid), public.my_invitations(), public.get_invitation(uuid), public.accept_invitation(uuid),
  public.decline_invitation(uuid), public.set_member_role(uuid, uuid, text), public.remove_member(uuid, uuid)
from public, anon;
grant execute on function
  public.current_user_email(), public.workspace_member_limit(uuid), public.invite_member(uuid, text, text),
  public.revoke_invitation(uuid), public.my_invitations(), public.get_invitation(uuid), public.accept_invitation(uuid),
  public.decline_invitation(uuid), public.set_member_role(uuid, uuid, text), public.remove_member(uuid, uuid)
to authenticated, service_role;

-- =============================================================================
-- RevisaYa · Fase 2 · Alta de talleres e invitaciones
--
-- Operaciones que un usuario autenticado no puede hacer con INSERT directos
-- (no tiene privilegio), y que se ejecutan como funciones SECURITY DEFINER
-- con todas las comprobaciones dentro de una única transacción:
--   app.create_organization  · alta de taller + sucursal principal + propietario
--   app.accept_invitation    · aceptar una invitación (email verificado y coincidente)
--   app.invitation_preview   · datos mínimos para mostrar una invitación
--
-- Códigos de error nuevos:
--   RY004 invitation_invalid (detail: not_found | expired | revoked | accepted |
--         email_mismatch | email_not_verified | already_member)
--   RY005 organization_quota (un usuario no puede crear más de 5 talleres)
-- =============================================================================

create function app.create_organization(
  p_trade_name text,
  p_slug text,
  p_timezone text default 'Europe/Madrid'
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_org uuid;
  v_branch uuid;
begin
  if v_uid is null then
    raise exception 'permission_denied' using errcode = '42501';
  end if;

  -- Solo usuarios con el email verificado pueden dar de alta un taller.
  if not exists (select 1 from auth.users u where u.id = v_uid and u.email_confirmed_at is not null) then
    raise exception 'email_not_verified' using errcode = '42501';
  end if;

  -- Freno a altas masivas de organizaciones vacías por un mismo usuario.
  if (select count(*) from public.organization_members m where m.user_id = v_uid and m.is_owner) >= 5 then
    raise exception 'organization_quota' using errcode = 'RY005';
  end if;

  insert into public.organizations (slug, trade_name, timezone, created_by)
  values (lower(btrim(p_slug)), btrim(p_trade_name), coalesce(p_timezone, 'Europe/Madrid'), v_uid)
  returning id into v_org;

  insert into public.branches (organization_id, name, slug, is_primary)
  values (v_org, btrim(p_trade_name), 'principal', true)
  returning id into v_branch;

  insert into public.organization_members (organization_id, user_id, role, is_owner, branch_scope)
  values (v_org, v_uid, 'admin', true, 'all');

  insert into public.audit_logs (organization_id, actor_type, actor_id, action, resource_type, resource_id)
  values (v_org, 'user', v_uid, 'organization.created', 'organizations', v_org::text);

  return v_org;
end;
$$;

-- Vista previa de una invitación a partir del hash de su token: devuelve solo
-- lo imprescindible para mostrarla (nombre del taller, rol, email invitado
-- enmascarado y estado). Ejecutable también sin sesión, desde el servidor.
create function app.invitation_preview(p_token_hash bytea)
returns table (
  organization_name text,
  role text,
  email_masked text,
  state text
)
language sql
stable
security definer
set search_path = ''
as $$
  select o.trade_name,
         i.role,
         regexp_replace(i.email::text, '^(.)[^@]*(@.*)$', '\1•••\2'),
         case
           when i.revoked_at is not null then 'revoked'
           when i.accepted_at is not null then 'accepted'
           when i.expires_at <= now() then 'expired'
           else 'pending'
         end
  from public.invitations i
  join public.organizations o on o.id = i.organization_id
  where i.token_hash = p_token_hash
    and o.status = 'active';
$$;

create function app.accept_invitation(p_token_hash bytea)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_inv public.invitations;
  v_user_email text;
  v_confirmed timestamptz;
  v_member uuid;
  v_valid_branches uuid[];
begin
  if v_uid is null then
    raise exception 'permission_denied' using errcode = '42501';
  end if;

  select * into v_inv from public.invitations where token_hash = p_token_hash for update;
  if not found then
    raise exception 'invitation_invalid' using errcode = 'RY004', detail = 'not_found';
  end if;
  if v_inv.revoked_at is not null then
    raise exception 'invitation_invalid' using errcode = 'RY004', detail = 'revoked';
  end if;
  if v_inv.accepted_at is not null then
    raise exception 'invitation_invalid' using errcode = 'RY004', detail = 'accepted';
  end if;
  if v_inv.expires_at <= now() then
    raise exception 'invitation_invalid' using errcode = 'RY004', detail = 'expired';
  end if;

  select u.email, u.email_confirmed_at into v_user_email, v_confirmed from auth.users u where u.id = v_uid;
  if v_confirmed is null then
    raise exception 'invitation_invalid' using errcode = 'RY004', detail = 'email_not_verified';
  end if;
  if lower(v_user_email) <> lower(v_inv.email::text) then
    raise exception 'invitation_invalid' using errcode = 'RY004', detail = 'email_mismatch';
  end if;
  if exists (select 1 from public.organization_members m
             where m.organization_id = v_inv.organization_id and m.user_id = v_uid) then
    raise exception 'invitation_invalid' using errcode = 'RY004', detail = 'already_member';
  end if;

  -- Primero se marca como aceptada (deja de contar como plaza pendiente) y
  -- después se crea el miembro: el trigger de límite cuenta una sola plaza.
  update public.invitations set accepted_at = now() where id = v_inv.id;

  insert into public.organization_members
    (organization_id, user_id, role, permissions, branch_scope, invited_by)
  values
    (v_inv.organization_id, v_uid, v_inv.role, v_inv.permissions, v_inv.branch_scope, v_inv.invited_by)
  returning id into v_member;

  if v_inv.branch_scope = 'selected' then
    select coalesce(array_agg(b.id), '{}') into v_valid_branches
    from public.branches b
    where b.organization_id = v_inv.organization_id and b.id = any (v_inv.branch_ids);
    if cardinality(v_valid_branches) = 0 then
      raise exception 'invitation_invalid' using errcode = 'RY004', detail = 'no_branches';
    end if;
    insert into public.member_branches (member_id, organization_id, branch_id)
    select v_member, v_inv.organization_id, unnest(v_valid_branches);
  end if;

  return v_inv.organization_id;
end;
$$;

-- Las invitaciones con alcance por sucursales deben indicar sucursales de la
-- misma organización (comprobado al crearlas, no solo al aceptarlas).
create function app.validate_invitation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.branch_scope = 'selected' then
    if cardinality(new.branch_ids) = 0
       or exists (select 1 from unnest(new.branch_ids) b(id)
                  where not exists (select 1 from public.branches br
                                    where br.id = b.id and br.organization_id = new.organization_id)) then
      raise exception 'invalid_branches' using errcode = '23514';
    end if;
  elsif cardinality(new.branch_ids) > 0 then
    new.branch_ids := '{}';
  end if;
  new.email := lower(btrim(new.email::text));
  return new;
end;
$$;
create trigger invitations_validate before insert on public.invitations
  for each row execute function app.validate_invitation();

grant execute on function app.create_organization(text, text, text), app.accept_invitation(bytea)
  to authenticated, service_role;
grant execute on function app.invitation_preview(bytea) to service_role;

-- Columnas de invitación que el administrador indica al crearla (nunca
-- accepted_at/revoked_at/created_at: los fija el sistema).
revoke insert on public.invitations from authenticated;
grant insert (organization_id, email, role, permissions, branch_scope, branch_ids, token_hash, invited_by, expires_at)
  on public.invitations to authenticated;

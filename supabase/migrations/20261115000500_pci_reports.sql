-- =============================================================================
-- RevisaYa PCI · 5 · Inicio e informes de mantenimiento.
-- Las funciones son SECURITY INVOKER: se ejecutan con la RLS del usuario (cada
-- uno ve solo sus sucursales y, si es técnico, solo sus órdenes). Los informes
-- además exigen el plan con 'reports' y el permiso 'reports.read'
-- (app.report_branches, ya existente).
-- =============================================================================

create function app.pci_dashboard(p_org uuid)
returns jsonb
language sql
stable
set search_path = ''
as $$
  with today as (select (now() at time zone o.timezone)::date as d from public.organizations o where o.id = p_org)
  select jsonb_build_object(
    'customers', (select count(*) from public.customers c where c.organization_id = p_org and c.deleted_at is null),
    'installations', (select count(*) from public.installations i where i.organization_id = p_org and i.deleted_at is null and i.status = 'active'),
    'equipment', (select count(*) from public.equipment e where e.organization_id = p_org and e.deleted_at is null and e.status <> 'retired'),
    'extinguishers', (select count(*) from public.equipment e where e.organization_id = p_org and e.deleted_at is null
                        and e.status = 'in_service' and e.category_code = 'extinguisher'),
    'work_orders_open', (select count(*) from public.work_orders w where w.organization_id = p_org
                           and w.status in ('pending', 'scheduled', 'assigned', 'in_progress')),
    'actions_scheduled', (select count(*) from public.work_order_items it join public.work_orders w on w.id = it.work_order_id
                           where w.organization_id = p_org and it.status = 'pending'
                             and w.status in ('scheduled', 'assigned', 'in_progress')),
    'records_30d', (select count(*) from public.equipment_maintenance_records m, today
                     where m.organization_id = p_org and m.voided_at is null and m.performed_on > today.d - 30),
    'equipment_due_30d', (select count(*) from public.equipment e, today where e.organization_id = p_org and e.deleted_at is null
                            and e.status = 'in_service' and e.next_action_on between today.d and today.d + 30),
    'equipment_overdue', (select count(*) from public.equipment e, today where e.organization_id = p_org and e.deleted_at is null
                            and e.status = 'in_service' and e.next_action_on < today.d),
    'incidents_open', (select count(*) from public.equipment_incidents x where x.organization_id = p_org and x.status in ('open', 'in_progress')),
    'recent', coalesce((
      select jsonb_agg(r order by r.at desc) from (
        select 'record' as kind, m.created_at as at, m.equipment_id as ref_id,
               a.name || ' · ' || e.code as label, i.name as installation
          from public.equipment_maintenance_records m
          join public.maintenance_action_types a on a.id = m.action_type_id
          join public.equipment e on e.id = m.equipment_id
          join public.installations i on i.id = m.installation_id
         where m.organization_id = p_org and m.voided_at is null
        union all
        select 'work_order', w.completed_at, w.id, 'Orden ' || w.number || ' completada', i.name
          from public.work_orders w join public.installations i on i.id = w.installation_id
         where w.organization_id = p_org and w.status = 'completed'
        union all
        select 'incident', x.created_at, x.id, 'Incidencia: ' || x.title, i.name
          from public.equipment_incidents x join public.installations i on i.id = x.installation_id
         where x.organization_id = p_org
        order by 2 desc
        limit 8
      ) r), '[]'::jsonb)
  );
$$;
grant execute on function app.pci_dashboard(uuid) to authenticated;

-- Resumen del periodo.
create function app.pci_report_summary(p_org uuid, p_from date, p_to date, p_branch uuid default null)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  v_branches uuid[] := app.report_branches(p_org, p_branch);
  v_today date;
begin
  perform app.report_check_range(p_from, p_to);
  select (now() at time zone o.timezone)::date into v_today from public.organizations o where o.id = p_org;
  return jsonb_build_object(
    'equipment_total', (select count(*) from public.equipment e where e.organization_id = p_org and e.branch_id = any (v_branches)
                          and e.deleted_at is null and e.status <> 'retired'),
    'by_category', coalesce((select jsonb_agg(jsonb_build_object('code', c.code, 'name', c.name, 'count', n) order by c.position)
                              from (select e.category_code, count(*) n from public.equipment e
                                     where e.organization_id = p_org and e.branch_id = any (v_branches) and e.deleted_at is null and e.status <> 'retired'
                                     group by 1) x join public.equipment_categories c on c.code = x.category_code), '[]'::jsonb),
    'records', (select count(*) from public.equipment_maintenance_records m where m.organization_id = p_org and m.branch_id = any (v_branches)
                  and m.voided_at is null and m.performed_on between p_from and p_to),
    'records_non_compliant', (select count(*) from public.equipment_maintenance_records m where m.organization_id = p_org and m.branch_id = any (v_branches)
                  and m.voided_at is null and m.performed_on between p_from and p_to and m.result = 'non_compliant'),
    'by_action', coalesce((select jsonb_agg(jsonb_build_object('name', a.name, 'count', n) order by n desc)
                            from (select m.action_type_id, count(*) n from public.equipment_maintenance_records m
                                   where m.organization_id = p_org and m.branch_id = any (v_branches) and m.voided_at is null
                                     and m.performed_on between p_from and p_to group by 1) x
                            join public.maintenance_action_types a on a.id = x.action_type_id), '[]'::jsonb),
    'overdue', (select count(*) from public.equipment e where e.organization_id = p_org and e.branch_id = any (v_branches)
                  and e.deleted_at is null and e.status = 'in_service' and e.next_action_on < v_today),
    'due_30d', (select count(*) from public.equipment e where e.organization_id = p_org and e.branch_id = any (v_branches)
                  and e.deleted_at is null and e.status = 'in_service' and e.next_action_on between v_today and v_today + 30),
    'incidents_opened', (select count(*) from public.equipment_incidents x where x.organization_id = p_org and x.branch_id = any (v_branches)
                           and x.detected_on between p_from and p_to),
    'incidents_open', (select count(*) from public.equipment_incidents x where x.organization_id = p_org and x.branch_id = any (v_branches)
                         and x.status in ('open', 'in_progress')),
    'work_orders_completed', (select count(*) from public.work_orders w where w.organization_id = p_org and w.branch_id = any (v_branches)
                                and w.status = 'completed' and (w.completed_at at time zone 'Europe/Madrid')::date between p_from and p_to),
    'technicians', coalesce((
      select jsonb_agg(jsonb_build_object('name', t.full_name, 'records', t.records, 'work_orders', t.orders) order by t.records desc, t.full_name)
        from (select tt.full_name,
                     (select count(*) from public.equipment_maintenance_records m where m.technician_id = tt.id and m.voided_at is null
                        and m.branch_id = any (v_branches) and m.performed_on between p_from and p_to) as records,
                     (select count(*) from public.work_orders w where w.technician_id = tt.id and w.status = 'completed'
                        and w.branch_id = any (v_branches) and (w.completed_at at time zone 'Europe/Madrid')::date between p_from and p_to) as orders
                from public.technicians tt where tt.organization_id = p_org) t
       where t.records > 0 or t.orders > 0), '[]'::jsonb)
  );
end;
$$;

-- Actuaciones previstas o vencidas hasta una fecha (una fila por equipo y operación).
create function app.pci_report_due(p_org uuid, p_until date, p_branch uuid default null, p_limit integer default 50, p_offset integer default 0)
returns table (equipment_id uuid, code text, category text, location text, installation_id uuid, installation text,
               customer text, action text, next_due_on date, overdue boolean, total bigint)
language plpgsql
stable
set search_path = ''
as $$
declare
  v_branches uuid[] := app.report_branches(p_org, p_branch);
  v_today date;
begin
  select (now() at time zone o.timezone)::date into v_today from public.organizations o where o.id = p_org;
  return query
  select e.id, e.code, c.name, e.location, i.id, i.name, cu.first_name || coalesce(' ' || nullif(cu.last_name, ''), ''),
         a.name, s.next_due_on, s.next_due_on < v_today, count(*) over ()
    from public.equipment_action_schedules s
    join public.equipment e on e.id = s.equipment_id and e.deleted_at is null and e.status = 'in_service'
    join public.equipment_categories c on c.code = e.category_code
    join public.installations i on i.id = e.installation_id and i.deleted_at is null
    join public.customers cu on cu.id = i.customer_id
    join public.maintenance_action_types a on a.id = s.action_type_id
   where s.organization_id = p_org and s.branch_id = any (v_branches) and s.next_due_on <= p_until
   order by s.next_due_on, i.name, e.code
   limit least(greatest(coalesce(p_limit, 50), 1), 5000) offset greatest(coalesce(p_offset, 0), 0);
end;
$$;

-- Mantenimientos realizados en el periodo.
create function app.pci_report_records(p_org uuid, p_from date, p_to date, p_branch uuid default null, p_limit integer default 50, p_offset integer default 0)
returns table (record_id uuid, performed_on date, equipment_id uuid, code text, category text, installation text, customer text,
               action text, result text, technician text, work_order text, total bigint)
language plpgsql
stable
set search_path = ''
as $$
declare
  v_branches uuid[] := app.report_branches(p_org, p_branch);
begin
  perform app.report_check_range(p_from, p_to);
  return query
  select m.id, m.performed_on, e.id, e.code, c.name, i.name, cu.first_name || coalesce(' ' || nullif(cu.last_name, ''), ''),
         a.name, m.result, t.full_name, w.number, count(*) over ()
    from public.equipment_maintenance_records m
    join public.equipment e on e.id = m.equipment_id
    join public.equipment_categories c on c.code = e.category_code
    join public.installations i on i.id = m.installation_id
    left join public.customers cu on cu.id = m.customer_id
    join public.maintenance_action_types a on a.id = m.action_type_id
    left join public.technicians t on t.id = m.technician_id
    left join public.work_orders w on w.id = m.work_order_id
   where m.organization_id = p_org and m.branch_id = any (v_branches) and m.voided_at is null
     and m.performed_on between p_from and p_to
   order by m.performed_on desc, m.created_at desc
   limit least(greatest(coalesce(p_limit, 50), 1), 5000) offset greatest(coalesce(p_offset, 0), 0);
end;
$$;

-- Instalaciones con sus equipos y lo pendiente.
create function app.pci_report_installations(p_org uuid, p_until date, p_branch uuid default null, p_limit integer default 50, p_offset integer default 0)
returns table (installation_id uuid, installation text, customer text, city text, equipment bigint, extinguishers bigint,
               overdue bigint, due bigint, next_due_on date, open_incidents bigint, total bigint)
language plpgsql
stable
set search_path = ''
as $$
declare
  v_branches uuid[] := app.report_branches(p_org, p_branch);
  v_today date;
begin
  select (now() at time zone o.timezone)::date into v_today from public.organizations o where o.id = p_org;
  return query
  select i.id, i.name, cu.first_name || coalesce(' ' || nullif(cu.last_name, ''), ''), i.city,
         count(e.id), count(e.id) filter (where e.category_code = 'extinguisher'),
         count(e.id) filter (where e.next_action_on < v_today),
         count(e.id) filter (where e.next_action_on between v_today and p_until),
         min(e.next_action_on),
         (select count(*) from public.equipment_incidents x where x.installation_id = i.id and x.status in ('open', 'in_progress')),
         count(*) over ()
    from public.installations i
    join public.customers cu on cu.id = i.customer_id
    left join public.equipment e on e.installation_id = i.id and e.deleted_at is null and e.status = 'in_service'
   where i.organization_id = p_org and i.branch_id = any (v_branches) and i.deleted_at is null
   group by i.id, cu.first_name, cu.last_name
   order by min(e.next_action_on) nulls last, i.name
   limit least(greatest(coalesce(p_limit, 50), 1), 5000) offset greatest(coalesce(p_offset, 0), 0);
end;
$$;

-- Incidencias del periodo.
create function app.pci_report_incidents(p_org uuid, p_from date, p_to date, p_branch uuid default null, p_limit integer default 50, p_offset integer default 0)
returns table (incident_id uuid, detected_on date, severity text, status text, title text, installation text, equipment text,
               resolved_on date, total bigint)
language plpgsql
stable
set search_path = ''
as $$
declare
  v_branches uuid[] := app.report_branches(p_org, p_branch);
begin
  perform app.report_check_range(p_from, p_to);
  return query
  select x.id, x.detected_on, x.severity, x.status, x.title, i.name, e.code, x.resolved_on, count(*) over ()
    from public.equipment_incidents x
    join public.installations i on i.id = x.installation_id
    left join public.equipment e on e.id = x.equipment_id
   where x.organization_id = p_org and x.branch_id = any (v_branches) and x.detected_on between p_from and p_to
   order by x.detected_on desc, x.created_at desc
   limit least(greatest(coalesce(p_limit, 50), 1), 5000) offset greatest(coalesce(p_offset, 0), 0);
end;
$$;

revoke all on function app.pci_report_summary(uuid, date, date, uuid),
  app.pci_report_due(uuid, date, uuid, integer, integer),
  app.pci_report_records(uuid, date, date, uuid, integer, integer),
  app.pci_report_installations(uuid, date, uuid, integer, integer),
  app.pci_report_incidents(uuid, date, date, uuid, integer, integer) from public, anon;
grant execute on function app.pci_report_summary(uuid, date, date, uuid),
  app.pci_report_due(uuid, date, uuid, integer, integer),
  app.pci_report_records(uuid, date, date, uuid, integer, integer),
  app.pci_report_installations(uuid, date, uuid, integer, integer),
  app.pci_report_incidents(uuid, date, date, uuid, integer, integer) to authenticated;

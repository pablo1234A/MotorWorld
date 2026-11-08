-- PCI: un técnico con «work_orders.execute» registra los resultados de SUS
-- órdenes (asignadas a él y abiertas) aunque no tenga «maintenance.write».
-- Antes la actuación exigía siempre maintenance.write y el técnico solo
-- ejecutor recibía «permiso denegado». No cambia nada para los demás perfiles.

drop policy equipment_records_insert on public.equipment_maintenance_records;
create policy equipment_records_insert on public.equipment_maintenance_records for insert to authenticated
  with check (
    organization_id in (select app.member_orgs())
    and (work_order_id is null or work_order_id in (select id from public.work_orders))
    and (
      branch_id in (select app.branches_with_permission('maintenance.write', true))
      or (work_order_id is not null
          and branch_id in (select app.branches_with_permission('work_orders.execute', true))
          and work_order_id in (select w.id from public.work_orders w
                                 where w.technician_id in (select app.my_technician_ids())
                                   and w.status = 'in_progress'))
    )
  );

drop policy equipment_record_materials_insert on public.equipment_record_materials;
create policy equipment_record_materials_insert on public.equipment_record_materials for insert to authenticated
  with check (
    organization_id in (select app.member_orgs())
    and (
      branch_id in (select app.branches_with_permission('maintenance.write', true))
      or (branch_id in (select app.branches_with_permission('work_orders.execute', true))
          and record_id in (select m.id from public.equipment_maintenance_records m
                             join public.work_orders w on w.id = m.work_order_id
                            where w.technician_id in (select app.my_technician_ids())
                              and w.status = 'in_progress'))
    )
  );

-- PCI: aislamiento entre empresas, coherencia instalación ↔ equipo ↔ orden,
-- permisos de técnicos, límites, historial inalterable, vencimientos y avisos.
begin;
set search_path = extensions, public;
select plan(35);

-- Datos: dos empresas mantenedoras.
select tests.set_id('ua', tests.create_user('pci-a@test.test'));
select tests.set_id('org_a', tests.create_org(tests.id('ua'), 'pci-a', 'max'));
select tests.set_id('br_a', tests.primary_branch(tests.id('org_a')));
select tests.set_id('ub', tests.create_user('pci-b@test.test'));
select tests.set_id('org_b', tests.create_org(tests.id('ub'), 'pci-b', 'max'));
select tests.set_id('br_b', tests.primary_branch(tests.id('org_b')));

create function tests.pci_installation(p_org uuid, p_branch uuid, p_name text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_c uuid; v_i uuid;
begin
  insert into public.customers (organization_id, branch_id, first_name, email, customer_kind, legal_name, tax_id)
  values (p_org, p_branch, p_name, lower(replace(p_name, ' ', '')) || '@cliente.test', 'company', p_name || ' SL', 'B12345674') returning id into v_c;
  insert into public.installations (organization_id, branch_id, customer_id, name, address_line1, city)
  values (p_org, p_branch, v_c, p_name || ' · Nave 1', 'Polígono Sur 4', 'Sevilla') returning id into v_i;
  return v_i;
end; $$;
create function tests.pci_extinguisher(p_org uuid, p_branch uuid, p_inst uuid, p_stamped date)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_e uuid;
begin
  insert into public.equipment (organization_id, branch_id, installation_id, category_code, type_id, code, installed_on)
  values (p_org, p_branch, p_inst, 'extinguisher',
          (select id from public.equipment_types where organization_id is null and code = 'powder_abc'), '', p_stamped) returning id into v_e;
  insert into public.equipment_extinguishers (equipment_id, organization_id, branch_id, agent, charge_value, charge_unit, efficacy, stamped_on, put_in_service_on)
  values (v_e, p_org, p_branch, 'powder_abc', 6, 'kg', '27A-183B-C', p_stamped, p_stamped);
  return v_e;
end; $$;
create function tests.action(p_code text) returns uuid language sql stable as $$
  select id from public.maintenance_action_types where organization_id is null and code = p_code $$;

select tests.set_id('inst_a', tests.pci_installation(tests.id('org_a'), tests.id('br_a'), 'Hotel Sol'));
select tests.set_id('inst_a2', tests.pci_installation(tests.id('org_a'), tests.id('br_a'), 'Almacenes Luna'));
select tests.set_id('inst_b', tests.pci_installation(tests.id('org_b'), tests.id('br_b'), 'Fábrica Norte'));
select tests.set_id('ext_a', tests.pci_extinguisher(tests.id('org_a'), tests.id('br_a'), tests.id('inst_a'), date '2024-01-15'));
select tests.set_id('ext_a2', tests.pci_extinguisher(tests.id('org_a'), tests.id('br_a'), tests.id('inst_a2'), date '2024-01-15'));
select tests.set_id('ext_b', tests.pci_extinguisher(tests.id('org_b'), tests.id('br_b'), tests.id('inst_b'), date '2024-01-15'));

-- ------------------------------------------------------------- integridad
select matches((select code from equipment where id = tests.id('ext_a')), '^EXT-[0-9]{6}$', 'Código automático por categoría');
select matches((select qr_token from equipment where id = tests.id('ext_a')), '^[a-f0-9]{64}$', 'QR con identificador aleatorio de 64 caracteres');
select throws_ok($$ insert into equipment (organization_id, branch_id, installation_id, category_code, code)
                    values (tests.id('org_a'), tests.id('br_a'), tests.id('inst_b'), 'bie', 'X1') $$,
  '23503', null, 'Un equipo no puede pertenecer a una instalación de otra empresa');
select throws_ok($$ insert into equipment (organization_id, branch_id, installation_id, category_code, type_id, code)
                    values (tests.id('org_a'), tests.id('br_a'), tests.id('inst_a'), 'bie',
                            (select id from equipment_types where code = 'co2' and organization_id is null), 'X2') $$,
  '23514', 'equipment_type_mismatch', 'El tipo tiene que ser de la categoría del equipo');
select throws_ok($$ insert into installations (organization_id, branch_id, customer_id, name, address_line1)
                    values (tests.id('org_a'), tests.id('br_a'), (select customer_id from installations where id = tests.id('inst_b')), 'Ajena', 'x') $$,
  '23503', null, 'Una instalación no puede colgar de un cliente de otra empresa');

-- --------------------------------------------------------- vencimientos
select is((select next_due_on from equipment_action_schedules where equipment_id = tests.id('ext_a') and action_type_id = tests.action('ext_annual')),
  date '2025-01-15', 'Mantenimiento anual: un año desde la puesta en servicio');
select is((select next_due_on from equipment_action_schedules where equipment_id = tests.id('ext_a') and action_type_id = tests.action('ext_retimbrado')),
  date '2029-01-15', 'Retimbrado: cinco años desde la fecha de timbrado');
select is((select count(*) from equipment_action_schedules where equipment_id = tests.id('ext_a') and action_type_id = tests.action('ext_quarterly')),
  0::bigint, 'La verificación trimestral (puede hacerla el titular) viene desactivada por defecto');
insert into equipment_maintenance_records (organization_id, branch_id, equipment_id, installation_id, action_type_id, performed_on, result)
values (tests.id('org_a'), tests.id('br_a'), tests.id('ext_a'), tests.id('inst_a'), tests.action('ext_annual'), date '2025-02-01', 'compliant');
select is((select next_action_on from equipment where id = tests.id('ext_a')), date '2026-02-01', 'Tras la actuación anual, la próxima es dentro de un año');
update equipment_extinguishers set retimbrados_before = 3 where equipment_id = tests.id('ext_a2');
select is((select next_due_on from equipment_action_schedules where equipment_id = tests.id('ext_a2') and action_type_id = tests.action('ext_retimbrado')),
  null::date, 'Con tres retimbrados hechos no se programa otro');
insert into org_action_type_settings (organization_id, action_type_id, enabled) values (tests.id('org_a'), tests.action('ext_quarterly'), true);
select is((select next_due_on from equipment_action_schedules where equipment_id = tests.id('ext_a') and action_type_id = tests.action('ext_quarterly')),
  date '2024-04-15', 'Si el taller activa la verificación trimestral, se calcula');

-- ----------------------------------------------------- historial inalterable
select tests.set_id('rec_a', (select id from equipment_maintenance_records where equipment_id = tests.id('ext_a') limit 1));
select throws_ok($$ update equipment_maintenance_records set result = 'non_compliant' where id = tests.id('rec_a') $$,
  '23514', 'amendment_reason_required', 'Una actuación no se cambia sin motivo');
select lives_ok($$ update equipment_maintenance_records set observations = 'Manómetro sustituido', amendment_reason = 'Faltaba la observación' where id = tests.id('rec_a') $$,
  'Con motivo, la corrección queda registrada');
select isnt((select amended_at from equipment_maintenance_records where id = tests.id('rec_a')), null, 'La corrección queda fechada');
select throws_ok($$ update equipment_maintenance_records set equipment_id = tests.id('ext_a2') where id = tests.id('rec_a') $$,
  '23514', 'equipment_record_immutable', 'El equipo de una actuación no se puede cambiar');
select throws_ok($$ insert into equipment_maintenance_records (organization_id, branch_id, equipment_id, installation_id, action_type_id, performed_on, result)
                    values (tests.id('org_a'), tests.id('br_a'), tests.id('ext_a'), tests.id('inst_a'), tests.action('bie_annual'), current_date, 'compliant') $$,
  '23514', 'action_type_not_applicable', 'No se registra una operación de BIE sobre un extintor');

-- ------------------------------------------------------- órdenes de trabajo
insert into work_orders (organization_id, branch_id, customer_id, installation_id, service_type)
values (tests.id('org_a'), tests.id('br_a'), (select customer_id from installations where id = tests.id('inst_a')), tests.id('inst_a'), 'periodic_maintenance');
select tests.set_id('wo_a', (select id from work_orders where installation_id = tests.id('inst_a')));
select matches((select number from work_orders where id = tests.id('wo_a')), '^OT-[0-9]{4}-0001$', 'Numeración OT-AAAA-NNNN');
select throws_ok($$ insert into work_order_items (organization_id, branch_id, work_order_id, equipment_id, planned_action_type_id)
                    values (tests.id('org_a'), tests.id('br_a'), tests.id('wo_a'), tests.id('ext_a2'), tests.action('ext_annual')) $$,
  '23514', 'equipment_not_in_installation', 'Una orden no incluye equipos de otra instalación');
select throws_ok($$ insert into work_orders (organization_id, branch_id, customer_id, installation_id, service_type)
                    values (tests.id('org_a'), tests.id('br_a'), (select customer_id from installations where id = tests.id('inst_a2')), tests.id('inst_a'), 'other') $$,
  '23514', 'installation_customer_mismatch', 'La instalación de la orden es del cliente de la orden');
insert into work_order_items (organization_id, branch_id, work_order_id, equipment_id, planned_action_type_id)
values (tests.id('org_a'), tests.id('br_a'), tests.id('wo_a'), tests.id('ext_a'), tests.action('ext_annual'));
select throws_ok($$ update work_orders set status = 'completed' where id = tests.id('wo_a') $$,
  '23514', 'invalid_work_order_transition', 'No se completa una orden pendiente sin pasar por «en curso»');

-- Técnico: operario con «ejecutar órdenes», vinculado a su ficha de técnico.
select tests.set_id('u_tec', tests.create_user('tecnico@pci-a.test'));
select tests.set_id('m_tec', tests.add_member(tests.id('org_a'), tests.id('u_tec'), 'operator', array['work_orders.execute', 'maintenance.write']));
insert into technicians (organization_id, member_id, full_name) values (tests.id('org_a'), tests.id('m_tec'), 'Ana Técnica');
select tests.set_id('tec', (select id from technicians where member_id = tests.id('m_tec')));
insert into work_orders (organization_id, branch_id, customer_id, installation_id, service_type, status, technician_id)
values (tests.id('org_a'), tests.id('br_a'), (select customer_id from installations where id = tests.id('inst_a2')), tests.id('inst_a2'), 'inspection', 'assigned', tests.id('tec'));
select tests.set_id('wo_tec', (select id from work_orders where installation_id = tests.id('inst_a2')));

select tests.authenticate_as(tests.id('u_tec'));
select is((select count(*) from work_orders), 1::bigint, 'El técnico solo ve las órdenes asignadas a él');
select is((select count(*) from work_orders where id = tests.id('wo_a')), 0::bigint, 'Ni siquiera buscando otra orden por su id');
select lives_ok($$ update work_orders set status = 'in_progress' where id = tests.id('wo_tec') $$, 'El técnico pone su orden en curso');
select throws_ok($$ update work_orders set scheduled_for = current_date + 3 where id = tests.id('wo_tec') $$,
  '42501', null, 'El técnico no reprograma ni reasigna');
select is((select count(*) from installations), 2::bigint, 'Ve las instalaciones de su sucursal (lectura)');
select throws_ok($$ insert into equipment (organization_id, branch_id, installation_id, category_code, code)
                    values (tests.id('org_a'), tests.id('br_a'), tests.id('inst_a'), 'bie', 'BIE-T1') $$,
  '42501', null, 'Sin «crear y editar equipos» no da de alta equipos');
select lives_ok($$ insert into equipment_maintenance_records (organization_id, branch_id, equipment_id, installation_id, work_order_id, action_type_id, performed_on, result)
                   values (tests.id('org_a'), tests.id('br_a'), tests.id('ext_a2'), tests.id('inst_a2'), tests.id('wo_tec'), tests.action('ext_annual'), current_date, 'compliant') $$,
  'Registra la actuación de su orden');
select throws_ok($$ insert into equipment_maintenance_records (organization_id, branch_id, equipment_id, installation_id, work_order_id, action_type_id, performed_on, result)
                    values (tests.id('org_a'), tests.id('br_a'), tests.id('ext_a'), tests.id('inst_a'), tests.id('wo_a'), tests.action('ext_annual'), current_date, 'compliant') $$,
  '42501', null, 'No puede registrar actuaciones en una orden que no es suya');
select tests.clear_authentication();

-- ---------------------------------------------------- aislamiento entre empresas
select tests.authenticate_as(tests.id('ub'));
select is((select count(*) from equipment where organization_id = tests.id('org_a')), 0::bigint, 'Otra empresa no ve los equipos');
select is((select count(*) from equipment_maintenance_records where organization_id = tests.id('org_a')), 0::bigint, 'Ni su historial');
select is((select count(*) from work_orders where organization_id = tests.id('org_a')), 0::bigint, 'Ni sus órdenes');
select is((select count(*) from equipment where qr_token = (select qr_token from equipment e2 where e2.id = tests.id('ext_b'))), 1::bigint,
  'Su propio QR sí lo resuelve');
select tests.clear_authentication();

-- --------------------------------------------------------------- límites (Pro: 300)
update subscriptions set plan_code = 'pro' where organization_id = tests.id('org_b');
select throws_ok($$ insert into equipment (organization_id, branch_id, installation_id, category_code, code)
                    select tests.id('org_b'), tests.id('br_b'), tests.id('inst_b'), 'other', 'O' || i from generate_series(1, 300) i $$,
  'RY001', 'plan_limit_reached', 'Pro: el equipo 301 se rechaza (ya había 1)');

-- ------------------------------------------------------------------- avisos
update branch_settings set reminders_enabled = true, offsets_days = '{30}' where branch_id = tests.id('br_a');
select tests.set_id('inst_a3', tests.pci_installation(tests.id('org_a'), tests.id('br_a'), 'Colegio Mar'));
select tests.set_id('ext_a3', tests.pci_extinguisher(tests.id('org_a'), tests.id('br_a'), tests.id('inst_a3'), current_date - 340));
select private.plan_reminders();
select is((select count(*) from reminders where installation_id = tests.id('inst_a3') and type = 'installation_due' and status = 'scheduled'), 1::bigint,
  'El planificador crea UN aviso para la instalación con mantenimiento próximo');
select private.plan_reminders();
select is((select count(*) from reminders where installation_id = tests.id('inst_a3') and type = 'installation_due'), 1::bigint,
  'Volver a planificar no duplica el aviso');

select * from finish();
rollback;

-- PCI: técnico «solo ejecutor» (migración 900), fotos en el bucket privado
-- (migración 1000) e importaciones por tipo (migración 800).
begin;
set search_path = extensions, public;
select plan(9);

select tests.set_id('u', tests.create_user('pci-jefe@t170.test'));
select tests.set_id('org', tests.create_org(tests.id('u'), 'pci-t170', 'business'));
select tests.set_id('br', tests.primary_branch(tests.id('org')));
insert into customers (organization_id, branch_id, first_name) values (tests.id('org'), tests.id('br'), 'Cliente T170');
select tests.set_id('cust', (select id from customers where organization_id = tests.id('org')));
insert into installations (organization_id, branch_id, customer_id, name, address_line1) values (tests.id('org'), tests.id('br'), tests.id('cust'), 'Nave', 'Calle 1');
select tests.set_id('inst', (select id from installations where organization_id = tests.id('org')));
insert into equipment (organization_id, branch_id, installation_id, category_code, code, installed_on) values (tests.id('org'), tests.id('br'), tests.id('inst'), 'bie', '', current_date - 300);
select tests.set_id('eq', (select id from equipment where organization_id = tests.id('org')));
select tests.set_id('act', (select id from maintenance_action_types where organization_id is null and code = 'bie_annual'));

-- Técnico sin «maintenance.write»: solo ejecuta sus órdenes.
select tests.set_id('ut', tests.create_user('pci-tec@t170.test'));
select tests.set_id('mt', tests.add_member(tests.id('org'), tests.id('ut'), 'operator', array['work_orders.execute']));
insert into technicians (organization_id, member_id, full_name) values (tests.id('org'), tests.id('mt'), 'Solo Ejecuta');
select tests.set_id('tec', (select id from technicians where member_id = tests.id('mt')));
insert into work_orders (organization_id, branch_id, customer_id, installation_id, service_type, status, technician_id)
values (tests.id('org'), tests.id('br'), tests.id('cust'), tests.id('inst'), 'periodic_maintenance', 'assigned', tests.id('tec'));
select tests.set_id('wo', (select id from work_orders where organization_id = tests.id('org')));

-- Una actuación registrada por la empresa fuera de cualquier orden.
insert into equipment_maintenance_records (organization_id, branch_id, equipment_id, installation_id, action_type_id, performed_on, result)
values (tests.id('org'), tests.id('br'), tests.id('eq'), tests.id('inst'), tests.id('act'), current_date - 1, 'compliant');
select tests.set_id('rec_free', (select id from equipment_maintenance_records where organization_id = tests.id('org') and work_order_id is null));

select tests.authenticate_as(tests.id('ut'));
select throws_ok($$ insert into equipment_maintenance_records (organization_id, branch_id, equipment_id, installation_id, work_order_id, action_type_id, performed_on, result)
                    values (tests.id('org'), tests.id('br'), tests.id('eq'), tests.id('inst'), tests.id('wo'), tests.id('act'), current_date, 'compliant') $$,
  '42501', null, 'Con la orden aún asignada (no en curso) no registra actuaciones');
select lives_ok($$ update work_orders set status = 'in_progress' where id = tests.id('wo') $$, 'Pone su orden en curso');
select lives_ok($$ insert into equipment_maintenance_records (organization_id, branch_id, equipment_id, installation_id, work_order_id, action_type_id, performed_on, result)
                   values (tests.id('org'), tests.id('br'), tests.id('eq'), tests.id('inst'), tests.id('wo'), tests.id('act'), current_date, 'compliant') $$,
  'Registra la actuación de su orden en curso sin permiso general de actuaciones');
select lives_ok($$ insert into equipment_record_materials (organization_id, branch_id, record_id, description, quantity)
                   values (tests.id('org'), tests.id('br'), (select id from equipment_maintenance_records where work_order_id = tests.id('wo')), 'Manguera', 1) $$,
  'Y sus materiales');
select throws_ok($$ insert into equipment_maintenance_records (organization_id, branch_id, equipment_id, installation_id, action_type_id, performed_on, result)
                    values (tests.id('org'), tests.id('br'), tests.id('eq'), tests.id('inst'), tests.id('act'), current_date, 'compliant') $$,
  '42501', null, 'Fuera de una orden no registra actuaciones');
select throws_ok($$ insert into equipment_record_materials (organization_id, branch_id, record_id, description, quantity)
                    values (tests.id('org'), tests.id('br'), tests.id('rec_free'), 'Ajeno', 1) $$,
  '42501', null, 'Ni añade materiales a actuaciones que no son de sus órdenes');
select tests.clear_authentication();

-- Almacenamiento y lotes.
select ok((select 'image/png' = any (allowed_mime_types) and 'image/jpeg' = any (allowed_mime_types) and 'application/pdf' = any (allowed_mime_types)
             from storage.buckets where id = 'documents'), 'El bucket privado admite fotos y PDF');
select is((select public from storage.buckets where id = 'documents'), false, 'Y sigue siendo privado');
select is((select column_default from information_schema.columns where table_schema = 'public' and table_name = 'import_batches' and column_name = 'kind'),
  '''vehicles''::text', 'Los lotes existentes quedan como importaciones de vehículos');

select * from finish();
rollback;

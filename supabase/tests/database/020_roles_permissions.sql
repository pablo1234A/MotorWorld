-- CASO CRÍTICO 2: un operario no puede realizar acciones de administrador, y
-- cada permiso se comprueba en la base de datos (no solo ocultando botones).
begin;
set search_path = extensions, public;
select plan(27);

select tests.set_id('owner', tests.create_user('duena@taller.test'));
select tests.set_id('op_rw', tests.create_user('operario@taller.test'));
select tests.set_id('op_ro', tests.create_user('consulta@taller.test'));
select tests.set_id('org', tests.create_org(tests.id('owner'), 'taller-roles', 'max'));
select tests.set_id('br', tests.primary_branch(tests.id('org')));
select tests.set_id('m_rw', tests.add_member(tests.id('org'), tests.id('op_rw'), 'operator',
  array['customers.write', 'vehicles.write', 'maintenance.write']));
select tests.set_id('m_ro', tests.add_member(tests.id('org'), tests.id('op_ro'), 'operator'));
select tests.set_id('cust', tests.add_customer(tests.id('org'), tests.id('br'), 'Laura'));
select tests.set_id('veh', tests.add_vehicle(tests.id('org'), tests.id('br'), tests.id('cust'), '1111BBB'));
insert into maintenance_records (organization_id, branch_id, vehicle_id, service_date, km, work_performed)
values (tests.id('org'), tests.id('br'), tests.id('veh'), date '2026-01-10', 60000, 'Aceite y filtros');
insert into reminders (organization_id, branch_id, customer_id, vehicle_id, type, due_date, offset_days, scheduled_for)
values (tests.id('org'), tests.id('br'), tests.id('cust'), tests.id('veh'), 'service_date', date '2027-01-10', 30, now());
insert into billing_invoices (organization_id, stripe_invoice_id, status, amount_due_cents)
values (tests.id('org'), 'in_roles1', 'paid', 7900);

-- ------------------------------------------------ operario de solo consulta
select tests.authenticate_as(tests.id('op_ro'));
select is((select count(*) from customers), 1::bigint, 'Consulta: ve los clientes de su taller');
select is((select count(*) from maintenance_records), 1::bigint, 'Consulta: ve el historial');
select throws_ok($$ insert into customers (organization_id, branch_id, first_name)
                    values (tests.id('org'), tests.id('br'), 'Nuevo') $$,
  '42501', null, 'Consulta: no puede crear clientes sin customers.write');
select throws_ok($$ insert into maintenance_records (organization_id, branch_id, vehicle_id, service_date, work_performed)
                    values (tests.id('org'), tests.id('br'), tests.id('veh'), current_date, 'x') $$,
  '42501', null, 'Consulta: no puede registrar revisiones sin maintenance.write');
select is((select count(*) from reminders), 0::bigint, 'Consulta: sin reminders.read no ve recordatorios');
select is((select count(*) from audit_logs), 0::bigint, 'Operario: no ve la auditoría');
select is((select count(*) from billing_invoices), 0::bigint, 'Operario: no ve la facturación');
select is((select count(*) from organization_members), 1::bigint, 'Operario: solo ve su propia membresía');
select throws_ok($$ insert into invitations (organization_id, email, role, token_hash)
                    values (tests.id('org'), 'otro@taller.test', 'admin', sha256('t')) $$,
  '42501', null, 'Operario: no puede invitar usuarios');
update organization_members set role = 'admin', permissions = '{}' where id = tests.id('m_ro');
update organizations set trade_name = 'Cambiado por operario' where id = tests.id('org');
update branch_settings set reminders_enabled = true where branch_id = tests.id('br');
select tests.clear_authentication();
select is((select role from organization_members where id = tests.id('m_ro')), 'operator',
  'Operario: no puede ascenderse a administrador');
select is((select trade_name from organizations where id = tests.id('org')), 'Taller Roles',
  'Operario: no puede cambiar los datos del taller');
select is((select reminders_enabled from branch_settings where branch_id = tests.id('br')), false,
  'Operario: no puede cambiar la configuración');

-- -------------------------------------------- operario con permisos de escritura
select tests.authenticate_as(tests.id('op_rw'));
select lives_ok($$ insert into customers (organization_id, branch_id, first_name)
                   values (tests.id('org'), tests.id('br'), 'Marta') $$,
  'Operario: crea clientes con customers.write');
select lives_ok($$ insert into maintenance_records (organization_id, branch_id, vehicle_id, service_date, km, work_performed)
                   values (tests.id('org'), tests.id('br'), tests.id('veh'), current_date, 70000, 'Frenos') $$,
  'Operario: registra revisiones con maintenance.write');
select lives_ok($$ update vehicles set current_km = 71000 where id = tests.id('veh') $$,
  'Operario: actualiza kilómetros con vehicles.write');
select throws_ok($$ update customers set deleted_at = now() where first_name = 'Marta' $$,
  '42501', 'permission_denied', 'Operario: no puede borrar clientes sin customers.delete');
delete from maintenance_records where vehicle_id = tests.id('veh');
select throws_ok($$ insert into api_keys (organization_id, name, prefix, key_hash, scopes)
                    values (tests.id('org'), 'k', 'ry_test_abcdefgh', sha256('k'), array['customers:read']) $$,
  '42501', null, 'Operario: no puede crear API keys');
select throws_ok($$ insert into email_templates (organization_id, kind, subject, body)
                    values (tests.id('org'), 'reminder_service_date', 'x', 'y') $$, '42501', null,
  'Operario: no puede crear ni editar plantillas de correo');
select tests.clear_authentication();
select is((select count(*) from maintenance_records where vehicle_id = tests.id('veh')), 2::bigint,
  'Operario: no puede borrar historial (solo administrador)');

-- -------------------------------------------------- administrador / propietario
select tests.authenticate_as(tests.id('owner'));
select is((select count(*) from organization_members), 3::bigint, 'Admin: ve todos los miembros');
select is((select count(*) from reminders), 1::bigint, 'Admin: ve los recordatorios');
select lives_ok($$ update branch_settings set reminders_enabled = true where branch_id = tests.id('br') $$,
  'Admin: cambia la configuración');
select lives_ok($$ update organization_members set permissions = array['customers.write', 'reports.read']
                   where id = tests.id('m_ro') $$, 'Admin: asigna permisos a un operario');
select throws_ok($$ update organization_members set role = 'operator', permissions = '{}' where user_id = tests.id('owner') $$,
  '42501', 'owner_protected', 'El propietario no puede ser degradado');
select throws_ok($$ delete from organization_members where user_id = tests.id('owner') $$,
  '42501', 'owner_protected', 'El propietario no puede ser eliminado');
select throws_ok($$ update customers set deleted_at = now() where id = tests.id('cust') $$,
  '23503', 'customer_has_vehicles', 'No se puede borrar un cliente con vehículos activos');
select lives_ok($$ update customers set deleted_at = now() where first_name = 'Marta' $$,
  'Admin: borra (lógicamente) un cliente sin vehículos');
select tests.clear_authentication();

select * from finish();
rollback;

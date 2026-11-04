-- CASO CRÍTICO 10: las sucursales permanecen aisladas.
begin;
set search_path = extensions, public;
select plan(12);

select tests.set_id('owner', tests.create_user('red@taller.test'));
select tests.set_id('op_n', tests.create_user('norte@taller.test'));
select tests.set_id('adm_s', tests.create_user('sur@taller.test'));
select tests.set_id('org', tests.create_org(tests.id('owner'), 'red-talleres', 'business'));
select tests.set_id('br_p', tests.primary_branch(tests.id('org')));
select tests.set_id('br_n', tests.add_branch(tests.id('org'), 'norte'));
select tests.set_id('br_s', tests.add_branch(tests.id('org'), 'sur'));
select tests.add_member(tests.id('org'), tests.id('op_n'), 'operator',
  array['customers.write', 'vehicles.write', 'reminders.read'], array[tests.id('br_n')]);
select tests.add_member(tests.id('org'), tests.id('adm_s'), 'admin', '{}', array[tests.id('br_s')]);
select tests.set_id('c_p', tests.add_customer(tests.id('org'), tests.id('br_p'), 'Centro'));
select tests.set_id('c_n', tests.add_customer(tests.id('org'), tests.id('br_n'), 'Norte'));
select tests.set_id('c_s', tests.add_customer(tests.id('org'), tests.id('br_s'), 'Sur'));
select tests.add_vehicle(tests.id('org'), tests.id('br_s'), tests.id('c_s'), '5555SSS');

-- Operario asignado a Norte
select tests.authenticate_as(tests.id('op_n'));
select results_eq($$ select first_name from customers $$, $$ values ('Norte') $$,
  'Operario de Norte solo ve clientes de Norte');
select is((select count(*) from vehicles), 0::bigint, 'Operario de Norte no ve vehículos de Sur');
select results_eq($$ select slug::text from branches $$, $$ values ('norte') $$,
  'Operario de Norte solo ve su sucursal');
select throws_ok($$ insert into customers (organization_id, branch_id, first_name)
                    values (tests.id('org'), tests.id('br_s'), 'Intruso') $$,
  '42501', null, 'Operario de Norte no puede crear clientes en Sur');
select throws_ok($$ update customers set branch_id = tests.id('br_s') where id = tests.id('c_n') $$,
  '42501', null, 'Un cliente no se puede mover de sucursal');
update customers set first_name = 'Cambiado' where id = tests.id('c_s');
select tests.clear_authentication();
select is((select first_name from customers where id = tests.id('c_s')), 'Sur', 'Norte no modifica clientes de Sur');

-- Administrador con alcance limitado a Sur
select tests.authenticate_as(tests.id('adm_s'));
select results_eq($$ select first_name from customers $$, $$ values ('Sur') $$,
  'Admin de Sur solo ve clientes de Sur');
select tests.clear_authentication();

-- Administrador general: vista conjunta
select tests.authenticate_as(tests.id('owner'));
select is((select count(*) from customers), 3::bigint, 'El administrador general ve las tres sucursales');
select is((select count(distinct branch_id) from customers), 3::bigint, 'Los registros siguen separados por sucursal');
select tests.clear_authentication();

-- Integridad entre sucursales (incluso para el sistema)
select throws_ok($$ insert into vehicles (organization_id, branch_id, customer_id, plate)
                    values (tests.id('org'), tests.id('br_n'), tests.id('c_s'), '7777NNN') $$,
  '23503', null, 'Un vehículo de Norte no puede pertenecer a un cliente de Sur');
select lives_ok($$ select tests.add_vehicle(tests.id('org'), tests.id('br_n'), tests.id('c_n'), '5555SSS') $$,
  'La misma matrícula puede existir en dos sucursales (P2: única por sucursal)');
select throws_ok($$ select tests.add_vehicle(tests.id('org'), tests.id('br_s'), tests.id('c_s'), '5555 sss') $$,
  '23505', null, 'Matrícula duplicada en la misma sucursal rechazada');

select * from finish();
rollback;

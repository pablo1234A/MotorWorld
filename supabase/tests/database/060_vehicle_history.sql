-- CASO CRÍTICO 9: los vehículos mantienen su historial. La ficha del vehículo
-- se mantiene coherente con su historial.
begin;
set search_path = extensions, public;
select plan(15);

select tests.set_id('owner', tests.create_user('historial@taller.test'));
select tests.set_id('org', tests.create_org(tests.id('owner'), 'taller-historial', 'pro'));
select tests.set_id('br', tests.primary_branch(tests.id('org')));
select tests.set_id('c1', tests.add_customer(tests.id('org'), tests.id('br'), 'Laura'));
select tests.set_id('c2', tests.add_customer(tests.id('org'), tests.id('br'), 'Andres'));
select tests.set_id('veh', tests.add_vehicle(tests.id('org'), tests.id('br'), tests.id('c1'), '1234ABC'));

insert into maintenance_records (organization_id, branch_id, vehicle_id, service_date, km, work_performed)
values (tests.id('org'), tests.id('br'), tests.id('veh'), date '2025-03-15', 82000, 'Revisión anual');

select results_eq(
  $$ select last_service_date, last_service_km, next_service_date, next_service_km, current_km
       from vehicles where id = tests.id('veh') $$,
  $$ values (date '2025-03-15', 82000, date '2026-03-15', 97000, 82000) $$,
  'La revisión fija la última revisión y calcula la próxima (12 meses / 15.000 km por defecto)');
select is((select count(*) from mileage_readings where vehicle_id = tests.id('veh')), 1::bigint,
  'La revisión registra una lectura de kilometraje');

insert into maintenance_records (organization_id, branch_id, vehicle_id, service_date, km, work_performed,
                                 next_recommended_date, next_recommended_km)
values (tests.id('org'), tests.id('br'), tests.id('veh'), date '2026-03-10', 96500, 'Revisión + frenos',
        date '2027-03-10', 110000);
select results_eq(
  $$ select last_service_date, next_service_date, next_service_km from vehicles where id = tests.id('veh') $$,
  $$ values (date '2026-03-10', date '2027-03-10', 110000) $$,
  'La próxima revisión recomendada en el registro prevalece');

insert into maintenance_records (organization_id, branch_id, vehicle_id, service_date, km, work_performed)
values (tests.id('org'), tests.id('br'), tests.id('veh'), date '2024-03-01', 65000, 'Revisión antigua');
select is((select last_service_date from vehicles where id = tests.id('veh')), date '2026-03-10',
  'Registrar una revisión antigua no altera la última revisión');

update vehicles set customer_id = tests.id('c2') where id = tests.id('veh');
select is((select count(*) from maintenance_records where vehicle_id = tests.id('veh')), 3::bigint,
  'Cambiar de propietario conserva todo el historial');
select is((select count(*) from maintenance_records where vehicle_id = tests.id('veh') and customer_id_snapshot = tests.id('c1')),
  3::bigint, 'El historial recuerda quién era el propietario en cada revisión');

delete from maintenance_records where vehicle_id = tests.id('veh') and service_date = date '2026-03-10';
select is((select last_service_date from vehicles where id = tests.id('veh')), date '2025-03-15',
  'Al borrar la revisión más reciente se recalcula la ficha');

update vehicles set next_service_date = date '2026-06-01', next_service_source = 'manual' where id = tests.id('veh');
select is((select next_service_date from vehicles where id = tests.id('veh')), date '2026-06-01',
  'La próxima revisión se puede fijar manualmente');

select throws_ok($$ insert into maintenance_records (organization_id, branch_id, vehicle_id, service_date, work_performed)
                    values (tests.id('org'), tests.id('br'), tests.id('veh'), current_date + 10, 'Futuro') $$,
  '23514', 'service_date_in_future', 'No se aceptan revisiones con fecha futura');
select throws_ok($$ insert into maintenance_records (organization_id, branch_id, vehicle_id, service_date, work_performed,
                                                     next_recommended_date)
                    values (tests.id('org'), tests.id('br'), tests.id('veh'), date '2025-05-01', 'x', date '2025-04-01') $$,
  '23514', null, 'La próxima revisión recomendada debe ser posterior');
select throws_ok($$ update vehicles set current_km = -5 where id = tests.id('veh') $$,
  '23514', null, 'Kilómetros negativos rechazados');

-- Borrado seguro
select throws_ok($$ update customers set deleted_at = now() where id = tests.id('c2') $$,
  '23503', 'customer_has_vehicles', 'Un cliente con vehículos activos no se puede borrar');
update vehicles set deleted_at = now() where id = tests.id('veh');
select lives_ok($$ update customers set deleted_at = now() where id = tests.id('c2') $$,
  'Tras borrar sus vehículos, el cliente sí se puede borrar');
select is((select count(*) from maintenance_records where vehicle_id = tests.id('veh')), 2::bigint,
  'El borrado lógico no destruye el historial');
select throws_ok($$ update vehicles set deleted_at = null, customer_id = tests.id('c2') where id = tests.id('veh') $$,
  '23503', 'customer_deleted', 'No se puede asignar un vehículo a un cliente borrado');

select * from finish();
rollback;

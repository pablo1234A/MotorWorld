-- Motor de recordatorios: planificador, momento de envío, reclamación y recuperación.
-- "Ahora" fijo: miércoles 2026-11-04 09:00 en Madrid (08:00 UTC). Ventana 09–19, lunes a viernes.
begin;
set search_path = extensions, public;
select plan(29);

select set_config('tests.now', '2026-11-04 08:00:00+00', true);
create function pg_temp.now_() returns timestamptz language sql as $$ select current_setting('tests.now')::timestamptz $$;

select tests.set_id('u', tests.create_user('motor@taller.test'));
select tests.set_id('org', tests.create_org(tests.id('u'), 'motor-' || substr(md5(random()::text), 1, 8), 'pro'));
select tests.set_id('br', tests.primary_branch(tests.id('org')));
update branch_settings set reminders_enabled = true, offsets_days = '{30,7}' where branch_id = tests.id('br');

create function pg_temp.vehicle(p_plate text, p_due date) returns uuid language plpgsql as $$
declare v uuid;
begin
  v := tests.add_vehicle(tests.id('org'), tests.id('br'), tests.add_customer(tests.id('org'), tests.id('br'), 'C' || p_plate), p_plate);
  update vehicles set next_service_date = p_due, next_service_source = 'manual' where id = v;
  return v;
end $$;

select tests.set_id('v30', pg_temp.vehicle('3000BBB', date '2026-12-04'));   -- aviso de 30 días: hoy
select tests.set_id('v7', pg_temp.vehicle('7000BBB', date '2026-11-11'));    -- aviso de 7 días: hoy (el de 30 ya pasó)
select tests.set_id('v17', pg_temp.vehicle('1700BBB', date '2026-11-21'));   -- el de 30 pasó y el de 7 queda lejos: recuperación
select tests.set_id('v5', pg_temp.vehicle('0500BBB', date '2026-11-09'));    -- ambos pasaron: se recupera el de 7
select tests.set_id('vfar', pg_temp.vehicle('9000BBB', date '2027-06-01'));  -- lejos: nada
select tests.set_id('vpast', pg_temp.vehicle('8000BBB', date '2026-10-01')); -- revisión ya vencida: nada
select tests.set_id('vsold', pg_temp.vehicle('6000BBB', date '2026-12-04'));
update vehicles set status = 'sold' where id = tests.id('vsold');

-- ------------------------------------------------------------ momento de envío
select is(private.next_send_slot(tests.id('br'), date '2026-11-04', date '2026-12-04', pg_temp.now_()), pg_temp.now_(),
  'Día de envío dentro de la ventana: ahora');
select is(private.next_send_slot(tests.id('br'), date '2026-11-04', date '2026-12-04', timestamptz '2026-11-04 06:00:00+00'),
  timestamptz '2026-11-04 08:00:00+00', 'Antes de la ventana: a las 09:00 hora de Madrid');
select is(private.next_send_slot(tests.id('br'), date '2026-11-04', date '2026-12-04', timestamptz '2026-11-04 18:30:00+00'),
  timestamptz '2026-11-05 08:00:00+00', 'Después de la ventana: al día siguiente a las 09:00');
select is(private.next_send_slot(tests.id('br'), date '2026-11-08', date '2026-11-15', pg_temp.now_()),
  timestamptz '2026-11-06 08:00:00+00', 'Domingo: se adelanta al viernes anterior (nunca después)');
insert into blackout_dates (branch_id, organization_id, day, reason) values (tests.id('br'), tests.id('org'), date '2026-11-06', 'Fiesta local');
select is(private.next_send_slot(tests.id('br'), date '2026-11-08', date '2026-11-15', timestamptz '2026-11-04 20:00:00+00'),
  timestamptz '2026-11-05 08:00:00+00', 'Festivo el viernes: se adelanta al jueves');
select is(private.next_send_slot(tests.id('br'), date '2026-11-07', date '2026-11-12', timestamptz '2026-11-06 20:00:00+00'),
  timestamptz '2026-11-09 08:00:00+00', 'Si el día ideal ya pasó y hoy no se envía: el siguiente día hábil');
delete from blackout_dates where branch_id = tests.id('br');
update organizations set timezone = 'Atlantic/Canary' where id = tests.id('org');
select is(private.next_send_slot(tests.id('br'), date '2026-11-04', date '2026-12-04', timestamptz '2026-11-04 07:30:00+00'),
  timestamptz '2026-11-04 09:00:00+00', 'Canarias: 09:00 hora canaria (una hora más tarde en UTC)');
update organizations set timezone = 'Europe/Madrid' where id = tests.id('org');

-- ------------------------------------------------------------- planificador
select lives_ok($$ select private.plan_reminders(pg_temp.now_()) $$, 'El planificador se ejecuta');
select results_eq($$ select offset_days from reminders where vehicle_id = tests.id('v30') $$, $$ values (30) $$,
  'Aviso de 30 días creado el día que toca');
select results_eq($$ select offset_days from reminders where vehicle_id = tests.id('v7') $$, $$ values (7) $$,
  'Aviso de 7 días creado; no se duplica el de 30 ya pasado el mismo día');
select results_eq($$ select offset_days from reminders where vehicle_id = tests.id('v17') $$, $$ values (30) $$,
  'Aviso perdido recuperado una vez (alta tardía)');
select results_eq($$ select offset_days from reminders where vehicle_id = tests.id('v5') $$, $$ values (7) $$,
  'Si se perdieron varios, solo se recupera el más reciente');
select is((select count(*) from reminders where vehicle_id in (tests.id('vfar'), tests.id('vpast'), tests.id('vsold'))), 0::bigint,
  'Nada para revisiones lejanas, ya vencidas o vehículos no activos');
select is((select scheduled_for from reminders where vehicle_id = tests.id('v30')), pg_temp.now_(), 'Programado para enviarse ya');
select is((select count(*) from reminders where organization_id = tests.id('org')), 4::bigint, 'Cuatro recordatorios en total');

select lives_ok($$ select private.plan_reminders(pg_temp.now_()), private.plan_reminders(pg_temp.now_() + interval '1 hour') $$,
  'Ejecutar el planificador otra vez…');
select is((select count(*) from reminders where organization_id = tests.id('org')), 4::bigint, '…no duplica recordatorios (idempotente)');

-- Revisión registrada: el aviso pendiente de la fecha anterior queda obsoleto.
insert into maintenance_records (organization_id, branch_id, vehicle_id, service_date, km, work_performed)
values (tests.id('org'), tests.id('br'), tests.id('v30'), date '2026-11-03', 90000, 'Revisión adelantada');
select private.plan_reminders(pg_temp.now_());
select results_eq($$ select status, skip_reason from reminders where vehicle_id = tests.id('v30') $$,
  $$ values ('canceled', 'superseded') $$, 'Si cambia la fecha de revisión, el aviso pendiente se cancela');

-- Avisos desactivados y suscripción inactiva: no se planifica nada.
select tests.set_id('u2', tests.create_user('motor2@taller.test'));
select tests.set_id('org2', tests.create_org(tests.id('u2'), 'motor2-' || substr(md5(random()::text), 1, 8), 'pro'));
select tests.set_id('br2', tests.primary_branch(tests.id('org2')));
select tests.set_id('c2', tests.add_customer(tests.id('org2'), tests.id('br2'), 'Off'));
select tests.set_id('v_off', tests.add_vehicle(tests.id('org2'), tests.id('br2'), tests.id('c2'), '4000CCC'));
update vehicles set next_service_date = date '2026-12-04' where id = tests.id('v_off');
select private.plan_reminders(pg_temp.now_());
select is((select count(*) from reminders where vehicle_id = tests.id('v_off')), 0::bigint, 'Con los avisos desactivados no se planifica');
update branch_settings set reminders_enabled = true where branch_id = tests.id('br2');
update subscriptions set status = 'canceled' where organization_id = tests.id('org2');
select private.plan_reminders(pg_temp.now_());
select is((select count(*) from reminders where vehicle_id = tests.id('v_off')), 0::bigint, 'Con la suscripción cancelada no se planifica');

-- ---------------------------------------------------------- por kilometraje
select tests.set_id('u3', tests.create_user('km@taller.test'));
select tests.set_id('org3', tests.create_org(tests.id('u3'), 'km-' || substr(md5(random()::text), 1, 8), 'max'));
select tests.set_id('br3', tests.primary_branch(tests.id('org3')));
update branch_settings set reminders_enabled = true, km_reminders_enabled = true, km_offset_before = 1000 where branch_id = tests.id('br3');
select tests.set_id('v_km', tests.add_vehicle(tests.id('org3'), tests.id('br3'), tests.add_customer(tests.id('org3'), tests.id('br3'), 'Km'), '5500DDD'));
insert into maintenance_records (organization_id, branch_id, vehicle_id, service_date, km, work_performed, next_recommended_date, next_recommended_km)
values (tests.id('org3'), tests.id('br3'), tests.id('v_km'), date '2026-05-01', 40000, 'Revisión', date '2027-05-01', 55500);
insert into mileage_readings (organization_id, branch_id, vehicle_id, km, read_on, source)
values (tests.id('org3'), tests.id('br3'), tests.id('v_km'), 55000, date '2026-10-01', 'manual');
select private.plan_reminders(pg_temp.now_());
select results_eq($$ select type, cycle_anchor from reminders where vehicle_id = tests.id('v_km') $$,
  $$ values ('service_km', date '2026-05-01') $$, 'Max: aviso por km cuando el ritmo estimado alcanza los km de la revisión');
select private.plan_reminders(pg_temp.now_() + interval '1 day');
select is((select count(*) from reminders where vehicle_id = tests.id('v_km')), 1::bigint, 'Un único aviso por km por ciclo de mantenimiento');
update subscriptions set plan_code = 'pro' where organization_id = tests.id('org3');
delete from reminders where vehicle_id = tests.id('v_km');
select private.plan_reminders(pg_temp.now_());
select is((select count(*) from reminders where vehicle_id = tests.id('v_km')), 0::bigint, 'Pro: sin avisos por kilometraje');

-- ------------------------------------------------- reclamación y recuperación
update reminders set status = 'scheduled', scheduled_for = pg_temp.now_() where organization_id = tests.id('org') and status <> 'canceled';
insert into reminders (organization_id, branch_id, customer_id, vehicle_id, type, due_date, offset_days, scheduled_for)
select tests.id('org3'), tests.id('br3'), v.customer_id, v.id, 'service_date', date '2027-05-01', 30, pg_temp.now_()
from vehicles v where v.id = tests.id('v_km');
select is((select count(*) from private.claim_reminders('test-worker', 10, 1)), 2::bigint,
  'Reparto justo: como mucho 1 por taller en el lote (2 talleres)');
select is((select count(*) from reminders where status = 'processing' and locked_by = 'test-worker' and attempts = 1 and locked_until > now()),
  2::bigint, 'Los reclamados quedan en "processing" con lease e intento contado');
select is((select count(*) from private.claim_reminders('otro-worker', 10, 1)), 1::bigint,
  'Otro dispatcher no recibe los que ya están reclamados');

update reminders set locked_until = now() - interval '1 minute' where locked_by = 'test-worker';
select is(private.release_expired_reminder_leases(), 2, 'Un lease vencido (proceso caído) se libera');
select is((select count(*) from reminders where last_error = 'lease_expired' and status = 'retrying'), 2::bigint,
  'Vuelve a la cola como reintento');
update reminders set status = 'processing', locked_until = now() - interval '1 minute', attempts = max_attempts
 where id = (select id from reminders where last_error = 'lease_expired' limit 1);
select private.release_expired_reminder_leases();
select is((select count(*) from reminders where status = 'failed' and last_error = 'lease_expired'), 1::bigint,
  'Agotados los intentos, queda como fallido');

select * from finish();
rollback;

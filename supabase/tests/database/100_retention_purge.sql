-- Retención: purga definitiva de borrados lógicos a los 30 días.
begin;
set search_path = extensions, public;
select plan(19);

select tests.set_id('u', tests.create_user('purga@taller.test'));
select tests.set_id('org', tests.create_org(tests.id('u'), 'purga-' || substr(md5(random()::text), 1, 8), 'pro'));
select tests.set_id('br', tests.primary_branch(tests.id('org')));

-- Cliente borrado hace 31 días, con vehículo, historial, recordatorio, presupuesto enviado y correo.
select tests.set_id('c_old', tests.add_customer(tests.id('org'), tests.id('br'), 'Antiguo'));
select tests.set_id('v_old', tests.add_vehicle(tests.id('org'), tests.id('br'), tests.id('c_old'), '1111AAA'));
insert into maintenance_records (organization_id, branch_id, vehicle_id, service_date, km, work_performed)
values (tests.id('org'), tests.id('br'), tests.id('v_old'), date '2025-01-10', 50000, 'Revisión');
insert into reminders (organization_id, branch_id, customer_id, vehicle_id, type, due_date, offset_days, scheduled_for)
values (tests.id('org'), tests.id('br'), tests.id('c_old'), tests.id('v_old'), 'service_date', date '2026-01-10', 30, now());
insert into quotes (organization_id, branch_id, customer_id, vehicle_id, issue_date, valid_until, subtotal, tax_total, total)
values (tests.id('org'), tests.id('br'), tests.id('c_old'), tests.id('v_old'), date '2025-02-01', date '2025-03-01', 10, 2.10, 12.10);
select tests.set_id('q_old', (select id from quotes where customer_id = tests.id('c_old')));
insert into quote_items (organization_id, branch_id, quote_id, position, description, quantity, unit_price, tax_rate, line_subtotal, line_tax, line_total)
values (tests.id('org'), tests.id('br'), tests.id('q_old'), 1, 'Mano de obra', 1, 10, 21, 10, 2.10, 12.10);
update quotes set status = 'sent' where id = tests.id('q_old');
insert into email_logs (organization_id, branch_id, customer_id, vehicle_id, kind, to_email, from_email, subject, provider, provider_message_id, status, sent_at)
values (tests.id('org'), tests.id('br'), tests.id('c_old'), tests.id('v_old'), 'reminder', 'antiguo@cliente.test', 'avisos@revisaya.test', 'Revisión', 'resend', 'msg_purga_1', 'accepted', now());
update vehicles set deleted_at = now() - interval '31 days' where id = tests.id('v_old');
update customers set deleted_at = now() - interval '31 days' where id = tests.id('c_old');

-- Cliente borrado hace 5 días: se conserva (aún se puede restaurar).
select tests.set_id('c_recent', tests.add_customer(tests.id('org'), tests.id('br'), 'Reciente'));
select tests.set_id('v_recent', tests.add_vehicle(tests.id('org'), tests.id('br'), tests.id('c_recent'), '2222BBB'));
update vehicles set deleted_at = now() - interval '5 days' where id = tests.id('v_recent');
update customers set deleted_at = now() - interval '5 days' where id = tests.id('c_recent');

-- Cliente activo con un vehículo borrado hace 40 días, con presupuesto y cita.
select tests.set_id('c_active', tests.add_customer(tests.id('org'), tests.id('br'), 'Activo'));
select tests.set_id('v_alone', tests.add_vehicle(tests.id('org'), tests.id('br'), tests.id('c_active'), '3333CCC'));
select tests.set_id('v_keep', tests.add_vehicle(tests.id('org'), tests.id('br'), tests.id('c_active'), '4444DDD'));
insert into quotes (organization_id, branch_id, customer_id, vehicle_id, issue_date, valid_until)
values (tests.id('org'), tests.id('br'), tests.id('c_active'), tests.id('v_alone'), current_date, current_date + 30);
insert into appointments (organization_id, branch_id, customer_id, vehicle_id, source, requester_name, requester_email)
values (tests.id('org'), tests.id('br'), tests.id('c_active'), tests.id('v_alone'), 'manual', 'Activo', 'activo@cliente.test');
update vehicles set deleted_at = now() - interval '40 days' where id = tests.id('v_alone');

select lives_ok($$ select private.purge_expired_data() $$, 'La purga se ejecuta');

select is((select count(*) from customers where id = tests.id('c_old')), 0::bigint, 'Cliente borrado hace 31 días: eliminado');
select is((select count(*) from vehicles where id = tests.id('v_old')), 0::bigint, 'Su vehículo: eliminado');
select is((select count(*) from maintenance_records where vehicle_id = tests.id('v_old')), 0::bigint, 'Su historial: eliminado');
select is((select count(*) from reminders where customer_id = tests.id('c_old')), 0::bigint, 'Sus recordatorios: eliminados');
select is((select count(*) from quotes where id = tests.id('q_old')), 0::bigint, 'Sus presupuestos (también los enviados): eliminados');
select is((select customer_id from email_logs where provider_message_id = 'msg_purga_1'), null::uuid,
  'El registro del correo se conserva desvinculado del cliente');

select is((select count(*) from customers where id = tests.id('c_recent')), 1::bigint, 'Cliente borrado hace 5 días: se conserva');
select is((select count(*) from vehicles where id = tests.id('v_recent')), 1::bigint, 'Su vehículo también');

select is((select count(*) from vehicles where id = tests.id('v_alone')), 0::bigint, 'Vehículo borrado hace 40 días: eliminado');
select is((select count(*) from vehicles where id = tests.id('v_keep')), 1::bigint, 'Los vehículos activos no se tocan');
select is((select count(*) from customers where id = tests.id('c_active') and deleted_at is null), 1::bigint, 'El cliente activo no se toca');
select is((select vehicle_id from quotes where customer_id = tests.id('c_active')), null::uuid,
  'El presupuesto del cliente activo se conserva sin el vehículo purgado');
select is((select vehicle_id from appointments where customer_id = tests.id('c_active')), null::uuid,
  'La cita se conserva sin el vehículo purgado');

select ok(exists (select 1 from audit_logs where organization_id = tests.id('org') and action = 'data.purged'
                  and (metadata ->> 'customers')::int >= 1),
  'Queda un evento de auditoría con los recuentos (sin datos personales)');
select ok(exists (select 1 from private.job_runs where job_name = 'purge_expired_data' and status = 'succeeded'),
  'La ejecución queda registrada en job_runs');
select ok(exists (select 1 from cron.job where jobname = 'revisaya-purge-expired-data'),
  'La purga está programada a diario');

select tests.authenticate_as(tests.id('u'));
select throws_ok($$ select private.purge_expired_data() $$, '42501', null, 'Un usuario no puede ejecutar la purga');
select set_config('app.purging', 'on', true);
select is(app.is_purging(), false, 'Un usuario no puede activar la excepción de purga aunque fije el parámetro');
select tests.clear_authentication();

select * from finish();
rollback;

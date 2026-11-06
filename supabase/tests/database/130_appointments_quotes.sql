-- Fase 7: huecos para citas (zona horaria, festivos, preaviso, ocupación),
-- una solicitud abierta por aviso, fechas de los presupuestos y caducidad.
begin;
set search_path = extensions, public;
select plan(18);

select tests.set_id('u', tests.create_user('citas@taller.test'));
select tests.set_id('org', tests.create_org(tests.id('u'), 'citas-' || substr(md5(random()::text), 1, 8), 'pro'));
select tests.set_id('br', tests.primary_branch(tests.id('org')));
select tests.set_id('c', tests.add_customer(tests.id('org'), tests.id('br'), 'Rosa'));
select tests.set_id('v', tests.add_vehicle(tests.id('org'), tests.id('br'), tests.id('c'), '2222DDD'));

-- --------------------------------------------------------------- huecos
-- Lunes 9–11 (huecos de 60 min, 1 coche) y martes 9–10 (2 coches).
update branch_settings set booking_enabled = true, booking_mode = 'slots', slot_minutes = 60, booking_notice_hours = 0
 where branch_id = tests.id('br');
insert into availability_rules (organization_id, branch_id, weekday, start_time, end_time, capacity)
values (tests.id('org'), tests.id('br'), 1, '09:00', '11:00', 1),
       (tests.id('org'), tests.id('br'), 2, '09:00', '10:00', 2);

-- "Ahora": domingo 8 de noviembre de 2026, 12:00 en Madrid.
select results_eq(
  $$ select slot_start, capacity, taken from app.available_slots(tests.id('br'), date '2026-11-08', 3, timestamptz '2026-11-08 11:00:00+00') $$,
  $$ values (timestamptz '2026-11-09 08:00:00+00', 1, 0), (timestamptz '2026-11-09 09:00:00+00', 1, 0), (timestamptz '2026-11-10 08:00:00+00', 2, 0) $$,
  'Huecos en hora de Madrid (09:00 local = 08:00 UTC en invierno), solo los días con horario');

select is((select count(*)::int from app.available_slots(tests.id('br'), date '2026-11-08', 3, timestamptz '2026-11-09 08:30:00+00')), 2,
  'No se ofrecen huecos que ya han empezado');
update branch_settings set booking_notice_hours = 24 where branch_id = tests.id('br');
select is((select count(*)::int from app.available_slots(tests.id('br'), date '2026-11-08', 3, timestamptz '2026-11-08 11:00:00+00')), 1,
  'Con 24 h de preaviso solo queda el martes');
update branch_settings set booking_notice_hours = 0 where branch_id = tests.id('br');

insert into blackout_dates (organization_id, branch_id, day, reason) values (tests.id('org'), tests.id('br'), date '2026-11-09', 'Cerrado');
select is((select count(*)::int from app.available_slots(tests.id('br'), date '2026-11-08', 3, timestamptz '2026-11-08 11:00:00+00')), 1,
  'Los festivos no ofrecen huecos');
delete from blackout_dates where branch_id = tests.id('br');

-- Verano: 09:00 en Madrid = 07:00 UTC.
select is((select min(slot_start) from app.available_slots(tests.id('br'), date '2027-07-05', 1, timestamptz '2027-07-01 00:00:00+00')),
  timestamptz '2027-07-05 07:00:00+00', 'En verano (CEST) el hueco de las 09:00 es a las 07:00 UTC');

insert into appointments (organization_id, branch_id, source, requester_name, requester_email, requested_slot, status)
values (tests.id('org'), tests.id('br'), 'booking_page', 'Ana', 'ana@cliente.test',
        tstzrange('2026-11-10 08:00:00+00', '2026-11-10 09:00:00+00', '[)'), 'requested');
select is((select taken from app.available_slots(tests.id('br'), date '2026-11-08', 3, timestamptz '2026-11-08 11:00:00+00') where slot_start = '2026-11-10 08:00:00+00'), 1,
  'Una solicitud con hueco ocupa una plaza');
insert into appointments (organization_id, branch_id, source, requester_name, requester_phone, status, confirmed_start, confirmed_end)
values (tests.id('org'), tests.id('br'), 'manual', 'Luis', '+34600000000', 'confirmed', '2026-11-10 08:30:00+00', '2026-11-10 09:30:00+00');
select is(app.slot_load(tests.id('br'), '2026-11-10 08:00:00+00', '2026-11-10 09:00:00+00'), 2,
  'Una cita confirmada que se solapa también ocupa');
update appointments set status = 'rejected' where requester_name = 'Ana';
select is(app.slot_load(tests.id('br'), '2026-11-10 08:00:00+00', '2026-11-10 09:00:00+00'), 1,
  'Una solicitud rechazada libera la plaza');

update branch_settings set booking_mode = 'free_request' where branch_id = tests.id('br');
select is((select count(*)::int from app.available_slots(tests.id('br'), date '2026-11-08', 3, timestamptz '2026-11-08 11:00:00+00')), 0,
  'En modo "el cliente propone un día" no hay huecos');

-- ----------------------------------------------- una solicitud por aviso
insert into reminders (organization_id, branch_id, customer_id, vehicle_id, type, due_date, offset_days, scheduled_for)
values (tests.id('org'), tests.id('br'), tests.id('c'), tests.id('v'), 'service_date', date '2026-12-01', 30, now())
returning id \gset
select tests.set_id('rem', (select id from reminders where vehicle_id = tests.id('v') limit 1));
insert into appointments (organization_id, branch_id, customer_id, vehicle_id, reminder_id, source, requester_name, requester_email, status)
values (tests.id('org'), tests.id('br'), tests.id('c'), tests.id('v'), tests.id('rem'), 'reminder_link', 'Rosa', 'rosa@cliente.test', 'requested');
select throws_ok($$
  insert into appointments (organization_id, branch_id, customer_id, vehicle_id, reminder_id, source, requester_name, requester_email, status)
  values (tests.id('org'), tests.id('br'), tests.id('c'), tests.id('v'), tests.id('rem'), 'reminder_link', 'Rosa', 'rosa@cliente.test', 'requested') $$,
  '23505', null, 'Pulsar dos veces el botón del aviso no crea dos solicitudes');
update appointments set status = 'rejected' where reminder_id = tests.id('rem');
select lives_ok($$
  insert into appointments (organization_id, branch_id, customer_id, vehicle_id, reminder_id, source, requester_name, requester_email, status)
  values (tests.id('org'), tests.id('br'), tests.id('c'), tests.id('v'), tests.id('rem'), 'reminder_link', 'Rosa', 'rosa@cliente.test', 'requested') $$,
  'Tras un rechazo sí puede volver a pedir cita');

-- ------------------------------------------------------------ presupuestos
insert into quotes (organization_id, branch_id, customer_id, issue_date, valid_until, subtotal, tax_total, total)
values (tests.id('org'), tests.id('br'), tests.id('c'), current_date - 40, current_date - 10, 10, 2.10, 12.10)
returning id \gset
select tests.set_id('q1', (select id from quotes where customer_id = tests.id('c') order by created_at limit 1));
insert into quote_items (organization_id, branch_id, quote_id, position, description, quantity, unit_price, tax_rate, line_subtotal, line_tax, line_total)
values (tests.id('org'), tests.id('br'), tests.id('q1'), 1, 'Filtro', 1, 10, 21, 10, 2.10, 12.10);
insert into quotes (organization_id, branch_id, customer_id, issue_date, valid_until)
values (tests.id('org'), tests.id('br'), tests.id('c'), current_date - 40, current_date - 10);

select is((select number from quotes where id = tests.id('q1')), format('P-%s-0001', extract(year from current_date - 40)), 'Numeración P-AAAA-NNNN');
update quotes set status = 'sent' where id = tests.id('q1');
select isnt((select sent_at from quotes where id = tests.id('q1')), null, 'Al emitirlo se fija la fecha de envío');
select is(private.expire_quotes(), 1, 'Caduca el presupuesto emitido cuya validez terminó');
select results_eq($$ select status from quotes where customer_id = tests.id('c') order by sequence $$,
  $$ values ('expired'::text), ('draft'::text) $$, 'Los borradores no caducan solos');
select throws_ok($$ update quotes set status = 'accepted' where id = tests.id('q1') $$, '23514', 'invalid_quote_transition',
  'Un presupuesto caducado ya no se puede aceptar');

-- --------------------------------------------------------------- correos
select lives_ok($$
  insert into email_logs (organization_id, branch_id, kind, to_email, from_email, subject, provider, provider_message_id, status)
  values (tests.id('org'), tests.id('br'), 'quote', 'rosa@cliente.test', 'a@b.test', 'Presupuesto', 'smtp', 'q-' || gen_random_uuid(), 'accepted'),
         (tests.id('org'), tests.id('br'), 'invitation', 'op@taller.test', 'a@b.test', 'Invitación', 'smtp', 'i-' || gen_random_uuid(), 'accepted') $$,
  'Se registran presupuestos e invitaciones enviados');
select lives_ok($$ update organizations set tax_id = 'FR12345678901' where id = tests.id('org') $$, 'NIF-IVA intracomunitario de 13 caracteres');

select * from finish();
rollback;

-- Presupuestos (numeración, aritmética decimal verificada, solo borradores
-- editables) y citas (solicitud ≠ cita confirmada, transiciones válidas).
begin;
set search_path = extensions, public;
select plan(19);

select tests.set_id('owner', tests.create_user('presupuestos@taller.test'));
select tests.set_id('op', tests.create_user('sin-citas@taller.test'));
select tests.set_id('org', tests.create_org(tests.id('owner'), 'taller-presu', 'max'));
select tests.set_id('br', tests.primary_branch(tests.id('org')));
select tests.add_member(tests.id('org'), tests.id('op'), 'operator', array['customers.write']);
select tests.set_id('cust', tests.add_customer(tests.id('org'), tests.id('br'), 'Laura'));
select tests.set_id('veh', tests.add_vehicle(tests.id('org'), tests.id('br'), tests.id('cust'), '1234ABC'));

-- Manipula importes y fuerza la verificación diferida (para throws_ok).
create function pg_temp.tamper_totals(p_quote uuid) returns void language plpgsql as $$
begin
  update public.quotes set subtotal = subtotal + 1, total = total + 1 where id = p_quote;
  set constraints all immediate;
end $$;

-- ------------------------------------------------------------- presupuestos
insert into quotes (organization_id, branch_id, customer_id, vehicle_id, issue_date, valid_until)
values (tests.id('org'), tests.id('br'), tests.id('cust'), tests.id('veh'), date '2026-11-04', date '2026-12-04');
insert into quotes (organization_id, branch_id, customer_id, issue_date, valid_until)
values (tests.id('org'), tests.id('br'), tests.id('cust'), date '2026-11-05', date '2026-12-05');
select results_eq($$ select number from quotes order by sequence $$,
  $$ values ('P-2026-0001'), ('P-2026-0002') $$, 'Numeración correlativa por sucursal y año');
select tests.set_id('q1', (select id from quotes where number = 'P-2026-0001'));

select throws_ok($$ insert into quote_items (organization_id, branch_id, quote_id, position, description, quantity,
                                              unit_price, tax_rate, line_subtotal, line_tax, line_total)
                    values (tests.id('org'), tests.id('br'), tests.id('q1'), 1, 'Aceite', 4.5, 9.99, 21, 44.95, 9.44, 54.39) $$,
  '23514', null, 'Una línea con importes mal calculados (redondeo truncado) se rechaza');
-- 4,5 × 9,99 = 44,955 → 44,96 ; IVA 21 % = 9,4416 → 9,44 ; total 54,40
-- 1 × 0,10 con IVA 21 % = 0,021 → 0,02 (sin errores de coma flotante)
select lives_ok($$ insert into quote_items (organization_id, branch_id, quote_id, position, description, quantity,
                                             unit_price, tax_rate, line_subtotal, line_tax, line_total)
                   values (tests.id('org'), tests.id('br'), tests.id('q1'), 1, 'Aceite 5W30', 4.5, 9.99, 21, 44.96, 9.44, 54.40),
                          (tests.id('org'), tests.id('br'), tests.id('q1'), 2, 'Arandela', 1, 0.10, 21, 0.10, 0.02, 0.12),
                          (tests.id('org'), tests.id('br'), tests.id('q1'), 3, 'Mano de obra', 1.5, 40.00, 21, 60.00, 12.60, 72.60) $$,
  'Líneas con aritmética decimal exacta');
update quotes set subtotal = 105.06, tax_total = 22.06, total = 127.12 where id = tests.id('q1');
select lives_ok($$ set constraints all immediate $$, 'Los totales cuadran con las líneas');
select throws_ok($$ select pg_temp.tamper_totals(tests.id('q1')) $$, '23514', 'quote_totals_mismatch',
  'Unos totales que no cuadran con las líneas se rechazan al confirmar');
select throws_ok($$ update quotes set total = 1 where id = tests.id('q1') $$,
  '23514', null, 'El total siempre es base + IVA');

update quotes set status = 'sent' where id = tests.id('q1');
select throws_ok($$ update quotes set notes = 'x', subtotal = 1, tax_total = 0, total = 1 where id = tests.id('q1') $$,
  '23514', 'quote_not_editable', 'Un presupuesto enviado no se puede modificar');
select throws_ok($$ insert into quote_items (organization_id, branch_id, quote_id, position, description, quantity,
                                              unit_price, tax_rate, line_subtotal, line_tax, line_total)
                    values (tests.id('org'), tests.id('br'), tests.id('q1'), 4, 'Extra', 1, 1, 21, 1, 0.21, 1.21) $$,
  '23514', 'quote_not_editable', 'No se pueden añadir líneas a un presupuesto enviado');
select throws_ok($$ update quotes set number = 'P-2026-0099' where id = tests.id('q1') $$,
  '23514', 'quote_number_immutable', 'El número del presupuesto es inmutable');
select lives_ok($$ update quotes set status = 'accepted' where id = tests.id('q1') $$, 'Enviado → aceptado');
select throws_ok($$ update quotes set status = 'draft' where id = tests.id('q1') $$,
  '23514', 'invalid_quote_transition', 'Aceptado → borrador no está permitido');

-- ------------------------------------------------------------------- citas
insert into appointments (organization_id, branch_id, customer_id, vehicle_id, source, requester_name,
                          requester_email, requested_date)
values (tests.id('org'), tests.id('br'), tests.id('cust'), tests.id('veh'), 'reminder_link', 'Laura',
        'laura@cliente.test', date '2026-11-20');
select tests.set_id('ap', (select id from appointments limit 1));
select is((select status from appointments where id = tests.id('ap')), 'requested',
  'Una solicitud nace como "requested", no como cita confirmada');
select throws_ok($$ update appointments set status = 'confirmed' where id = tests.id('ap') $$,
  '23514', null, 'Confirmar exige fecha y hora de la cita');

select tests.authenticate_as(tests.id('owner'));
select lives_ok($$ update appointments set status = 'confirmed',
                   confirmed_start = timestamptz '2026-11-20 09:00+01', confirmed_end = timestamptz '2026-11-20 10:00+01'
                   where id = tests.id('ap') $$, 'El taller confirma la cita');
select lives_ok($$ update appointments set confirmed_start = timestamptz '2026-11-21 09:00+01',
                   confirmed_end = timestamptz '2026-11-21 10:00+01' where id = tests.id('ap') $$,
  'El taller cambia la fecha de una cita confirmada');
select tests.clear_authentication();
select is((select count(*) from appointment_events where appointment_id = tests.id('ap')), 3::bigint,
  'Historial de la cita: solicitud, confirmación y cambio de fecha');
select is((select decided_by from appointments where id = tests.id('ap')), tests.id('owner'),
  'Se registra quién confirmó');
select throws_ok($$ update appointments set status = 'requested' where id = tests.id('ap') $$,
  '23514', 'invalid_appointment_transition', 'Una cita confirmada no vuelve a ser solicitud');

select tests.authenticate_as(tests.id('op'));
select is((select count(*) from appointments), 0::bigint, 'Sin appointments.manage no se ven las citas');
select tests.clear_authentication();

select * from finish();
rollback;

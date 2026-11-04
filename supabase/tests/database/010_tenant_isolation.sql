-- CASO CRÍTICO 1: un taller no puede consultar, modificar ni borrar datos de otro.
begin;
set search_path = extensions, public;
select plan(36);

-- ---------------------------------------------------------------- preparación
select tests.set_id('ua', tests.create_user('admin-a@taller.test'));
select tests.set_id('ub', tests.create_user('admin-b@taller.test'));
select tests.set_id('org_a', tests.create_org(tests.id('ua'), 'taller-a', 'max'));
select tests.set_id('org_b', tests.create_org(tests.id('ub'), 'taller-b', 'max'));
select tests.set_id('br_a', tests.primary_branch(tests.id('org_a')));
select tests.set_id('br_b', tests.primary_branch(tests.id('org_b')));
select tests.set_id('cust_a', tests.add_customer(tests.id('org_a'), tests.id('br_a'), 'Laura'));
select tests.set_id('cust_b', tests.add_customer(tests.id('org_b'), tests.id('br_b'), 'Pedro'));
select tests.set_id('veh_a', tests.add_vehicle(tests.id('org_a'), tests.id('br_a'), tests.id('cust_a'), '1234ABC'));
select tests.set_id('veh_b', tests.add_vehicle(tests.id('org_b'), tests.id('br_b'), tests.id('cust_b'), '1234 abc'));

insert into maintenance_records (organization_id, branch_id, vehicle_id, service_date, km, work_performed)
values (tests.id('org_a'), tests.id('br_a'), tests.id('veh_a'), date '2026-03-15', 82000, 'Revisión'),
       (tests.id('org_b'), tests.id('br_b'), tests.id('veh_b'), date '2026-03-15', 50000, 'Revisión');
insert into reminders (organization_id, branch_id, customer_id, vehicle_id, type, due_date, offset_days, scheduled_for)
values (tests.id('org_b'), tests.id('br_b'), tests.id('cust_b'), tests.id('veh_b'), 'service_date', date '2027-03-15', 30, now());
insert into appointments (organization_id, branch_id, customer_id, vehicle_id, source, requester_name, requester_email)
values (tests.id('org_b'), tests.id('br_b'), tests.id('cust_b'), tests.id('veh_b'), 'booking_page', 'Pedro', 'pedro@cliente.test');
insert into quotes (organization_id, branch_id, customer_id, issue_date, valid_until)
values (tests.id('org_b'), tests.id('br_b'), tests.id('cust_b'), current_date, current_date + 30);
insert into email_logs (organization_id, branch_id, customer_id, kind, to_email, from_email, subject, provider,
                        provider_message_id, status, sent_at)
values (tests.id('org_b'), tests.id('br_b'), tests.id('cust_b'), 'reminder', 'pedro@cliente.test',
        'avisos@revisaya.test', 'Revisión', 'resend', 'msg_b_1', 'accepted', now());
insert into import_batches (organization_id, branch_id, file_name, file_sha256)
values (tests.id('org_b'), tests.id('br_b'), 'clientes.xlsx', sha256('x'));
insert into usage_counters (organization_id, resource, period_start, used, limit_snapshot)
values (tests.id('org_b'), 'emails', date_trunc('month', now())::date, 10, 3000);
insert into billing_invoices (organization_id, stripe_invoice_id, status, amount_due_cents)
values (tests.id('org_b'), 'in_test123', 'paid', 7900);

-- ---------------------------------------------- como administrador del taller A
select tests.authenticate_as(tests.id('ua'));

select is((select count(*) from organizations where id = tests.id('org_b')), 0::bigint, 'A no ve la organización B');
select is((select count(*) from branches where organization_id = tests.id('org_b')), 0::bigint, 'A no ve sucursales de B');
select is((select count(*) from organization_members where organization_id = tests.id('org_b')), 0::bigint, 'A no ve miembros de B');
select is((select count(*) from profiles where id = tests.id('ub')), 0::bigint, 'A no ve el perfil del usuario de B');
select is((select count(*) from branch_settings where organization_id = tests.id('org_b')), 0::bigint, 'A no ve la configuración de B');
select is((select count(*) from customers where organization_id = tests.id('org_b')), 0::bigint, 'A no ve clientes de B');
select is((select count(*) from vehicles where organization_id = tests.id('org_b')), 0::bigint, 'A no ve vehículos de B');
select is((select count(*) from maintenance_records where organization_id = tests.id('org_b')), 0::bigint, 'A no ve historial de B');
select is((select count(*) from mileage_readings where organization_id = tests.id('org_b')), 0::bigint, 'A no ve lecturas de km de B');
select is((select count(*) from reminders where organization_id = tests.id('org_b')), 0::bigint, 'A no ve recordatorios de B');
select is((select count(*) from email_logs where organization_id = tests.id('org_b')), 0::bigint, 'A no ve correos de B');
select is((select count(*) from appointments where organization_id = tests.id('org_b')), 0::bigint, 'A no ve citas de B');
select is((select count(*) from appointment_events where organization_id = tests.id('org_b')), 0::bigint, 'A no ve historial de citas de B');
select is((select count(*) from quotes where organization_id = tests.id('org_b')), 0::bigint, 'A no ve presupuestos de B');
select is((select count(*) from subscriptions where organization_id = tests.id('org_b')), 0::bigint, 'A no ve la suscripción de B');
select is((select count(*) from billing_invoices where organization_id = tests.id('org_b')), 0::bigint, 'A no ve facturas de B');
select is((select count(*) from usage_counters where organization_id = tests.id('org_b')), 0::bigint, 'A no ve el consumo de B');
select is((select count(*) from import_batches where organization_id = tests.id('org_b')), 0::bigint, 'A no ve importaciones de B');
select is((select count(*) from audit_logs where organization_id = tests.id('org_b')), 0::bigint, 'A no ve la auditoría de B');
select is((select count(*) from customers), 1::bigint, 'A solo ve su propio cliente');

-- Escrituras dirigidas a B
select throws_ok(
  $$ insert into customers (organization_id, branch_id, first_name) values (tests.id('org_b'), tests.id('br_b'), 'Intruso') $$,
  '42501', null, 'A no puede crear clientes en B');
select throws_ok(
  $$ insert into customers (organization_id, branch_id, first_name) values (tests.id('org_a'), tests.id('br_b'), 'Intruso') $$,
  '42501', null, 'A no puede usar una sucursal de B con su propio organization_id');
select throws_ok(
  $$ update customers set organization_id = tests.id('org_b') where id = tests.id('cust_a') $$,
  '42501', null, 'A no puede cambiar el organization_id de sus registros');
select throws_ok(
  $$ update vehicles set customer_id = tests.id('cust_b') where id = tests.id('veh_a') $$,
  '23503', null, 'A no puede asignar su vehículo a un cliente de B (FK compuesta)');

update customers set first_name = 'Hackeado' where organization_id = tests.id('org_b');
update vehicles set status = 'scrapped' where organization_id = tests.id('org_b');
delete from maintenance_records where organization_id = tests.id('org_b');
update reminders set status = 'canceled', skip_reason = 'canceled_by_user' where organization_id = tests.id('org_b');
update organizations set trade_name = 'Hackeado' where id = tests.id('org_b');

select tests.clear_authentication();
select is((select first_name from customers where id = tests.id('cust_b')), 'Pedro', 'El cliente de B no se modificó');
select is((select status from vehicles where id = tests.id('veh_b')), 'active', 'El vehículo de B no se modificó');
select is((select count(*) from maintenance_records where organization_id = tests.id('org_b')), 1::bigint, 'El historial de B no se borró');
select is((select status from reminders where organization_id = tests.id('org_b')), 'scheduled', 'El recordatorio de B no se canceló');
select is((select trade_name from organizations where id = tests.id('org_b')), 'Taller B', 'La organización B no se modificó');

-- ----------------------------------------------- integridad a nivel de motor
select throws_ok(
  $$ insert into vehicles (organization_id, branch_id, customer_id, plate)
     values (tests.id('org_a'), tests.id('br_a'), tests.id('cust_b'), '9999ZZZ') $$,
  '23503', null, 'FK compuesta: vehículo de A con cliente de B imposible incluso para el sistema');
select throws_ok(
  $$ insert into maintenance_records (organization_id, branch_id, vehicle_id, service_date, work_performed)
     values (tests.id('org_a'), tests.id('br_a'), tests.id('veh_b'), current_date, 'x') $$,
  '23503', null, 'FK compuesta: historial de A sobre vehículo de B imposible');
select throws_ok(
  $$ update customers set organization_id = tests.id('org_b'), branch_id = tests.id('br_b') where id = tests.id('cust_a') $$,
  '42501', 'tenant_immutable', 'La tenencia es inmutable incluso para el sistema');
select is((select count(*) from vehicles where plate_normalized = '1234ABC' and organization_id in (tests.id('org_a'), tests.id('org_b'))), 2::bigint,
  'La misma matrícula puede existir en organizaciones distintas');
select throws_ok(
  $$ insert into vehicles (organization_id, branch_id, customer_id, plate)
     values (tests.id('org_a'), tests.id('br_a'), tests.id('cust_a'), '1234-abc') $$,
  '23505', null, 'Matrícula duplicada (normalizada) en el mismo taller rechazada');

-- Usuario sin organización
select tests.set_id('nobody', tests.create_user('nadie@taller.test'));
select tests.authenticate_as(tests.id('nobody'));
select is((select count(*) from customers), 0::bigint, 'Un usuario sin organización no ve clientes');
select is((select count(*) from organizations), 0::bigint, 'Un usuario sin organización no ve organizaciones');
select tests.clear_authentication();

select * from finish();
rollback;

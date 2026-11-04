-- CASO CRÍTICO 3: no se pueden duplicar recordatorios. Un correo no puede
-- figurar como enviado sin confirmación del proveedor. Webhooks idempotentes.
begin;
set search_path = extensions, public;
select plan(15);

select tests.set_id('owner', tests.create_user('avisos@taller.test'));
select tests.set_id('org', tests.create_org(tests.id('owner'), 'taller-avisos', 'pro'));
select tests.set_id('br', tests.primary_branch(tests.id('org')));
select tests.set_id('cust', tests.add_customer(tests.id('org'), tests.id('br'), 'Laura'));
select tests.set_id('veh', tests.add_vehicle(tests.id('org'), tests.id('br'), tests.id('cust'), '1234ABC'));

insert into reminders (organization_id, branch_id, customer_id, vehicle_id, type, due_date, offset_days, scheduled_for)
values (tests.id('org'), tests.id('br'), tests.id('cust'), tests.id('veh'), 'service_date', date '2027-03-15', 30, now());

select throws_ok($$
  insert into reminders (organization_id, branch_id, customer_id, vehicle_id, type, due_date, offset_days, scheduled_for)
  values (tests.id('org'), tests.id('br'), tests.id('cust'), tests.id('veh'), 'service_date', date '2027-03-15', 30, now()) $$,
  '23505', null, 'El mismo evento de recordatorio no se puede crear dos veces');
select lives_ok($$
  insert into reminders (organization_id, branch_id, customer_id, vehicle_id, type, due_date, offset_days, scheduled_for)
  values (tests.id('org'), tests.id('br'), tests.id('cust'), tests.id('veh'), 'service_date', date '2027-03-15', 30, now())
  on conflict on constraint reminders_event_unique do nothing $$,
  'El planificador puede reintentar sin error (on conflict do nothing)');
select is((select count(*) from reminders where vehicle_id = tests.id('veh')), 1::bigint,
  'Sigue habiendo un único recordatorio para el evento');
select lives_ok($$
  insert into reminders (organization_id, branch_id, customer_id, vehicle_id, type, due_date, offset_days, scheduled_for)
  values (tests.id('org'), tests.id('br'), tests.id('cust'), tests.id('veh'), 'service_date', date '2027-03-15', 7, now()) $$,
  'Otro offset (7 días) es otro evento distinto');

select throws_ok($$ update reminders set status = 'sent', sent_at = now() where vehicle_id = tests.id('veh') and offset_days = 30 $$,
  '23514', null, 'No se puede marcar como enviado sin identificador del proveedor');
select throws_ok($$ update reminders set status = 'skipped' where vehicle_id = tests.id('veh') and offset_days = 30 $$,
  '23514', null, 'Un recordatorio saltado exige motivo');
select lives_ok($$ update reminders set status = 'sent', sent_at = now(), provider = 'resend',
                   provider_message_id = 'msg_1' where vehicle_id = tests.id('veh') and offset_days = 30 $$,
  'Con confirmación del proveedor sí se marca como enviado');

-- El usuario solo puede cancelar recordatorios programados.
select tests.authenticate_as(tests.id('owner'));
select throws_ok($$ update reminders set status = 'sent' where vehicle_id = tests.id('veh') and offset_days = 7 $$,
  '42501', null, 'El usuario no puede marcar un recordatorio como enviado');
select lives_ok($$ update reminders set status = 'canceled', skip_reason = 'canceled_by_user' where vehicle_id = tests.id('veh') and offset_days = 7 $$,
  'El administrador puede cancelar un recordatorio programado');
update reminders set status = 'canceled', skip_reason = 'canceled_by_user' where vehicle_id = tests.id('veh') and offset_days = 30;
select tests.clear_authentication();
select is((select status from reminders where vehicle_id = tests.id('veh') and offset_days = 30), 'sent',
  'Un recordatorio ya enviado no se puede cancelar');

-- Registro de correos e idempotencia de webhooks
select throws_ok($$ insert into email_logs (organization_id, branch_id, kind, to_email, from_email, subject, provider, status)
                    values (tests.id('org'), tests.id('br'), 'reminder', 'l@c.test', 'a@r.test', 's', 'resend', 'accepted') $$,
  '23514', null, 'Un correo aceptado exige el identificador del proveedor');
insert into email_events (provider, provider_event_id, type, occurred_at) values ('resend', 'evt_1', 'email.delivered', now());
select throws_ok($$ insert into email_events (provider, provider_event_id, type, occurred_at)
                    values ('resend', 'evt_1', 'email.delivered', now()) $$,
  '23505', null, 'Un evento de webhook duplicado se rechaza');

-- Remitente: nunca dominio propio sin verificar
select throws_ok($$ update branch_settings set sender_mode = 'custom_domain' where branch_id = tests.id('br') $$,
  '23514', 'sending_domain_not_verified', 'No se puede usar un dominio propio sin verificar');
insert into sending_domains (organization_id, domain, provider, status, verified_at)
values (tests.id('org'), 'tallersur.es', 'resend', 'verified', now());
select lives_ok($$ update branch_settings set sender_mode = 'custom_domain',
                   sending_domain_id = (select id from sending_domains where domain = 'tallersur.es')
                   where branch_id = tests.id('br') $$,
  'Con el dominio verificado sí se puede usar');
update sending_domains set status = 'failed' where domain = 'tallersur.es';
select is((select sender_mode from branch_settings where branch_id = tests.id('br')), 'shared',
  'Si el dominio deja de estar verificado se vuelve al remitente compartido');

select * from finish();
rollback;

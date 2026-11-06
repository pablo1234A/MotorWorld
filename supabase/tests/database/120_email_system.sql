-- Sistema de correos: eventos del proveedor, supresión, reprogramación al
-- mejorar el plan, slugs reservados.
begin;
set search_path = extensions, public;
select plan(30);

select tests.set_id('u', tests.create_user('correo@taller.test'));
select tests.set_id('org', tests.create_org(tests.id('u'), 'correo-' || substr(md5(random()::text), 1, 8), 'pro'));
select tests.set_id('br', tests.primary_branch(tests.id('org')));
select tests.set_id('c', tests.add_customer(tests.id('org'), tests.id('br'), 'Eva'));
update customers set email = 'eva@cliente.test' where id = tests.id('c');
select tests.set_id('v', tests.add_vehicle(tests.id('org'), tests.id('br'), tests.id('c'), '1111CCC'));

-- ------------------------------------------------------------ slugs reservados
select throws_ok($$ insert into organizations (slug, trade_name, created_by) values ('postmaster', 'X', tests.id('u')) $$,
  '23514', 'slug_reserved', 'No se puede crear un taller con un slug reservado (postmaster@)');
select throws_ok($$ update organizations set slug = 'abuse' where id = tests.id('org') $$,
  '23514', 'slug_reserved', 'Ni cambiarlo a uno reservado');
select lives_ok($$ update organizations set trade_name = 'Taller Correo' where id = tests.id('org') $$,
  'Los cambios que no tocan el slug no se ven afectados');

-- --------------------------------------------------------- tipos de registro
select lives_ok($$
  insert into email_logs (organization_id, branch_id, kind, to_email, from_email, subject, provider, provider_message_id, status)
  values (tests.id('org'), tests.id('br'), 'digest', 'admin@taller.test', 'no_reply@avisos.test', 'Resumen', 'smtp', 'dg-' || substr(md5(random()::text), 1, 8), 'accepted') $$,
  'Se registran los correos de la plataforma al taller (resumen)');

-- ----------------------------------------------------------- eventos de entrega
create function pg_temp.reminder_with_log(p_msg text, p_offset int) returns bigint language plpgsql as $$
declare r uuid; l bigint;
begin
  insert into reminders (organization_id, branch_id, customer_id, vehicle_id, type, due_date, offset_days, scheduled_for,
                         status, provider, provider_message_id, sent_at)
  values (tests.id('org'), tests.id('br'), tests.id('c'), tests.id('v'), 'service_date', date '2027-01-10', p_offset, now(),
          'sent', 'resend', p_msg, now())
  returning id into r;
  insert into email_logs (organization_id, branch_id, reminder_id, customer_id, vehicle_id, kind, to_email, from_email, subject,
                          provider, provider_message_id, status, sent_at)
  values (tests.id('org'), tests.id('br'), r, tests.id('c'), tests.id('v'), 'reminder', 'eva@cliente.test', 'x@avisos.test', 'Aviso',
          'resend', p_msg, 'accepted', now())
  returning id into l;
  return l;
end $$;

select pg_temp.reminder_with_log('msg-1', 30);
select is(private.apply_email_event('resend', 'ev-1', 'msg-1', 'delivered', now()), 'delivered', 'Entregado');
select results_eq($$ select l.status, r.status, l.delivered_at is not null from email_logs l join reminders r on r.id = l.reminder_id
                     where l.provider_message_id = 'msg-1' $$,
  $$ values ('delivered'::text, 'delivered'::text, true) $$, 'El registro y el recordatorio pasan a "entregado"');
select is(private.apply_email_event('resend', 'ev-1', 'msg-1', 'delivered', now()), 'duplicate', 'El mismo evento dos veces: no hace nada');
select is((select count(*) from email_events where provider_event_id = 'ev-1'), 1::bigint, '…y se guarda una sola vez');
select is(private.apply_email_event('resend', 'ev-2', 'msg-1', 'delivery_delayed', now() - interval '1 hour'), 'stale',
  'Un retraso que llega tarde…');
select is((select status from email_logs where provider_message_id = 'msg-1'), 'delivered', '…no hace retroceder el estado');
select is(private.apply_email_event('resend', 'ev-3', 'msg-1', 'opened', now()), 'ignored', 'Las aperturas no se procesan (P8)');
select is(private.apply_email_event('resend', 'ev-4', 'msg-1', 'complained', now()), 'complaint', 'Queja');
select results_eq($$ select l.status, r.status from email_logs l join reminders r on r.id = l.reminder_id where l.provider_message_id = 'msg-1' $$,
  $$ values ('complained'::text, 'complained'::text) $$, 'La queja queda registrada en ambos');
select is((select reason from email_suppressions where organization_id = tests.id('org') and email = 'eva@cliente.test'), 'complaint',
  'Una queja suprime la dirección (no recibirá más avisos)');
select is((select payload_min::text from email_events where provider_event_id = 'ev-4'), '{}', 'No se guarda el contenido ni la dirección en el evento');

delete from email_suppressions where organization_id = tests.id('org');
select pg_temp.reminder_with_log('msg-2', 7);
select is(private.apply_email_event('resend', 'ev-5', 'msg-2', 'bounced', now(), 'soft'), 'delivery_delayed', 'Rebote temporal: se trata como retraso');
select is((select count(*) from email_suppressions where organization_id = tests.id('org')), 0::bigint, '…y no suprime la dirección');
select is(private.apply_email_event('resend', 'ev-6', 'msg-2', 'bounced', now(), 'hard'), 'hard_bounce', 'Rebote definitivo');
select results_eq($$ select l.status, l.bounce_type, r.status from email_logs l join reminders r on r.id = l.reminder_id where l.provider_message_id = 'msg-2' $$,
  $$ values ('bounced'::text, 'hard'::text, 'bounced'::text) $$, 'Rebote registrado');
select is((select reason from email_suppressions where organization_id = tests.id('org') and email = 'eva@cliente.test'), 'hard_bounce',
  'Un rebote definitivo suprime la dirección');
select is(private.apply_email_event('resend', 'ev-7', 'msg-2', 'delivered', now()), 'stale',
  'Un "entregado" desordenado tras el rebote no lo deshace');
select is((select status from email_logs where provider_message_id = 'msg-2'), 'bounced', '…el estado sigue siendo "rebotado"');
select is(private.apply_email_event('resend', 'ev-8', 'no-existe', 'delivered', now()), 'unknown_message', 'Evento de un mensaje desconocido: se guarda y se ignora');
select throws_ok($$ select private.apply_email_event('resend', 'ev-9', 'msg-2', 'bounced', now(), 'raro') $$,
  '22023', 'invalid_bounce_type', 'Tipo de rebote no válido');

-- ---------------------------------------------- reprogramación al mejorar el plan
insert into reminders (organization_id, branch_id, customer_id, vehicle_id, type, due_date, offset_days, scheduled_for, status, skip_reason)
values (tests.id('org'), tests.id('br'), tests.id('c'), tests.id('v'), 'service_date', current_date + 20, 30, now(), 'skipped', 'quota_exceeded'),
       (tests.id('org'), tests.id('br'), tests.id('c'), tests.id('v'), 'service_date', current_date - 2, 30, now(), 'skipped', 'quota_exceeded'),
       (tests.id('org'), tests.id('br'), tests.id('c'), tests.id('v'), 'service_date', current_date + 20, 7, now(), 'skipped', 'no_email');
insert into usage_counters (organization_id, resource, period_start, used, limit_snapshot, alert_80_sent_at, alert_100_sent_at)
values (tests.id('org'), 'emails', app.usage_period(tests.id('org')), 500, 500, now(), now());

update subscriptions set plan_code = 'max' where organization_id = tests.id('org');
select results_eq($$ select status, skip_reason from reminders where organization_id = tests.id('org') and due_date = current_date + 20 and offset_days = 30 $$,
  $$ values ('scheduled'::text, null::text) $$, 'Al mejorar el plan, el aviso saltado por cuota vuelve a la cola');
select is((select status from reminders where organization_id = tests.id('org') and due_date = current_date - 2), 'skipped',
  'Si la revisión ya pasó, no se reprograma');
select is((select status from reminders where organization_id = tests.id('org') and offset_days = 7 and due_date = current_date + 20), 'skipped',
  'Los saltados por otros motivos (sin correo) no se tocan');
select results_eq($$ select alert_80_sent_at is null, alert_100_sent_at is null from usage_counters where organization_id = tests.id('org') $$,
  $$ values (true, true) $$, 'Con el nuevo límite, los avisos de consumo pueden volver a enviarse');

update reminders set status = 'skipped', skip_reason = 'subscription_inactive', scheduled_for = now()
 where organization_id = tests.id('org') and due_date = current_date + 20 and offset_days = 30;
update subscriptions set plan_code = 'pro' where organization_id = tests.id('org');
select is((select status from reminders where organization_id = tests.id('org') and due_date = current_date + 20 and offset_days = 30), 'skipped',
  'Bajar de plan no reprograma nada');
update subscriptions set status = 'canceled' where organization_id = tests.id('org');
update subscriptions set status = 'active' where organization_id = tests.id('org');
select is((select status from reminders where organization_id = tests.id('org') and due_date = current_date + 20 and offset_days = 30), 'scheduled',
  'Al reactivar la suscripción, los avisos pausados vuelven a la cola');

select * from finish();
rollback;

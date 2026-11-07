-- Fase 8: gracia de impago (P7), acceso según el estado de Stripe y registro de correos de facturación.
begin;
set search_path = extensions, public;
select plan(8);

select ok(app.subscription_is_active('trialing', null), 'Prueba gratuita: acceso completo');
select ok(app.subscription_is_active('active', null), 'Activa: acceso completo');
select ok(app.subscription_is_active('past_due', now() - interval '6 days'), 'Impago: 7 días de gracia con acceso');
select ok(not app.subscription_is_active('past_due', now() - interval '8 days'), 'Tras la gracia: solo lectura');
select ok(not app.subscription_is_active('unpaid', null), 'Impagada: solo lectura');
select ok(not app.subscription_is_active('canceled', null), 'Cancelada: solo lectura');

select tests.set_id('u', tests.create_user('factura@taller.test'));
select tests.set_id('org', tests.create_org(tests.id('u'), 'factura-' || substr(md5(random()::text), 1, 8), 'pro'));
select lives_ok($$
  insert into email_logs (organization_id, branch_id, kind, to_email, from_email, subject, provider, provider_message_id, status)
  values (tests.id('org'), tests.primary_branch(tests.id('org')), 'billing', 'a@taller.test', 'no_reply@x.test', 'Cobro', 'smtp', 'b-' || gen_random_uuid(), 'accepted') $$,
  'Se registran los correos de facturación');
select throws_ok($$ insert into stripe_events (id, type, livemode) values ('no-es-un-evento', 'x', false) $$, '23514', null,
  'Solo identificadores de evento de Stripe');

select * from finish();
rollback;

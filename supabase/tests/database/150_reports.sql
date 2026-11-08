-- Fase 9: informes (Max) y contadores básicos. El acceso lo deciden las funciones SQL.
begin;
set search_path = extensions, public;
select plan(9);

select tests.set_id('owner', tests.create_user('informes@taller.test'));
select tests.set_id('max', tests.create_org(tests.id('owner'), 'informes-max', 'max'));
select tests.set_id('pro_owner', tests.create_user('pro-informes@taller.test'));
select tests.set_id('pro', tests.create_org(tests.id('pro_owner'), 'informes-pro', 'pro'));
select tests.set_id('op', tests.create_user('op-informes@taller.test'));
select tests.add_member(tests.id('max'), tests.id('op'), 'operator', array['reminders.read']);
select tests.set_id('op2', tests.create_user('op2-informes@taller.test'));
select tests.add_member(tests.id('max'), tests.id('op2'), 'operator', array['reports.read']);

select tests.authenticate_as(tests.id('owner'));
select lives_ok($$ select app.report_summary(tests.id('max'), current_date - 30, current_date) $$, 'Administrador de un taller Max: ve los informes');
select throws_ok($$ select app.report_summary(tests.id('max'), current_date, current_date - 1) $$, '22023', 'invalid_report_range', 'Periodo al revés: rechazado');
select throws_ok($$ select app.report_summary(tests.id('max'), current_date - 800, current_date) $$, '22023', 'invalid_report_range', 'Más de dos años: rechazado');
select throws_ok($$ select app.report_summary(tests.id('pro'), current_date - 30, current_date) $$, '42501', null, 'Otro taller: denegado');
select throws_ok($$ select app.dashboard_activity(tests.id('pro')) $$, '42501', null, 'Contadores de otro taller: denegado');

select tests.authenticate_as(tests.id('pro_owner'));
select throws_ok($$ select app.report_summary(tests.id('pro'), current_date - 30, current_date) $$, 'RY003', null, 'Plan Pro: los informes no están incluidos');
select lives_ok($$ select app.dashboard_activity(tests.id('pro')) $$, 'Plan Pro: contadores básicos del inicio (P16)');

select tests.authenticate_as(tests.id('op'));
select throws_ok($$ select * from app.report_not_returned(tests.id('max'), current_date - 30, current_date) $$, '42501', null, 'Operario sin «Ver informes»: denegado');

select tests.authenticate_as(tests.id('op2'));
select lives_ok($$ select * from app.report_emails(tests.id('max'), current_date - 30, current_date) $$, 'Operario con «Ver informes»: permitido');

select tests.clear_authentication();
select * from finish();
rollback;

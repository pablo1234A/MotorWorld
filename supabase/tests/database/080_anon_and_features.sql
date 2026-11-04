-- Acceso anónimo y funcionalidades por plan.
begin;
set search_path = extensions, public;
select plan(9);

select tests.set_id('owner', tests.create_user('feat@taller.test'));
select tests.set_id('org_pro', tests.create_org(tests.id('owner'), 'feat-pro', 'pro'));
select tests.set_id('u_exc', tests.create_user('exc@taller.test'));
select tests.set_id('org_exc', tests.create_org(tests.id('u_exc'), 'feat-exc', 'excelencia'));
select tests.add_customer(tests.id('org_pro'), tests.primary_branch(tests.id('org_pro')), 'Laura');

select tests.authenticate_anon();
select is((select count(*) from plans), 4::bigint, 'Anónimo: puede leer los planes públicos (precios)');
select throws_ok($$ select count(*) from customers $$, '42501', null, 'Anónimo: no puede leer clientes');
select throws_ok($$ select count(*) from organizations $$, '42501', null, 'Anónimo: no puede leer organizaciones');
select throws_ok($$ select app.member_orgs() $$, '42501', null, 'Anónimo: no puede usar las funciones internas');
select tests.clear_authentication();

select throws_ok($$ select app.assert_feature(tests.id('org_pro'), 'km_reminders') $$,
  'RY003', 'feature_unavailable', 'Pro: sin recordatorios por kilometraje');
select tests.authenticate_as(tests.id('owner'));
select throws_ok($$ update branch_settings set km_reminders_enabled = true $$,
  'RY003', 'feature_unavailable', 'Pro: no puede activar avisos por kilometraje');
select throws_ok($$ insert into api_keys (organization_id, name, prefix, key_hash, scopes)
                    values (tests.id('org_pro'), 'ERP', 'ry_test_abcdefgh', sha256('k'), array['customers:read']) $$,
  '42501', null, 'Pro: no puede crear API keys (solo Excelencia)');
select tests.clear_authentication();

select tests.authenticate_as(tests.id('u_exc'));
select lives_ok($$ insert into api_keys (organization_id, name, prefix, key_hash, scopes)
                   values (tests.id('org_exc'), 'ERP', 'ry_test_abcdefgh', sha256('k'), array['customers:read']) $$,
  'Excelencia: puede crear API keys');
select throws_ok($$ select key_hash from api_keys $$, '42501', null,
  'El hash de la API key no es legible ni por su administrador');
select tests.clear_authentication();

select * from finish();
rollback;

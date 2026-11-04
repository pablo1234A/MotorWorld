-- Fase 2: alta de talleres e invitaciones.
begin;
set search_path = extensions, public;
select plan(22);
select set_config('tests.suffix', substr(md5(random()::text), 1, 8), true);

-- Usuarios: verificado, sin verificar, invitado (verificado), invitado sin verificar.
select tests.set_id('u', tests.create_user('fundador@taller.test'));
update auth.users set email_confirmed_at = now() where id = tests.id('u');
select tests.set_id('u_unverified', tests.create_user('pendiente@taller.test'));
select tests.set_id('guest', tests.create_user('Invitado@Taller.test'));
update auth.users set email_confirmed_at = now() where id = tests.id('guest');
select tests.set_id('guest_unv', tests.create_user('sinverificar@taller.test'));

-- --------------------------------------------------------- create_organization
select tests.authenticate_anon();
select throws_ok($$ select app.create_organization('Taller', 'taller-anon') $$, '42501', null,
  'Sin sesión no se puede crear un taller');
select tests.clear_authentication();

select tests.authenticate_as(tests.id('u_unverified'));
select throws_ok($$ select app.create_organization('Taller', 'taller-sin-verificar') $$, '42501', 'email_not_verified',
  'Con el email sin verificar no se puede crear un taller');
select tests.clear_authentication();

select tests.authenticate_as(tests.id('u'));
select tests.set_id('org', app.create_organization('  Taller Sur  ', 'Taller-Sur-' || tests.suffix()));
select isnt(tests.id('org'), null, 'Un usuario verificado crea su taller');
select results_eq($$ select trade_name, slug::text from organizations where id = tests.id('org') $$,
  $$ values ('Taller Sur', 'taller-sur-' || tests.suffix()) $$, 'Nombre recortado y slug normalizado');
select is((select count(*) from branches where organization_id = tests.id('org') and is_primary), 1::bigint,
  'Se crea la sucursal principal');
select is((select count(*) from branch_settings where organization_id = tests.id('org')), 1::bigint,
  'La sucursal nace con su configuración');
select results_eq($$ select role, is_owner, branch_scope from organization_members where organization_id = tests.id('org') $$,
  $$ values ('admin', true, 'all') $$, 'El creador es el propietario administrador');
select throws_ok($$ select app.create_organization('Otro', 'taller-sur-' || tests.suffix()) $$, '23505', null, 'El slug es único');
select throws_ok($$ select app.create_organization('Otro', 'Mal Slug!') $$, '23514', null, 'Slug con formato inválido rechazado');
select throws_ok($$ select app.create_organization('Otro', 'otro-' || tests.suffix(), 'Marte/Olympus') $$, '22023', 'invalid_timezone',
  'Zona horaria inválida rechazada');
select lives_ok($$ select app.create_organization('T2', 't2-' || substr(md5(random()::text), 1, 6)),
                          app.create_organization('T3', 't3-' || substr(md5(random()::text), 1, 6)),
                          app.create_organization('T4', 't4-' || substr(md5(random()::text), 1, 6)),
                          app.create_organization('T5', 't5-' || substr(md5(random()::text), 1, 6)) $$,
  'Un usuario puede tener hasta 5 talleres');
select throws_ok($$ select app.create_organization('T6', 'sexto-' || tests.suffix()) $$, 'RY005', 'organization_quota',
  'El sexto taller se rechaza');
select tests.clear_authentication();

-- Plan Max para poder invitar (3 usuarios).
insert into subscriptions (organization_id, plan_code, status, billing_interval)
values (tests.id('org'), 'max', 'active', 'month');

-- ---------------------------------------------------------------- invitaciones
select tests.authenticate_as(tests.id('u'));
select lives_ok($$ insert into invitations (organization_id, email, role, permissions, token_hash, invited_by)
                   values (tests.id('org'), 'invitado@taller.test', 'operator', array['customers.write'],
                           sha256('token-ok'), tests.id('u')) $$, 'El administrador invita a un operario');
select throws_ok($$ insert into invitations (organization_id, email, role, token_hash, accepted_at)
                    values (tests.id('org'), 'x@taller.test', 'operator', sha256('t2'), now()) $$,
  '42501', null, 'El administrador no puede crear invitaciones ya aceptadas');
select throws_ok($$ insert into invitations (organization_id, email, role, branch_scope, branch_ids, token_hash)
                    values (tests.id('org'), 'y@taller.test', 'operator', 'selected',
                            array[gen_random_uuid()], sha256('t3')) $$,
  '23514', 'invalid_branches', 'Una invitación no puede apuntar a sucursales ajenas');
insert into invitations (organization_id, email, role, token_hash, expires_at)
values (tests.id('org'), 'pendiente@taller.test', 'operator', sha256('caducada'), now() + interval '1 day');
select tests.clear_authentication();
update invitations set expires_at = now() - interval '1 minute' where token_hash = sha256('caducada');

select results_eq($$ select organization_name, role, email_masked, state from app.invitation_preview(sha256('token-ok')) $$,
  $$ values ('Taller Sur', 'operator', 'i•••@taller.test', 'pending') $$,
  'La vista previa muestra solo datos mínimos y el email enmascarado');

select tests.authenticate_as(tests.id('guest_unv'));
select throws_ok($$ select app.accept_invitation(sha256('token-ok')) $$, 'RY004', null,
  'Un usuario con el email sin verificar no puede aceptar');
select tests.clear_authentication();

select tests.authenticate_as(tests.id('u_unverified'));
select throws_ok($$ select app.accept_invitation(sha256('caducada')) $$, 'RY004', null,
  'Una invitación caducada no se puede aceptar');
select tests.clear_authentication();

select tests.authenticate_as(tests.id('guest'));
select is(app.accept_invitation(sha256('token-ok')), tests.id('org'),
  'El invitado (email verificado y coincidente, sin distinguir mayúsculas) acepta');
select results_eq($$ select role, permissions from organization_members where user_id = tests.id('guest') $$,
  $$ values ('operator', array['customers.write']) $$, 'Entra con el rol y permisos de la invitación');
select throws_ok($$ select app.accept_invitation(sha256('token-ok')) $$, 'RY004', null,
  'Una invitación no se puede usar dos veces');
select tests.clear_authentication();

select tests.authenticate_as(tests.id('u_unverified'));
select throws_ok($$ select app.accept_invitation(sha256('no-existe')) $$, 'RY004', null,
  'Un token inexistente se rechaza');
select tests.clear_authentication();

select * from finish();
rollback;

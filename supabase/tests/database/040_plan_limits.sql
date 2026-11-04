-- CASO CRÍTICO 4: no se pueden superar los límites del plan. Suscripción
-- inactiva = solo lectura. El consumo de correos no se reinicia al cambiar de plan.
begin;
set search_path = extensions, public;
select plan(29);

select tests.set_id('u_pro', tests.create_user('pro@taller.test'));
select tests.set_id('org_pro', tests.create_org(tests.id('u_pro'), 'taller-pro', 'pro'));
select tests.set_id('br_pro', tests.primary_branch(tests.id('org_pro')));

-- --------------------------------------------------------- clientes (Pro: 150)
select lives_ok($$ insert into customers (organization_id, branch_id, first_name)
                   select tests.id('org_pro'), tests.id('br_pro'), 'Cliente ' || i from generate_series(1, 150) i $$,
  'Pro: se pueden crear 150 clientes');
select throws_ok($$ select tests.add_customer(tests.id('org_pro'), tests.id('br_pro'), 'Extra') $$,
  'RY001', 'plan_limit_reached', 'Pro: el cliente 151 se rechaza');
select is((select count(*) from customers where organization_id = tests.id('org_pro')), 150::bigint,
  'Pro: siguen 150 clientes');
update customers set deleted_at = now()
 where id = (select id from customers where organization_id = tests.id('org_pro') order by created_at limit 1);
select lives_ok($$ select tests.add_customer(tests.id('org_pro'), tests.id('br_pro'), 'Hueco') $$,
  'Pro: un cliente borrado libera hueco');
select throws_ok($$ update customers set deleted_at = null where organization_id = tests.id('org_pro') and deleted_at is not null $$,
  'RY001', 'plan_limit_reached', 'Pro: restaurar un cliente por encima del límite se rechaza');

-- ------------------------------------------------- vehículos activos (Pro: 300)
select lives_ok($$
  insert into vehicles (organization_id, branch_id, customer_id, plate)
  select tests.id('org_pro'), tests.id('br_pro'), c.id, 'V' || lpad(((row_number() over ()) * 10 + k)::text, 6, '0')
  from (select id from customers where organization_id = tests.id('org_pro') and deleted_at is null limit 150) c
  cross join generate_series(1, 2) k $$,
  'Pro: se pueden registrar 300 vehículos activos');
select throws_ok($$ insert into vehicles (organization_id, branch_id, customer_id, plate)
                    select tests.id('org_pro'), tests.id('br_pro'), id, 'X0000001'
                    from customers where organization_id = tests.id('org_pro') and deleted_at is null limit 1 $$,
  'RY001', 'plan_limit_reached', 'Pro: el vehículo activo 301 se rechaza');
select lives_ok($$ insert into vehicles (organization_id, branch_id, customer_id, plate, status)
                   select tests.id('org_pro'), tests.id('br_pro'), id, 'X0000002', 'sold'
                   from customers where organization_id = tests.id('org_pro') and deleted_at is null limit 1 $$,
  'Pro: un vehículo vendido no cuenta como activo');
select throws_ok($$ update vehicles set status = 'active' where plate = 'X0000002' $$,
  'RY001', 'plan_limit_reached', 'Pro: reactivar un vehículo por encima del límite se rechaza');
select lives_ok($$ update vehicles set current_km = 1000 where organization_id = tests.id('org_pro') $$,
  'Pro: editar vehículos ya existentes no choca con el límite');

-- ----------------------------------------------------------- usuarios (Pro: 1)
select throws_ok($$ insert into invitations (organization_id, email, role, token_hash)
                    values (tests.id('org_pro'), 'otro@taller.test', 'operator', sha256('a')) $$,
  'RY001', 'plan_limit_reached', 'Pro: no se puede invitar a un segundo usuario');
select tests.set_id('u_x', tests.create_user('x@taller.test'));
select throws_ok($$ select tests.add_member(tests.id('org_pro'), tests.id('u_x'), 'operator') $$,
  'RY001', 'plan_limit_reached', 'Pro: no se puede añadir un segundo miembro');

-- ---------------------------------------------------------- usuarios (Max: 3)
select tests.set_id('u_max', tests.create_user('max@taller.test'));
select tests.set_id('org_max', tests.create_org(tests.id('u_max'), 'taller-max', 'max'));
select lives_ok($$ insert into invitations (organization_id, email, role, token_hash)
                   values (tests.id('org_max'), 'a@taller.test', 'operator', sha256('1')),
                          (tests.id('org_max'), 'b@taller.test', 'operator', sha256('2')) $$,
  'Max: dos invitaciones (3 usuarios en total)');
select throws_ok($$ insert into invitations (organization_id, email, role, token_hash)
                    values (tests.id('org_max'), 'c@taller.test', 'operator', sha256('3')) $$,
  'RY001', 'plan_limit_reached', 'Max: la cuarta plaza se rechaza (invitaciones pendientes cuentan)');
update invitations set expires_at = now() - interval '1 second' where email = 'a@taller.test';
select lives_ok($$ insert into invitations (organization_id, email, role, token_hash)
                   values (tests.id('org_max'), 'c@taller.test', 'operator', sha256('3')) $$,
  'Max: una invitación caducada libera la plaza');

-- -------------------------------------------------------------- sucursales
select throws_ok($$ select tests.add_branch(tests.id('org_pro'), 'segunda') $$,
  'RY001', 'plan_limit_reached', 'Pro: no admite una segunda sucursal');
select tests.set_id('u_bus', tests.create_user('bus@taller.test'));
select tests.set_id('org_bus', tests.create_org(tests.id('u_bus'), 'red-business', 'business'));
select lives_ok($$ select tests.add_branch(tests.id('org_bus'), 'b2'), tests.add_branch(tests.id('org_bus'), 'b3') $$,
  'Business: hasta 3 talleres en total');
select throws_ok($$ select tests.add_branch(tests.id('org_bus'), 'b4') $$,
  'RY001', 'plan_limit_reached', 'Business: el cuarto taller se rechaza (P13: 3 en total)');
update branches set status = 'archived' where organization_id = tests.id('org_bus') and slug = 'b3';
select lives_ok($$ select tests.add_branch(tests.id('org_bus'), 'b4') $$,
  'Business: archivar un taller libera la plaza');

-- -------------------------------------------- ilimitados (Business: clientes)
select lives_ok($$ insert into customers (organization_id, branch_id, first_name)
                   select tests.id('org_bus'), tests.primary_branch(tests.id('org_bus')), 'C' || i
                   from generate_series(1, 1000) i $$,
  'Business: clientes ilimitados');

-- ------------------------------------------------- suscripción inactiva
select tests.set_id('u_none', tests.create_user('none@taller.test'));
select tests.set_id('org_none', tests.create_org(tests.id('u_none'), 'sin-plan', null));
select throws_ok($$ select tests.add_customer(tests.id('org_none'), tests.primary_branch(tests.id('org_none')), 'X') $$,
  'RY002', 'subscription_inactive', 'Sin suscripción no se pueden crear clientes');

update subscriptions set status = 'canceled', canceled_at = now() where organization_id = tests.id('org_max');
select tests.authenticate_as(tests.id('u_max'));
select is((select count(*) from subscriptions), 1::bigint, 'Cancelada: el taller sigue viendo su suscripción');
select throws_ok($$ insert into customers (organization_id, branch_id, first_name)
                    values (tests.id('org_max'), tests.primary_branch(tests.id('org_max')), 'Nuevo') $$,
  '42501', null, 'Cancelada: los datos quedan en solo lectura');
select tests.clear_authentication();

update subscriptions set status = 'past_due', past_due_since = now() - interval '2 days'
 where organization_id = tests.id('org_max');
select lives_ok($$ select tests.add_customer(tests.id('org_max'), tests.primary_branch(tests.id('org_max')), 'Gracia') $$,
  'Impago reciente (< 7 días): acceso completo durante la gracia');
update subscriptions set past_due_since = now() - interval '8 days' where organization_id = tests.id('org_max');
select throws_ok($$ select tests.add_customer(tests.id('org_max'), tests.primary_branch(tests.id('org_max')), 'Tarde') $$,
  'RY002', 'subscription_inactive', 'Impago de más de 7 días: sin escritura');

-- ------------------------------------------------------- correos (Pro: 500)
insert into usage_counters (organization_id, resource, period_start, used, limit_snapshot)
values (tests.id('org_pro'), 'emails', app.usage_period(tests.id('org_pro')), 499, 500);
select isnt(app.reserve_usage(tests.id('org_pro'), 'emails'), null, 'Pro: el correo 500 se reserva');
select is(app.reserve_usage(tests.id('org_pro'), 'emails'), null, 'Pro: el correo 501 se rechaza');
update subscriptions set plan_code = 'max' where organization_id = tests.id('org_pro');
select isnt(app.reserve_usage(tests.id('org_pro'), 'emails'), null, 'Tras mejorar a Max se puede seguir enviando');
select is((select used from usage_counters where organization_id = tests.id('org_pro')), 501,
  'Cambiar de plan no reinicia el contador del mes');

select * from finish();
rollback;

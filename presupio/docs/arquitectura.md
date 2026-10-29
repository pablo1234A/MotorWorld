# Arquitectura y decisiones (fase 1)

## Visión general

```
Navegador (fase 2)
   │  cookie de sesión HttpOnly + JSON
   ▼
Fastify (apps/api)
   ├─ seguridad: Helmet, CORS con lista blanca, comprobación de Origin, solo JSON, límites de peticiones
   ├─ authPlugin: todas las rutas son privadas por defecto; resuelve la sesión, el rol y los permisos
   ├─ módulos: auth · me · company · members · contacts · quotes · follow-ups · exclusions · activity
   └─ withTenant(): una transacción por operación con app.company_id fijado
   ▼
PostgreSQL
   ├─ rol propietario (presupio_owner): ejecuta las migraciones y es dueño del esquema
   └─ rol de aplicación (presupio_app): solo opera con datos y está sujeto a RLS
```

Es un monolito modular. Para un MVP con 3–5 empresas piloto es lo más fiable y barato de operar. Los módulos están separados para poder extraer piezas: desde la fase 3, el motor de seguimiento se ejecuta como un proceso trabajador aparte (`src/worker.ts`), con todo su estado en PostgreSQL. Ver [`automatizacion.md`](automatizacion.md).

## Multiempresa: tres barreras independientes

1. **Aplicación.** Cada consulta filtra por `company_id`, tomado siempre de la sesión y nunca de la petición. Los esquemas Zod son estrictos: rechazan `companyId`, `role`, `plan` o cualquier campo no previsto.
2. **Row-Level Security.** Cada operación se ejecuta en una transacción con `set_config('app.company_id', …, true)`. Las políticas de PostgreSQL solo dejan ver o escribir filas de esa empresa. Sin empresa activa no se ve nada. La prueba `tenancy.test.ts` lo comprueba consultando directamente con el rol de la aplicación.
   - Se verificó quitando a propósito el filtro de empresa del código: RLS siguió bloqueando el acceso.
3. **Claves foráneas compuestas.** `(company_id, contact_id)`, `(company_id, quote_id)`, `(company_id, owner_user_id) → memberships`… La base de datos impide enlazar un presupuesto con el contacto o el usuario de otra empresa, aunque fallen las dos barreras anteriores.

Un recurso de otra empresa responde **404**, nunca 403, para no revelar que existe.

Las tablas de identidad (`users`, `sessions`, `user_tokens`) son globales, no tienen RLS y solo las usa el código de autenticación. Para aceptar una invitación antes de conocer la empresa se usa una función `SECURITY DEFINER` acotada (`app_find_open_invitation`), que solo devuelve el id y la empresa de una invitación abierta a partir del hash del token.

## Autenticación

- **Sesiones opacas en servidor**, no JWT. Se pueden revocar al instante: logout, cambio o restablecimiento de contraseña, baja de un miembro.
  - El token (256 bits) viaja en una cookie `HttpOnly`, `SameSite=Lax` y `Secure` en producción, con prefijo `__Host-`.
  - Solo se guarda su hash SHA-256.
  - Caducidad absoluta (30 días) y por inactividad (7 días).
- **Rol leído en cada petición.** Un cambio de rol o una baja surten efecto inmediato. La sesión tiene una clave foránea a la membresía: al eliminar a un miembro, sus sesiones en esa empresa se borran en cascada.
- **Contraseñas** con Argon2id (parámetros OWASP), entre 10 y 128 caracteres. Si el email no existe, el login verifica contra un hash ficticio para que el tiempo de respuesta no lo delate.
- **Recuperación de contraseña:**
  - Token de un solo uso que caduca en 30 minutos y se guarda hasheado.
  - Se consume con un `UPDATE … WHERE used_at IS NULL` atómico.
  - Al restablecer se cierran todas las sesiones.
  - La respuesta es idéntica exista o no el email, y el trabajo se hace después de responder para no filtrar tiempos.
- **Verificación de email:** mismo mecanismo de token; caduca en 48 horas.
- **CSRF:**
  - `SameSite=Lax`.
  - Comprobación del `Origin` en las peticiones que modifican datos.
  - Solo se acepta `application/json`: un formulario HTML de otro sitio recibe 415.
- **Límites de intentos:**
  - Global por IP (`@fastify/rate-limit`).
  - Por ruta (registro, login, recuperación, canje de tokens).
  - Por email (5 fallos de login cada 15 minutos).
  - Los contadores viven **en memoria**: con varias instancias habrá que moverlos a Redis (fase 4).

## Roles y permisos

| Permiso | owner | admin | member | viewer |
|---|:-:|:-:|:-:|:-:|
| Leer empresa, plan, miembros, presupuestos, contactos y actividad | ✅ | ✅ | ✅ | ✅ |
| Crear y editar presupuestos, contactos y seguimientos | ✅ | ✅ | ✅ | — |
| Registrar una exclusión (no contactar) | ✅ | ✅ | ✅ | — |
| Levantar una exclusión y corregir estados finales | ✅ | ✅ | — | — |
| Editar la empresa y la configuración; gestionar miembros e invitaciones | ✅ | ✅ | — | — |
| Asignar o retirar el rol de propietario | ✅ | — | — | — |

Además:
- Nadie cambia su propio rol.
- La empresa nunca se queda sin propietario: las operaciones se serializan con `FOR UPDATE` sobre la empresa.
- Un administrador no puede tocar a un propietario.

Cualquier comercial puede registrar una exclusión: anotar que alguien no quiere más mensajes no debe depender de un administrador.

## Modelo de datos

```
users ─┬─< memberships >── companies ──┬── company_settings (1:1)
       │                               ├── subscriptions (1:1)
       ├─< sessions (FK a membership)  ├─< invitations
       └─< user_tokens                 ├─< contacts ──< quotes ──< follow_ups
                                       ├─< contact_exclusions
                                       └─< activity_log (solo inserción)
```

### Estados de un presupuesto

| Estado | Significado |
|---|---|
| `draft` | Preparado; no enviado |
| `sent` | Enviado y **pendiente de respuesta**; es el candidato a seguimiento |
| `responded` | El cliente ha contestado. No implica compra |
| `accepted` | **Venta confirmada.** Exige evidencia documentada (contrato, pedido, señal…) y registra quién la confirmó y el importe, marcado como `declared_by_company` |
| `rejected` | El cliente lo ha rechazado |

Transiciones permitidas: `draft→sent`, `sent→responded|accepted|rejected` y `responded→sent|accepted|rejected`. Propietarios y administradores pueden corregir estados finales (`accepted→responded`, `rejected→responded|sent`), y queda registrado. Los presupuestos se **archivan** (`archived_at`); no se borran.

### Métricas sin inflar (plan maestro, sección 4)

- `responded_at`: primera respuesta del cliente, de cualquier tipo.
- `reactivated_at`: **oportunidad reactivada**. El cliente responde (sin rechazar) **después de un seguimiento de contacto completado**. Las tareas internas no cuentan.
- **Venta recuperada:** `accepted` **y** `reactivated_at`, con la evidencia obligatoria.

Un rechazo cuenta como respuesta, pero no como reactivación. Las restricciones `CHECK` de la base de datos impiden, por ejemplo, un `accepted` sin evidencia o una reactivación sin respuesta.

### Seguimientos

- Canales: `task` (interno), `email`, `phone`, `whatsapp`, `sms`, `in_person`.
- Se pueden programar (`pending`) o registrar ya hechos (`completed` con `outcome`).
- **Paradas automáticas:**
  - Cuando el cliente responde, se cancelan los contactos pendientes. Las tareas internas se mantienen.
  - Al aceptar, rechazar o archivar, se cancela todo lo pendiente.
  - Al registrar una exclusión, se cancelan los pendientes de los canales afectados.
- **Exclusiones:** se aplican por contacto, email o teléfono, en un canal concreto o en todos. Cada contacto con el cliente comprueba la lista y devuelve 409 `CONTACT_EXCLUDED` si está bloqueado.
- `dedupe_key` única por empresa: garantiza que el motor automático de la fase 3 no cree el mismo paso dos veces.

### Historial de actividad

- Tabla de solo inserción: el rol de la aplicación no tiene `UPDATE` ni `DELETE` sobre ella.
- Guarda la acción, la entidad y unos metadatos mínimos. Se filtran claves como `password`, `token`, `hash` o `cookie`, y no se guarda el contenido de los mensajes.

### Suscripción

- Al registrarse: `trialing` con los límites de Starter durante `TRIAL_DAYS` (14 por defecto), **sin cobro**.
- **Ningún endpoint escribe en `subscriptions`**, y desde la fase 4 el rol de la aplicación ni siquiera tiene permiso `UPDATE`/`DELETE` sobre la tabla. Desde la fase 5 la cambian solo las funciones `SECURITY DEFINER` acotadas que aplican un webhook verificado de Stripe (modo de prueba, ver [`facturacion.md`](facturacion.md)) y la herramienta de operación.
- Consumo por empresa y periodo en `usage_periods` (contador atómico con `CHECK`) y `recovery_events` (una por presupuesto). Ver [`limites-y-metricas.md`](limites-y-metricas.md).
- El catálogo (27,99 €, 57,99 € y 127,99 €; 25 y 65 recuperaciones al mes; Business con uso razonable) vive en `src/domain/plans.ts`.

## Migraciones

- Archivos SQL numerados en `apps/api/migrations/`.
- Cada migración se aplica en una transacción, con bloqueo consultivo y checksum: si alguien modifica una migración ya aplicada, el migrador falla.
- Después de migrar, se conceden al rol de aplicación solo los permisos de datos. El migrador comprueba que ese rol no sea superusuario ni tenga `BYPASSRLS`.
- **Nunca se edita una migración ya aplicada en un entorno compartido:** se crea una nueva (`0002_….sql`).

## Decisiones tomadas sin consultar (revisables)

| Decisión | Motivo | Cómo cambiarla |
|---|---|---|
| Prueba gratuita de 14 días con límites de Starter | Práctica habitual en SaaS; el plan maestro no la define | `TRIAL_DAYS` |
| Si los precios incluyen IVA está pendiente de validación fiscal (la interfaz lo indica; no hay Stripe Tax) | Pendiente (D3) | `PRICES_TAX_DISPLAY`, [`facturacion.md`](facturacion.md#8-pendiente-no-se-ha-activado-ni-se-da-por-resuelto) |
| Business: 300 recuperaciones al mes (uso razonable) y 400 emails automáticos al día | Límite amplio, publicado y sin restricciones ocultas (fase 4) | `src/domain/plans.ts` |
| Recuperación = respuesta registrada en los 30 días siguientes a un seguimiento verificable | Resultado medible y temprano; la venta se mide aparte (fase 4) | `src/domain/recovery.ts` |
| El registro revela si un email ya existe (409) | Mejor experiencia en B2B; mitigado con límite por IP | `auth/routes.ts` |
| Login permitido sin email verificado | No bloquea el piloto. Desde la fase 4, activar el envío automático sí exige el email confirmado | `automation/routes.ts` |
| Las invitaciones devuelven el enlace a quien invita | Funciona sin proveedor de correo; la cuenta queda sin verificar | `members/routes.ts` |
| Importes en céntimos (enteros) y moneda EUR por defecto | Evita errores de coma flotante | — |

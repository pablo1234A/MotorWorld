# Registro de correcciones prelanzamiento

Problemas de la auditoría integral (octubre de 2026) y de lo descubierto al corregirlos.

Para cada problema se recoge la causa, la corrección, la prueba que la demuestra y lo que queda pendiente. Los estados son los de la auditoría:

- **CORREGIDO Y VERIFICADO**
- **CORREGIDO PERO NO VERIFICADO COMPLETAMENTE**
- **PENDIENTE POR DEPENDENCIA EXTERNA**
- **PENDIENTE DE REVISIÓN LEGAL O FISCAL**
- **NO RESUELTO**

## P1-02 · Pruebas intermitentes en paralelo

- **Causa:** todos los archivos de prueba compartían una base de datos. `runCycle` recorre todas las empresas con envío automático, así que un archivo planificaba y cancelaba pasos de empresas de otro archivo que se ejecutaba a la vez. En la auditoría fallaron 3 de 6 ejecuciones.
- **Corrección:**
  - `test/global-setup.ts` migra la base plantilla `*_test` y clona una base por trabajador de Vitest (`*_test_w1…wN`, con `CREATE DATABASE … TEMPLATE`).
  - `test/worker-db.ts` (archivo de arranque de cada prueba) apunta cada archivo a la base de su trabajador.
  - Sin `DATABASE_ADMIN_URL`, las pruebas usan una sola base y se ejecutan en serie.
- **Prueba:** 10 ejecuciones consecutivas en paralelo, todas en verde. Se comprobó que la plantilla queda vacía y que cada base tiene sus propias empresas.

## P1-01 · La API y el worker terminaban si PostgreSQL cerraba conexiones

- **Causa:** el `pg.Pool` emite `error` cuando el servidor cierra una conexión inactiva (código 57P01 en un reinicio, o un corte de red). No había manejador, así que Node terminaba el proceso.
- **Corrección:**
  - `createDb` siempre registra un manejador. La API y el worker lo conectan a su registro de errores.
  - Las promesas rechazadas sin capturar se registran.
  - El envío anota `provider_call_started_at` justo antes de llamar al proveedor. Si la base de datos falla a mitad de un lote, lo no enviado se distingue de lo que pudo salir (ver P2-07).
- **Prueba:** `test/resilience.test.ts`, con un proxy TCP que «tumba» la base sin parar el servidor real.
  - `/health/ready` responde 503 durante el corte y 200 al volver, sin reiniciar.
  - Un login durante el corte responde 503 con `SERVICE_UNAVAILABLE`.
  - Con `pg_terminate_backend` (el error 57P01 exacto de la auditoría), el proceso sigue vivo.
  - Un ciclo del motor durante el corte falla sin efectos y el siguiente envía una sola vez.
  - El **proceso real del worker** (`src/worker.ts`) sigue vivo durante el corte y vuelve a completar ciclos al restablecerse.

## P2-07 · Envíos de resultado desconocido

- **Causa:**
  - Un envío interrumpido quedaba como «fallido», cosa que no se podía demostrar.
  - No se distinguía «no llegó a llamarse al proveedor» de «puede haber salido».
  - No había reconciliación ni revisión.
  - **Fallo nuevo descubierto:** si la llamada colgada volvía después de darse por desconocida, su resultado sobrescribía el estado sin contar el intento.
- **Corrección** (migraciones 0006 y 0007, `automation/unknown.ts`):
  - Nuevo estado de seguimiento `unknown` («Por revisar»).
  - Si el proveedor nunca se llamó, el seguimiento vuelve a la cola y el intento se libera.
  - Si el proveedor se llamó, queda en `unknown` y el intento como `unverified`: no se cobra y no se reenvía.
  - **Reconciliación:** Mailgun se consulta en el Events API, y los webhooks de Mailgun sobre ese envío demuestran que salió.
  - **Revisión manual** con `POST /follow-ups/:id/resolve` (propietario o administrador), registrando quién y qué decidió. La interfaz añade la pestaña «Por revisar».
  - Alerta `deliveries_unknown_review` en `/ops/status`.
  - Un intento `unverified` solo pasa a contado si cabe en el límite de su periodo.
  - Un resultado tardío resuelve el desconocido, o se ignora si ya estaba resuelto.
- **Prueba:**
  - `test/resilience.test.ts`, 4 pruebas: corte a mitad de lote, reconciliación, resultado tardío, «no enviado» y protección del intento contado.
  - `automation.test.ts`: webhook sobre un envío desconocido.
  - `automation-units.test.ts`: consulta del Events API contra un servidor local.
- **Pendiente:** comprobar la consulta del Events API con una cuenta real de Mailgun. No se pudo consultar su documentación desde este entorno; el diseño usa los filtros `recipient` y fechas y la variable `presupio_delivery_id`.

## P2-08 · Una reducción manual del límite se deshacía

- **Causa:** `ensureUsagePeriod` subía el límite al del plan siempre que el del plan fuera mayor, también cuando soporte lo había bajado.
- **Corrección:**
  - Solo se sube cuando el plan del periodo cambia.
  - Nuevo comando auditado `npm run ops -- set-limit` (no admite un límite menor que lo ya consumido, exige un motivo y queda en el historial).
- **Prueba:** `plans.test.ts › un ajuste de soporte del límite se mantiene…`. El ajuste se mantiene tras varios cálculos y un cambio de plan lo recalcula.

## P1-03 · Supresión de un contacto o de un presupuesto

- **Causa:** no había forma de borrar ni anonimizar un contacto o un presupuesto concreto; solo se podía borrar la empresa entera con `ops`.
- **Corrección** (migración 0008, `modules/privacy/service.ts`):
  - `POST /contacts/:id/anonymize` con `{ confirm: "ANONIMIZAR" }` y `POST /quotes/:id/erase` con `{ confirm: "ELIMINAR" }`.
  - Nuevo permiso `data:erase`, solo para propietarios y administradores.
  - Disponible en solo lectura: una petición de supresión debe atenderse aunque la cuenta no tenga plan activo.
- **Qué se hace** (anonimización irreversible):
  - Se borran:
    - nombre, email, teléfono, organización y notas del contacto;
    - destinatario, asunto y cuerpo de los emails;
    - notas de los seguimientos y la instantánea de un email aprobado (sustituida por un marcador);
    - evidencias de venta y motivos de rechazo;
    - notas libres del historial (función acotada `app_scrub_activity_notes`);
    - en un presupuesto: título, descripción y referencia.
  - Se cancelan los seguimientos pendientes y se desactiva el envío automático de esos presupuestos.
  - El presupuesto queda oculto y no se puede modificar: responde 404.
- **Qué se conserva:**
  - las filas sin datos personales, para los intentos ya facturados, las métricas y el historial;
  - las exclusiones **activas**, con solo el dato de su canal, para seguir respetando una baja.
- **Interfaz:** «Suprimir datos» en la ficha del contacto y «Eliminar definitivamente» en la del presupuesto, con confirmación escrita.
- **Prueba:** `test/privacy.test.ts`, 4 pruebas.
  - Permisos (un comercial recibe 403), aislamiento (otra empresa recibe 404) y confirmación obligatoria.
  - Ningún dato personal queda en la exportación completa.
  - El intento facturado y la exclusión activa minimizada se conservan.
  - La API oculta lo suprimido y el motor no programa ni envía nada a esa persona.
  - Funciona en solo lectura.
- **Pendiente de revisión legal:**
  - si la conservación de la exclusión activa y de la fila anonimizada es adecuada;
  - si alguna obligación exige conservar algún dato concreto (`docs/legal/README.md`).

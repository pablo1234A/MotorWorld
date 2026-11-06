# RevisaYa — Citas y presupuestos (Fase 7)

Código: migración `supabase/migrations/20261108000100_appointments_quotes.sql`, módulos `src/server/modules/appointments/` y `src/server/modules/quotes/`, PDF en `src/server/quotes/pdf.tsx`. Pruebas: `supabase/tests/database/130_appointments_quotes.sql`, `tests/integration/phase7.test.ts`, `tests/unit/phase7.test.ts`, `tests/e2e/reminders.spec.ts` y `tests/e2e/quotes.spec.ts`.

## 1. Citas

### 1.1 Solicitud ≠ cita confirmada
Lo que llega del cliente es una **solicitud** (`requested`). Solo el taller la convierte en **cita** (`confirmed`) con día, hora y duración. La base de datos valida las transiciones:

```text
requested → confirmed | rejected | canceled
confirmed → confirmed (cambio de fecha) | completed | no_show | canceled
```

Cada cambio queda en `appointment_events` (quién y cuándo), visible en el historial de la cita.

### 1.2 Cómo pide cita el cliente
- **Desde el aviso**: el botón «Pedir cita» lleva a `/t/<slug>/cita?t=<enlace firmado>`. El enlace (HMAC con `EMAIL_LINK_SECRET`) identifica el recordatorio. La página se abre con el nombre, el correo, el teléfono y la matrícula ya rellenos, y la solicitud queda vinculada al cliente, al vehículo y al aviso (el panel de recordatorios muestra «Cita pedida»). Es determinista: un reintento del envío genera el mismo enlace. Caduca 60 días después de la fecha de la revisión; después, la página deja pedir cita igualmente, sin prellenar nada.
- **Enlace general del taller** (`/t/<slug>/cita`, en Configuración → Citas): para la web, Google o WhatsApp. Sin enlace firmado, la solicitud se vincula a una ficha solo si coinciden la matrícula **y** el correo; si no, el taller la vincula o crea la ficha desde el panel.
- Pulsar dos veces el botón del aviso no crea dos solicitudes (índice único de solicitud abierta por aviso). Tras un rechazo sí se puede volver a pedir.
- Con varias sucursales con citas activas, el cliente elige primero el taller.

### 1.3 Dos modos (por sucursal)
| Modo | El cliente… | Notas |
|---|---|---|
| `free_request` (por defecto) | propone un día (desde mañana hasta 90 días) | El taller fija la hora al confirmar. |
| `slots` | elige un hueco libre | `app.available_slots`: franjas semanales de la sucursal **en su zona horaria**, sin festivos ni días de cierre, con la antelación mínima y la capacidad de cada hueco. La ocupación cuenta solicitudes con hueco y citas confirmadas que se solapan (`app.slot_load`). Al enviar, un cerrojo por sucursal impide que dos personas se queden la última plaza (probado con 3 solicitudes simultáneas). |

### 1.4 Protección de la página pública
- Límite de peticiones: 5 por hora y por IP, y 60 por hora por taller.
- Campo trampa invisible: si llega relleno, se responde como si todo fuera bien y no se guarda nada.
- **Cloudflare Turnstile** si están configuradas `NEXT_PUBLIC_TURNSTILE_SITE_KEY` y `TURNSTILE_SECRET_KEY`. Se verifica en el servidor y, si Cloudflare no responde, la solicitud se rechaza. Sin claves no se exige, y las dos protecciones anteriores siguen activas.
- Sin sesión: todo se lee y escribe con la conexión del sistema y solo se expone la marca del taller. Con el enlace firmado se añaden también el nombre, el contacto y la matrícula del propio cliente.
- Con la suscripción inactiva, o sin ninguna sucursal con citas activas, la página indica que no se aceptan citas en línea y muestra el contacto del taller.
- La página no se indexa en buscadores (`noindex`).

### 1.5 Correos
| Momento | Correo | Cuenta en el consumo |
|---|---|---|
| Solicitud enviada | `booking_received` al cliente (si dejó correo) | Sí |
| Solicitud nueva | Aviso al taller: administradores y quien tenga `appointments.manage` en esa sucursal | No (correo de la plataforma) |
| Confirmada / cambiada | `booking_confirmed` / `booking_rescheduled` con la cita en **.ics** (RFC 5545, mismo UID y SEQUENCE creciente) | Sí |
| Rechazada / cancelada | `booking_rejected` / `booking_canceled`, con mensaje opcional del taller y botón para pedir otra cita | Sí |

- Las cinco plantillas de cita son **editables** en Configuración → Plantillas. Sus variables son `{nombre}`, `{modelo}`, `{matricula}`, `{fecha_cita}`, `{hora_cita}` y `{taller}`.
- Son correos de servicio pedidos por el propio cliente: no llevan enlace de baja.
- Respetan los rebotes, las quejas y los bloqueos manuales. Una baja de los **avisos** no impide recibir los correos de una cita que la persona ha pedido.
- Sin proveedor configurado, el panel lo dice y no simula el envío.

### 1.6 Panel
- `/app/citas` (permiso `appointments.manage`): pestañas Solicitudes, Próximas, Historial y Todas, con búsqueda por cliente o matrícula.
- `/app/citas/<id>`: confirmar (día, hora, duración y aviso por correo), cambiar la fecha, rechazar o cancelar (con mensaje), marcar como realizada o como «no se presentó», vincular a la ficha del cliente (sugiere el cliente con el mismo correo) o crear la ficha, notas internas e historial.
- `/app/citas/nueva`: cita creada en el taller (por teléfono o en el mostrador). Nace confirmada. También se accede desde la ficha del vehículo.
- El inicio del panel avisa de las solicitudes pendientes.
- Configuración → Citas (solo administradores): activar la página, el modo, la duración de los huecos, la antelación mínima y las franjas por día de la semana.

## 2. Presupuestos (PDF §6: «básicos en PDF, con IVA», plan Pro y superiores)

- **Importes exactos**: `decimal.js` en el navegador y en el servidor, con las mismas reglas que la base de datos:
  - subtotal de línea = round(cantidad × precio, 2);
  - IVA = round(subtotal × tipo / 100, 2);
  - los totales se **verifican** al confirmar la transacción.
  - Tipos de IVA: 21, 10, 4 y 0 %.
  - Se admiten cifras escritas a la española (`4,5`; `1.234,56`).
- **Numeración** `P-AAAA-NNNN` por sucursal y año, sin duplicados aunque se creen a la vez (probado con 10 simultáneos). Un borrador borrado deja un hueco en la numeración: es un presupuesto, no una factura.
- **Estados**:

  ```text
  draft (editable) → sent («Emitido») → accepted | rejected | expired
  ```

  Al emitir se **congelan** los datos del taller (razón social, NIF, dirección, logo), del cliente y del vehículo (`snapshot`), y se genera y guarda el PDF (bucket privado `documents`). Lo emitido ya no se puede modificar: se duplica para hacer otro.
- **Caducidad**: los emitidos cuya validez ha terminado pasan a «Caducado» cada noche (`private.expire_quotes`, `pg_cron`, 03:37). Los borradores no caducan solos.
- **PDF** (`@react-pdf/renderer`):
  - logo (PNG o JPG; un logo WebP se sustituye por el nombre) y datos fiscales del taller;
  - cliente, vehículo y conceptos;
  - base imponible, IVA desglosado por tipo y total;
  - observaciones y la indicación «No es una factura».

  Los borradores llevan la marca «BORRADOR».
- **Envío**: correo al cliente con el PDF adjunto (cuenta en el consumo). Se puede volver a enviar.
- **Panel**: `/app/presupuestos` (permiso `quotes.manage`) con filtros por estado y búsqueda. El editor calcula el total en vivo y está accesible también desde la ficha del vehículo. Solo los administradores pueden borrar borradores.

## 3. Pendiente / fuera de alcance
- Sincronización de citas con Google Calendar (plan Max): Fase 9.
- Aceptación del presupuesto por el cliente desde un enlace: no la pide el PDF. El taller la marca a mano.
- Facturación: fuera del alcance del producto (PDF §6).

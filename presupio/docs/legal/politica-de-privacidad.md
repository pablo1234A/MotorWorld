# Política de privacidad de Presupio

> **BORRADOR — PENDIENTE DE REVISIÓN JURÍDICA. NO PUBLICAR.**
> Recoge los datos que Presupio trata de verdad y durante cuánto tiempo. No es un documento validado y no afirma el cumplimiento de ninguna norma. Ver `README.md`.

Esta política trata los datos de las **personas usuarias de Presupio** (cuentas y empresas cliente). Los datos de los clientes de cada empresa (sus contactos y presupuestos) los trata Presupio por encargo de esa empresa (`encargo-de-tratamiento.md`).

## 1. Responsable

`[PENDIENTE: razón social, NIF, domicilio y contacto. Delegado de protección de datos, si procede]`

## 2. Qué datos tratamos

- **Cuenta:**
  - nombre y email;
  - contraseña, guardada solo como resumen Argon2id;
  - fecha de aceptación de los términos y último acceso.
- **Empresa:** nombre, razón social, NIF, teléfono, web y zona horaria.
- **Sesión:**
  - una cookie técnica (`politica-de-cookies.md`);
  - el navegador (user agent) de cada sesión.
- **Uso:** historial de acciones dentro de la cuenta, y consumo del plan (intentos y emails enviados).
- **Pago:**
  - identificadores de cliente y suscripción en Stripe;
  - estado de la suscripción e historial de eventos de facturación.

  Los datos de la tarjeta los recoge Stripe; Presupio no los recibe.
- **Prevención del abuso:**
  - huellas irreversibles (SHA-256) del email y del dominio que disfrutaron de la prueba gratuita;
  - contadores de límites de peticiones con la dirección IP o el email resumidos.

## 3. Para qué y con qué base

| Finalidad | Base jurídica |
|---|---|
| Prestar el servicio contratado o la prueba | `[PENDIENTE]` |
| Cobro de la suscripción | `[PENDIENTE]` |
| Seguridad: límites de peticiones e inicios de sesión | `[PENDIENTE]` |
| Una prueba gratuita por persona o empresa | `[PENDIENTE]` |
| Avisos del servicio: fin de la prueba, conservación de datos, cobros | `[PENDIENTE]` |

## 4. Con quién se comparten

- **Alojamiento:** `[PENDIENTE: proveedor y región]`
- **Envío de emails:** `[PENDIENTE: Mailgun (región UE) u otro proveedor SMTP]`
- **Pagos:** Stripe `[PENDIENTE: entidad y garantías]`
- **Transferencias fuera del EEE:** `[PENDIENTE]`

## 5. Cuánto tiempo

- **Cuenta y datos de la empresa:** mientras la cuenta tenga acceso y 90 días después (con avisos previos). Después pueden eliminarse.
- **Sesiones:** 30 días como máximo, 7 sin actividad.
- **Texto de los emails enviados:** 90 días.
- **Huellas de la prueba gratuita:** 24 meses.
- **Contadores de límites:** minutos u horas.

`[PENDIENTE: confirmar los plazos y las obligaciones de conservación aplicables; política de copias de seguridad]`

## 6. Derechos

`[PENDIENTE: derechos aplicables, cómo ejercerlos, plazo de respuesta y autoridad de control]`

Hoy la aplicación permite:

- exportar todos los datos de la empresa;
- corregir los datos del perfil y de la empresa;
- suprimir contactos y presupuestos concretos.

Borrar la cuenta completa se hace a petición, mediante operación.

## 7. Seguridad

Medidas implantadas en el producto:

- aislamiento de datos por empresa en la base de datos (seguridad a nivel de fila);
- contraseñas con Argon2id;
- tokens y enlaces guardados solo como resumen;
- cookie de sesión HttpOnly;
- cabeceras de seguridad;
- control de permisos por rol;
- historial de acciones.

`[PENDIENTE: medidas del alojamiento, cifrado en reposo y copias]`

## 8. Cambios

`[PENDIENTE]`

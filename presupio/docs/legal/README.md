# Documentos legales de Presupio — BORRADORES PENDIENTES DE REVISIÓN

> **Estado: BORRADOR. PENDIENTE DE REVISIÓN JURÍDICA Y FISCAL.**
> Estos textos los ha preparado el equipo técnico a partir de cómo funciona Presupio de verdad: qué datos guarda, durante cuánto tiempo y con qué proveedores. **No son documentos validados.**
>
> - No se ha comprobado que cumplan la normativa aplicable.
> - No deben publicarse ni presentarse a usuarios como definitivos.
> - Presupio **no afirma** cumplir el RGPD, la LOPDGDD, la LSSI-CE ni ninguna otra norma por el hecho de tenerlos.

## Documentos

| Archivo | Para qué | Estado |
|---|---|---|
| [terminos-del-servicio.md](terminos-del-servicio.md) | Condiciones de uso y de contratación | Borrador |
| [politica-de-privacidad.md](politica-de-privacidad.md) | Datos de las personas usuarias de Presupio (Presupio como responsable) | Borrador |
| [encargo-de-tratamiento.md](encargo-de-tratamiento.md) | Datos de los clientes de cada empresa (Presupio como encargado) | Borrador |
| [politica-de-cookies.md](politica-de-cookies.md) | Cookies de la aplicación | Borrador |
| [aviso-legal.md](aviso-legal.md) | Datos del titular del sitio | Borrador |

Los valores entre `[PENDIENTE: …]` faltan y no deben inventarse.

## Cómo se conectan con la aplicación

- El alta y la aceptación de invitaciones piden aceptar «los términos del servicio y la política de privacidad».
- **En producción la API no arranca** sin `LEGAL_TERMS_URL` y `LEGAL_PRIVACY_URL` (https). Son las direcciones de las versiones **publicadas tras la revisión**, y los formularios enlazan a ellas.
- Fuera de producción, la aplicación indica que los documentos están pendientes de publicar. Nunca enlaza a estos borradores.
- Se guarda la fecha de aceptación (`users.terms_accepted_at`), pero **no la versión aceptada**. Si la revisión lo pide, hay que añadirla.

## Qué debe revisar un profesional antes de publicar

### Identidad y contratación

1. Datos del titular: razón social, NIF, domicilio, inscripción registral, contacto (aviso legal, términos y privacidad).
2. Si Presupio se contrata solo entre empresas y profesionales o también por consumidores. Cambia el régimen aplicable (desistimiento, cláusulas…). Hoy el producto está pensado para empresas de reformas.
3. Condiciones de contratación con Stripe:
   - renovación mensual;
   - cambios de plan (subida prorrateada inmediata, bajada en la renovación);
   - cancelación al final del periodo;
   - 7 días de gracia ante un cobro fallido, **pendiente de confirmar**.
4. Limitación de responsabilidad, disponibilidad del servicio (sin SLA definido), ley aplicable y jurisdicción.
5. Texto del **uso razonable** de Business (300 intentos al mes y 400 emails automáticos al día, publicados sin restricciones ocultas).
6. La regla de **una prueba gratuita por persona y por dominio de empresa al año** (`docs/facturacion.md`) y cómo se comunica.

### Fiscal (asesoría fiscal)

7. Si 27,99, 57,99 y 127,99 € se presentan con IVA incluido o aparte, y en qué casos.
8. El tratamiento de clientes intracomunitarios y de Canarias, Ceuta y Melilla.
9. La facturación (Stripe emite las facturas, Presupio no las guarda) y la conservación de la documentación contable.

   Hoy la interfaz dice «pendiente de validación fiscal» y no se usa Stripe Tax.

### Protección de datos

10. **Roles:**
    - Presupio, como responsable de los datos de sus usuarios;
    - Presupio, como encargado de los datos de los clientes de cada empresa (presupuestos, contactos, emails de seguimiento).
11. **Base jurídica de los emails de seguimiento.** Hoy la empresa la declara al activar el envío automático (campo «base legal»), y Presupio añade la baja en un clic y la lista de exclusión. Hay que confirmar:
    - si estos emails son comunicaciones comerciales en el sentido de la LSSI-CE;
    - qué base y qué requisitos aplican;
    - qué debe garantizar cada parte.
12. **Subencargados y transferencias internacionales:**
    - alojamiento: `[PENDIENTE: proveedor y región]`;
    - envío de email: Mailgun, región UE, u otro proveedor SMTP;
    - pagos: Stripe;
    - recepción de respuestas: Mailgun Routes.

    Para cada uno: contrato, ubicación y garantías.
13. **Plazos de conservación** (abajo) y si alguna obligación exige conservar más tiempo algún dato, por ejemplo documentación contable.
14. **Supresión.** Se puede anonimizar un contacto o eliminar un presupuesto. Se conservan:
    - la fila anonimizada, para los intentos ya facturados;
    - la exclusión activa (solo el canal), para seguir respetando la baja.

    Hay que confirmar que es adecuado (`docs/registro-correcciones.md`, P1-03).
15. **Huellas de la prueba gratuita:** SHA-256 de email y dominio, 24 meses. Hay que validar la base jurídica y el plazo. Lo mismo para los contadores de límites de peticiones (IP y email resumidos, minutos u horas).
16. **Detección de respuestas:** se guardan metadatos de los emails entrantes (presupuesto, cómo se emparejó, dominio del remitente), no su contenido. Hay que informarlo.
17. Si hace falta un registro de actividades de tratamiento, una evaluación de impacto o un delegado de protección de datos.
18. Procedimiento y plazo de **notificación de brechas** al cliente (encargo) y a la autoridad.

### Cookies

19. Confirmar que la única cookie (sesión, técnica y necesaria) no requiere consentimiento, y el texto informativo. No hay analítica ni publicidad.

## Datos y plazos reales (para la revisión)

| Dato | Dónde | Conservación actual |
|---|---|---|
| Cuenta: nombre, email, contraseña (hash Argon2id), último acceso | `users` | Mientras exista la cuenta. Borrado manual 90 días después de terminar el acceso (`npm run ops -- delete-company`), con avisos previos. |
| Empresa: nombre, razón social, NIF, teléfono, web, zona horaria | `companies` | Igual |
| Sesiones: cookie, navegador (user agent) | `sessions` | 30 días como máximo; 7 sin actividad |
| Presupuestos, contactos, seguimientos, exclusiones | varias tablas | Igual que la cuenta. Supresión individual disponible. |
| Texto de cada email automático enviado | `message_deliveries` | 90 días (`MESSAGE_CONTENT_RETENTION_DAYS`) |
| Historial de actividad | `activity_log` | Igual que la cuenta |
| Eventos de webhooks (Mailgun, correo entrante) | `webhook_events` | 30 días |
| Historial de facturación (sin datos de tarjeta) | `billing_events` | Igual que la cuenta |
| Huellas de la prueba gratuita | `trial_claims` | 24 meses |
| Contadores de límites (claves resumidas) | `rate_limit_counters` | Ventana del límite + 1 hora |
| Copias de seguridad | `ops/backup.sh` | `[PENDIENTE: política de copias y su plazo]` |

# Contrato de encargo del tratamiento (Presupio como encargado)

> **BORRADOR — PENDIENTE DE REVISIÓN JURÍDICA. NO PUBLICAR NI FIRMAR.**
> Estructura y datos técnicos reales para que un profesional redacte el contrato. No es un documento validado. Ver `README.md`.

## 1. Partes

- **Responsable:** la empresa cliente de Presupio.
- **Encargado:** `[PENDIENTE: titular de Presupio]`

## 2. Objeto

Tratar, por cuenta de la empresa, los datos de sus clientes y contactos para:

- registrar presupuestos;
- programar seguimientos;
- enviar emails automáticos de seguimiento, si la empresa lo activa;
- detectar respuestas, si está configurado.

## 3. Datos e interesados

- **Interesados:** clientes y contactos de la empresa que han recibido un presupuesto.
- **Datos:**
  - nombre, organización, email y teléfono;
  - presupuestos (título, importe, estados, notas);
  - seguimientos y su resultado;
  - emails enviados: texto durante 90 días;
  - bajas y exclusiones;
  - metadatos de las respuestas recibidas (no su contenido).

## 4. Duración

Mientras dure el servicio y, tras su fin, el plazo de conservación de 90 días con avisos previos, durante el cual la empresa puede exportar sus datos.

`[PENDIENTE: devolución o destrucción al final y certificación]`

## 5. Instrucciones de la empresa

La empresa decide:

- a quién se contacta;
- con qué textos;
- cuándo (días y horario);
- si cada email requiere su aprobación previa.

Declara su base legal al activar el envío automático.

`[PENDIENTE: revisión del reparto de responsabilidades sobre la base jurídica de los envíos]`

## 6. Subencargados

| Servicio | Proveedor | Estado |
|---|---|---|
| Alojamiento y base de datos | `[PENDIENTE]` | — |
| Envío de emails de seguimiento | Mailgun (región UE) u otro proveedor SMTP | `[PENDIENTE: contrato y garantías]` |
| Recepción de respuestas | Mailgun Routes, si se configura | `[PENDIENTE]` |

## 7. Seguridad (medidas implantadas en el producto)

- **Aislamiento entre empresas:** seguridad a nivel de fila en PostgreSQL. Las pruebas automatizadas comprueban que una empresa no ve los datos de otra.
- **Permisos por rol.** Solo propietarios y administradores pueden suprimir datos o cambiar el envío.
- **Historial de acciones** de solo inserción.
- **Bajas:**
  - enlace de baja en un clic en cada email;
  - lista de exclusión que bloquea nuevos envíos;
  - los rebotes y las quejas del proveedor excluyen al contacto.
- **Supresión individual:** anonimizar un contacto o eliminar un presupuesto.
- **Minimización:**
  - el texto de los emails se borra a los 90 días;
  - de las respuestas no se guarda el contenido.
- `[PENDIENTE: medidas del alojamiento, cifrado, copias y su plazo]`

## 8. Asistencia a la empresa

- **Exportación completa** de los datos de la empresa.
- **Supresión individual** desde la aplicación.
- `[PENDIENTE: plazos de respuesta]`

## 9. Brechas de seguridad

`[PENDIENTE: procedimiento y plazo de notificación a la empresa]`

## 10. Auditorías

`[PENDIENTE]`

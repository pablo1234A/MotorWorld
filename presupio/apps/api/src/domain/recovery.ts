/**
 * Definición de «recuperación» (unidad de consumo de los planes). Ver docs/limites-y-metricas.md.
 *
 * Un presupuesto cuenta como recuperación cuando se cumplen TODAS estas condiciones:
 *  1. Estaba enviado y sin respuesta.
 *  2. Antes de la respuesta hubo un seguimiento realizado y verificable:
 *     - un contacto manual registrado como hecho (llamada, email, WhatsApp, SMS, visita; no
 *       las tareas internas), o
 *     - un email automático aceptado por el proveedor de email (estado «enviado»).
 *  3. El cliente respondió (o aceptó) y la empresa lo registró con una fecha de respuesta que
 *     no es anterior a ese seguimiento ni posterior en más de RECOVERY_ATTRIBUTION_DAYS días.
 *
 * No cuentan: emails enviados sin respuesta, seguimientos programados, presupuestos
 * pendientes, ni respuestas sin seguimiento previo o muy posteriores a él.
 * Cuenta una sola vez por presupuesto, en el periodo de facturación en que se registra.
 *
 * Es una correlación temporal registrada, no una prueba de causalidad: Presupio no puede
 * saber si el cliente habría respondido igualmente.
 */
export const RECOVERY_ATTRIBUTION_DAYS = 30;
export const RECOVERY_ATTRIBUTION_MS = RECOVERY_ATTRIBUTION_DAYS * 86_400_000;

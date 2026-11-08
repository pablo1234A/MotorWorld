import { formatDate } from "@/lib/dates";

import {
  type EmailKind,
  type RenderedEmail,
  renderWorkshopEmail,
  type TemplateContent,
  vehicleLabel,
  type WorkshopBrand,
} from "./reminder-email";

/**
 * Vista previa y correo de prueba de cualquier plantilla con datos de ejemplo
 * (o de una instalación real de la empresa). Compartido por el editor
 * (cliente) y el envío de pruebas (servidor).
 */
export interface SampleData {
  customerFirstName: string;
  vehicleMake: string | null;
  vehicleModel: string | null;
  plate: string;
  dueDate: string;
  installationName?: string;
  installationAddress?: string;
  workshop: WorkshopBrand;
  ctaHref: string | null;
}

export function renderSampleEmail(
  kind: EmailKind,
  template: TemplateContent,
  sample: SampleData,
  unsubscribeUrl: string,
): RenderedEmail {
  const reminder = kind.startsWith("reminder_");
  const vehicle =
    kind === "reminder_service_date" || kind === "reminder_service_km";
  const instalacion =
    sample.installationName ?? "Garaje comunitario Calle Encina 12";
  return renderWorkshopEmail({
    template,
    vars: {
      nombre: sample.customerFirstName.trim() || "cliente",
      ...(vehicle
        ? {
            modelo: vehicleLabel(sample.vehicleMake, sample.vehicleModel),
            matricula: sample.plate,
          }
        : { modelo: "", matricula: "" }),
      instalacion,
      direccion: sample.installationAddress ?? "Calle Encina 12, Madrid",
      equipos: "6 extintores y 2 BIE",
      fecha_revision: formatDate(sample.dueDate),
      fecha_cita: formatDate(sample.dueDate),
      hora_cita: "10:00",
      fecha_visita: formatDate(sample.dueDate),
      hora_visita: " a las 10:00",
      orden: "OT-2026-0001",
      fecha_servicio: formatDate(sample.dueDate),
      resumen: "Equipos revisados: 8. Correctos: 7. Con observaciones: 1.",
      incidencia: "Extintor sin señalizar en la planta -1",
      gravedad: "media",
      equipo: " (equipo EXT-000004)",
      informe: "Estado de la instalación",
      taller: sample.workshop.name,
    },
    workshop: sample.workshop,
    ctaHref: sample.ctaHref,
    unsubscribeUrl: reminder ? unsubscribeUrl : null,
    note:
      kind === "booking_rejected" || kind === "booking_canceled"
        ? "Aquí aparecerá el mensaje que escribas al rechazar o cancelar (opcional)."
        : null,
  });
}

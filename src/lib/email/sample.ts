import { formatDate } from "@/lib/dates";

import { type EmailKind, type RenderedEmail, renderWorkshopEmail, type TemplateContent, vehicleLabel, type WorkshopBrand } from "./reminder-email";

/**
 * Vista previa y correo de prueba de cualquier plantilla con datos de un
 * vehículo real del taller (o de ejemplo). Compartido por el editor (cliente)
 * y el envío de pruebas (servidor).
 */
export interface SampleData {
  customerFirstName: string;
  vehicleMake: string | null;
  vehicleModel: string | null;
  plate: string;
  dueDate: string;
  workshop: WorkshopBrand;
  ctaHref: string | null;
}

export function renderSampleEmail(kind: EmailKind, template: TemplateContent, sample: SampleData, unsubscribeUrl: string): RenderedEmail {
  const reminder = kind.startsWith("reminder_");
  return renderWorkshopEmail({
    template,
    vars: {
      nombre: sample.customerFirstName.trim() || "cliente",
      modelo: vehicleLabel(sample.vehicleMake, sample.vehicleModel),
      matricula: sample.plate,
      fecha_revision: formatDate(sample.dueDate),
      fecha_cita: formatDate(sample.dueDate),
      hora_cita: "10:00",
      taller: sample.workshop.name,
    },
    workshop: sample.workshop,
    ctaHref: sample.ctaHref,
    unsubscribeUrl: reminder ? unsubscribeUrl : null,
    note: kind === "booking_rejected" || kind === "booking_canceled" ? "Aquí aparecerá el mensaje que escribas al rechazar o cancelar (opcional)." : null,
  });
}

import { z } from "zod";

import { isValidIsoDate } from "@/lib/dates";
import { parseDecimalInput, TAX_RATES } from "@/lib/quotes/money";

/** Presupuestos (compartido cliente/servidor). La BD verifica importes y totales. */

const isoDate = z.string().trim().refine(isValidIsoDate, "Fecha no válida");

export const quoteLineSchema = z.object({
  description: z.string().trim().min(1, "Describe la línea").max(300, "Máximo 300 caracteres"),
  quantity: z
    .string()
    .transform((v, ctx) => {
      const n = parseDecimalInput(v, 3);
      if (n === null || Number(n) <= 0 || Number(n) > 999_999) {
        ctx.addIssue({ code: "custom", message: "Cantidad no válida (mayor que 0, hasta 3 decimales)" });
        return z.NEVER;
      }
      return n;
    }),
  unitPrice: z
    .string()
    .transform((v, ctx) => {
      const n = parseDecimalInput(v, 2);
      if (n === null || Number(n) > 9_999_999) {
        ctx.addIssue({ code: "custom", message: "Precio no válido (hasta 2 decimales)" });
        return z.NEVER;
      }
      return n;
    }),
  taxRate: z.coerce.number().refine((v) => (TAX_RATES as readonly number[]).includes(v), "Tipo de IVA no válido"),
  /** PCI: servicio (mano de obra, revisión), material (recambio, extintor) u otro. */
  lineKind: z.enum(["service", "material", "other"]).default("service"),
});
export type QuoteLine = z.infer<typeof quoteLineSchema>;

export const quoteSchema = z
  .object({
    customerId: z.uuid({ error: "Elige el cliente" }),
    vehicleId: z
      .union([z.literal(""), z.uuid()])
      .optional()
      .transform((v) => v || null),
    installationId: z
      .union([z.literal(""), z.uuid()])
      .optional()
      .transform((v) => v || null),
    issueDate: isoDate,
    validUntil: isoDate,
    notes: z
      .string()
      .trim()
      .max(5000, "Máximo 5000 caracteres")
      .optional()
      .transform((v) => v || null),
    /** Las líneas llegan del editor como JSON. */
    items: z
      .string()
      .transform((v, ctx) => {
        try {
          return JSON.parse(v) as unknown;
        } catch {
          ctx.addIssue({ code: "custom", message: "Líneas no válidas" });
          return z.NEVER;
        }
      })
      .pipe(z.array(quoteLineSchema).min(1, "Añade al menos una línea").max(200, "Máximo 200 líneas")),
  })
  .refine((v) => v.validUntil >= v.issueDate, { path: ["validUntil"], message: "La validez debe terminar en la fecha del presupuesto o después" });
export type QuoteInput = z.infer<typeof quoteSchema>;
/** Entrada de los servicios: la instalación y el tipo de línea son opcionales (llamadores anteriores a PCI). */
export type QuoteServiceInput = Omit<QuoteInput, "installationId" | "items"> & {
  installationId?: string | null;
  items: Array<Omit<QuoteLine, "lineKind"> & { lineKind?: QuoteLine["lineKind"] }>;
};

export const QUOTE_STATUS_LABELS: Record<string, string> = {
  draft: "Borrador",
  sent: "Emitido",
  accepted: "Aceptado",
  rejected: "Rechazado",
  expired: "Caducado",
};

export const QUOTE_FILTERS = ["draft", "sent", "accepted", "rejected", "expired"] as const;

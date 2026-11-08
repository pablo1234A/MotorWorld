"use server";

import { refresh } from "next/cache";
import { z } from "zod";

import { type ActionState, parseForm, runAction } from "@/server/actions/result";
import { can } from "@/server/auth/context";
import { requireOrg } from "@/server/auth/guards";
import { DomainError } from "@/server/db/errors";
import { getEmailProvider, getSenderConfig } from "@/server/email/provider";
import { NOTIFY_MESSAGES } from "@/server/modules/appointments/notify";
import { enforceRateLimits, RATE_LIMITS } from "@/server/security/rate-limit";

import { sendPciEmail } from "./service";

const schema = z.object({ kind: z.enum(["action_upcoming", "service_completed", "incident_detected", "report_sent"]), id: z.uuid() });

const SENT: Record<z.infer<typeof schema>["kind"], string> = {
  action_upcoming: "Aviso de la próxima actuación enviado al cliente.",
  service_completed: "Parte de trabajo enviado al cliente.",
  incident_detected: "Incidencia comunicada al cliente.",
  report_sent: "Estado de la instalación enviado al cliente.",
};

/** Correo al cliente desde una orden, una incidencia o una instalación (siempre a mano). */
export async function sendPciEmailAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction("pci.email", async () => {
    const ctx = await requireOrg();
    const { kind, id } = parseForm(schema, formData);
    // Órdenes e informes: quien gestiona órdenes; incidencias: quien las registra.
    const allowed = kind === "incident_detected" ? can(ctx, "incidents.write") || can(ctx, "work_orders.manage") : can(ctx, "work_orders.manage");
    if (!allowed) throw new DomainError("permission_denied");
    await enforceRateLimits([[`pci-email:org:${ctx.membership.organizationId}`, RATE_LIMITS.pciEmailsPerOrg]]);
    const outcome = await sendPciEmail(ctx, kind, id, { email: getEmailProvider(), sender: getSenderConfig() });
    refresh();
    return outcome === "sent" ? { status: "success", message: SENT[kind] } : { status: "error", code: outcome, message: NOTIFY_MESSAGES[outcome] };
  });
}

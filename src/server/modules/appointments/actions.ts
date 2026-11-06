"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import {
  availabilityRuleSchema,
  bookingSettingsSchema,
  confirmSchema,
  decisionSchema,
  manualAppointmentSchema,
  notesSchema,
} from "@/lib/validation/appointments";
import { type ActionState, parseForm, runAction } from "@/server/actions/result";
import { assertAdmin, assertPermission, requireOrg } from "@/server/auth/guards";
import { getEmailProvider, getSenderConfig } from "@/server/email/provider";

import { type NotifyOutcome, sendAppointmentEmail } from "./notify";
import * as appointments from "./service";
import * as settings from "./settings";

const deps = () => ({ email: getEmailProvider(), sender: getSenderConfig() });

/**
 * Tras un cambio de estado, el formulario que lo pidió puede desaparecer de la
 * página: el resultado viaja en la URL y lo muestra la propia página.
 */
function done(id: string, ok: string, outcome: NotifyOutcome | null): never {
  redirect(`/app/citas/${id}?ok=${ok}${outcome ? `&aviso=${outcome}` : ""}`);
}
const idSchema = z.object({ id: z.uuid() });

async function manager() {
  const ctx = await requireOrg();
  assertPermission(ctx, "appointments.manage");
  return ctx;
}

export async function confirmAppointmentAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(
    "appointment.confirm",
    async () => {
      const ctx = await manager();
      const input = parseForm(confirmSchema, formData);
      const result = await appointments.confirmAppointment(ctx, input);
      const outcome = input.notify ? await sendAppointmentEmail(result === "confirmed" ? "booking_confirmed" : "booking_rescheduled", input.id, deps()) : null;
      done(input.id, result, outcome);
    },
    formData,
  );
}

export async function rejectAppointmentAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(
    "appointment.reject",
    async () => {
      const ctx = await manager();
      const input = parseForm(decisionSchema, formData);
      await appointments.rejectAppointment(ctx, input.id);
      const outcome = input.notify ? await sendAppointmentEmail("booking_rejected", input.id, deps(), { note: input.message }) : null;
      done(input.id, "rejected", outcome);
    },
    formData,
  );
}

export async function cancelAppointmentAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(
    "appointment.cancel",
    async () => {
      const ctx = await manager();
      const input = parseForm(decisionSchema, formData);
      await appointments.cancelAppointment(ctx, input.id);
      const outcome = input.notify ? await sendAppointmentEmail("booking_canceled", input.id, deps(), { note: input.message }) : null;
      done(input.id, "canceled", outcome);
    },
    formData,
  );
}

export async function completeAppointmentAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction("appointment.complete", async () => {
    const ctx = await manager();
    const { id, outcome } = parseForm(idSchema.extend({ outcome: z.enum(["completed", "no_show"]) }), formData);
    if (outcome === "completed") await appointments.completeAppointment(ctx, id);
    else await appointments.noShowAppointment(ctx, id);
    done(id, outcome, null);
  });
}

export async function saveAppointmentNotesAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(
    "appointment.notes",
    async () => {
      const ctx = await manager();
      const input = parseForm(notesSchema, formData);
      await appointments.saveNotes(ctx, input.id, input.notes);
      refresh();
      return { status: "success", message: "Notas guardadas." };
    },
    formData,
  );
}

export async function linkAppointmentCustomerAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction("appointment.link_customer", async () => {
    const ctx = await manager();
    const { id, customerId } = parseForm(idSchema.extend({ customerId: z.union([z.literal(""), z.uuid()]).optional() }), formData);
    await appointments.linkToCustomer(ctx, id, customerId || null);
    done(id, customerId ? "linked_existing" : "linked_new", null);
  });
}

export async function createManualAppointmentAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(
    "appointment.create",
    async () => {
      const ctx = await manager();
      const input = parseForm(manualAppointmentSchema, formData);
      const id = await appointments.createManualAppointment(ctx, input);
      if (input.notify) await sendAppointmentEmail("booking_confirmed", id, deps());
      redirect(`/app/citas/${id}?creada=1`);
    },
    formData,
  );
}

// ------------------------------------------------------------ configuración

export async function updateBookingSettingsAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(
    "booking_settings.update",
    async () => {
      const ctx = await requireOrg();
      assertAdmin(ctx);
      await settings.updateBookingSettings(ctx, parseForm(bookingSettingsSchema, formData));
      refresh();
      return { status: "success", message: "Configuración de citas guardada." };
    },
    formData,
  );
}

export async function addAvailabilityRuleAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(
    "booking_settings.rule_add",
    async () => {
      const ctx = await requireOrg();
      assertAdmin(ctx);
      await settings.addAvailabilityRule(ctx, parseForm(availabilityRuleSchema, formData));
      refresh();
      return { status: "success", message: "Horario añadido." };
    },
    formData,
  );
}

export async function removeAvailabilityRuleAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction("booking_settings.rule_remove", async () => {
    const ctx = await requireOrg();
    assertAdmin(ctx);
    await settings.removeAvailabilityRule(ctx, parseForm(idSchema, formData).id);
    refresh();
    return { status: "success", message: "Horario eliminado." };
  });
}

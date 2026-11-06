"use server";

import { refresh } from "next/cache";
import { z } from "zod";

import { blackoutRemoveSchema, blackoutSchema, reminderSettingsSchema } from "@/lib/validation/reminders";
import { type ActionState, parseForm, runAction } from "@/server/actions/result";
import { assertAdmin, requireOrg } from "@/server/auth/guards";

import * as reminders from "./service";

export async function updateReminderSettingsAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(
    "reminder_settings.update",
    async () => {
      const ctx = await requireOrg();
      assertAdmin(ctx);
      const input = parseForm(reminderSettingsSchema, formData);
      await reminders.updateReminderSettings(ctx, input);
      refresh();
      return {
        status: "success",
        message: input.remindersEnabled ? "Configuración guardada. Los avisos están activados." : "Configuración guardada. Los avisos están desactivados.",
      };
    },
    formData,
  );
}

export async function addBlackoutAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(
    "reminder_settings.blackout_add",
    async () => {
      const ctx = await requireOrg();
      assertAdmin(ctx);
      const input = parseForm(blackoutSchema, formData);
      await reminders.addBlackout(ctx, input);
      refresh();
      return { status: "success", message: "Día sin envíos añadido." };
    },
    formData,
  );
}

export async function removeBlackoutAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction("reminder_settings.blackout_remove", async () => {
    const ctx = await requireOrg();
    assertAdmin(ctx);
    await reminders.removeBlackout(ctx, parseForm(blackoutRemoveSchema, formData));
    refresh();
    return { status: "success", message: "Día sin envíos eliminado." };
  });
}

export async function cancelReminderAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction("reminder.cancel", async () => {
    const ctx = await requireOrg();
    assertAdmin(ctx);
    const { id } = parseForm(z.object({ id: z.uuid() }), formData);
    await reminders.cancelReminder(ctx, id);
    refresh();
    return { status: "success", message: "Aviso cancelado. No se enviará." };
  });
}

"use server";

import { refresh } from "next/cache";

import { technicianSchema } from "@/lib/validation/pci";
import { type ActionState, parseForm, runAction } from "@/server/actions/result";
import { assertAdmin, requireOrg } from "@/server/auth/guards";

import { saveTechnician } from "./service";

export async function saveTechnicianAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(
    "technician.save",
    async () => {
      const ctx = await requireOrg();
      assertAdmin(ctx);
      await saveTechnician(ctx, parseForm(technicianSchema, formData));
      refresh();
      return { status: "success", message: "Técnico guardado." };
    },
    formData,
  );
}

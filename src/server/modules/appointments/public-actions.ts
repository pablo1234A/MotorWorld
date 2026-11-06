"use server";

import { redirect } from "next/navigation";

import { publicBookingSchema } from "@/lib/validation/appointments";
import { type ActionState, parseForm, runAction } from "@/server/actions/result";
import { getEmailProvider, getSenderConfig } from "@/server/email/provider";
import { clientIp } from "@/server/http/request";

import { createPublicRequest } from "./public";

export async function createBookingRequestAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(
    "booking.public_request",
    async () => {
      // El widget de Turnstile envía su token con este nombre.
      const turnstile = formData.get("cf-turnstile-response");
      if (typeof turnstile === "string") formData.set("turnstileToken", turnstile);
      formData.delete("cf-turnstile-response");
      const input = parseForm(publicBookingSchema, formData);
      await createPublicRequest(input, await clientIp(), { email: getEmailProvider(), sender: getSenderConfig() });
      redirect(`/t/${encodeURIComponent(input.slug)}/cita/enviada`);
    },
    formData,
  );
}

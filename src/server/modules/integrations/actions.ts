"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { type ActionState, runAction } from "@/server/actions/result";
import { assertAdmin, requireOrg } from "@/server/auth/guards";

import * as calendar from "./calendar";

const appUrl = () => process.env.APP_URL ?? "http://localhost:3000";
const GOOGLE_STATE_COOKIE = "ry_google_state";

async function admin() {
  const ctx = await requireOrg();
  assertAdmin(ctx);
  return ctx;
}

/** Abre la pantalla de permisos de Google. El state viaja firmado y también en una cookie httpOnly. */
export async function connectGoogleAction(_prev: ActionState, _formData: FormData): Promise<ActionState> {
  return runAction("integrations.google.connect", async () => {
    const ctx = await admin();
    const { url, state } = await calendar.startConnect(ctx, appUrl());
    (await cookies()).set(GOOGLE_STATE_COOKIE, state, {
      httpOnly: true,
      secure: appUrl().startsWith("https://"),
      sameSite: "lax",
      path: "/api/integrations/google",
      maxAge: 600,
    });
    redirect(url);
  });
}

export async function disconnectGoogleAction(_prev: ActionState, _formData: FormData): Promise<ActionState> {
  return runAction("integrations.google.disconnect", async () => {
    const ctx = await admin();
    await calendar.disconnect(ctx);
    redirect("/app/configuracion/integraciones?google=desconectado");
  });
}

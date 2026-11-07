"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { PLAN_CODES } from "@/lib/plans";
import { type ActionState, parseForm, runAction } from "@/server/actions/result";
import { assertAdmin, requireOrg } from "@/server/auth/guards";

import * as billing from "./service";

const planSchema = z.object({ plan: z.enum(PLAN_CODES), interval: z.enum(["month", "year"]) });
const appUrl = () => process.env.APP_URL ?? "http://localhost:3000";

async function admin() {
  const ctx = await requireOrg();
  assertAdmin(ctx);
  return ctx;
}

export async function startCheckoutAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction("billing.checkout", async () => {
    const ctx = await admin();
    const { plan, interval } = parseForm(planSchema, formData);
    const url = await billing.startCheckout(ctx, plan, interval, appUrl());
    redirect(url);
  });
}

export async function changePlanAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction("billing.change_plan", async () => {
    const ctx = await admin();
    const { plan, interval } = parseForm(planSchema, formData);
    await billing.changePlan(ctx, plan, interval);
    redirect("/app/facturacion?cambio=ok");
  });
}

export async function openPortalAction(_prev: ActionState, _formData: FormData): Promise<ActionState> {
  return runAction("billing.portal", async () => {
    const ctx = await admin();
    redirect(await billing.openPortal(ctx, appUrl()));
  });
}

export async function cancelSubscriptionAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction("billing.cancel", async () => {
    const ctx = await admin();
    const { cancel } = parseForm(z.object({ cancel: z.enum(["true", "false"]) }), formData);
    await billing.setCancelAtPeriodEnd(ctx, cancel === "true");
    refresh();
    redirect(`/app/facturacion?cancelacion=${cancel === "true" ? "programada" : "anulada"}`);
  });
}

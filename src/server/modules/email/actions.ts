"use server";

import { refresh } from "next/cache";
import { z } from "zod";

import { domainSchema, manualSuppressionSchema, senderModeSchema, templateKindSchema, templateSchema } from "@/lib/validation/email";
import { type ActionState, parseForm, runAction } from "@/server/actions/result";
import { assertAdmin, requireOrg } from "@/server/auth/guards";
import { getDomainProvider } from "@/server/email/domains";
import { getEmailProvider, getSenderConfig } from "@/server/email/provider";

import * as domains from "./domains";
import * as settings from "./settings";
import * as templates from "./templates";

const idSchema = z.object({ id: z.uuid() });

export async function saveTemplateAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(
    "email_template.save",
    async () => {
      const ctx = await requireOrg();
      assertAdmin(ctx);
      const input = parseForm(templateSchema, formData);
      if (formData.get("intent") === "test") {
        const { to } = await templates.sendTestEmail(ctx, input, { email: getEmailProvider(), sender: getSenderConfig() });
        return { status: "success", message: `Correo de prueba enviado a ${to}. Cuenta en el consumo del mes.` };
      }
      await templates.saveTemplate(ctx, input);
      refresh();
      return { status: "success", message: "Plantilla guardada. Los próximos avisos usarán este texto." };
    },
    formData,
  );
}

export async function restoreTemplateAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction("email_template.restore", async () => {
    const ctx = await requireOrg();
    assertAdmin(ctx);
    const { kind } = parseForm(templateKindSchema, formData);
    await templates.restoreTemplate(ctx, kind);
    refresh();
    return { status: "success", message: "Plantilla original restaurada." };
  });
}

export async function updateSenderSettingsAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(
    "email_settings.update",
    async () => {
      const ctx = await requireOrg();
      assertAdmin(ctx);
      await settings.updateSenderSettings(ctx, parseForm(senderModeSchema, formData));
      refresh();
      return { status: "success", message: "Configuración del correo guardada." };
    },
    formData,
  );
}

export async function addDomainAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(
    "sending_domain.add",
    async () => {
      const ctx = await requireOrg();
      assertAdmin(ctx);
      const input = parseForm(domainSchema, formData);
      await domains.addDomain(ctx, input, getDomainProvider());
      refresh();
      return { status: "success", message: `Dominio ${input.domain} añadido. Crea los registros DNS que aparecen abajo y pulsa «Comprobar ahora».` };
    },
    formData,
  );
}

export async function checkDomainAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction("sending_domain.check", async () => {
    const ctx = await requireOrg();
    assertAdmin(ctx);
    const { id } = parseForm(idSchema, formData);
    const status = await domains.checkDomain(ctx, id, getDomainProvider());
    refresh();
    return status === "verified"
      ? { status: "success", message: "¡Dominio verificado! Ya puedes usarlo como remitente." }
      : { status: "success", message: "Todavía no está verificado. Los cambios de DNS pueden tardar hasta 72 horas; lo seguiremos comprobando automáticamente." };
  });
}

export async function removeDomainAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction("sending_domain.remove", async () => {
    const ctx = await requireOrg();
    assertAdmin(ctx);
    const { id } = parseForm(idSchema, formData);
    await domains.removeDomain(ctx, id, getDomainProvider());
    refresh();
    return { status: "success", message: "Dominio eliminado. Los avisos salen con el remitente de RevisaYa." };
  });
}

export async function addSuppressionAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(
    "email_suppression.add",
    async () => {
      const ctx = await requireOrg();
      assertAdmin(ctx);
      const { email } = parseForm(manualSuppressionSchema, formData);
      await settings.addSuppression(ctx, email);
      refresh();
      return { status: "success", message: `No se enviarán más correos a ${email}.` };
    },
    formData,
  );
}

export async function removeSuppressionAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction("email_suppression.remove", async () => {
    const ctx = await requireOrg();
    assertAdmin(ctx);
    const { email } = parseForm(manualSuppressionSchema, formData);
    await settings.removeSuppression(ctx, email);
    refresh();
    return { status: "success", message: "Dirección desbloqueada." };
  });
}

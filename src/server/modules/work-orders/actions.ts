"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { createWorkOrderSchema, formWithMaterials, workOrderItemList, itemResultSchema, updateWorkOrderSchema, workOrderStatusSchema } from "@/lib/validation/pci";
import { type ActionState, parseForm, runAction } from "@/server/actions/result";
import { requireOrg } from "@/server/auth/guards";
import { can } from "@/server/auth/context";
import { DomainError } from "@/server/db/errors";
import { syncWorkOrderLater } from "@/server/modules/integrations/calendar";

import * as orders from "./service";

/** Gestionar (crear, programar, asignar, cancelar) o, como técnico, ejecutar las suyas. La BD lo vuelve a comprobar. */
async function manager() {
  const ctx = await requireOrg();
  if (!can(ctx, "work_orders.manage")) throw new DomainError("permission_denied", "work_orders.manage");
  return ctx;
}
async function executor() {
  const ctx = await requireOrg();
  if (!can(ctx, "work_orders.manage") && !can(ctx, "work_orders.execute")) throw new DomainError("permission_denied", "work_orders.execute");
  return ctx;
}

export async function createWorkOrderAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(
    "work_order.create",
    async () => {
      const ctx = await manager();
      const id = await orders.createWorkOrder(ctx, parseForm(createWorkOrderSchema, formData));
      syncWorkOrderLater(id);
      redirect(`/app/ordenes-trabajo/${id}?creada=1`);
    },
    formData,
  );
}

export async function updateWorkOrderAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(
    "work_order.update",
    async () => {
      const ctx = await manager();
      const input = parseForm(updateWorkOrderSchema, formData);
      await orders.updateWorkOrder(ctx, input);
      syncWorkOrderLater(input.id);
      redirect(`/app/ordenes-trabajo/${input.id}?guardada=1`);
    },
    formData,
  );
}

export async function setWorkOrderStatusAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(
    "work_order.status",
    async () => {
      const input = parseForm(workOrderStatusSchema, formData);
      const ctx = input.status === "canceled" ? await manager() : await executor();
      await orders.setWorkOrderStatus(ctx, input.id, input.status, input.completionNotes);
      syncWorkOrderLater(input.id);
      redirect(`/app/ordenes-trabajo/${input.id}?estado=${input.status}`);
    },
    formData,
  );
}

export async function addWorkOrderItemsAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction("work_order.items_add", async () => {
    const ctx = await manager();
    const { id, items } = parseForm(z.object({ id: z.uuid(), items: workOrderItemList(1) }), formData);
    await orders.addWorkOrderItems(ctx, id, items.map((i) => ({ equipmentId: i.split(":")[0], actionTypeId: i.split(":")[1] })));
    refresh();
    return { status: "success", message: "Equipos añadidos a la orden." };
  });
}

export async function removeWorkOrderItemAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction("work_order.item_remove", async () => {
    const ctx = await manager();
    await orders.removeWorkOrderItem(ctx, parseForm(z.object({ itemId: z.uuid() }), formData).itemId);
    refresh();
    return { status: "success", message: "Equipo quitado de la orden." };
  });
}

export async function recordItemResultAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(
    "work_order.item_result",
    async () => {
      const ctx = await executor();
      const input = itemResultSchema.parse(formWithMaterials(formData));
      const { workOrderId } = await orders.recordItemResult(ctx, input);
      redirect(`/app/ordenes-trabajo/${workOrderId}?registrado=1#equipos`);
    },
    formData,
  );
}

export async function addWorkOrderNoteAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction("work_order.note", async () => {
    const ctx = await executor();
    const { id, note } = parseForm(z.object({ id: z.uuid(), note: z.string().trim().min(1, "Escribe la nota").max(2000) }), formData);
    await orders.addWorkOrderNote(ctx, id, note);
    refresh();
    return { status: "success", message: "Nota añadida." };
  });
}

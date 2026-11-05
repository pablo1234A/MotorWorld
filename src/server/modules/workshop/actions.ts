"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import {
  changeOwnerSchema,
  createCustomerSchema,
  createVehicleSchema,
  deleteCustomerSchema,
  maintenanceSchema,
  mileageSchema,
  nextServiceSchema,
  partsFromForm,
  updateCustomerSchema,
  updateVehicleSchema,
} from "@/lib/validation/workshop";
import { type ActionState, parseForm, runAction } from "@/server/actions/result";
import { assertAdmin, assertPermission, requireOrg } from "@/server/auth/guards";

import * as customers from "../customers/service";
import type { DuplicateMatch } from "../customers/service";
import * as maintenance from "../maintenance/service";
import * as vehicles from "../vehicles/service";

/**
 * Server Actions de clientes, vehículos e historial. Cada acción: sesión →
 * permiso (aquí) → validación zod → servicio (RLS + restricciones en BD).
 */

const idOnly = z.object({ id: z.uuid() });

// ------------------------------------------------------------------ clientes
export async function createCustomerAction(
  _prev: ActionState<{ duplicates: DuplicateMatch[] }>,
  formData: FormData,
): Promise<ActionState<{ duplicates: DuplicateMatch[] }>> {
  return runAction(
    "customer.create",
    async () => {
      const ctx = await requireOrg();
      assertPermission(ctx, "customers.write");
      const input = parseForm(createCustomerSchema, formData);
      const result = await customers.createCustomer(ctx, input);
      if (result.kind === "duplicates") {
        return {
          status: "error",
          code: "possible_duplicate",
          message: "Ya hay un cliente con ese correo o teléfono en este taller. Revisa que no esté repetido.",
          values: Object.fromEntries([...formData.entries()].filter(([, v]) => typeof v === "string")) as Record<string, string>,
          fieldErrors: undefined,
        };
      }
      redirect(`/app/clientes/${result.id}?creado=1`);
    },
    formData,
  );
}

export async function updateCustomerAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(
    "customer.update",
    async () => {
      const ctx = await requireOrg();
      assertPermission(ctx, "customers.write");
      const input = parseForm(updateCustomerSchema, formData);
      await customers.updateCustomer(ctx, input);
      refresh();
      return { status: "success", message: "Cliente guardado." };
    },
    formData,
  );
}

export async function deleteCustomerAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction("customer.delete", async () => {
    const ctx = await requireOrg();
    assertPermission(ctx, "customers.delete");
    const { id, withVehicles } = parseForm(deleteCustomerSchema, formData);
    if (withVehicles) assertPermission(ctx, "vehicles.delete");
    await customers.deleteCustomer(ctx, id, withVehicles);
    redirect("/app/clientes?borrado=1");
  });
}

// ----------------------------------------------------------------- vehículos
export async function createVehicleAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(
    "vehicle.create",
    async () => {
      const ctx = await requireOrg();
      assertPermission(ctx, "vehicles.write");
      const input = parseForm(createVehicleSchema, formData);
      if (input.lastServiceDate) assertPermission(ctx, "maintenance.write");
      const id = await vehicles.createVehicle(ctx, input);
      redirect(`/app/vehiculos/${id}?creado=1`);
    },
    formData,
  );
}

export async function updateVehicleAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(
    "vehicle.update",
    async () => {
      const ctx = await requireOrg();
      assertPermission(ctx, "vehicles.write");
      await vehicles.updateVehicle(ctx, parseForm(updateVehicleSchema, formData));
      refresh();
      return { status: "success", message: "Vehículo guardado." };
    },
    formData,
  );
}

export async function recordMileageAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(
    "vehicle.mileage",
    async () => {
      const ctx = await requireOrg();
      assertPermission(ctx, "vehicles.write");
      await vehicles.recordMileage(ctx, parseForm(mileageSchema, formData));
      refresh();
      return { status: "success", message: "Kilómetros actualizados." };
    },
    formData,
  );
}

export async function setNextServiceAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(
    "vehicle.next_service",
    async () => {
      const ctx = await requireOrg();
      assertPermission(ctx, "vehicles.write");
      await vehicles.setNextService(ctx, parseForm(nextServiceSchema, formData));
      refresh();
      return { status: "success", message: "Próxima revisión guardada." };
    },
    formData,
  );
}

export async function changeOwnerAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction("vehicle.change_owner", async () => {
    const ctx = await requireOrg();
    assertPermission(ctx, "vehicles.write");
    const { id, customerId } = parseForm(changeOwnerSchema, formData);
    await vehicles.changeOwner(ctx, id, customerId);
    refresh();
    return { status: "success", message: "Propietario cambiado. El historial del vehículo se conserva." };
  });
}

export async function deleteVehicleAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction("vehicle.delete", async () => {
    const ctx = await requireOrg();
    assertPermission(ctx, "vehicles.delete");
    const { id } = parseForm(idOnly, formData);
    const { customerId } = await vehicles.deleteVehicle(ctx, id);
    redirect(`/app/clientes/${customerId}?vehiculo_borrado=1`);
  });
}

// ----------------------------------------------------------------- historial
function maintenanceInput(formData: FormData) {
  const raw = Object.fromEntries(
    ["serviceDate", "km", "workPerformed", "notes", "nextRecommendedDate", "nextRecommendedKm"].map((k) => [k, formData.get(k) ?? undefined]),
  );
  return maintenanceSchema.parse({ ...raw, parts: partsFromForm(formData) });
}

export async function createRecordAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(
    "maintenance.create",
    async () => {
      const ctx = await requireOrg();
      assertPermission(ctx, "maintenance.write");
      const vehicleId = z.uuid().parse(formData.get("vehicleId"));
      await maintenance.createRecord(ctx, vehicleId, maintenanceInput(formData));
      refresh();
      return { status: "success", message: "Revisión registrada. La próxima revisión se ha recalculado." };
    },
    formData,
  );
}

export async function updateRecordAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(
    "maintenance.update",
    async () => {
      const ctx = await requireOrg();
      assertPermission(ctx, "maintenance.write");
      const recordId = z.uuid().parse(formData.get("recordId"));
      const { vehicleId } = await maintenance.updateRecord(ctx, recordId, maintenanceInput(formData));
      redirect(`/app/vehiculos/${vehicleId}?revision_editada=1`);
    },
    formData,
  );
}

export async function deleteRecordAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction("maintenance.delete", async () => {
    const ctx = await requireOrg();
    assertAdmin(ctx);
    const { id } = parseForm(idOnly, formData);
    await maintenance.deleteRecord(ctx, id);
    refresh();
    return { status: "success", message: "Revisión eliminada del historial." };
  });
}

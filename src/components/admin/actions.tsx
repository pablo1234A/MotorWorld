"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/form";
import { Dialog } from "@/components/ui/overlays";
import { api, errorMessage } from "@/lib/api-client";

export function UserStatusAction({ userId, email, disabled, locked }: { userId: string; email: string; disabled: boolean; locked: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(action: "disable" | "enable") {
    setBusy(true);
    try {
      await api(`/api/admin/users/${userId}`, { method: "PATCH", body: action === "disable" ? { action, reason } : { action } });
      toast.success(action === "disable" ? "Cuenta desactivada" : "Cuenta reactivada");
      setOpen(false);
      setReason("");
      router.refresh();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  if (locked) return <span className="text-xs text-faint">—</span>;
  if (disabled) {
    return (
      <Button size="sm" variant="secondary" loading={busy} onClick={() => submit("enable")}>
        Reactivar
      </Button>
    );
  }
  return (
    <>
      <Button size="sm" variant="danger-ghost" onClick={() => setOpen(true)}>
        Desactivar
      </Button>
      <Dialog
        open={open}
        onOpenChange={setOpen}
        title="Desactivar cuenta"
        description={`${email} no podrá iniciar sesión ni acceder a sus datos. La causa queda registrada en la auditoría.`}
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button variant="danger" loading={busy} disabled={reason.trim().length < 10} onClick={() => submit("disable")}>
              Desactivar cuenta
            </Button>
          </>
        }
      >
        <Field label="Causa justificada" htmlFor={`reason-${userId}`} hint="Mínimo 10 caracteres." required>
          <Textarea id={`reason-${userId}`} rows={3} maxLength={500} value={reason} onChange={(event) => setReason(event.target.value)} />
        </Field>
      </Dialog>
    </>
  );
}

export function WorkspacePlanAction({ workspaceId, workspaceName, currentPlan, plans, stripeManaged }: { workspaceId: string; workspaceName: string; currentPlan: string; plans: { code: string; name: string }[]; stripeManaged: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [planCode, setPlanCode] = useState(currentPlan);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  if (stripeManaged) return <span className="text-xs text-muted">Gestionado por Stripe</span>;
  return (
    <>
      <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>
        Cambiar plan
      </Button>
      <Dialog
        open={open}
        onOpenChange={setOpen}
        title="Asignar plan manualmente"
        description={`Espacio «${workspaceName}». Úsalo para soporte, pruebas o acuerdos comerciales; no genera ningún cobro.`}
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button
              loading={busy}
              disabled={reason.trim().length < 5}
              onClick={async () => {
                setBusy(true);
                try {
                  await api(`/api/admin/workspaces/${workspaceId}/plan`, { method: "PATCH", body: { planCode, reason } });
                  toast.success("Plan actualizado");
                  setOpen(false);
                  router.refresh();
                } catch (error) {
                  toast.error(errorMessage(error));
                } finally {
                  setBusy(false);
                }
              }}
            >
              Guardar
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="Plan" htmlFor={`plan-${workspaceId}`}>
            <Select id={`plan-${workspaceId}`} value={planCode} onChange={(event) => setPlanCode(event.target.value)}>
              {plans.map((plan) => (
                <option key={plan.code} value={plan.code}>
                  {plan.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Motivo" htmlFor={`plan-reason-${workspaceId}`} required>
            <Input id={`plan-reason-${workspaceId}`} value={reason} maxLength={300} onChange={(event) => setReason(event.target.value)} />
          </Field>
        </div>
      </Dialog>
    </>
  );
}

export type EditablePlan = { id: string; code: string; name: string; price: number; monthlyListingLimit: number; monthlyBulkLimit: number; maxProducts: number; maxTemplates: number; maxBulkRows: number; maxImagesPerProduct: number; maxMembers: number; isActive: boolean };

export function PlanEditor({ plan }: { plan: EditablePlan }) {
  const router = useRouter();
  const [values, setValues] = useState(plan);
  const [busy, setBusy] = useState(false);
  const dirty = JSON.stringify(values) !== JSON.stringify(plan);

  const number = (key: keyof EditablePlan, label: string, step = 1) => (
    <Field label={label} htmlFor={`${plan.id}-${key}`}>
      <Input id={`${plan.id}-${key}`} type="number" min={0} step={step} value={String(values[key])} onChange={(event) => setValues({ ...values, [key]: event.target.value === "" ? 0 : Number(event.target.value) })} />
    </Field>
  );

  return (
    <form
      className="space-y-4 p-5"
      onSubmit={async (event) => {
        event.preventDefault();
        setBusy(true);
        try {
          const { id: _id, code: _code, ...body } = values;
          void _id;
          void _code;
          await api(`/api/admin/plans/${plan.id}`, { method: "PATCH", body });
          toast.success(`Plan ${values.name} actualizado`);
          router.refresh();
        } catch (error) {
          toast.error(errorMessage(error));
        } finally {
          setBusy(false);
        }
      }}
    >
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Nombre" htmlFor={`${plan.id}-name`}>
          <Input id={`${plan.id}-name`} value={values.name} maxLength={60} onChange={(event) => setValues({ ...values, name: event.target.value })} />
        </Field>
        {number("price", "Precio mensual (€)", 0.01)}
        {number("monthlyListingLimit", "Generaciones / mes")}
        {number("monthlyBulkLimit", "Generaciones masivas / mes")}
        {number("maxProducts", "Máx. productos")}
        {number("maxTemplates", "Máx. plantillas")}
        {number("maxBulkRows", "Máx. filas por CSV")}
        {number("maxImagesPerProduct", "Fotos por producto")}
        {number("maxMembers", "Miembros del equipo")}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <label className="flex items-center gap-2.5 text-sm">
          <Checkbox checked={values.isActive} disabled={plan.code === "free"} onChange={(event) => setValues({ ...values, isActive: event.target.checked })} />
          Plan activo (visible en precios)
        </label>
        <Button type="submit" loading={busy} disabled={!dirty}>
          Guardar plan
        </Button>
      </div>
    </form>
  );
}

export function ContactHandledAction({ id, handled }: { id: string; handled: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <Button
      size="sm"
      variant={handled ? "ghost" : "secondary"}
      loading={busy}
      onClick={async () => {
        setBusy(true);
        try {
          await api(`/api/admin/contact/${id}`, { method: "PATCH", body: { handled: !handled } });
          router.refresh();
        } catch (error) {
          toast.error(errorMessage(error));
        } finally {
          setBusy(false);
        }
      }}
    >
      {handled ? "Reabrir" : "Marcar atendido"}
    </Button>
  );
}

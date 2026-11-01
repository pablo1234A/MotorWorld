import { Alert } from "@/components/ui/feedback";
import { Checkbox, Field, Input, Textarea } from "@/components/ui/field";
import { PageHeader, Panel } from "@/components/ui/layout";
import { ActionForm } from "@/components/admin/action-form";
import { requireAdmin } from "@/lib/auth";
import { createSessionClient } from "@/lib/supabase/server";
import { updateProduct } from "@/lib/actions/admin";
import { formatPrice } from "@/lib/billing/entitlements";
import { DOCUMENT_TYPES } from "@/lib/documents/registry";
import type { ProductRow } from "@/lib/db/types";
import { stripeMode } from "@/lib/env";

export default async function AdminProductsPage() {
  await requireAdmin();
  const db = await createSessionClient();
  const { data } = await db.from("products").select("*").order("sort_order");
  const products = (data ?? []) as ProductRow[];
  return (
    <>
      <PageHeader title="Planes" description="Alcance de cada modalidad. El importe se toma siempre del precio configurado en Stripe." />
      <Alert tone="info" className="mb-6" title={`Stripe: modo ${stripeMode() === "test" ? "pruebas" : stripeMode() === "live" ? "real" : "desactivado"}`}>
        Crea los precios en Stripe (IVA incluido para clientes en España) y pega aquí su identificador <code>price_…</code>. Al guardar se verifica en Stripe y se sincroniza el importe mostrado.
      </Alert>
      <div className="space-y-6">
        {products.map((p) => (
          <Panel key={p.id} title={`${p.name} · ${formatPrice(p.price_cents, p.currency)}${p.kind === "subscription" ? " / mes" : ""}`} description={`Código: ${p.code} · ${p.kind === "subscription" ? "Suscripción" : "Pago único"}${p.active ? "" : " · Inactivo"}`}>
            <ActionForm action={updateProduct.bind(null, p.id)} submitLabel="Guardar plan">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field id={`name-${p.id}`} label="Nombre" required><Input id={`name-${p.id}`} name="name" defaultValue={p.name} /></Field>
                <Field id={`price-${p.id}`} label="ID de precio en Stripe" hint="Vacío = no se puede comprar."><Input id={`price-${p.id}`} name="stripe_price_id" defaultValue={p.stripe_price_id ?? ""} placeholder="price_…" /></Field>
              </div>
              <Field id={`desc-${p.id}`} label="Descripción" required><Input id={`desc-${p.id}`} name="description" defaultValue={p.description ?? ""} /></Field>
              <fieldset>
                <legend className="mb-2 text-sm font-medium text-ink">Documentos incluidos</legend>
                <div className="flex flex-wrap gap-4">
                  {DOCUMENT_TYPES.map((d) => (
                    <Checkbox key={d.code} name="included_document_types" value={d.code} defaultChecked={p.included_document_types.includes(d.code)} label={d.name} />
                  ))}
                </div>
              </fieldset>
              <div className="grid gap-4 sm:grid-cols-2">
                {p.kind === "subscription" ? (
                  <Field id={`docs-${p.id}`} label="Documentos por mes" hint="Por periodo de facturación. Vacío = ilimitados.">
                    <Input id={`docs-${p.id}`} name="documents_per_period" inputMode="numeric" defaultValue={p.documents_per_period ?? ""} />
                    <input type="hidden" name="generations_limit" value="" />
                  </Field>
                ) : (
                  <Field id={`gen-${p.id}`} label="Límite de generaciones" hint="Cada generación produce el conjunto completo. Vacío = ilimitadas.">
                    <Input id={`gen-${p.id}`} name="generations_limit" inputMode="numeric" defaultValue={p.generations_limit ?? ""} />
                  </Field>
                )}
                <div className="flex flex-col justify-end gap-3 pb-1">
                  <Checkbox name="includes_updates" defaultChecked={p.includes_updates} label="Incluye nuevas versiones de plantillas" />
                  <Checkbox name="active" defaultChecked={p.active} label="Plan activo" />
                </div>
              </div>
              <Field id={`feat-${p.id}`} label="Características (una por línea)" required><Textarea id={`feat-${p.id}`} name="features" rows={6} defaultValue={p.features.join("\n")} /></Field>
            </ActionForm>
          </Panel>
        ))}
      </div>
    </>
  );
}

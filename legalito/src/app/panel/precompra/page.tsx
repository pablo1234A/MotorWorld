import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Alert } from "@/components/ui/feedback";
import { PageHeader } from "@/components/ui/layout";
import { CheckoutForm, type CheckoutPlan } from "@/components/app/checkout-form";
import { TrackEvent } from "@/components/analytics";
import { requireOrganization } from "@/lib/auth";
import { getFormStatus, getMyEntitlements } from "@/lib/data/panel";
import { listActiveProducts } from "@/lib/billing/data";
import { formatPrice } from "@/lib/billing/entitlements";
import { createAdminClient } from "@/lib/supabase/server";
import { stripeMode } from "@/lib/env";
import { templatesAvailable } from "@/lib/documents/templates-repo";
import { DISCLAIMER } from "@/config/site";

export const metadata: Metadata = { title: "Elige tu modalidad" };

export default async function PrePurchasePage({ searchParams }: PageProps<"/panel/precompra">) {
  await requireOrganization();
  const [form, ent, sp] = await Promise.all([getFormStatus(), getMyEntitlements(), searchParams]);
  if (!form.completed) redirect("/panel/generador");
  if (ent.canGenerate) redirect("/panel/generador/revision");

  const db = createAdminClient();
  const products = await listActiveProducts(db);
  const plans: CheckoutPlan[] = await Promise.all(
    products.map(async (p) => ({
      code: p.code,
      name: p.name,
      price: formatPrice(p.price_cents, p.currency),
      period: p.kind === "subscription" ? (p.billing_interval === "year" ? "/ año" : "/ mes") : "pago único",
      description: p.description ?? "",
      features: p.features.filter((f) => !/^sin /i.test(f)).slice(0, 4),
      available: Boolean(p.stripe_price_id) && (await templatesAvailable(db, p.included_document_types)).ok,
    })),
  );
  const mode = stripeMode();

  return (
    <>
      <TrackEvent name="purchase_view" />
      <PageHeader title="Elige cómo quieres obtener tus documentos" description="Después del pago generaremos tus documentos automáticamente con las respuestas que has revisado." />
      <div className="mb-6 space-y-3">
        {sp.cancelado && (
          <Alert tone="info" title="Pago cancelado">
            No se ha realizado ningún cargo. Puedes intentarlo de nuevo cuando quieras.
          </Alert>
        )}
        {mode === "test" && (
          <Alert tone="warning" title="Entorno de pruebas">
            Los pagos están en modo de prueba de Stripe: no se realizan cobros reales. Usa la tarjeta 4242 4242 4242 4242.
          </Alert>
        )}
        {mode === "disabled" && (
          <Alert tone="warning" title="Pagos no habilitados">
            Este entorno no tiene Stripe configurado o los cobros reales no están autorizados.
          </Alert>
        )}
        {plans.every((p) => !p.available) && mode !== "disabled" && (
          <Alert tone="warning" title="Planes no disponibles todavía">
            Los documentos están pendientes de revisión jurídica o los precios no están configurados. No es posible comprar por ahora.
          </Alert>
        )}
      </div>
      <CheckoutForm plans={plans} defaultPlan={typeof sp.plan === "string" ? sp.plan : undefined} />
      <p className="mt-8 text-xs leading-relaxed text-subtle">{DISCLAIMER}</p>
    </>
  );
}

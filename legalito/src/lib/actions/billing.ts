"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { requireOrganization } from "@/lib/auth";
import { createAdminClient, ServiceNotConfiguredError } from "@/lib/supabase/server";
import { env, siteUrl, stripeMode } from "@/lib/env";
import { getStripe } from "@/lib/billing/stripe";
import { loadEntitlements } from "@/lib/billing/data";
import { latestCompletedResponse } from "@/lib/documents/service";
import { templatesAvailable } from "@/lib/documents/templates-repo";
import { documentTypeName } from "@/lib/documents/registry";
import type { ProductRow } from "@/lib/db/types";
import { audit, logError, rateLimit } from "@/lib/observability";
import { trackServer } from "@/lib/analytics-server";
import type { FormState } from "./types";

const checkoutSchema = z.object({
  product: z.string().regex(/^[a-z][a-z0-9_]{2,40}$/),
  terms: z.literal("on", { message: "Debes aceptar las condiciones de contratación." }),
  immediate: z.literal("on", { message: "Debes solicitar el acceso inmediato para continuar." }),
});

/**
 * Crea una sesión de Stripe Checkout. Todo se decide en servidor: producto,
 * precio, cliente y organización. El navegador solo elige el código del plan.
 */
export async function startCheckout(_prev: FormState, formData: FormData): Promise<FormState> {
  // Se factura siempre a la cuenta principal; «active» es la cuenta (o cliente) cuyo formulario se ha completado.
  const { user, org: active, account } = await requireOrganization();
  const org = account.root;
  const parsed = checkoutSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos no válidos." };

  if (stripeMode() === "disabled") {
    return { error: "Los pagos no están habilitados en este entorno. Configura Stripe en modo de pruebas (ver docs/STRIPE.md)." };
  }
  if (!(await rateLimit(`checkout:${org.id}`, 10, 3600))) return { error: "Demasiados intentos. Inténtalo más tarde." };

  const db = createAdminClient();
  const { data: productRow } = await db.from("products").select("*").eq("code", parsed.data.product).eq("active", true).maybeSingle();
  const product = productRow as ProductRow | null;
  if (!product) return { error: "El plan seleccionado no está disponible." };
  if (!product.stripe_price_id) return { error: "Este plan todavía no tiene un precio de Stripe configurado." };

  if (product.kind === "one_time" && active.id !== org.id) {
    return { error: "El pago único es para un solo negocio. Para generar los documentos de tus clientes elige una suscripción." };
  }
  if (!(await latestCompletedResponse(active.id))) return { error: "Completa el formulario antes de pagar." };

  // No se vende nada cuyas plantillas no estén disponibles (en producción: aprobadas jurídicamente).
  const availability = await templatesAvailable(db, product.included_document_types);
  if (!availability.ok) {
    return {
      error: `Todavía no podemos vender este plan: ${availability.unavailable.map(documentTypeName).join(", ")} está pendiente de revisión jurídica.`,
    };
  }

  const entitlements = await loadEntitlements(db, org.id);
  if (product.kind === "subscription" && entitlements.subscription && !["canceled", "incomplete_expired"].includes(entitlements.subscription.status)) {
    return { error: "Ya tienes una suscripción. Gestiónala desde «Mi suscripción»." };
  }

  let url: string | null = null;
  try {
    const stripe = getStripe();
    let customer = org.stripe_customer_id;
    if (!customer) {
      const created = await stripe.customers.create(
        { email: user.email, name: org.legal_name ?? undefined, metadata: { organization_id: org.id } },
        { idempotencyKey: `customer:${org.id}` },
      );
      customer = created.id;
      await db.from("organizations").update({ stripe_customer_id: customer }).eq("id", org.id).is("stripe_customer_id", null);
      const { data: fresh } = await db.from("organizations").select("stripe_customer_id").eq("id", org.id).single();
      customer = (fresh?.stripe_customer_id as string) ?? customer;
    }

    // generate_for: cuenta cuyos documentos se generan al activarse el pago (se valida de nuevo al cumplirlo).
    const metadata = { organization_id: org.id, product_code: product.code, user_id: user.id, generate_for: active.id };
    const base = siteUrl();
    const session = await stripe.checkout.sessions.create({
      mode: product.kind === "subscription" ? "subscription" : "payment",
      customer,
      client_reference_id: org.id,
      line_items: [{ price: product.stripe_price_id, quantity: 1 }],
      metadata,
      locale: "es",
      allow_promotion_codes: true,
      billing_address_collection: "required",
      tax_id_collection: { enabled: true },
      customer_update: { name: "auto", address: "auto" },
      automatic_tax: { enabled: env().STRIPE_AUTOMATIC_TAX },
      success_url: `${base}/panel/compra/confirmacion?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${base}/panel/precompra?cancelado=1`,
      ...(product.kind === "subscription"
        ? { subscription_data: { metadata } }
        : { payment_intent_data: { metadata }, invoice_creation: { enabled: true, invoice_data: { metadata } } }),
    });
    url = session.url;

    // Evidencia del consentimiento para el suministro inmediato de contenido digital.
    await audit(
      {
        actorId: user.id,
        action: "checkout.started",
        entityType: "checkout_session",
        entityId: session.id,
        organizationId: org.id,
        metadata: { product: product.code, terms_accepted: true, immediate_supply_and_withdrawal_waiver: true },
      },
      { withIp: true },
    );
    await trackServer("checkout_started", { userId: user.id, props: { product: product.code } });
  } catch (e) {
    if (e instanceof ServiceNotConfiguredError) return { error: e.message };
    await logError("billing.checkout", e, { organizationId: org.id });
    return { error: "No hemos podido iniciar el pago. Inténtalo de nuevo en unos minutos." };
  }
  if (!url) return { error: "No hemos podido iniciar el pago." };
  redirect(url);
}

export async function openBillingPortal(): Promise<void> {
  const { user, account } = await requireOrganization();
  const org = account.root;
  if (!org.stripe_customer_id || stripeMode() === "disabled") redirect("/panel/suscripcion?portal=no-disponible");
  let url: string;
  try {
    const session = await getStripe().billingPortal.sessions.create({
      customer: org.stripe_customer_id,
      return_url: `${siteUrl()}/panel/suscripcion`,
      locale: "es",
    });
    url = session.url;
    await audit({ actorId: user.id, action: "billing.portal_opened", organizationId: org.id });
  } catch (e) {
    await logError("billing.portal", e, { organizationId: org.id });
    redirect("/panel/suscripcion?portal=error");
  }
  redirect(url);
}

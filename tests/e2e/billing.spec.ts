import { expect, test } from "@playwright/test";
import Stripe from "stripe";

import { appEnv, db, runJob, uniqueEmail } from "./support/env";
import { createWorkshop, signUpAndVerify } from "./support/flows";

/**
 * Fase 8 de punta a punta, en modo TEST y sin ninguna clave real: la app
 * habla con stripe-mock (servidor oficial de Stripe que valida cada llamada;
 * `pnpm stripe:mock`). El navegador de la prueba no sale a internet: la página
 * de pago de Stripe se sustituye por una página vacía y el cobro se representa
 * con el webhook firmado que enviaría Stripe.
 */

test.describe("suscripción (Stripe en modo TEST)", () => {
  test("sin plan → elegir plan → pago de Stripe → webhook → prueba de 7 días → cancelar", async ({ page, baseURL }) => {
    const owner = uniqueEmail("factura");
    await signUpAndVerify(page, owner);
    await createWorkshop(page, "Taller Facturas");
    await expect(page.getByText("Tu taller aún no tiene un plan activo")).toBeVisible();

    const sync = await runJob(baseURL!, "stripe-sync-catalog");
    expect(sync.ok).toBe(true);

    await page.getByRole("link", { name: "Elegir un plan (7 días gratis)" }).click();
    await expect(page.getByRole("heading", { name: "Facturación" })).toBeVisible();
    await expect(page.getByText("Tu taller todavía no tiene plan")).toBeVisible();
    // Precios EXACTOS del PDF, sin IVA.
    const max = page.locator("form", { has: page.getByRole("heading", { name: "Max", exact: true }) });
    await expect(max).toContainText("79 €/mes + IVA");
    await page.getByRole("radio", { name: "Anual (2 meses gratis)" }).click();
    await expect(max).toContainText("790 €/año + IVA");
    await page.getByRole("radio", { name: "Mensual" }).click();

    await page.route("https://checkout.stripe.com/**", (route) => route.fulfill({ contentType: "text/html", body: "<h1>Pago de Stripe</h1>" }));
    await page.getByRole("button", { name: "Contratar Max" }).click();
    await expect(page).toHaveURL(/^https:\/\/checkout\.stripe\.com\//);

    // Stripe confirma la suscripción (prueba de 7 días) con un webhook firmado.
    const [{ org_id, customer }] = await db<{ org_id: string; customer: string }>(
      `select m.organization_id as org_id, bc.stripe_customer_id as customer from organization_members m
         join profiles p on p.id = m.user_id join billing_customers bc on bc.organization_id = m.organization_id where p.email = $1`,
      [owner],
    );
    const [{ price }] = await db<{ price: string }>("select stripe_price_id as price from billing_prices where plan_code = 'max' and interval = 'month' and livemode = false");
    const now = Math.floor(Date.now() / 1000);
    const payload = JSON.stringify({
      id: `evt_e2e${now}`,
      object: "event",
      type: "customer.subscription.created",
      created: now,
      livemode: false,
      data: {
        object: {
          id: `sub_e2e${now}`,
          object: "subscription",
          customer,
          status: "trialing",
          livemode: false,
          metadata: { organization_id: org_id },
          cancel_at_period_end: false,
          trial_start: now,
          trial_end: now + 7 * 86400,
          items: { object: "list", data: [{ id: "si_e2e", object: "subscription_item", price: { id: price }, current_period_start: now, current_period_end: now + 7 * 86400 }] },
        },
      },
    });
    const secret = appEnv("STRIPE_WEBHOOK_SECRET");
    const signature = new Stripe("sk_test_unused").webhooks.generateTestHeaderString({ payload, secret });
    expect((await page.request.post("/api/webhooks/stripe", { data: payload, headers: { "content-type": "application/json", "stripe-signature": "t=1,v1=falsa" } })).status()).toBe(400);
    const res = await page.request.post("/api/webhooks/stripe", { data: payload, headers: { "content-type": "application/json", "stripe-signature": signature } });
    expect(await res.json()).toMatchObject({ received: true, outcome: "applied" });

    await page.goto("/app/facturacion?pago=ok");
    await expect(page.getByText("¡Listo!")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Plan Max · mensual" })).toBeVisible();
    await expect(page.getByText("Periodo de prueba")).toBeVisible();
    await expect(page.getByText(/Prueba gratuita hasta el \d{2}\/\d{2}\/\d{4}/)).toBeVisible();
    await expect(page.getByText("Tu plan actual")).toBeVisible();

    // Con el plan activo el taller ya no está en solo lectura.
    await page.goto("/app");
    await expect(page.getByText("Tu taller aún no tiene un plan activo")).toHaveCount(0);

    await page.goto("/app/facturacion");
    page.once("dialog", (d) => d.accept());
    await page.getByRole("button", { name: "Cancelar la suscripción" }).click();
    await expect(page.getByText("Cancelación programada: mantienes el acceso hasta el final del periodo pagado.")).toBeVisible();
  });
});

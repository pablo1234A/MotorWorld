import { expect, test } from "@playwright/test";

import { db, PASSWORD, uniqueEmail } from "./support/env";
import { createWorkshop, signIn, signOut, signUpAndVerify } from "./support/flows";
import { totp } from "./support/totp";

/** Fase 11: verificación en dos pasos, cabeceras de seguridad y accesos sin permiso. */

test.describe("seguridad", () => {
  test("verificación en dos pasos: activar, entrar con código, código malo rechazado, desactivar", async ({ page }) => {
    test.setTimeout(150_000);
    const email = uniqueEmail("dospasos");
    await signUpAndVerify(page, email);
    await createWorkshop(page, "Taller Dos Pasos");
    await page.goto("/app/configuracion");
    await expect(page.getByText("Protege tu cuenta de administrador")).toBeVisible();

    await page.goto("/app/cuenta");
    await page.getByRole("button", { name: "Activar la verificación en dos pasos" }).click();
    await expect(page.getByAltText("Código QR para la app de autenticación")).toBeVisible();
    const secret = (await page.getByTestId("totp-secret").textContent())!.trim();
    await page.getByLabel("Código de 6 números").fill("000000" === totp(secret) ? "111111" : "000000");
    await page.getByRole("button", { name: "Confirmar y activar" }).click();
    await expect(page.getByText("El código no es correcto o ha caducado. Prueba con el siguiente.")).toBeVisible();
    await page.getByLabel("Código de 6 números").fill(totp(secret));
    await page.getByRole("button", { name: "Confirmar y activar" }).click();
    await expect(page.getByText("Verificación en dos pasos activada.")).toBeVisible();

    await signOut(page);
    await signIn(page, email, PASSWORD);
    await expect(page).toHaveURL(/\/acceso\/verificar/);
    // Sin el código, la sesión no vale para nada: ni el panel ni las rutas internas.
    await page.goto("/app/clientes");
    await expect(page).toHaveURL(/\/acceso\/verificar/);
    expect((await page.request.get("/api/app/reports/correos")).status()).toBe(401);
    await page.getByLabel("Código de 6 números").fill("123456" === totp(secret) ? "654321" : "123456");
    await page.getByRole("button", { name: "Entrar", exact: true }).click();
    await expect(page.getByText("El código no es correcto o ha caducado.")).toBeVisible();
    // Supabase no admite reutilizar el código de la misma ventana de 30 s: se espera a la siguiente.
    await page.waitForTimeout(31_000);
    await page.getByLabel("Código de 6 números").fill(totp(secret));
    await page.getByRole("button", { name: "Entrar", exact: true }).click();
    await expect(page).toHaveURL(/\/app(\/clientes)?$/);

    const audit = await db<{ action: string }>(
      "select a.action from audit_logs a join profiles p on p.id::text = a.resource_id where p.email = $1 and a.action like 'auth.mfa%' order by a.id",
      [email],
    );
    expect(audit.map((a) => a.action)).toEqual(["auth.mfa_enabled", "auth.mfa_failed", "auth.mfa_verified"]);

    // Con la sesión completa (dos pasos) se puede cambiar la contraseña sin perder la verificación.
    await page.goto("/app/cuenta");
    await page.getByLabel("Contraseña actual").fill(PASSWORD);
    await page.getByLabel("Contraseña nueva", { exact: true }).fill("OtraClave2026Segura");
    await page.getByLabel("Repite la contraseña nueva").fill("OtraClave2026Segura");
    await page.getByRole("button", { name: /Cambiar la contraseña|Cambiar contraseña|Guardar contraseña/ }).click();
    await expect(page.getByText("Contraseña actualizada.")).toBeVisible();
    await expect(page).toHaveURL(/\/app\/cuenta/);

    await page.waitForTimeout(31_000);
    await page.getByLabel("Código de 6 números").fill(totp(secret));
    await page.getByRole("button", { name: "Desactivar la verificación en dos pasos" }).click();
    await expect(page.getByText("Verificación en dos pasos desactivada.")).toBeVisible();
  });

  test("cabeceras de seguridad y CSP en páginas y API", async ({ page }) => {
    const res = await page.goto("/");
    const h = res!.headers();
    expect(h["content-security-policy"]).toContain("frame-ancestors 'none'");
    expect(h["content-security-policy"]).toContain("object-src 'none'");
    expect(h["x-frame-options"]).toBe("DENY");
    expect(h["x-content-type-options"]).toBe("nosniff");
    expect(h["referrer-policy"]).toBe("strict-origin-when-cross-origin");
    expect(h["x-powered-by"]).toBeUndefined();
    const errors: string[] = [];
    page.on("console", (m) => {
      if (m.type() === "error" && /Content Security Policy|CSP/i.test(m.text())) errors.push(m.text());
    });
    await page.goto("/registro");
    await page.goto("/legal/privacidad");
    expect(errors).toEqual([]);
  });

  test("sin sesión: el panel redirige y las rutas internas responden 401", async ({ request }) => {
    for (const path of ["/api/app/reports/correos", "/api/app/customers/search?q=a", "/api/app/import/template"]) {
      const res = await request.get(path, { maxRedirects: 0 });
      expect([401, 307]).toContain(res.status());
    }
    expect((await request.get("/api/internal/jobs/status")).status()).toBe(401);
    expect((await request.get("/api/v1/customers")).status()).toBe(401);
    expect((await request.post("/api/webhooks/stripe", { data: "{}" })).status()).toBeGreaterThanOrEqual(400);
  });
});

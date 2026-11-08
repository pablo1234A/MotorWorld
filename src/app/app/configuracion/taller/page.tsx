import type { Metadata } from "next";

import { LogoForm, ProfileForm } from "@/components/organizations/profile-forms";
import { Alert } from "@/components/ui/feedback";
import { isAdmin } from "@/server/auth/context";
import { requireOrgPage } from "@/server/auth/guards";
import { getProfile, logoUrl } from "@/server/modules/organizations/profile";

export const metadata: Metadata = { title: "Datos de la empresa · RevisaYa" };

export default async function WorkshopProfilePage() {
  const ctx = await requireOrgPage("/app/configuracion/taller");
  if (!isAdmin(ctx)) {
    return <Alert tone="error" title="Sin permiso">Solo los administradores pueden cambiar los datos de la empresa.</Alert>;
  }
  const profile = await getProfile(ctx);
  const readOnly = !ctx.subscription.active;
  // Ruta relativa en el panel (mismo origen).
  const src = logoUrl("http://local", profile.id, profile.logoPath)?.replace("http://local", "") ?? null;
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Datos de la empresa</h1>
        <p className="text-sm text-[var(--muted)]">Tu marca en los correos, la página de citas y los presupuestos.</p>
      </div>
      {readOnly ? <Alert tone="warning">Tu suscripción no está activa: los datos están en solo lectura.</Alert> : null}
      <LogoForm logoSrc={src} readOnly={readOnly} />
      <ProfileForm values={profile} readOnly={readOnly} />
    </div>
  );
}

import type { Metadata } from "next";

import { ChangePasswordForm, ProfileForm } from "@/components/account/account-forms";
import { SubmitButton } from "@/components/ui/button";
import { Card } from "@/components/ui/feedback";
import { requireOrgPage } from "@/server/auth/guards";
import { withRls } from "@/server/db/client";
import { signOutEverywhereAction } from "@/server/modules/auth/actions";

export const metadata: Metadata = { title: "Mi cuenta · RevisaYa" };

export default async function AccountPage() {
  const ctx = await requireOrgPage("/app/cuenta");
  const profile = await withRls(ctx.auth, (tx) =>
    tx.selectFrom("profiles").select(["first_name", "last_name", "email"]).where("id", "=", ctx.user.id).executeTakeFirstOrThrow(),
  );

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Mi cuenta</h1>
        <p className="text-sm text-[var(--muted)]">{String(profile.email)}</p>
      </div>
      <Card>
        <h2 className="mb-4 text-lg font-semibold">Datos personales</h2>
        <ProfileForm firstName={profile.first_name} lastName={profile.last_name} />
      </Card>
      <Card>
        <h2 className="mb-4 text-lg font-semibold">Contraseña</h2>
        <ChangePasswordForm />
      </Card>
      <Card>
        <h2 className="mb-1 text-lg font-semibold">Sesiones</h2>
        <p className="mb-4 text-sm text-[var(--muted)]">Cierra la sesión en todos los dispositivos donde hayas entrado (móvil, otros ordenadores…).</p>
        <form action={signOutEverywhereAction}>
          <SubmitButton variant="secondary" pendingLabel="Cerrando sesiones…">
            Cerrar sesión en todos los dispositivos
          </SubmitButton>
        </form>
      </Card>
    </div>
  );
}

import type { Metadata } from "next";

import { ChangePasswordForm, ProfileForm } from "@/components/account/account-forms";
import { DisableMfa, EnableMfa } from "@/components/account/mfa-forms";
import { SubmitButton } from "@/components/ui/button";
import { Alert, Card } from "@/components/ui/feedback";
import { requireOrgPage } from "@/server/auth/guards";
import { hasVerifiedFactor } from "@/server/auth/session";
import { withRls } from "@/server/db/client";
import { signOutEverywhereAction } from "@/server/modules/auth/actions";

export const metadata: Metadata = { title: "Mi cuenta · RevisaYa" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function AccountPage({ searchParams }: { searchParams: SearchParams }) {
  const ctx = await requireOrgPage("/app/cuenta");
  const result = (await searchParams).dos_pasos;
  const mfa = await hasVerifiedFactor(ctx.user.id);
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
      <Card className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Verificación en dos pasos</h2>
        {result === "activada" ? <Alert tone="success">Verificación en dos pasos activada. A partir de ahora, al entrar te pediremos un código.</Alert> : null}
        {result === "desactivada" ? <Alert tone="success">Verificación en dos pasos desactivada.</Alert> : null}
        {mfa ? (
          <>
            <p className="text-sm">
              <span className="font-semibold text-[var(--success-strong)]">Activada.</span> Al entrar te pedimos el código de tu app de autenticación.
            </p>
            <DisableMfa />
          </>
        ) : (
          <>
            <p className="text-sm text-[var(--muted)]">
              Además de la contraseña, al entrar te pediremos un código de tu móvil. Si alguien consigue tu contraseña, no podrá entrar.
              {ctx.membership.role === "admin" ? " Muy recomendable para los administradores: pueden ver y cambiar toda la empresa." : ""}
            </p>
            <EnableMfa />
          </>
        )}
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

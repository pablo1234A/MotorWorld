import type { Metadata } from "next";
import { InvitationActions } from "@/components/app/team";
import { Logo } from "@/components/logo";
import { ButtonLink } from "@/components/ui/button";
import { isUuid } from "@/lib/utils";
import { getSessionContext } from "@/server/auth/session";

export const metadata: Metadata = { title: "Invitación", robots: { index: false } };
export const dynamic = "force-dynamic";

const ROLE: Record<string, string> = { admin: "administrador", editor: "editor", viewer: "miembro de solo lectura" };

export default async function InvitationPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const context = isUuid(token) ? await getSessionContext() : null;
  const next = encodeURIComponent(`/invitacion/${token}`);

  let body: React.ReactNode;
  if (!isUuid(token)) {
    body = <Message title="Invitación no válida" text="El enlace está incompleto o no es correcto." />;
  } else if (!context) {
    body = (
      <>
        <Message title="Te han invitado a un equipo de AnunciaPro" text="Inicia sesión o crea una cuenta con el correo en el que recibiste la invitación para aceptarla." />
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <ButtonLink href={`/login?next=${next}`}>Iniciar sesión</ButtonLink>
          <ButtonLink href="/registro" variant="secondary">
            Crear cuenta
          </ButtonLink>
        </div>
      </>
    );
  } else {
    const { data } = await context.supabase.rpc("get_invitation", { p_token: token });
    const invitation = data as { workspace_name: string; role: string; for_current_user: boolean; expired: boolean } | null;
    if (!invitation) body = <Message title="Esta invitación ya no existe" text="Puede que se haya anulado o que ya la hayas aceptado." link />;
    else if (invitation.expired) body = <Message title="La invitación ha caducado" text="Pide a la persona que te invitó que te envíe una nueva." link />;
    else if (!invitation.for_current_user)
      body = <Message title="Esta invitación es para otra cuenta" text={`Has iniciado sesión como ${context.profile.email}. Cierra sesión y entra con el correo al que se envió la invitación.`} link />;
    else
      body = (
        <>
          <Message title={`Únete a «${invitation.workspace_name}»`} text={`Te han invitado como ${ROLE[invitation.role] ?? invitation.role}. Tu espacio personal seguirá disponible y podrás cambiar de uno a otro desde el menú.`} />
          <div className="mt-6 flex justify-center">
            <InvitationActions token={token} workspaceName={invitation.workspace_name} />
          </div>
        </>
      );
  }

  return (
    <main id="contenido" className="flex min-h-dvh flex-col items-center justify-center px-6 py-12 text-center">
      <Logo />
      <div className="mt-10 w-full max-w-md rounded-2xl border border-line bg-surface p-8">{body}</div>
    </main>
  );
}

function Message({ title, text, link }: { title: string; text: string; link?: boolean }) {
  return (
    <>
      <h1 className="text-2xl font-semibold">{title}</h1>
      <p className="mt-3 text-sm leading-relaxed text-muted">{text}</p>
      {link ? (
        <ButtonLink href="/app" variant="secondary" className="mt-6">
          Ir a mi panel
        </ButtonLink>
      ) : null}
    </>
  );
}

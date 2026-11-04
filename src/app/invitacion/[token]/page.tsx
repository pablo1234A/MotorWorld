import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { buttonClass } from "@/components/ui/button-styles";
import { Alert, Skeleton } from "@/components/ui/feedback";
import { AcceptInvitationForm } from "@/components/members/accept-invitation-form";
import { ROLE_LABELS } from "@/lib/permissions";
import { getAuthUser } from "@/server/auth/session";
import { previewInvitation } from "@/server/modules/members/service";

export const metadata: Metadata = { title: "Invitación · RevisaYa", robots: { index: false } };

type Params = Promise<{ token: string }>;

const STATE_MESSAGES = {
  expired: "Esta invitación ha caducado. Pide al administrador del taller que te envíe un enlace nuevo.",
  revoked: "Esta invitación ha sido anulada.",
  accepted: "Esta invitación ya se ha utilizado.",
} as const;

export default function InvitationPage({ params }: { params: Params }) {
  return (
    <div className="flex flex-1 flex-col items-center px-4 py-10 sm:py-16">
      <p className="mb-8 text-xl font-semibold tracking-tight">RevisaYa</p>
      <main className="w-full max-w-md rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 shadow-sm sm:p-8">
        <Suspense fallback={<Skeleton className="h-48 w-full" />}>
          <InvitationContent params={params} />
        </Suspense>
      </main>
    </div>
  );
}

async function InvitationContent({ params }: { params: Params }) {
  const { token } = await params;
  const preview = await previewInvitation(token);
  if (!preview) {
    return <Alert tone="error" title="Invitación no válida">Revisa que has copiado el enlace completo.</Alert>;
  }
  if (preview.state !== "pending") {
    return <Alert tone="error" title="No se puede usar esta invitación">{STATE_MESSAGES[preview.state]}</Alert>;
  }

  const user = await getAuthUser();
  const next = `/invitacion/${token}`;
  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="mb-1 text-2xl font-semibold tracking-tight">Te han invitado a {preview.organizationName}</h1>
        <p className="text-sm leading-6 text-[var(--muted)]">
          Entrarás como <strong>{ROLE_LABELS[preview.role].toLowerCase()}</strong>. La invitación es para{" "}
          <strong>{preview.emailMasked}</strong>.
        </p>
      </div>
      {user ? (
        <AcceptInvitationForm token={token} />
      ) : (
        <div className="flex flex-col gap-3">
          <Link className={buttonClass("primary")} href={`/registro?next=${encodeURIComponent(next)}`}>
            Crear cuenta con ese correo
          </Link>
          <Link className={buttonClass("secondary")} href={`/acceso?next=${encodeURIComponent(next)}`}>
            Ya tengo cuenta: iniciar sesión
          </Link>
        </div>
      )}
    </div>
  );
}

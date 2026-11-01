import type { Metadata } from "next";
import Link from "next/link";
import { CheckCircle2, Clock } from "lucide-react";
import { Alert } from "@/components/ui/feedback";
import { LinkButton } from "@/components/ui/button";
import { Panel } from "@/components/ui/layout";
import { AutoRefresh } from "@/components/app/auto-refresh";
import { requireOrganization } from "@/lib/auth";
import { fulfillCheckoutSession } from "@/lib/billing/fulfillment";
import { getStripe } from "@/lib/billing/stripe";
import { listDocuments } from "@/lib/data/panel";
import { logError } from "@/lib/observability";

export const metadata: Metadata = { title: "Confirmación de compra" };

/**
 * Página de retorno de Stripe. No se confía en el parámetro de la URL: se
 * consulta la sesión a Stripe y se comprueba que pertenece a esta organización.
 * El cumplimiento es idempotente y compatible con el webhook.
 */
export default async function ConfirmationPage({ searchParams }: PageProps<"/panel/compra/confirmacion">) {
  const { org } = await requireOrganization();
  const sp = await searchParams;
  const sessionId = typeof sp.session_id === "string" && /^cs_(test|live)_[A-Za-z0-9]+$/.test(sp.session_id) ? sp.session_id : null;

  let status: "paid" | "pending" | "invalid" = "invalid";
  if (sessionId) {
    try {
      const session = await getStripe().checkout.sessions.retrieve(sessionId);
      if (session.metadata?.organization_id === org.id) {
        const r = await fulfillCheckoutSession(sessionId);
        status = r.status === "paid" ? "paid" : r.status === "pending" ? "pending" : "invalid";
      }
    } catch (e) {
      await logError("billing.confirmation", e, { sessionId });
      status = "pending";
    }
  }

  const docs = status === "paid" ? await listDocuments() : [];

  if (status === "invalid") {
    return (
      <Panel>
        <Alert tone="warning" title="No encontramos este pago">
          Si acabas de pagar, revisa <Link href="/panel/suscripcion">Mi suscripción</Link> en unos minutos o escríbenos desde Ayuda.
        </Alert>
      </Panel>
    );
  }

  return (
    <div className="mx-auto max-w-xl py-6 text-center">
      {status === "paid" ? (
        <>
          <CheckCircle2 className="mx-auto h-12 w-12 text-success" aria-hidden />
          <h1 className="mt-4 text-2xl font-semibold">Pago confirmado</h1>
          {docs.length > 0 ? (
            <>
              <p className="mt-2 text-muted">Tus documentos ya están generados y listos para descargar.</p>
              <LinkButton href="/panel/documentos" className="mt-8">
                Ir a mis documentos
              </LinkButton>
            </>
          ) : (
            <>
              <p className="mt-2 text-muted">Estamos generando tus documentos. Esta página se actualizará sola.</p>
              <AutoRefresh seconds={4} maxTimes={10} />
              <LinkButton href="/panel/generador/revision" variant="secondary" className="mt-8">
                Generarlos manualmente
              </LinkButton>
            </>
          )}
        </>
      ) : (
        <>
          <Clock className="mx-auto h-12 w-12 text-blue" aria-hidden />
          <h1 className="mt-4 text-2xl font-semibold">Verificando el pago…</h1>
          <p className="mt-2 text-muted">Algunos métodos de pago tardan unos minutos en confirmarse. Te enviaremos un email cuando esté listo.</p>
          <AutoRefresh seconds={5} maxTimes={12} />
        </>
      )}
    </div>
  );
}

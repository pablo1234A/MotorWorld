"use client";
import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { CreditCard, ExternalLink, FileText } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import { fmtDate } from "@/lib/format";
import { formatEur } from "@/lib/money";
import { SUB_STATUS } from "@/lib/status";
import { Alert, Badge, Card, CardHeader, EmptyState, PageHeader, Progress } from "@/components/ui/Display";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { PageLoader } from "@/components/ui/Spinner";
import { useToast } from "@/components/ui/Toast";
import { PlanPicker, type PlanInfo } from "@/components/app/PlanPicker";

type B = {
  stripeConfigured: boolean; hasStripeCustomer: boolean;
  subscription: { status: string; planCode: string; currentPeriodStart: string; currentPeriodEnd: string; cancelAtPeriodEnd: boolean; canSend: boolean } | null;
  usage: { sent: number; limit: number; percentUsed: number; available: number; pending: number } | null;
  plans: PlanInfo[];
  invoices: { id: string; number: string | null; status: string; subtotalCents: number; taxCents: number; totalCents: number; issuedAt: string; hostedInvoiceUrl: string | null; invoicePdfUrl: string | null }[];
};

function Billing() {
  const sp = useSearchParams();
  const toast = useToast();
  const d = useApi<B>("/api/v1/billing");
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmCancel, setConfirmCancel] = useState(false);
  if (d.loading && !d.data) return <PageLoader />;
  if (d.error) return <Alert tone="bad">{d.error.message}</Alert>;
  const b = d.data!;
  const s = b.subscription;
  const live = s && !["CANCELED", "INCOMPLETE_EXPIRED"].includes(s.status);
  const plan = b.plans.find((p) => p.code === s?.planCode);

  const portal = async () => {
    setBusy("portal");
    try { const r = await api<{ url: string }>("/api/v1/billing/portal", { method: "POST", body: {} }); window.location.href = r.url; }
    catch (e) { toast("bad", (e as ApiError).message); setBusy(null); }
  };
  const setCancel = async (cancel: boolean) => {
    setBusy("cancel");
    try { await api("/api/v1/billing/cancel", { body: { cancel } }); toast("ok", cancel ? "La suscripción no se renovará" : "Renovación reactivada"); setConfirmCancel(false); await d.reload(); }
    catch (e) { toast("bad", (e as ApiError).message); }
    setBusy(null);
  };

  return (
    <>
      <PageHeader title="Suscripción y facturación" description="Tu plan, consumo, método de pago y facturas." />
      {sp.get("checkout") === "ok" && !s?.canSend ? <Alert tone="info" className="mb-4" title="Pago recibido">Stripe está confirmando la suscripción. Se activará en unos segundos. <button className="underline" onClick={() => d.reload()}>Actualizar</button></Alert> : null}
      {sp.get("checkout") === "ok" && s?.canSend ? <Alert tone="ok" className="mb-4">¡Suscripción activa! Ya puedes enviar solicitudes.</Alert> : null}
      {sp.get("checkout") === "cancelado" ? <Alert tone="warn" className="mb-4">Has cancelado el proceso de pago. No se ha realizado ningún cargo.</Alert> : null}

      {live && s ? (
        <div className="grid gap-4 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-sm text-ink-500">Plan actual</p>
                <p className="mt-1 font-display text-2xl font-semibold">{plan?.name ?? s.planCode}</p>
                {plan ? <p className="mt-1 text-sm text-ink-600">{formatEur(plan.price.totalCents)}/mes IVA incluido · {plan.monthlyEmailLimit} correos/mes</p> : null}
              </div>
              <Badge tone={SUB_STATUS[s.status]?.tone} dot>{SUB_STATUS[s.status]?.label ?? s.status}</Badge>
            </div>
            {s.status === "PAST_DUE" || s.status === "UNPAID" ? <Alert tone="bad" className="mt-4" title="Pago pendiente">No hemos podido cobrar la última cuota. Los envíos están en pausa hasta que se regularice. Actualiza tu método de pago.</Alert> : null}
            {s.cancelAtPeriodEnd ? <Alert tone="warn" className="mt-4">Tu suscripción finalizará el {fmtDate(s.currentPeriodEnd)} y no se renovará.</Alert> : null}
            <dl className="mt-5 grid gap-3 text-sm sm:grid-cols-2">
              <div className="rounded-lg border border-ink-100 p-3"><dt className="text-ink-500">Periodo actual</dt><dd className="font-medium">{fmtDate(s.currentPeriodStart)} – {fmtDate(s.currentPeriodEnd)}</dd></div>
              <div className="rounded-lg border border-ink-100 p-3"><dt className="text-ink-500">{s.cancelAtPeriodEnd ? "Finaliza" : "Próxima renovación"}</dt><dd className="font-medium">{fmtDate(s.currentPeriodEnd)}</dd></div>
            </dl>
            <div className="mt-6 flex flex-wrap gap-2">
              <Button variant="secondary" icon={<CreditCard className="h-4 w-4" />} loading={busy === "portal"} onClick={portal} disabled={!b.hasStripeCustomer || !b.stripeConfigured}>Método de pago y facturas</Button>
              {s.cancelAtPeriodEnd ? <Button variant="secondary" loading={busy === "cancel"} onClick={() => setCancel(false)}>Reactivar renovación</Button> : <Button variant="ghost" onClick={() => setConfirmCancel(true)}>Cancelar renovación</Button>}
            </div>
          </Card>
          <Card>
            <CardHeader title="Consumo del periodo" />
            {b.usage ? (
              <>
                <p className="font-display text-2xl font-semibold tabular-nums">{b.usage.sent} <span className="text-base font-normal text-ink-500">/ {b.usage.limit}</span></p>
                <div className="mt-3"><Progress value={b.usage.percentUsed} tone={b.usage.percentUsed >= 100 ? "bad" : b.usage.percentUsed >= 80 ? "warn" : "ink"} /></div>
                <p className="mt-2 text-xs text-ink-500">{b.usage.available} disponibles · {b.usage.pending} pendientes. El contador se reinicia el {fmtDate(s.currentPeriodEnd)}.</p>
              </>
            ) : null}
          </Card>
        </div>
      ) : null}

      <section className="mt-8">
        <h2 className="mb-1 text-lg font-semibold">{live ? "Cambiar de plan" : "Elige tu plan"}</h2>
        <p className="mb-4 text-sm text-ink-500">{live ? "El cambio se aplica al instante; Stripe prorratea el importe del periodo en curso." : "Pago mensual seguro con Stripe. Sin permanencia."}</p>
        <PlanPicker plans={b.plans} currentPlan={live ? s?.planCode : null} mode={live ? "change" : "checkout"} stripeConfigured={b.stripeConfigured} onChanged={() => { toast("ok", "Plan actualizado"); void d.reload(); }} />
      </section>

      <Card className="mt-8" padded={false}>
        <div className="px-5 pt-5 sm:px-6"><h2 className="text-base font-semibold">Facturas</h2><p className="mt-1 text-sm text-ink-500">Base imponible, IVA y total de cada cobro.</p></div>
        {b.invoices.length === 0 ? <EmptyState icon={<FileText className="h-5 w-5" />} title="Sin facturas todavía">Aparecerán aquí tras el primer cobro.</EmptyState> : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead className="text-left text-xs uppercase tracking-wide text-ink-500"><tr className="border-b border-ink-100"><th className="px-5 py-2 sm:px-6">Factura</th><th className="px-3 py-2">Fecha</th><th className="px-3 py-2 text-right">Base</th><th className="px-3 py-2 text-right">IVA</th><th className="px-3 py-2 text-right">Total</th><th className="px-5 py-2 sm:px-6" /></tr></thead>
              <tbody className="divide-y divide-ink-100">
                {b.invoices.map((i) => (
                  <tr key={i.id}>
                    <td className="px-5 py-3 font-medium sm:px-6">{i.number ?? "Borrador"} <Badge className="ml-1" tone={i.status === "paid" ? "ok" : i.status === "open" ? "warn" : "neutral"}>{i.status === "paid" ? "Pagada" : i.status === "open" ? "Pendiente" : i.status}</Badge></td>
                    <td className="px-3 py-3">{fmtDate(i.issuedAt)}</td>
                    <td className="px-3 py-3 text-right tabular-nums">{formatEur(i.subtotalCents)}</td>
                    <td className="px-3 py-3 text-right tabular-nums">{formatEur(i.taxCents)}</td>
                    <td className="px-3 py-3 text-right font-medium tabular-nums">{formatEur(i.totalCents)}</td>
                    <td className="px-5 py-3 text-right sm:px-6">{i.invoicePdfUrl ? <a href={i.invoicePdfUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-sm font-medium underline">PDF <ExternalLink className="h-3 w-3" /></a> : null}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Modal open={confirmCancel} onClose={() => setConfirmCancel(false)} title="Cancelar la renovación" footer={<>
        <Button variant="ghost" onClick={() => setConfirmCancel(false)}>Mantener suscripción</Button>
        <Button variant="danger" loading={busy === "cancel"} onClick={() => setCancel(true)}>Cancelar renovación</Button>
      </>}>
        <p className="text-sm text-ink-600">Seguirás teniendo acceso hasta el {s ? fmtDate(s.currentPeriodEnd) : "final del periodo"}. Después se detendrán los envíos y no se te cobrará de nuevo. Puedes reactivarla antes de esa fecha.</p>
      </Modal>
    </>
  );
}

export default function Page() {
  return <Suspense fallback={<PageLoader />}><Billing /></Suspense>;
}

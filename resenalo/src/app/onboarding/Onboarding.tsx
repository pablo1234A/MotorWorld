"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Check, CheckCircle2 } from "lucide-react";
import clsx from "clsx";
import { api, ApiError } from "@/lib/api";
import { Logo } from "@/components/brand/Logo";
import { Button } from "@/components/ui/Button";
import { Checkbox } from "@/components/ui/Field";
import { Alert, Card } from "@/components/ui/Display";
import { PageLoader } from "@/components/ui/Spinner";
import { BusinessFields, emptyBusiness, fromBusiness, toPayload, type BusinessData } from "@/components/app/BusinessForm";
import { PlanPicker, type PlanInfo } from "@/components/app/PlanPicker";
import { EmailConnectButtons } from "@/components/app/EmailConnect";

const STEPS = ["Tu negocio", "Plan", "Correo", "Listo"];

type Billing = { stripeConfigured: boolean; subscription: { planCode: string; canSend: boolean } | null; plans: PlanInfo[] };
type Conn = { connection: { emailAddress: string; status: string } | null; providers: { google: boolean; microsoft: boolean } };

export function Onboarding({ userName, hasBusiness }: { userName: string; hasBusiness: boolean }) {
  const sp = useSearchParams();
  const [step, setStep] = useState(hasBusiness ? 1 : 0);
  const [biz, setBiz] = useState<BusinessData>(emptyBusiness);
  const [dpa, setDpa] = useState(false);
  const [errors, setErrors] = useState<{ msg?: string; fields?: Record<string, string> }>({});
  const [saving, setSaving] = useState(false);
  const [billing, setBilling] = useState<Billing | null>(null);
  const [conn, setConn] = useState<Conn | null>(null);

  const load = useCallback(async () => {
    const [b, c] = await Promise.all([api<Billing>("/api/v1/billing"), api<Conn>("/api/v1/email-connection")]);
    setBilling(b);
    setConn(c);
    return { b, c };
  }, []);

  useEffect(() => {
    if (!hasBusiness) return;
    api<{ business: Record<string, unknown> }>("/api/v1/business").then((r) => setBiz(fromBusiness(r.business)));
    load().then(({ b, c }) => {
      if (sp.get("connected") || (c.connection && c.connection.status === "ACTIVE" && b.subscription?.canSend)) setStep(sp.get("connected") ? 3 : 2);
      else if (sp.get("checkout") === "ok" || b.subscription?.canSend) setStep(2);
    });
  }, [hasBusiness, load, sp]);

  const saveBusiness = async () => {
    setSaving(true);
    setErrors({});
    try {
      if (hasBusiness || billing) await api("/api/v1/business", { method: "PATCH", body: toPayload(biz) });
      else await api("/api/v1/business", { body: { ...toPayload(biz), acceptDpa: dpa } });
      await load();
      setStep(1);
    } catch (e) {
      const x = e as ApiError;
      setErrors({ msg: x.message, fields: x.fields });
    }
    setSaving(false);
  };

  const finish = async () => {
    setSaving(true);
    await api("/api/v1/business/onboarding-complete", { method: "POST", body: {} });
    window.location.href = "/app";
  };

  const sendReady = Boolean(billing?.subscription?.canSend);
  const connReady = conn?.connection?.status === "ACTIVE";

  return (
    <div className="min-h-[100dvh]">
      <header className="container-page flex h-16 items-center justify-between">
        <Logo />
        <span className="text-sm text-ink-500">Configuración inicial</span>
      </header>
      <main id="contenido" className="container-page max-w-3xl pb-20 pt-4">
        <h1 className="text-2xl font-semibold sm:text-3xl">Hola {userName}, vamos a dejarlo todo listo</h1>
        <p className="mt-2 text-sm text-ink-500">Son 3 pasos. Puedes cambiar cualquier dato más adelante.</p>

        <ol className="mt-8 grid grid-cols-4 gap-2" aria-label="Progreso">
          {STEPS.map((s, i) => (
            <li key={s} className="min-w-0">
              <div className={clsx("h-1 rounded-full", i <= step ? "bg-ink-800" : "bg-ink-200")} />
              <p className={clsx("mt-2 truncate text-xs font-medium", i === step ? "text-ink-900" : "text-ink-500")} aria-current={i === step ? "step" : undefined}>
                {i < step ? <Check className="mr-1 inline h-3 w-3" /> : null}
                {s}
              </p>
            </li>
          ))}
        </ol>

        <div className="mt-8">
          {step === 0 ? (
            <Card>
              <h2 className="text-lg font-semibold">Datos de tu negocio</h2>
              <p className="mb-6 mt-1 text-sm text-ink-500">Los usaremos en los correos que reciban tus clientes.</p>
              {errors.msg ? <Alert tone="bad" className="mb-5">{errors.msg}</Alert> : null}
              <BusinessFields value={biz} onChange={setBiz} errors={errors.fields} sections={["basic", "review", "legal"]} />
              {!hasBusiness && !billing ? (
                <div className="mt-6 rounded-lg border border-ink-200 p-4">
                  <Checkbox
                    checked={dpa}
                    onChange={(e) => setDpa(e.target.checked)}
                    label={<>Acepto el <Link href="/legal/encargo-tratamiento" target="_blank" className="underline">acuerdo de encargo del tratamiento</Link> (art. 28 RGPD) para los datos de mis clientes, y confirmo que tengo base legal para contactarles.</>}
                  />
                </div>
              ) : null}
              <div className="mt-6 flex justify-end">
                <Button size="lg" loading={saving} onClick={saveBusiness} disabled={!biz.name || (!hasBusiness && !billing && !dpa)}>
                  Guardar y continuar
                </Button>
              </div>
            </Card>
          ) : null}

          {step === 1 ? (
            !billing ? <PageLoader /> : (
              <div>
                <h2 className="text-lg font-semibold">Elige tu plan</h2>
                <p className="mb-5 mt-1 text-sm text-ink-500">Pago mensual seguro con Stripe. Sin permanencia. IVA incluido.</p>
                {sp.get("checkout") === "cancelado" ? <Alert tone="warn" className="mb-4">Has cancelado el pago. Puedes elegir un plan cuando quieras.</Alert> : null}
                {sp.get("checkout") === "ok" && !sendReady ? <Alert tone="info" className="mb-4">Estamos confirmando el pago con Stripe… <button className="underline" onClick={() => load()}>Actualizar</button></Alert> : null}
                {sendReady ? <Alert tone="ok" className="mb-4">Suscripción activa: plan {billing.subscription?.planCode}.</Alert> : (
                  <PlanPicker plans={billing.plans} mode="checkout" returnTo="onboarding" stripeConfigured={billing.stripeConfigured} />
                )}
                <div className="mt-6 flex justify-between">
                  <Button variant="ghost" onClick={() => setStep(0)}>Atrás</Button>
                  <Button variant={sendReady ? "primary" : "secondary"} onClick={() => setStep(2)}>{sendReady ? "Continuar" : "Lo haré más tarde"}</Button>
                </div>
              </div>
            )
          ) : null}

          {step === 2 ? (
            <Card>
              <h2 className="text-lg font-semibold">Conecta tu correo</h2>
              <p className="mb-6 mt-1 text-sm text-ink-500">Las solicitudes saldrán desde tu propia cuenta, para que tus clientes reconozcan al remitente.</p>
              {sp.get("error") ? <Alert tone="bad" className="mb-4">{sp.get("error")}</Alert> : null}
              {connReady ? (
                <Alert tone="ok" title="Cuenta conectada">{conn?.connection?.emailAddress}</Alert>
              ) : conn ? (
                <EmailConnectButtons providers={conn.providers} returnTo="onboarding" />
              ) : (
                <PageLoader />
              )}
              <div className="mt-6 flex justify-between">
                <Button variant="ghost" onClick={() => setStep(1)}>Atrás</Button>
                <Button variant={connReady ? "primary" : "secondary"} onClick={() => setStep(3)}>{connReady ? "Continuar" : "Lo haré más tarde"}</Button>
              </div>
            </Card>
          ) : null}

          {step === 3 ? (
            <Card>
              <CheckCircle2 className="h-8 w-8 text-ok-600" />
              <h2 className="mt-4 text-lg font-semibold">Todo preparado</h2>
              <ul className="mt-4 space-y-2 text-sm">
                <Item ok label="Negocio configurado" />
                <Item ok={Boolean(biz.reviewUrl)} label="Enlace de reseñas" todo="Añádelo en Configuración del negocio" />
                <Item ok={sendReady} label="Suscripción activa" todo="Elige un plan en Suscripción y facturación" />
                <Item ok={connReady} label="Correo conectado" todo="Conéctalo en Conexión de correo" />
              </ul>
              <p className="mt-5 text-sm text-ink-500">Hemos creado una plantilla y una automatización por defecto (envío 2 horas después de finalizar el servicio). Revísalas antes de registrar tus primeros clientes.</p>
              <div className="mt-6 flex justify-end">
                <Button size="lg" loading={saving} onClick={finish}>Ir a mi panel</Button>
              </div>
            </Card>
          ) : null}
        </div>
      </main>
    </div>
  );
}

function Item({ ok, label, todo }: { ok: boolean; label: string; todo?: string }) {
  return (
    <li className="flex items-start gap-2">
      <span className={clsx("mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full", ok ? "bg-ok-600 text-white" : "border border-ink-300")}>{ok ? <Check className="h-3 w-3" /> : null}</span>
      <span>
        <span className={ok ? "text-ink-800" : "text-ink-600"}>{label}</span>
        {!ok && todo ? <span className="block text-xs text-ink-500">{todo}</span> : null}
      </span>
    </li>
  );
}

import type { Metadata } from "next";
import { PricingGrid } from "@/components/marketing/pricing";
import { Notice } from "@/components/ui/primitives";
import { paymentsEnabled } from "@/lib/config/env";
import { getPublicPlans } from "@/server/services/public";

export const metadata: Metadata = { title: "Precios", description: "Planes de AnunciaPro: empieza gratis y amplía cuando tu catálogo crezca." };

// Prerenderizada; los planes se refrescan desde la base de datos cada 5 minutos.
export const revalidate = 300;

export default async function PricingPage() {
  const plans = await getPublicPlans();
  const enabled = paymentsEnabled();
  return (
    <div className="mx-auto max-w-6xl px-5 py-16">
      <div className="max-w-2xl">
        <h1 className="text-4xl font-bold sm:text-5xl">Precios sencillos</h1>
        <p className="mt-4 text-lg leading-relaxed text-muted">Un plan gratuito para siempre y tres planes de pago según el volumen de anuncios que generes cada mes.</p>
      </div>
      {!enabled ? (
        <Notice tone="warning" className="mt-8 max-w-3xl" title="Planes de pago todavía no disponibles">
          La contratación aún no está abierta, por lo que no se realiza ningún cobro. Los precios son los previstos para el lanzamiento y pueden cambiar. Mientras tanto, todas las cuentas funcionan con el plan Free.
        </Notice>
      ) : null}
      <div className="mt-10">
        <PricingGrid plans={plans} paymentsEnabled={enabled} />
      </div>
      <div className="mt-14 grid gap-8 md:grid-cols-3">
        {[
          ["¿Qué es una generación?", "Cada generación, regeneración o ajuste automático de un anuncio (tono, extensión o título). Editar a mano, guardar, copiar y exportar no consume."],
          ["¿Cuándo se renueva el consumo?", "En el plan Free, el día 1 de cada mes (UTC). En los planes de pago, al inicio de cada periodo de facturación."],
          ["¿Y si una generación falla?", "Si el fallo se debe a un error interno de AnunciaPro, la generación no se descuenta."],
        ].map(([title, text]) => (
          <div key={title}>
            <h2 className="font-sans text-base font-semibold tracking-normal">{title}</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted">{text}</p>
          </div>
        ))}
      </div>
      <p className="mt-12 text-[13px] text-faint">Precios en euros. Los impuestos aplicables se indicarán antes de confirmar cualquier contratación.</p>
    </div>
  );
}

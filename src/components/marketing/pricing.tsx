import { Check } from "lucide-react";
import { ButtonLink } from "@/components/ui/button";
import { Badge } from "@/components/ui/primitives";
import { EXPORT_FORMAT_LABELS } from "@/domain/plans";
import { cn, formatNumber, formatPrice } from "@/lib/utils";
import type { PublicPlan } from "@/server/services/public";

const TAGLINES: Record<string, string> = {
  free: "Para probar AnunciaPro y vender de forma ocasional.",
  starter: "Para vendedores habituales con un catálogo en crecimiento.",
  pro: "Para revendedores y tiendas que trabajan por lotes.",
  business: "Para empresas con catálogos grandes.",
};

export function planFeatureList(plan: PublicPlan): string[] {
  const items = [
    `${formatNumber(plan.monthlyListingLimit)} generaciones al mes`,
    plan.features.maxProducts ? `Catálogo de hasta ${formatNumber(plan.features.maxProducts)} productos` : "Catálogo sin límite",
    `${plan.features.maxImagesPerProduct} fotografías por producto`,
    plan.features.maxTemplates ? `${formatNumber(plan.features.maxTemplates)} ${plan.features.maxTemplates === 1 ? "plantilla personalizada" : "plantillas personalizadas"}` : "Perfiles de marketplace incluidos",
    plan.monthlyBulkLimit > 0
      ? `Generación masiva desde CSV (hasta ${formatNumber(plan.features.maxBulkRows)} filas por archivo)`
      : "Generación individual",
    `Exportación: ${plan.features.exportFormats.map((format) => EXPORT_FORMAT_LABELS[format]).join(", ")}`,
  ];
  if (plan.features.teamReady) items.push("Preparado para equipos (próximamente)");
  return items;
}

export function PricingGrid({ plans, paymentsEnabled, currentPlan }: { plans: PublicPlan[]; paymentsEnabled: boolean; currentPlan?: string }) {
  if (plans.length === 0) {
    return <p className="rounded-card border border-line bg-surface px-6 py-10 text-center text-sm text-muted">Los planes no están disponibles en este momento. Vuelve a intentarlo en unos minutos.</p>;
  }
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      {plans.map((plan) => {
        const featured = plan.code === "pro";
        const paid = plan.price > 0;
        return (
          <article
            key={plan.id}
            className={cn("relative flex flex-col rounded-2xl border bg-surface p-6 shadow-card", featured ? "border-ink shadow-raised" : "border-line")}
          >
            <div className="flex items-center justify-between">
              <h3 className="font-display text-xl font-semibold">{plan.name}</h3>
              {currentPlan === plan.code ? <Badge tone="success">Tu plan</Badge> : featured ? <Badge tone="brand">Incluye masivo</Badge> : null}
            </div>
            <p className="mt-2 min-h-10 text-[13px] leading-relaxed text-muted">{TAGLINES[plan.code] ?? ""}</p>
            <p className="mt-5 flex items-baseline gap-1.5">
              <span className="font-display text-4xl font-bold tracking-tight">{formatPrice(plan.price, plan.currency)}</span>
              <span className="text-sm text-muted">/mes</span>
            </p>
            <ul className="mt-6 flex-1 space-y-2.5 text-sm">
              {planFeatureList(plan).map((item) => (
                <li key={item} className="flex gap-2.5 leading-snug text-ink-soft">
                  <Check className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />
                  {item}
                </li>
              ))}
            </ul>
            <div className="mt-7">
              {!paid ? (
                <ButtonLink href="/registro" variant={featured ? "primary" : "secondary"} className="w-full">
                  Empezar gratis
                </ButtonLink>
              ) : paymentsEnabled ? (
                <ButtonLink href="/app/cuenta#plan" variant={featured ? "primary" : "secondary"} className="w-full">
                  Elegir {plan.name}
                </ButtonLink>
              ) : (
                <p className="rounded-[10px] border border-dashed border-line-strong px-3 py-2.5 text-center text-[13px] text-muted">Contratación disponible próximamente</p>
              )}
            </div>
          </article>
        );
      })}
    </div>
  );
}

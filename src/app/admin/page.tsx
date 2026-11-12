import Link from "next/link";
import { BarList } from "@/components/app/charts";
import { Card, CardHeader, Notice, PageHeader } from "@/components/ui/primitives";
import { generationProviderInfo } from "@/domain/generation/registry";
import { paymentsEnabled } from "@/lib/config/env";
import { formatNumber } from "@/lib/utils";
import { getAdminOverview } from "@/server/services/admin";

export default async function AdminOverviewPage() {
  const overview = await getAdminOverview();
  const provider = generationProviderInfo();
  const figures: [string, number, string, string][] = [
    ["Usuarios", overview.users, `${formatNumber(overview.newUsers)} nuevos este mes`, "/admin/usuarios"],
    ["Espacios de trabajo", overview.workspaces, "Uno por cuenta", "/admin/espacios"],
    ["Productos", overview.products, "En todos los espacios", "/admin/catalogo"],
    ["Anuncios", overview.listings, `${formatNumber(overview.listingsMonth)} este mes`, "/admin/catalogo?tipo=anuncios"],
    ["Generaciones del mes", overview.generationsMonth, "Consumo neto (UTC)", "/admin/consumo"],
    ["Trabajos en curso", overview.jobsActive, "Pendientes o procesando", "/admin/trabajos"],
    ["Trabajos con fallos", overview.jobsFailed, "Fallidos o parciales", "/admin/trabajos"],
    ["Mensajes sin atender", overview.pendingContact, "Formulario de contacto", "/admin/mensajes"],
  ];
  return (
    <>
      <PageHeader title="Resumen general" description="Estadísticas globales de la plataforma, calculadas en tiempo real." />
      <div className="mb-6 grid gap-3 sm:grid-cols-2">
        <Notice tone={paymentsEnabled() ? "success" : "warning"} title={paymentsEnabled() ? "Pagos activados" : "Pagos desactivados (PAYMENTS_ENABLED=false)"}>
          {paymentsEnabled() ? "Stripe procesa las suscripciones." : "No se crean cobros ni sesiones de pago. Los planes se pueden asignar manualmente desde «Espacios»."}
        </Notice>
        <Notice tone="info" title={`Motor de generación: ${provider.label}`}>
          {provider.method === "ai" ? "Se está utilizando un proveedor de IA externo." : "Modo de plantillas y reglas, sin proveedor de IA."}
        </Notice>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {figures.map(([label, value, hint, href]) => (
          <Link key={label} href={href} className="rounded-card border border-line bg-surface p-5 shadow-card hover:border-line-strong">
            <p className="text-[13px] font-medium text-muted">{label}</p>
            <p className="mt-2 font-display text-3xl font-semibold tabular-nums">{formatNumber(value)}</p>
            <p className="mt-1 text-xs text-muted">{hint}</p>
          </Link>
        ))}
      </div>
      <Card className="mt-6 max-w-xl">
        <CardHeader title="Espacios por plan" />
        <div className="p-5">
          <BarList items={overview.workspacesByPlan.map((row) => ({ label: row.plan, total: row.total }))} emptyLabel="Sin datos." />
        </div>
      </Card>
    </>
  );
}

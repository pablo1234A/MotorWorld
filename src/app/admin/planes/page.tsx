import type { Metadata } from "next";
import { PlanEditor } from "@/components/admin/actions";
import { Badge, Card, CardHeader, Notice, PageHeader } from "@/components/ui/primitives";
import { parsePlanFeatures } from "@/domain/plans";
import { adminListPlans } from "@/server/services/admin";

export const metadata: Metadata = { title: "Planes" };

export default async function AdminPlansPage() {
  const plans = await adminListPlans();
  return (
    <>
      <PageHeader title="Planes" description="Los límites se aplican en la base de datos de forma inmediata a todos los espacios con ese plan." />
      <Notice tone="warning" className="mb-5">
        El precio mostrado aquí es informativo (página de precios). El importe que se cobra lo determina el precio configurado en Stripe para cada plan: mantén ambos sincronizados. La página pública de precios puede tardar hasta 5 minutos en reflejar los cambios.
      </Notice>
      <div className="space-y-5">
        {plans.map((plan) => {
          const features = parsePlanFeatures(plan.features);
          return (
            <Card key={plan.id}>
              <CardHeader title={plan.name} description={`Código: ${plan.code}`} action={plan.is_active ? <Badge tone="success">Activo</Badge> : <Badge tone="warning">Inactivo</Badge>} />
              <PlanEditor
                plan={{
                  id: plan.id,
                  code: plan.code,
                  name: plan.name,
                  price: Number(plan.price),
                  monthlyListingLimit: plan.monthly_listing_limit,
                  monthlyBulkLimit: plan.monthly_bulk_limit,
                  maxProducts: features.maxProducts ?? 0,
                  maxTemplates: features.maxTemplates ?? 0,
                  maxBulkRows: features.maxBulkRows,
                  maxImagesPerProduct: features.maxImagesPerProduct,
                  isActive: plan.is_active,
                }}
              />
            </Card>
          );
        })}
      </div>
    </>
  );
}

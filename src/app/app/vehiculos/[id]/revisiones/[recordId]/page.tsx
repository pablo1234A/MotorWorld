import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Alert, Card } from "@/components/ui/feedback";
import { MaintenanceForm } from "@/components/workshop/maintenance-form";
import { formatDate, todayIn } from "@/lib/dates";
import { capabilities } from "@/server/auth/capabilities";
import { requireOrgPage } from "@/server/auth/guards";
import { getRecord } from "@/server/modules/maintenance/service";

export const metadata: Metadata = { title: "Editar revisión · RevisaYa" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function EditRecordPage({ params }: { params: Promise<{ id: string; recordId: string }> }) {
  const ctx = await requireOrgPage("/app/vehiculos");
  const { id, recordId } = await params;
  if (!UUID.test(id) || !UUID.test(recordId)) notFound();
  const record = await getRecord(ctx, recordId);
  if (!record || record.vehicleId !== id) notFound();
  const caps = capabilities(ctx);

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <div>
        <Link href={`/app/vehiculos/${id}`} className="text-sm text-[var(--accent)]">
          ← Volver al vehículo
        </Link>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">Revisión del {formatDate(record.serviceDate)}</h1>
      </div>
      {!caps.maintenanceWrite ? (
        <Alert tone="error">No tienes permiso para editar revisiones.</Alert>
      ) : (
        <Card>
          <MaintenanceForm vehicleId={id} today={todayIn()} values={{ ...record, recordId: record.id }} />
        </Card>
      )}
    </div>
  );
}

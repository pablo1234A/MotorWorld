"use client";
import { useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import { Alert, Card, PageHeader } from "@/components/ui/Display";
import { Button } from "@/components/ui/Button";
import { PageLoader } from "@/components/ui/Spinner";
import { useToast } from "@/components/ui/Toast";
import { BusinessFields, emptyBusiness, fromBusiness, toPayload, type BusinessData } from "@/components/app/BusinessForm";

export default function BusinessPage() {
  const d = useApi<{ business: Record<string, unknown> }>("/api/v1/business");
  const toast = useToast();
  const [v, setV] = useState<BusinessData>(emptyBusiness);
  const [err, setErr] = useState<{ msg?: string; fields?: Record<string, string> }>({});
  const [saving, setSaving] = useState(false);
  useEffect(() => { if (d.data) setV(fromBusiness(d.data.business)); }, [d.data]);
  if (d.loading && !d.data) return <PageLoader />;
  if (d.error) return <Alert tone="bad">{d.error.message}</Alert>;
  return (
    <>
      <PageHeader title="Configuración del negocio" description="Datos que se usan en los correos, el enlace de reseñas y tus preferencias de envío." />
      <Card>
        <form onSubmit={async (e) => {
          e.preventDefault();
          setSaving(true);
          setErr({});
          try { await api("/api/v1/business", { method: "PATCH", body: toPayload(v) }); toast("ok", "Cambios guardados"); await d.reload(); }
          catch (ex) { const x = ex as ApiError; setErr({ msg: x.message, fields: x.fields }); }
          setSaving(false);
        }}>
          {err.msg ? <Alert tone="bad" className="mb-5">{err.msg}</Alert> : null}
          <BusinessFields value={v} onChange={setV} errors={err.fields} />
          <div className="mt-8 flex justify-end border-t border-ink-100 pt-5"><Button type="submit" loading={saving}>Guardar cambios</Button></div>
        </form>
      </Card>
    </>
  );
}

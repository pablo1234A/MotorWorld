"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/Button";
export function ResolveButton({ id }: { id: string }) {
  const r = useRouter();
  const [l, setL] = useState(false);
  return <Button size="sm" variant="secondary" loading={l} onClick={async () => {
        setL(true);
        try {
          await api(`/api/admin/data-requests/${id}/resolve`, { method: "POST", body: {} });
          r.refresh();
        } catch {
          alert("No se pudo marcar como resuelta. Inténtalo de nuevo.");
        } finally {
          setL(false);
        }
      }}>Marcar resuelta</Button>;
}

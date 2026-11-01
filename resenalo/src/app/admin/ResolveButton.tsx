"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/Button";
export function ResolveButton({ id }: { id: string }) {
  const r = useRouter();
  const [l, setL] = useState(false);
  return <Button size="sm" variant="secondary" loading={l} onClick={async () => { setL(true); await api(`/api/admin/data-requests/${id}/resolve`, { method: "POST", body: {} }); r.refresh(); }}>Marcar resuelta</Button>;
}

import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { requireOrgPage } from "@/server/auth/guards";
import { findEquipment } from "@/server/modules/equipment/service";

export const metadata: Metadata = { title: "Equipo · RevisaYa", robots: { index: false, follow: false } };

/**
 * Destino de las etiquetas QR. Exige sesión (si no, pasa por el acceso y
 * vuelve aquí) y la RLS decide si el usuario puede ver el equipo: un token
 * de otra empresa da «no encontrado», sin revelar nada.
 */
export default async function QrPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!/^[a-f0-9]{64}$/.test(token)) notFound();
  const ctx = await requireOrgPage(`/app/equipos/qr/${token}`);
  const found = await findEquipment(ctx, token);
  if (!found) notFound();
  redirect(`/app/equipos/${found.id}`);
}

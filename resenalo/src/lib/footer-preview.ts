/** Pie identificativo del remitente (LSSI-CE). Compartido por servidor y vista previa. */
export function footerPreview(b: { name: string; legalName: string | null; addressLine: string | null; postalCode: string | null; city: string | null }) {
  const addr = [b.addressLine, [b.postalCode, b.city].filter(Boolean).join(" ")].filter(Boolean).join(", ");
  return [`Has recibido este mensaje porque has sido cliente de ${b.name}.`, [b.legalName || b.name, addr].filter(Boolean).join(" · ")];
}

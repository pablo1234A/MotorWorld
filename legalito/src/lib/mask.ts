/** Minimización de datos en administración: se muestran solo los datos imprescindibles. */
export function maskEmail(email: string | null | undefined): string {
  if (!email) return "—";
  const [user, domain] = email.split("@");
  if (!domain) return "***";
  return `${user.slice(0, 2)}${"*".repeat(Math.max(1, Math.min(user.length - 2, 6)))}@${domain}`;
}

export function maskTaxId(id: string | null | undefined): string {
  if (!id) return "—";
  return `${"*".repeat(Math.max(0, id.length - 4))}${id.slice(-4)}`;
}

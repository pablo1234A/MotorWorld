export const fmtDate = (d: string | Date | null | undefined, withTime = false) => {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  return new Intl.DateTimeFormat("es-ES", withTime ? { dateStyle: "medium", timeStyle: "short" } : { dateStyle: "medium" }).format(date);
};
export const fmtNum = (n: number) => new Intl.NumberFormat("es-ES").format(n);
export const relTime = (d: string | Date) => {
  const diff = (new Date(d).getTime() - Date.now()) / 1000;
  const rtf = new Intl.RelativeTimeFormat("es", { numeric: "auto" });
  const abs = Math.abs(diff);
  if (abs < 60) return rtf.format(Math.round(diff), "second");
  if (abs < 3600) return rtf.format(Math.round(diff / 60), "minute");
  if (abs < 86400) return rtf.format(Math.round(diff / 3600), "hour");
  return rtf.format(Math.round(diff / 86400), "day");
};

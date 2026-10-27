export function ago(iso: string | null | undefined): string {
  if (!iso) return '—';
  const s = Math.max(0, (Date.now() - Date.parse(iso)) / 1000);
  if (s < 45) return 'ahora';
  if (s < 3600) return `hace ${Math.round(s / 60)} min`;
  if (s < 86400) return `hace ${Math.round(s / 3600)} h`;
  return `hace ${Math.round(s / 86400)} d`;
}

export function clock(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export function dateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('es-ES', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export function money(n: number | null | undefined, currency = 'EUR'): string {
  if (n == null) return '—';
  return new Intl.NumberFormat('es-ES', { style: 'currency', currency }).format(n);
}

export const WORKFLOW_LABEL: Record<string, string> = {
  strategy: 'Estrategia',
  video_pipeline: 'Video Pipeline',
  store_audit: 'Store Audit',
  analytics_review: 'Analytics',
  daily_report: 'Daily Report',
};

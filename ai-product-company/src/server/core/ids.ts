import { randomBytes } from 'node:crypto';

/** Short, sortable, prefixed IDs: e.g. "tsk_lq9z3k2a8f1c". */
export function newId(prefix: string): string {
  const time = Date.now().toString(36);
  const rand = randomBytes(5).toString('hex');
  return `${prefix}_${time}${rand}`;
}

export const now = () => new Date().toISOString();

/** Local calendar date (YYYY-MM-DD) for daily reports. */
export function localDate(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function addHours(iso: string, hours: number): string {
  return new Date(new Date(iso).getTime() + hours * 3_600_000).toISOString();
}

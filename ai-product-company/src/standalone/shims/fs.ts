import { Buffer } from 'buffer';
import { dirname, normalize } from './path';

/**
 * Virtual file system for the browser edition. Synchronous API (like node:fs)
 * over an in-memory map, mirrored to IndexedDB so media survives reloads.
 */
const files = new Map<string, Uint8Array>();
const dirs = new Set<string>(['/']);
const urls = new Map<string, string>();
let onChange: (path: string, data: Uint8Array | null) => void = () => {};

export function __setPersistence(fn: typeof onChange) {
  onChange = fn;
}
export function __load(entries: [string, Uint8Array][]) {
  for (const [p, d] of entries) {
    files.set(p, d);
    addDirs(dirname(p));
  }
}

const MIME: Record<string, string> = { '.mp4': 'video/mp4', '.webm': 'video/webm', '.mov': 'video/quicktime', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.json': 'application/json' };
export function __objectUrl(p: string): string {
  const n = normalize(p);
  const hit = urls.get(n);
  if (hit) return hit;
  const data = files.get(n);
  if (!data) return '';
  const ext = n.slice(n.lastIndexOf('.')).toLowerCase();
  const url = URL.createObjectURL(new Blob([data as BlobPart], { type: MIME[ext] ?? 'application/octet-stream' }));
  urls.set(n, url);
  return url;
}

function addDirs(d: string) {
  let cur = normalize(d);
  while (cur && !dirs.has(cur)) {
    dirs.add(cur);
    if (cur === '/') break;
    cur = dirname(cur);
  }
}
function enoent(p: string): never {
  const e = new Error(`ENOENT: no such file or directory, '${p}'`) as Error & { code: string };
  e.code = 'ENOENT';
  throw e;
}
function revoke(n: string) {
  const u = urls.get(n);
  if (u) URL.revokeObjectURL(u);
  urls.delete(n);
}

export function existsSync(p: string) {
  const n = normalize(p);
  return files.has(n) || dirs.has(n);
}
export function mkdirSync(p: string) {
  addDirs(p);
}
export function mkdtempSync(prefix: string) {
  const d = `${prefix}${Math.random().toString(36).slice(2, 8)}`;
  addDirs(d);
  return normalize(d);
}
export function writeFileSync(p: string, data: string | Uint8Array) {
  const n = normalize(p);
  const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : new Uint8Array(data);
  files.set(n, bytes);
  addDirs(dirname(n));
  revoke(n);
  onChange(n, bytes);
}
export function readFileSync(p: string, enc?: string): Buffer | string {
  const n = normalize(p);
  const data = files.get(n) ?? enoent(n);
  const buf = Buffer.from(data);
  return enc ? buf.toString(enc as BufferEncoding) : buf;
}
export function statSync(p: string) {
  const n = normalize(p);
  const data = files.get(n);
  if (!data && !dirs.has(n)) enoent(n);
  return { size: data?.length ?? 0, isFile: () => Boolean(data), isDirectory: () => !data };
}
export function rmSync(p: string, _opts?: { recursive?: boolean; force?: boolean }) {
  const n = normalize(p);
  for (const k of [...files.keys()]) {
    if (k === n || k.startsWith(`${n}/`)) {
      files.delete(k);
      revoke(k);
      onChange(k, null);
    }
  }
  for (const d of [...dirs]) if (d === n || d.startsWith(`${n}/`)) dirs.delete(d);
}
export function readdirSync(p: string) {
  const n = normalize(p);
  const out = new Set<string>();
  for (const k of [...files.keys(), ...dirs]) if (k.startsWith(`${n}/`)) out.add(k.slice(n.length + 1).split('/')[0]);
  return [...out];
}
export function createReadStream(): never {
  throw new Error('createReadStream is not available in the browser edition');
}

export default { existsSync, mkdirSync, mkdtempSync, writeFileSync, readFileSync, statSync, rmSync, readdirSync, createReadStream };

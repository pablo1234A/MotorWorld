/** Minimal POSIX path module for the browser edition. */
const normalize = (p: string) => {
  const abs = p.startsWith('/');
  const out: string[] = [];
  for (const seg of p.split('/')) {
    if (!seg || seg === '.') continue;
    if (seg === '..') out.pop();
    else out.push(seg);
  }
  return (abs ? '/' : '') + out.join('/') || (abs ? '/' : '.');
};
export const sep = '/';
export const join = (...parts: string[]) => normalize(parts.filter(Boolean).join('/'));
export const resolve = (...parts: string[]) => {
  let r = '';
  for (const p of parts) r = p.startsWith('/') ? p : `${r}/${p}`;
  return normalize(r.startsWith('/') ? r : `/${r}`);
};
export const dirname = (p: string) => {
  const n = normalize(p);
  const i = n.lastIndexOf('/');
  return i <= 0 ? (n.startsWith('/') ? '/' : '.') : n.slice(0, i);
};
export const basename = (p: string, ext?: string) => {
  const b = normalize(p).split('/').pop() ?? '';
  return ext && b.endsWith(ext) ? b.slice(0, -ext.length) : b;
};
export const extname = (p: string) => {
  const b = basename(p);
  const i = b.lastIndexOf('.');
  return i > 0 ? b.slice(i) : '';
};
export { normalize };
export default { sep, join, resolve, dirname, basename, extname, normalize };

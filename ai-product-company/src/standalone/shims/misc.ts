/** Stubs for Node modules the browser edition never uses at runtime (kept importable). */
const unavailable = (what: string) => () => {
  throw new Error(`${what} is not available in the browser edition`);
};
export const execFileSync = unavailable('child_process');
export const spawn = unavailable('child_process');
export const lookup = async () => {
  throw new Error('DNS is not available in the browser');
};
export const isIP = (s: string) => (/^\d+\.\d+\.\d+\.\d+$/.test(s) ? 4 : s.includes(':') ? 6 : 0);
export const isIPv6 = (s: string) => isIP(s) === 6;
export const tmpdir = () => '/tmp';
export function promisify<T>(fn: (...args: unknown[]) => void) {
  return (...args: unknown[]) => new Promise<T>((resolve, reject) => fn(...args, (err: Error | null, value: T) => (err ? reject(err) : resolve(value))));
}
export default { execFileSync, spawn, lookup, isIP, isIPv6, tmpdir, promisify };

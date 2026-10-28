import { existsSync, readFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath as toPath } from 'node:url';

const HERE = path.dirname(toPath(import.meta.url));

export default async function globalTeardown() {
  const pidFile = path.join(HERE, '.output', 'api.pid');
  if (!existsSync(pidFile)) return;
  const pid = Number(readFileSync(pidFile, 'utf8'));
  try {
    // Grupo de procesos completo (npx → tsx → node).
    process.kill(-pid, 'SIGTERM');
  } catch {
    // ya terminado
  }
  rmSync(pidFile, { force: true });
}

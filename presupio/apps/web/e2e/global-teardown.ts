import { existsSync, readFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath as toPath } from 'node:url';

const HERE = path.dirname(toPath(import.meta.url));

export default async function globalTeardown() {
  // API real y simulador local del proveedor de email.
  for (const name of ['api.pid', 'sink.pid']) {
    const pidFile = path.join(HERE, '.output', name);
    if (!existsSync(pidFile)) continue;
    const pid = Number(readFileSync(pidFile, 'utf8'));
    try {
      // Grupo de procesos completo (npx → tsx → node).
      process.kill(-pid, 'SIGTERM');
    } catch {
      // ya terminado
    }
    rmSync(pidFile, { force: true });
  }
}

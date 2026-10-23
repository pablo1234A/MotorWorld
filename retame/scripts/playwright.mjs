/* Localiza Playwright: dependencia local si existe; si no, la global.
 * Solo lo necesitan `npm run og` (imágenes) y `npm run test:e2e`. */
import { createRequire } from "node:module";
import { execSync } from "node:child_process";
import fs from "node:fs";

export async function getChromium() {
  const require = createRequire(import.meta.url);
  let mod;
  try { mod = require("playwright"); }
  catch {
    const root = execSync("npm root -g").toString().trim();
    mod = require(root + "/playwright");
  }
  const opts = {};
  if (fs.existsSync("/opt/pw-browsers/chromium")) {
    /* Entornos con Chromium preinstalado fuera de la caché de Playwright. */
    try { await mod.chromium.launch().then((b) => b.close()); }
    catch { opts.executablePath = "/opt/pw-browsers/chromium"; }
  }
  return { chromium: mod.chromium, launchOpts: opts };
}

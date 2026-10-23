/* Carga los scripts del navegador (config, iconos, contenido, motor y
 * plantillas) en un contexto aislado de Node para generar el sitio y
 * ejecutar los tests con exactamente el mismo código que usa la web. */
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const SHARED = ["config.js", "icons.js", "content.js", "engine.js", "ui.js"];

export function loadEngine(overrides = {}) {
  const ctx = { console, Intl, Date, Math, JSON };
  vm.createContext(ctx);
  for (const f of SHARED) {
    const file = path.join(ROOT, "src", f);
    if (!fs.existsSync(file)) continue;
    vm.runInContext(fs.readFileSync(file, "utf8"), ctx, { filename: f });
  }
  Object.assign(ctx.CONFIG, overrides);
  return ctx;
}

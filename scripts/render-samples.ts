// Dev utility: generates sample sites from briefs and writes static HTML for visual QA.
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { autofix } from "../src/engine/autofix";
import { generateSite } from "../src/engine/generate";
import { renderPage } from "../src/render";

const out = process.argv[2] ?? "export-out/samples";
const briefs: Array<[string, string]> = [
  ["restaurante", "Restaurante de cocina de temporada llamado \"Casa Lumbre\" en Valencia, con reservas online y carta"],
  ["saas", "SaaS para automatizar la facturación de pequeñas empresas, con precios y prueba gratis, estilo oscuro"],
  ["concesionario", "Concesionario de coches de ocasión premium en Madrid llamado Motor Vértice con financiación"],
  ["tienda", "Tienda online de cerámica artesanal que vende tazas, cuencos y jarrones, estilo minimal"],
  ["portfolio", "Portfolio de una fotógrafa de arquitectura en Barcelona, estilo editorial"],
  ["3d", "Experiencia 3D inmersiva para el lanzamiento de unos auriculares llamados Halo"],
];
mkdirSync(out, { recursive: true });
for (const [slug, brief] of briefs) {
  const { doc, after, fixed } = autofix(generateSite({ brief }));
  const home = doc.pages[0];
  const { html } = renderPage(doc, home, { mode: "publish", projectId: slug, appUrl: "http://localhost:3000", basePath: "/s/" + slug });
  writeFileSync(join(out, `${slug}.html`), html.replace(/http:\/\/localhost:3000\/vendor\//g, "../../public/vendor/"));
  console.log(slug.padEnd(14), doc.theme.style.padEnd(10), doc.theme.mode, "pages:", doc.pages.map((p) => p.path).join(" "), "| QA", after.score, "| fixes", fixed.length, "| issues", after.issues.filter((i) => i.severity !== "info").map((i) => i.severity[0] + ":" + i.message.slice(0, 70)).slice(0, 4).join(" || "));
}

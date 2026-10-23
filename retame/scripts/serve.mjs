/* Servidor estático mínimo para probar public/ como lo haría un hosting:
 * /ruta/ → /ruta/index.html, /ruta → 301 a /ruta/ y 404.html si no existe.
 *   node scripts/serve.mjs [puerto] */
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { ROOT } from "./load.mjs";

const PUB = process.env.PUBLIC_DIR ? path.resolve(process.env.PUBLIC_DIR) : path.join(ROOT, "public");
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".png": "image/png", ".svg": "image/svg+xml", ".woff2": "font/woff2", ".xml": "application/xml; charset=utf-8", ".txt": "text/plain; charset=utf-8", ".webmanifest": "application/manifest+json" };

export function serve(port = 0) {
  const server = http.createServer((req, res) => {
    let p;
    try { p = decodeURIComponent(new URL(req.url, "http://x").pathname); } catch { p = "/"; }
    let file = path.join(PUB, p);
    if (!file.startsWith(PUB)) { res.writeHead(400); return res.end(); }
    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) {
      if (!p.endsWith("/")) { res.writeHead(301, { Location: p + "/" + (req.url.includes("?") ? req.url.slice(req.url.indexOf("?")) : "") }); return res.end(); }
      file = path.join(file, "index.html");
    }
    if (!fs.existsSync(file)) {
      res.writeHead(404, { "Content-Type": TYPES[".html"] });
      return res.end(fs.readFileSync(path.join(PUB, "404.html")));
    }
    res.writeHead(200, { "Content-Type": TYPES[path.extname(file)] || "application/octet-stream" });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((resolve) => server.listen(port, "127.0.0.1", () => resolve(server)));
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  const s = await serve(+process.argv[2] || 8080);
  console.log("RÉTAME en http://127.0.0.1:" + s.address().port);
}

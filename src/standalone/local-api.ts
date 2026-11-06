/**
 * Drop-in replacement for src/lib/api.ts in the single-file edition. Implements the same routes
 * the builder UI calls, but locally: generation, AI chat (local interpreter), QA, versions,
 * assets and export all run in the browser and persist in IndexedDB.
 * Anything that genuinely needs a server answers with a clear error instead of pretending.
 */
import { zipSync } from "fflate";
import { autofix, sanitizeCustomHtml } from "@/engine/autofix";
import { generateSite } from "@/engine/generate";
import { interpret, type Selection } from "@/engine/intents";
import { applyOperations } from "@/engine/ops";
import { safeParseDocument, type SiteDocument } from "@/engine/schema";
import { slugify, uid } from "@/engine/util";
import { validateDocument } from "@/engine/validate";
import { renderCss, renderPage, robotsTxt, sitemapXml } from "@/render";
import { RUNTIME_JS } from "@/render/runtime";
import { db } from "./db";

export class ApiError extends Error {
  constructor(public status: number, message: string, public details?: unknown) {
    super(message);
  }
}

export { relativeTime } from "@/lib/time";

interface ProjectRecord {
  id: string;
  name: string;
  slug: string;
  kind: string;
  engine: string;
  revision: number;
  doc: SiteDocument;
  createdAt: string;
  updatedAt: string;
}
interface VersionRecord {
  id: string;
  label: string;
  source: string;
  createdAt: string;
  doc: SiteDocument;
}
interface ChatRecord {
  id: string;
  role: "user" | "assistant";
  content: string;
  meta?: Record<string, unknown>;
  createdAt: string;
}
interface AssetRecord {
  id: string;
  url: string;
  filename: string;
  mime: string;
  size: number;
  kind: string;
  createdAt: string;
}

const NO_SERVER = "Esta función necesita el servidor de World Builder AI.";

async function ids(): Promise<string[]> {
  return (await (await db()).get<string[]>("projectIds")) ?? [];
}
async function getProject(id: string): Promise<ProjectRecord> {
  const p = await (await db()).get<ProjectRecord>(`project:${id}`);
  if (!p) throw new ApiError(404, "Proyecto no encontrado.");
  return p;
}
async function putProject(p: ProjectRecord) {
  const d = await db();
  await d.set(`project:${p.id}`, p);
  const list = await ids();
  if (!list.includes(p.id)) await d.set("projectIds", [p.id, ...list]);
}
async function addVersion(id: string, doc: SiteDocument, label: string, source: string) {
  const d = await db();
  const list = (await d.get<VersionRecord[]>(`versions:${id}`)) ?? [];
  list.unshift({ id: uid("ver"), label, source, createdAt: new Date().toISOString(), doc });
  await d.set(`versions:${id}`, list.slice(0, 40));
}
function cleanDoc(input: unknown): SiteDocument {
  const r = safeParseDocument(input);
  if (!r.success) throw new ApiError(400, "El documento no es válido.", r.error.issues.slice(0, 8).map((i) => ({ path: i.path.join("."), message: i.message })));
  for (const p of r.data.pages) for (const s of p.sections) if (s.type === "custom" && s.content.html) s.content.html = sanitizeCustomHtml(s.content.html);
  return r.data;
}
async function uniqueSlug(base: string, except?: string) {
  const root = slugify(base) || "mi-web";
  const taken = new Set<string>();
  for (const id of await ids()) {
    if (id === except) continue;
    const p = await (await db()).get<ProjectRecord>(`project:${id}`);
    if (p) taken.add(p.slug);
  }
  let slug = root;
  for (let i = 2; taken.has(slug); i++) slug = `${root}-${i}`;
  return slug;
}
function summary(p: ProjectRecord) {
  return { id: p.id, name: p.name, slug: p.slug, kind: p.kind, engine: p.engine, updatedAt: p.updatedAt, publishedAt: null, pages: p.doc.pages.length, theme: { style: p.doc.theme.style, mode: p.doc.theme.mode, colors: p.doc.theme.colors, fonts: p.doc.theme.fonts } };
}

export async function createFromDoc(doc: SiteDocument, engine = "local") {
  const now = new Date().toISOString();
  const p: ProjectRecord = { id: uid("prj"), name: doc.settings.siteName, slug: await uniqueSlug(doc.settings.siteName), kind: doc.kind, engine, revision: 1, doc, createdAt: now, updatedAt: now };
  await putProject(p);
  await addVersion(p.id, doc, "Versión generada", "generate");
  return p;
}

// ───────────── Export (runs fully in the browser) ─────────────

const enc = new TextEncoder();

export async function buildZip(p: ProjectRecord): Promise<Uint8Array> {
  const doc = p.doc;
  const files: Record<string, Uint8Array> = {};
  for (const page of doc.pages) {
    const { html } = renderPage(doc, page, { mode: "export", projectId: p.id, appUrl: "", externalAssets: true });
    files[page.path === "/" ? "index.html" : `${page.path.slice(1)}/index.html`] = enc.encode(html);
  }
  files["assets/site.css"] = enc.encode(renderCss(doc));
  files["assets/site.js"] = enc.encode(RUNTIME_JS);
  files["sitemap.xml"] = enc.encode(sitemapXml(doc, "https://tu-dominio.com"));
  files["robots.txt"] = enc.encode(robotsTxt("https://tu-dominio.com"));
  files["project.json"] = enc.encode(JSON.stringify(doc, null, 2));
  files["README.md"] = enc.encode(
    `# ${doc.settings.siteName}\n\nSitio estático generado con World Builder AI (edición de un solo archivo).\n\n## Publicar\n- Netlify: arrastra esta carpeta en https://app.netlify.com/drop\n- Vercel: \`npx vercel deploy\`\n- Cloudflare Pages: \`npx wrangler pages deploy .\`\n\nAntes de publicar, sustituye https://tu-dominio.com en sitemap.xml y robots.txt por tu dominio.\n\n## Formularios\n${doc.settings.formWebhook ? `Los formularios envían a ${doc.settings.formWebhook}.` : "Configura un endpoint (Formspree, Make, n8n o tu servidor de World Builder AI) en Sitio › Webhook de formularios y vuelve a exportar."}\n\nGSAP y Three.js se cargan desde jsDelivr solo en las páginas que los usan.\n`,
  );
  return zipSync(files, { level: 6 });
}

function download(name: string, data: BlobPart, type: string) {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

/** Handles links like /api/projects/:id/export that the UI renders as plain anchors. */
export async function handleApiLink(href: string) {
  const url = new URL(href, "https://local.invalid");
  const m = url.pathname.match(/^\/api\/projects\/([^/]+)\/(export|submissions)$/);
  if (!m) return;
  const p = await getProject(m[1]);
  const name = slugify(p.name) || "sitio";
  if (m[2] === "export") {
    if (url.searchParams.get("format") === "json") download(`${name}.world.json`, JSON.stringify(p.doc, null, 2), "application/json");
    else download(`${name}.zip`, (await buildZip(p)) as BlobPart, "application/zip");
  } else download(`envios-${name}.csv`, "﻿enviado_el,pagina,formulario\n", "text/csv");
}

// ───────────── Uploads ─────────────

async function fileToAsset(file: File): Promise<AssetRecord> {
  const isImage = /^image\/(png|jpeg|webp|avif|gif)$/.test(file.type);
  const isVideo = /^video\/(mp4|webm)$/.test(file.type);
  const isFont = /font\/woff2?|\.woff2?$/.test(file.type || file.name);
  if (!isImage && !isVideo && !isFont) throw new ApiError(415, "Formato no admitido. Usa PNG, JPG, WebP, AVIF, GIF, MP4, WebM o WOFF.");
  if (file.size > 8 * 1024 * 1024) throw new ApiError(413, "El archivo supera 8 MB.");
  let url: string;
  let size = file.size;
  if (isImage && file.type !== "image/gif") {
    // Downscale large photos so projects stay light in browser storage.
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, 1920 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    url = canvas.toDataURL("image/webp", 0.86);
    if (!url.startsWith("data:image/webp")) url = canvas.toDataURL("image/jpeg", 0.86);
    size = Math.round((url.length * 3) / 4);
  } else {
    url = await new Promise<string>((res, rej) => {
      const r = new FileReader();
      r.onload = () => res(String(r.result));
      r.onerror = () => rej(r.error);
      r.readAsDataURL(file);
    });
  }
  return { id: uid("ast"), url, filename: file.name, mime: file.type, size, kind: isImage ? "image" : isVideo ? "video" : "font", createdAt: new Date().toISOString() };
}

// ───────────── Router ─────────────

type Init = RequestInit & { json?: unknown };

export async function api<T = unknown>(path: string, init?: Init): Promise<T> {
  return (await route(path, init ?? {})) as T;
}

async function route(path: string, init: Init): Promise<unknown> {
  const method = (init.method ?? "GET").toUpperCase();
  const body = init.json as Record<string, unknown> | undefined;
  const url = new URL(path, "https://local.invalid");
  const p = url.pathname;
  const d = await db();
  let m: RegExpMatchArray | null;

  if (p === "/api/auth/logout") return { ok: true };

  if (p === "/api/projects") {
    if (method === "GET") {
      const list: ProjectRecord[] = [];
      for (const id of await ids()) {
        const rec = await d.get<ProjectRecord>(`project:${id}`);
        if (rec) list.push(rec);
      }
      list.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
      return { projects: list.map(summary) };
    }
    const brief = String(body?.brief ?? "").trim();
    if (brief.length < 12) throw new ApiError(400, "Describe tu web con un poco más de detalle (mínimo 12 caracteres).");
    const r = autofix(generateSite({ brief, kind: body?.kind as never, style: body?.style as never, mode: body?.mode as never, name: (body?.name as string) || undefined, pages: body?.pages as string[] | undefined, seed: body?.seed as number | undefined }));
    const rec = await createFromDoc(r.doc);
    return { project: { id: rec.id, slug: rec.slug }, engine: "local", fixes: r.fixed, qa: { score: r.after.score, issues: r.after.issues.length } };
  }

  if ((m = p.match(/^\/api\/projects\/([^/]+)$/))) {
    const rec = await getProject(m[1]);
    if (method === "GET") return { project: { id: rec.id, name: rec.name, slug: rec.slug, revision: rec.revision, engine: rec.engine, doc: rec.doc, updatedAt: rec.updatedAt, publishedAt: null } };
    if (method === "PUT") {
      if (body?.baseRevision !== undefined && body.baseRevision !== rec.revision) throw new ApiError(409, "El proyecto ha cambiado en otra pestaña. Recarga para ver la última versión.");
      const doc = cleanDoc(body?.doc);
      const next = { ...rec, doc, name: doc.settings.siteName, kind: doc.kind, revision: rec.revision + 1, updatedAt: new Date().toISOString() };
      await putProject(next);
      const v = body?.version as { label: string; source: string } | undefined;
      if (v) await addVersion(rec.id, doc, v.label, v.source);
      return { revision: next.revision, savedAt: next.updatedAt };
    }
    if (method === "PATCH") {
      const slug = slugify(String(body?.slug ?? ""));
      if (slug.length < 3) throw new ApiError(400, "La dirección debe tener al menos 3 caracteres.");
      await putProject({ ...rec, slug: await uniqueSlug(slug, rec.id) });
      return { slug };
    }
    if (method === "DELETE") {
      await d.del(`project:${rec.id}`);
      await d.del(`versions:${rec.id}`);
      await d.del(`chat:${rec.id}`);
      await d.set("projectIds", (await ids()).filter((x) => x !== rec.id));
      return { ok: true };
    }
  }

  if ((m = p.match(/^\/api\/projects\/([^/]+)\/versions$/))) {
    await getProject(m[1]);
    const list = (await d.get<VersionRecord[]>(`versions:${m[1]}`)) ?? [];
    return { versions: list.map(({ doc: _doc, ...v }) => v) };
  }

  if ((m = p.match(/^\/api\/projects\/([^/]+)\/versions\/([^/]+)$/))) {
    const rec = await getProject(m[1]);
    const v = ((await d.get<VersionRecord[]>(`versions:${m[1]}`)) ?? []).find((x) => x.id === m![2]);
    if (!v) throw new ApiError(404, "Versión no encontrada.");
    if (method === "GET") return { version: v };
    await addVersion(rec.id, rec.doc, "Antes de restaurar", "auto");
    const next = { ...rec, doc: v.doc, revision: rec.revision + 1, updatedAt: new Date().toISOString() };
    await putProject(next);
    await addVersion(rec.id, v.doc, `Restaurado: ${v.label}`, "restore");
    return { revision: next.revision, doc: v.doc };
  }

  if ((m = p.match(/^\/api\/projects\/([^/]+)\/ai$/))) {
    await getProject(m[1]);
    const key = `chat:${m[1]}`;
    const history = (await d.get<ChatRecord[]>(key)) ?? [];
    if (method === "GET") return { messages: history, engine: "local", model: null };
    if (method === "DELETE") {
      await d.del(key);
      return { ok: true };
    }
    const doc = cleanDoc(body?.doc);
    const instruction = String(body?.instruction ?? "").trim().slice(0, 2000);
    const r = interpret(doc, instruction, body?.selection as Selection);
    const applied = applyOperations(doc, r.ops);
    const fixed = applied.applied.length ? autofix(applied.doc) : null;
    let reply = r.notes.join(" ") || (applied.applied.length ? `Hecho: ${applied.applied.join(", ").toLowerCase()}.` : "No he aplicado cambios.");
    if (applied.errors.length) reply += ` (No se pudo aplicar: ${applied.errors.slice(0, 2).join("; ")})`;
    const now = new Date().toISOString();
    await d.set(key, [...history, { id: uid("msg"), role: "user", content: instruction, createdAt: now }, { id: uid("msg"), role: "assistant", content: reply, meta: { engine: "local", applied: applied.applied, fixes: fixed?.fixed ?? [] }, createdAt: now }].slice(-200));
    return { reply, engine: "local", model: null, applied: applied.applied, errors: applied.errors, fixes: fixed?.fixed ?? [], doc: fixed ? fixed.doc : applied.doc, changed: applied.applied.length > 0 };
  }

  if ((m = p.match(/^\/api\/projects\/([^/]+)\/publish$/))) {
    const rec = await getProject(m[1]);
    if (method === "GET") return { slug: rec.slug, url: "", publishedAt: null, upToDate: false, qa: validateDocument(rec.doc), deployments: [], vercel: false };
    throw new ApiError(501, `Este archivo funciona sin servidor, así que no puede alojar la web en Internet. Usa el botón «ZIP» y súbelo a Netlify Drop (arrastrar y soltar), Vercel o Cloudflare Pages. ${NO_SERVER}`);
  }

  if ((m = p.match(/^\/api\/projects\/([^/]+)\/submissions$/))) return method === "GET" ? { submissions: [] } : { ok: true };
  if ((m = p.match(/^\/api\/projects\/([^/]+)\/deploy$/))) throw new ApiError(501, `Desplegar en Vercel requiere el servidor con VERCEL_TOKEN. Descarga el ZIP y súbelo con \`npx vercel deploy\`.`);

  if (p === "/api/uploads") {
    const file = (init.body as FormData | undefined)?.get("file");
    if (!(file instanceof File)) throw new ApiError(400, "Falta el archivo.");
    const asset = await fileToAsset(file);
    await d.set("assets", [asset, ...((await d.get<AssetRecord[]>("assets")) ?? [])]);
    return { asset };
  }
  if (p === "/api/assets") return { assets: (await d.get<AssetRecord[]>("assets")) ?? [] };
  if ((m = p.match(/^\/api\/assets\/([^/]+)$/))) {
    await d.set("assets", ((await d.get<AssetRecord[]>("assets")) ?? []).filter((a) => a.id !== m![1]));
    return { ok: true };
  }
  if (p === "/api/images/search") {
    if (method === "POST") return { ok: true };
    throw new ApiError(412, "La búsqueda en Unsplash/Pexels necesita el servidor con su clave de API (no puede ir dentro de un archivo público). Aquí puedes subir tus imágenes, pegar una URL o usar arte generativo.");
  }
  throw new ApiError(404, `Ruta no disponible sin servidor: ${p}`);
}

// ───────────── Backup ─────────────

export async function exportBackup() {
  const d = await db();
  const out: Record<string, unknown> = {};
  for (const k of await d.keys()) out[k] = await d.get(k);
  download(`world-builder-ai-copia-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify({ format: "world-builder-ai-backup", version: 1, data: out }), "application/json");
}

export async function importFile(file: File): Promise<{ kind: "backup"; projects: number } | { kind: "project"; id: string }> {
  const json = JSON.parse(await file.text());
  const d = await db();
  if (json?.format === "world-builder-ai-backup") {
    for (const [k, v] of Object.entries(json.data as Record<string, unknown>)) await d.set(k, v);
    return { kind: "backup", projects: ((json.data.projectIds as string[]) ?? []).length };
  }
  const doc = cleanDoc(json);
  const rec = await createFromDoc(autofix(doc).doc, "import");
  return { kind: "project", id: rec.id };
}

export async function storageInfo() {
  const d = await db();
  const est = navigator.storage?.estimate ? await navigator.storage.estimate() : null;
  return { backend: d.kind, usage: est?.usage ?? null, quota: est?.quota ?? null, projects: (await ids()).length };
}

export async function clearAll() {
  const d = await db();
  for (const k of await d.keys()) await d.del(k);
}

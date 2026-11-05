import "server-only";
import { mkdir, readFile, writeFile, unlink } from "node:fs/promises";
import { join, resolve } from "node:path";
import { and, desc, eq } from "drizzle-orm";
import { getDb, schema } from "./db";
import { HttpError } from "./http";
import { newId } from "./ids";

/**
 * File storage. Local disk by default (UPLOAD_DIR). The interface is small on purpose so an
 * S3/R2/UploadThing driver can replace it without touching callers.
 */
const ROOT = resolve(process.env.UPLOAD_DIR || join(process.cwd(), ".data", "uploads"));
const MAX_BYTES = Number(process.env.MAX_UPLOAD_MB || 8) * 1024 * 1024;

/** Allowed types, verified by magic bytes, not by the client-provided MIME. */
const SIGNATURES: Array<{ mime: string; ext: string; kind: "image" | "video" | "font"; test: (b: Buffer) => boolean }> = [
  { mime: "image/png", ext: "png", kind: "image", test: (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  { mime: "image/jpeg", ext: "jpg", kind: "image", test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { mime: "image/gif", ext: "gif", kind: "image", test: (b) => b.subarray(0, 4).toString("ascii") === "GIF8" },
  { mime: "image/webp", ext: "webp", kind: "image", test: (b) => b.subarray(0, 4).toString("ascii") === "RIFF" && b.subarray(8, 12).toString("ascii") === "WEBP" },
  { mime: "image/avif", ext: "avif", kind: "image", test: (b) => b.subarray(4, 12).toString("ascii") === "ftypavif" },
  { mime: "video/mp4", ext: "mp4", kind: "video", test: (b) => b.subarray(4, 8).toString("ascii") === "ftyp" && b.subarray(8, 12).toString("ascii") !== "avif" },
  { mime: "video/webm", ext: "webm", kind: "video", test: (b) => b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3 },
  { mime: "font/woff2", ext: "woff2", kind: "font", test: (b) => b.subarray(0, 4).toString("ascii") === "wOF2" },
  { mime: "font/woff", ext: "woff", kind: "font", test: (b) => b.subarray(0, 4).toString("ascii") === "wOFF" },
];

export function sniff(buf: Buffer) {
  return SIGNATURES.find((s) => s.test(buf)) ?? null;
}

export async function saveUpload(userId: string, projectId: string | null, file: File) {
  if (file.size > MAX_BYTES) throw new HttpError(413, `El archivo supera el máximo de ${MAX_BYTES / 1024 / 1024} MB.`);
  const buf = Buffer.from(await file.arrayBuffer());
  const type = sniff(buf);
  if (!type) throw new HttpError(415, "Formato no admitido. Usa PNG, JPG, WebP, AVIF, GIF, MP4, WebM o fuentes WOFF/WOFF2.");
  const id = newId("ast");
  const key = `${id}.${type.ext}`;
  await mkdir(ROOT, { recursive: true });
  await writeFile(join(ROOT, key), buf);
  const db = await getDb();
  const filename = file.name.replace(/[^\p{L}\p{N}._ -]+/gu, "_").slice(0, 120) || key;
  await db.insert(schema.assets).values({ id, userId, projectId, filename, mime: type.mime, size: buf.length, storageKey: key, kind: type.kind });
  return { id, url: `/api/files/${key}`, filename, mime: type.mime, size: buf.length, kind: type.kind };
}

export async function readStored(key: string): Promise<{ data: Buffer; mime: string } | null> {
  if (!/^ast_[A-Za-z0-9]+\.[a-z0-9]+$/.test(key)) return null;
  const db = await getDb();
  const rows = await db.select({ mime: schema.assets.mime }).from(schema.assets).where(eq(schema.assets.storageKey, key)).limit(1);
  if (!rows[0]) return null;
  try {
    return { data: await readFile(join(ROOT, key)), mime: rows[0].mime };
  } catch {
    return null;
  }
}

export async function listAssets(userId: string) {
  const db = await getDb();
  const rows = await db.select().from(schema.assets).where(eq(schema.assets.userId, userId)).orderBy(desc(schema.assets.createdAt)).limit(500);
  return rows.map((r) => ({ id: r.id, url: `/api/files/${r.storageKey}`, filename: r.filename, mime: r.mime, size: r.size, kind: r.kind, createdAt: r.createdAt, projectId: r.projectId }));
}

export async function deleteAsset(userId: string, id: string) {
  const db = await getDb();
  const rows = await db.select().from(schema.assets).where(and(eq(schema.assets.id, id), eq(schema.assets.userId, userId))).limit(1);
  if (!rows[0]) throw new HttpError(404, "Archivo no encontrado.");
  await db.delete(schema.assets).where(eq(schema.assets.id, id));
  await unlink(join(ROOT, rows[0].storageKey)).catch(() => undefined);
}

/** Resolves "/api/files/<key>" references inside a document to their bytes (for ZIP export). */
export async function collectDocumentFiles(doc: unknown): Promise<Map<string, { data: Buffer; mime: string; key: string }>> {
  const found = new Map<string, { data: Buffer; mime: string; key: string }>();
  const text = JSON.stringify(doc);
  for (const m of text.matchAll(/\/api\/files\/(ast_[A-Za-z0-9]+\.[a-z0-9]+)/g)) {
    const key = m[1];
    if (found.has(`/api/files/${key}`)) continue;
    const f = await readStored(key);
    if (f) found.set(`/api/files/${key}`, { ...f, key });
  }
  return found;
}

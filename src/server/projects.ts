import "server-only";
import { and, desc, eq, sql } from "drizzle-orm";
import { safeParseDocument, type SiteDocument } from "@/engine/schema";
import { sanitizeCustomHtml } from "@/engine/autofix";
import { slugify } from "@/engine/util";
import { getDb, schema } from "./db";
import { HttpError } from "./http";
import { newId } from "./ids";

export type ProjectRow = typeof schema.projects.$inferSelect;

const MAX_VERSIONS = 60;

export async function uniqueSlug(base: string): Promise<string> {
  const db = await getDb();
  const root = slugify(base) || "mi-web";
  for (let i = 0; i < 50; i++) {
    const candidate = i === 0 ? root : `${root}-${i + 1}`;
    const taken = await db.select({ id: schema.projects.id }).from(schema.projects).where(eq(schema.projects.slug, candidate)).limit(1);
    if (!taken.length) return candidate;
  }
  return `${root}-${Date.now().toString(36)}`;
}

/** Sanitizes user-controlled HTML on every write so stored documents are always safe. */
function sanitizeDoc(doc: SiteDocument): SiteDocument {
  for (const p of doc.pages) for (const s of p.sections) if (s.type === "custom" && s.content.html) s.content.html = sanitizeCustomHtml(s.content.html);
  return doc;
}

export function validateDocOrThrow(input: unknown): SiteDocument {
  const r = safeParseDocument(input);
  if (!r.success) throw new HttpError(400, "El documento no es válido.", r.error.issues.slice(0, 8).map((i) => ({ path: i.path.join("."), message: i.message })));
  return sanitizeDoc(r.data);
}

export async function createProject(userId: string, doc: SiteDocument, engine: string): Promise<ProjectRow> {
  const db = await getDb();
  const id = newId("prj");
  const slug = await uniqueSlug(doc.settings.siteName);
  const row = { id, userId, name: doc.settings.siteName, slug, kind: doc.kind, doc: sanitizeDoc(doc), engine };
  await db.insert(schema.projects).values(row);
  await addVersion(id, doc, "Versión generada", "generate");
  return (await getProjectRow(id))!;
}

export async function getProjectRow(id: string) {
  const db = await getDb();
  const rows = await db.select().from(schema.projects).where(eq(schema.projects.id, id)).limit(1);
  return rows[0] ?? null;
}

export async function getOwnedProject(userId: string, id: string): Promise<ProjectRow> {
  const p = await getProjectRow(id);
  if (!p || p.userId !== userId) throw new HttpError(404, "Proyecto no encontrado.");
  return p;
}

export async function listProjects(userId: string) {
  const db = await getDb();
  return db
    .select({ id: schema.projects.id, name: schema.projects.name, slug: schema.projects.slug, kind: schema.projects.kind, updatedAt: schema.projects.updatedAt, publishedAt: schema.projects.publishedAt, engine: schema.projects.engine, doc: schema.projects.doc })
    .from(schema.projects)
    .where(eq(schema.projects.userId, userId))
    .orderBy(desc(schema.projects.updatedAt));
}

/** Saves with optimistic concurrency: a stale `baseRevision` is rejected instead of overwriting newer work. */
export async function saveProject(userId: string, id: string, doc: SiteDocument, baseRevision: number | undefined, version?: { label: string; source: string }) {
  const db = await getDb();
  const p = await getOwnedProject(userId, id);
  if (baseRevision !== undefined && baseRevision !== p.revision) throw new HttpError(409, "El proyecto ha cambiado en otra pestaña. Recarga para ver la última versión.", { revision: p.revision });
  const clean = sanitizeDoc(doc);
  const updated = await db
    .update(schema.projects)
    .set({ doc: clean, name: clean.settings.siteName, kind: clean.kind, revision: sql`${schema.projects.revision} + 1`, updatedAt: new Date() })
    .where(and(eq(schema.projects.id, id), eq(schema.projects.revision, p.revision)))
    .returning({ revision: schema.projects.revision });
  if (!updated.length) throw new HttpError(409, "Conflicto de guardado. Recarga el proyecto.");
  if (version) await addVersion(id, clean, version.label, version.source);
  return updated[0].revision;
}

export async function addVersion(projectId: string, doc: SiteDocument, label: string, source: string) {
  const db = await getDb();
  await db.insert(schema.projectVersions).values({ id: newId("ver"), projectId, doc, label: label.slice(0, 120), source });
  // Keep history bounded: drop the oldest automatic versions beyond the limit.
  const all = await db.select({ id: schema.projectVersions.id, source: schema.projectVersions.source }).from(schema.projectVersions).where(eq(schema.projectVersions.projectId, projectId)).orderBy(desc(schema.projectVersions.createdAt));
  const extra = all.slice(MAX_VERSIONS).filter((v) => v.source !== "publish");
  for (const v of extra) await db.delete(schema.projectVersions).where(eq(schema.projectVersions.id, v.id));
}

export async function listVersions(projectId: string) {
  const db = await getDb();
  return db
    .select({ id: schema.projectVersions.id, label: schema.projectVersions.label, source: schema.projectVersions.source, createdAt: schema.projectVersions.createdAt })
    .from(schema.projectVersions)
    .where(eq(schema.projectVersions.projectId, projectId))
    .orderBy(desc(schema.projectVersions.createdAt))
    .limit(MAX_VERSIONS);
}

export async function getVersion(projectId: string, versionId: string) {
  const db = await getDb();
  const rows = await db.select().from(schema.projectVersions).where(and(eq(schema.projectVersions.id, versionId), eq(schema.projectVersions.projectId, projectId))).limit(1);
  if (!rows[0]) throw new HttpError(404, "Versión no encontrada.");
  return rows[0];
}

export async function deleteProject(userId: string, id: string) {
  const db = await getDb();
  await getOwnedProject(userId, id);
  await db.delete(schema.projects).where(eq(schema.projects.id, id));
}

export async function publishProject(userId: string, id: string) {
  const db = await getDb();
  const p = await getOwnedProject(userId, id);
  const now = new Date();
  await db
    .insert(schema.publications)
    .values({ projectId: id, slug: p.slug, doc: p.doc, publishedAt: now })
    .onConflictDoUpdate({ target: schema.publications.projectId, set: { doc: p.doc, slug: p.slug, publishedAt: now } });
  await db.update(schema.projects).set({ publishedAt: now }).where(eq(schema.projects.id, id));
  await addVersion(id, p.doc, `Publicado ${now.toLocaleString("es-ES")}`, "publish");
  await db.insert(schema.deployments).values({ id: newId("dep"), projectId: id, provider: "hosted", status: "ready", url: `/s/${p.slug}` });
  return { slug: p.slug, publishedAt: now };
}

export async function unpublishProject(userId: string, id: string) {
  const db = await getDb();
  await getOwnedProject(userId, id);
  await db.delete(schema.publications).where(eq(schema.publications.projectId, id));
  await db.update(schema.projects).set({ publishedAt: null }).where(eq(schema.projects.id, id));
}

export async function getPublicationBySlug(slug: string) {
  const db = await getDb();
  const rows = await db.select().from(schema.publications).where(eq(schema.publications.slug, slug)).limit(1);
  return rows[0] ?? null;
}

export async function getPublication(projectId: string) {
  const db = await getDb();
  const rows = await db.select().from(schema.publications).where(eq(schema.publications.projectId, projectId)).limit(1);
  return rows[0] ?? null;
}

export async function changeSlug(userId: string, id: string, desired: string) {
  const db = await getDb();
  await getOwnedProject(userId, id);
  const slug = slugify(desired);
  if (slug.length < 3) throw new HttpError(400, "La dirección debe tener al menos 3 caracteres (a-z, 0-9, guiones).");
  const taken = await db.select({ id: schema.projects.id }).from(schema.projects).where(eq(schema.projects.slug, slug)).limit(1);
  if (taken.length && taken[0].id !== id) throw new HttpError(409, "Esa dirección ya está en uso.");
  await db.update(schema.projects).set({ slug }).where(eq(schema.projects.id, id));
  await db.update(schema.publications).set({ slug }).where(eq(schema.publications.projectId, id));
  return slug;
}

import { and, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "@/server/db";
import { handler, json, parseBody, requireUser } from "@/server/http";
import { getOwnedProject } from "@/server/projects";

type Ctx = { params: Promise<{ id: string }> };

function csvCell(v: unknown) {
  const s = String(v ?? "");
  // Neutralize spreadsheet formula injection.
  const safe = /^[=+\-@]/.test(s) ? `'${s}` : s;
  return `"${safe.replace(/"/g, '""')}"`;
}

export const GET = handler(async (req: Request, { params }: Ctx) => {
  const user = await requireUser();
  const { id } = await params;
  await getOwnedProject(user.id, id);
  const db = await getDb();
  const rows = await db.select().from(schema.formSubmissions).where(eq(schema.formSubmissions.projectId, id)).orderBy(desc(schema.formSubmissions.createdAt)).limit(1000);
  if (new URL(req.url).searchParams.get("format") === "csv") {
    const keys = Array.from(new Set(rows.flatMap((r) => Object.keys(r.data))));
    const lines = [["enviado_el", "pagina", "formulario", ...keys].map(csvCell).join(","), ...rows.map((r) => [r.createdAt.toISOString(), r.page, r.formId, ...keys.map((k) => r.data[k])].map(csvCell).join(","))];
    return new Response("﻿" + lines.join("\n"), { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="envios-${id}.csv"` } });
  }
  return json({ submissions: rows });
});

const patch = z.object({ ids: z.array(z.string().max(64)).max(500), read: z.boolean() });

export const PATCH = handler(async (req: Request, { params }: Ctx) => {
  const user = await requireUser(req);
  const { id } = await params;
  await getOwnedProject(user.id, id);
  const body = await parseBody(req, patch);
  const db = await getDb();
  if (body.ids.length) await db.update(schema.formSubmissions).set({ read: body.read }).where(and(eq(schema.formSubmissions.projectId, id), inArray(schema.formSubmissions.id, body.ids)));
  return json({ ok: true });
});

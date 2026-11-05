import { asc, eq } from "drizzle-orm";
import { z } from "zod";
import { aiEnabled, AiError, editWithClaude, MODEL } from "@/ai/claude";
import { autofix } from "@/engine/autofix";
import { interpret } from "@/engine/intents";
import { applyOperations } from "@/engine/ops";
import { getDb, schema } from "@/server/db";
import { handler, HttpError, json, parseBody, rateLimit, requireUser } from "@/server/http";
import { newId } from "@/server/ids";
import { getOwnedProject, validateDocOrThrow } from "@/server/projects";

export const maxDuration = 300;
type Ctx = { params: Promise<{ id: string }> };

const body = z.object({
  instruction: z.string().trim().min(2).max(2000),
  doc: z.unknown(),
  selection: z.object({ pageId: z.string().max(64), sectionId: z.string().max(64).optional() }),
});

export const GET = handler(async (_req: Request, { params }: Ctx) => {
  const user = await requireUser();
  const { id } = await params;
  await getOwnedProject(user.id, id);
  const db = await getDb();
  const rows = await db.select().from(schema.chatMessages).where(eq(schema.chatMessages.projectId, id)).orderBy(asc(schema.chatMessages.createdAt)).limit(200);
  return json({ messages: rows.map((r) => ({ id: r.id, role: r.role, content: r.content, meta: r.meta, createdAt: r.createdAt })), engine: aiEnabled() ? "claude" : "local", model: aiEnabled() ? MODEL : null });
});

/**
 * Turns a chat instruction into atomic operations. The client sends its current (possibly
 * unsaved) document; the server returns the operations and the resulting document, which the
 * editor adds to its undo history. Nothing is persisted here except the conversation.
 */
export const POST = handler(async (req: Request, { params }: Ctx) => {
  const user = await requireUser(req);
  const { id } = await params;
  await getOwnedProject(user.id, id);
  rateLimit(`ai:${user.id}`, 60, 10 * 60_000);
  const input = await parseBody(req, body);
  const doc = validateDocOrThrow(input.doc);
  const db = await getDb();
  const history = await db.select({ role: schema.chatMessages.role, content: schema.chatMessages.content }).from(schema.chatMessages).where(eq(schema.chatMessages.projectId, id)).orderBy(asc(schema.chatMessages.createdAt)).limit(40);

  let reply: string;
  let ops: unknown[];
  let engine: "claude" | "local";
  let usage: { input: number; output: number } | undefined;
  if (aiEnabled()) {
    try {
      const r = await editWithClaude(doc, input.instruction, input.selection, history as Array<{ role: "user" | "assistant"; content: string }>);
      ({ reply, ops, usage } = r);
      engine = "claude";
    } catch (e) {
      if (e instanceof AiError) throw new HttpError(502, e.message);
      throw e;
    }
  } else {
    const r = interpret(doc, input.instruction, input.selection);
    ops = r.ops;
    engine = "local";
    reply = r.notes.join(" ");
  }

  const applied = applyOperations(doc, ops);
  // QA pass after every AI change: fixes broken links/contrast/SEO the edit may have introduced.
  const fixed = applied.applied.length ? autofix(applied.doc) : null;
  const resultDoc = fixed ? fixed.doc : applied.doc;
  if (!reply) reply = applied.applied.length ? `Hecho: ${applied.applied.join(", ").toLowerCase()}.` : "No he aplicado cambios.";
  if (applied.errors.length) reply += ` (No se pudo aplicar: ${applied.errors.slice(0, 2).join("; ")})`;

  await db.insert(schema.chatMessages).values([
    { id: newId("msg"), projectId: id, role: "user", content: input.instruction, meta: { selection: input.selection } },
    { id: newId("msg"), projectId: id, role: "assistant", content: reply, meta: { engine, applied: applied.applied, errors: applied.errors, fixes: fixed?.fixed ?? [], usage } },
  ]);

  return json({ reply, engine, model: engine === "claude" ? MODEL : null, applied: applied.applied, errors: applied.errors, fixes: fixed?.fixed ?? [], doc: resultDoc, changed: applied.applied.length > 0 });
});

export const DELETE = handler(async (req: Request, { params }: Ctx) => {
  const user = await requireUser(req);
  const { id } = await params;
  await getOwnedProject(user.id, id);
  const db = await getDb();
  await db.delete(schema.chatMessages).where(eq(schema.chatMessages.projectId, id));
  return json({ ok: true });
});

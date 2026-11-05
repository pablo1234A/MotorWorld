"use client";
import { useEffect, useRef, useState } from "react";
import { ArrowUp, ChevronDown, MessageSquare, Sparkles, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import type { SiteDocument } from "@/engine/schema";
import { SECTION_LABELS } from "@/engine/variants";
import { api } from "@/lib/api";
import { Button, cn } from "../ui";
import { useEditor, useSelectedSection } from "./store";

interface Msg {
  id: string;
  role: "user" | "assistant";
  content: string;
  meta?: { engine?: string; applied?: string[]; errors?: string[]; fixes?: string[] } | null;
  pending?: boolean;
}

const SECTION_SUGGESTIONS = ["Hazla más premium, con fondo oscuro y animación suave", "Prueba otra variante de diseño", "Cambia el título a \"…\"", "Quita las animaciones de esta sección"];
const GLOBAL_SUGGESTIONS = ["Pasa la web a modo oscuro", "Usa una tipografía más elegante", "Añade una sección de preguntas frecuentes", "Color principal verde oliva"];

export function Chat() {
  const projectId = useEditor((s) => s.projectId);
  const section = useSelectedSection();
  const [messages, setMessages] = useState<Msg[]>([]);
  const [engine, setEngine] = useState<"claude" | "local">("local");
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const list = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    api<{ messages: Msg[]; engine: "claude" | "local" }>(`/api/projects/${projectId}/ai`).then((r) => {
      setMessages(r.messages);
      setEngine(r.engine);
    }, () => undefined);
  }, [projectId]);

  useEffect(() => {
    list.current?.scrollTo({ top: list.current.scrollHeight, behavior: "smooth" });
  }, [messages, open]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        input.current?.focus();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  async function send(instruction: string) {
    const st = useEditor.getState();
    const trimmed = instruction.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    setOpen(true);
    setText("");
    const pendingId = `p${Date.now()}`;
    setMessages((m) => [...m, { id: `u${Date.now()}`, role: "user", content: trimmed }, { id: pendingId, role: "assistant", content: engine === "claude" ? "Pensando con Claude Opus 5.5…" : "Interpretando…", pending: true }]);
    try {
      const r = await api<{ reply: string; engine: string; applied: string[]; errors: string[]; fixes: string[]; doc: SiteDocument; changed: boolean }>(`/api/projects/${projectId}/ai`, {
        method: "POST",
        json: { instruction: trimmed, doc: st.doc, selection: { pageId: st.pageId, sectionId: st.sectionId ?? undefined } },
      });
      // Applied as a single undoable step on top of whatever the user has now.
      if (r.changed) useEditor.getState().commit(r.doc);
      setMessages((m) => m.map((x) => (x.id === pendingId ? { id: pendingId, role: "assistant", content: r.reply, meta: { engine: r.engine, applied: r.applied, errors: r.errors, fixes: r.fixes } } : x)));
      if (r.changed) toast.success("Cambios aplicados", { description: "Ctrl+Z para deshacer", duration: 2500 });
    } catch (e) {
      setMessages((m) => m.map((x) => (x.id === pendingId ? { ...x, pending: false, content: `No se pudo completar: ${(e as Error).message}` } : x)));
    } finally {
      setBusy(false);
    }
  }

  async function clear() {
    if (!confirm("¿Borrar la conversación? Los cambios ya aplicados se mantienen.")) return;
    await api(`/api/projects/${projectId}/ai`, { method: "DELETE" });
    setMessages([]);
  }

  const suggestions = section ? SECTION_SUGGESTIONS : GLOBAL_SUGGESTIONS;

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-4 z-20 flex justify-center px-4">
      <div className="pointer-events-auto w-full max-w-[640px]">
        {open ? (
          <div className="animate-pop mb-2 overflow-hidden rounded-xl border border-line bg-panel/95 shadow-[var(--shadow-pop)] backdrop-blur">
            <div className="flex items-center justify-between border-b border-line px-3 py-2">
              <p className="flex items-center gap-1.5 text-xs font-medium">
                <Sparkles className="size-3.5 text-accent" /> {engine === "claude" ? "Claude Opus 5.5" : "Motor local"}
              </p>
              <div className="flex gap-1">
                {messages.length ? (
                  <Button size="icon-sm" variant="ghost" onClick={clear} aria-label="Borrar conversación">
                    <Trash2 className="size-3.5" />
                  </Button>
                ) : null}
                <Button size="icon-sm" variant="ghost" onClick={() => setOpen(false)} aria-label="Ocultar conversación">
                  <ChevronDown className="size-4" />
                </Button>
              </div>
            </div>
            <div ref={list} className="scroll-thin max-h-[42vh] space-y-3 overflow-y-auto p-3" aria-live="polite">
              {messages.length === 0 ? (
                <p className="py-6 text-center text-[13px] text-muted">
                  Pide cambios en lenguaje natural. {section ? `Actuaré sobre «${SECTION_LABELS[section.type]}».` : "Selecciona una sección para cambios concretos."}
                  {engine === "local" ? <span className="mt-2 block text-[11px] text-faint">Sin ANTHROPIC_API_KEY entiendo instrucciones comunes (colores, tipografía, fondo, añadir o quitar secciones, variantes, textos entre comillas).</span> : null}
                </p>
              ) : null}
              {messages.map((m) => (
                <div key={m.id} className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}>
                  <div className={cn("max-w-[85%] rounded-xl px-3 py-2 text-[13px] leading-relaxed", m.role === "user" ? "bg-accent text-white" : "border border-line bg-elev text-fg", m.pending && "animate-pulse text-muted")}>
                    {m.content}
                    {m.meta?.fixes?.length ? <p className="mt-1.5 text-[11px] text-faint">QA: {m.meta.fixes.length} corrección(es) automática(s)</p> : null}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : null}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            send(text);
          }}
          className="rounded-2xl border border-line bg-panel/95 p-1.5 shadow-[var(--shadow-pop)] backdrop-blur focus-within:border-accent/60"
        >
          <div className="flex items-center gap-1.5 px-1.5 pt-1">
            {section ? (
              <span className="inline-flex h-5 items-center gap-1 rounded-md bg-accent-soft px-1.5 text-[11px] text-[#c4bbff]">
                {SECTION_LABELS[section.type]}
                <button type="button" aria-label="Quitar selección" onClick={() => useEditor.getState().select(null)}>
                  <X className="size-3" />
                </button>
              </span>
            ) : (
              <span className="text-[11px] text-faint">Todo el sitio</span>
            )}
            <button type="button" onClick={() => setOpen((o) => !o)} className="ml-auto flex items-center gap-1 text-[11px] text-faint hover:text-fg" aria-expanded={open}>
              <MessageSquare className="size-3" /> {messages.length ? `${Math.ceil(messages.length / 2)} cambios` : "Historial"}
            </button>
          </div>
          <div className="flex items-end gap-2">
            <textarea
              ref={input}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send(text);
                }
              }}
              rows={1}
              placeholder={section ? "Describe el cambio para esta sección…" : "Pide un cambio: «modo oscuro», «añade testimonios»…  (Ctrl+K)"}
              className="max-h-32 min-h-9 flex-1 resize-none bg-transparent px-2 py-2 text-[13px] text-fg placeholder:text-faint focus:outline-none"
              aria-label="Instrucción para la IA"
              disabled={busy}
            />
            <Button type="submit" variant="primary" size="icon" disabled={!text.trim()} loading={busy} aria-label="Enviar">
              {!busy ? <ArrowUp className="size-4" /> : null}
            </Button>
          </div>
          {!text && !busy ? (
            <div className="flex gap-1.5 overflow-x-auto px-1.5 pb-1 scroll-thin">
              {suggestions.map((s) => (
                <button key={s} type="button" onClick={() => (s.includes("…") ? (setText(s.replace("…", "")), input.current?.focus()) : send(s))} className="press shrink-0 rounded-full border border-line px-2.5 py-1 text-[11px] text-muted hover:text-fg">
                  {s}
                </button>
              ))}
            </div>
          ) : null}
        </form>
      </div>
    </div>
  );
}

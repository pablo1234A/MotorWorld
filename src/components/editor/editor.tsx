"use client";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Check, Cloud, CloudOff, Download, ExternalLink, History, Inbox, Monitor, PanelLeft, PanelRight, Redo2, Rocket, ShieldCheck, Smartphone, Tablet, Undo2, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import type { SiteDocument } from "@/engine/schema";
import { validateDocument } from "@/engine/validate";
import { renderPage } from "@/render";
import { api, ApiError } from "@/lib/api";
import { Button, cn, Kbd, Segmented, Select, Tooltip } from "../ui";
import { Chat } from "./chat";
import { ExportDialog, HistoryDialog, MediaPicker, PublishDialog, QaDialog, SubmissionsDialog } from "./dialogs";
import { LeftPanel } from "./left-panel";
import { Preview } from "./preview";
import { RightPanel } from "./right-panel";
import { useCurrentPage, useEditor, type Device } from "./store";

const AUTOSAVE_MS = 1200;
const VERSION_EVERY_MS = 10 * 60_000;

function useAutosave() {
  const doc = useEditor((s) => s.doc);
  const status = useEditor((s) => s.status);
  const inflight = useRef<Promise<void> | null>(null);

  const saveNow = useCallback(async () => {
    if (inflight.current) await inflight.current;
    const st = useEditor.getState();
    const json = JSON.stringify(st.doc);
    if (json === st.savedJson || st.status === "conflict") return;
    st.setStatus("saving");
    const versioned = Date.now() - st.lastVersionAt > VERSION_EVERY_MS;
    const run = (async () => {
      try {
        const r = await api<{ revision: number }>(`/api/projects/${st.projectId}`, {
          method: "PUT",
          json: { doc: st.doc, baseRevision: st.revision, ...(versioned ? { version: { label: `Autoguardado ${new Date().toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })}`, source: "auto" } } : {}) },
        });
        useEditor.getState().markSaved(r.revision, json, versioned);
      } catch (e) {
        if (e instanceof ApiError && e.status === 409) {
          useEditor.getState().setStatus("conflict");
          toast.error("Este proyecto se ha modificado en otra pestaña", { description: "Recarga para continuar sin perder cambios de la otra sesión.", duration: Infinity, action: { label: "Recargar", onClick: () => location.reload() } });
        } else {
          useEditor.getState().setStatus("error");
          toast.error(`No se pudo guardar: ${(e as Error).message}`);
        }
      }
    })();
    inflight.current = run;
    await run;
    inflight.current = null;
  }, []);

  useEffect(() => {
    const st = useEditor.getState();
    if (st.status === "conflict") return;
    if (JSON.stringify(doc) === st.savedJson) {
      if (st.status === "dirty") st.setStatus("saved");
      return;
    }
    if (st.status !== "saving") st.setStatus("dirty");
    const t = setTimeout(saveNow, AUTOSAVE_MS);
    return () => clearTimeout(t);
  }, [doc, saveNow]);

  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      const st = useEditor.getState();
      if (JSON.stringify(st.doc) !== st.savedJson) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, []);

  return { saveNow, status };
}

function SaveIndicator({ status }: { status: string }) {
  const map = {
    saved: { icon: Check, text: "Guardado", cls: "text-faint" },
    dirty: { icon: Cloud, text: "Cambios sin guardar", cls: "text-faint" },
    saving: { icon: Cloud, text: "Guardando…", cls: "text-muted" },
    error: { icon: CloudOff, text: "Error al guardar", cls: "text-danger" },
    conflict: { icon: AlertTriangle, text: "Conflicto", cls: "text-warn" },
  } as const;
  const m = map[status as keyof typeof map] ?? map.saved;
  return (
    <span className={cn("hidden items-center gap-1.5 text-[11px] md:flex", m.cls)} role="status">
      <m.icon className="size-3.5" /> {m.text}
    </span>
  );
}

function useShortcuts(saveNow: () => Promise<void>) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement;
      const typing = t.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName);
      const mod = e.metaKey || e.ctrlKey;
      const st = useEditor.getState();
      if (mod && e.key.toLowerCase() === "s") {
        e.preventDefault();
        saveNow();
        return;
      }
      if (typing) return;
      if (mod && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) st.redo();
        else st.undo();
      } else if (mod && e.key.toLowerCase() === "y") {
        e.preventDefault();
        st.redo();
      } else if (mod && e.key.toLowerCase() === "d" && st.sectionId) {
        e.preventDefault();
        st.apply([{ op: "duplicate_section", pageId: st.pageId, sectionId: st.sectionId }]);
      } else if ((e.key === "Delete" || e.key === "Backspace") && st.sectionId) {
        e.preventDefault();
        st.apply([{ op: "remove_section", pageId: st.pageId, sectionId: st.sectionId }]);
        st.select(null);
        toast("Sección eliminada", { action: { label: "Deshacer", onClick: () => useEditor.getState().undo() } });
      } else if (e.key === "Escape") st.select(null);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [saveNow]);
}

export function Editor({ project }: { project: { id: string; slug: string; name: string; revision: number; doc: SiteDocument; publishedAt: string | null } }) {
  const initialized = useRef(false);
  if (!initialized.current) {
    useEditor.getState().init({ projectId: project.id, slug: project.slug, doc: project.doc, revision: project.revision });
    initialized.current = true;
  }
  const doc = useEditor((s) => s.doc);
  const pageId = useEditor((s) => s.pageId);
  const device = useEditor((s) => s.device);
  const canUndo = useEditor((s) => s.past.length > 0);
  const canRedo = useEditor((s) => s.future.length > 0);
  const page = useCurrentPage();
  const { saveNow, status } = useAutosave();
  useShortcuts(saveNow);

  const [dialog, setDialog] = useState<null | "qa" | "history" | "publish" | "export" | "forms">(null);
  const [mediaTarget, setMediaTarget] = useState<{ sectionId: string; field: string; itemId?: string } | null>(null);
  const [panels, setPanels] = useState({ left: true, right: true });
  const qaScore = useMemo(() => validateDocument(doc).score, [doc]);
  const onMedia = useCallback((t: { sectionId: string; field: string; itemId?: string }) => setMediaTarget(t), []);

  useEffect(() => {
    if (window.innerWidth < 1100) setPanels({ left: false, right: false });
  }, []);

  function openPreview() {
    const html = renderPage(doc, page, { mode: "publish", projectId: project.id, appUrl: location.origin, basePath: "" }).html;
    const url = URL.createObjectURL(new Blob([html], { type: "text/html" }));
    window.open(url, "_blank", "noopener");
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-bg">
      <header className="flex h-12 shrink-0 items-center gap-2 border-b border-line bg-panel px-2">
        <Tooltip content="Volver a proyectos">
          <Link href="/dashboard" className="press grid size-8 place-items-center rounded-lg text-muted hover:bg-hover hover:text-fg" aria-label="Volver a proyectos">
            <ArrowLeft className="size-4" />
          </Link>
        </Tooltip>
        <Tooltip content={panels.left ? "Ocultar panel izquierdo" : "Mostrar panel izquierdo"}>
          <Button variant="ghost" size="icon" onClick={() => setPanels((p) => ({ ...p, left: !p.left }))} aria-pressed={panels.left} aria-label="Panel izquierdo">
            <PanelLeft className="size-4" />
          </Button>
        </Tooltip>
        <p className="max-w-40 min-w-0 truncate text-[13px] font-medium">{doc.settings.siteName}</p>
        <div className="w-44 shrink-0">
        <Select value={pageId} onChange={(e) => useEditor.getState().setPage(e.target.value)} className="h-7 text-xs" aria-label="Página">
          {doc.pages.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} · {p.path}
            </option>
          ))}
        </Select>
        </div>
        <div className="mx-auto hidden sm:block">
          <Segmented<Device>
            label="Dispositivo"
            value={device}
            onChange={(d) => useEditor.getState().setDevice(d)}
            className="w-[132px]"
            options={[
              { value: "desktop", label: <Monitor className="size-3.5" />, title: "Escritorio" },
              { value: "tablet", label: <Tablet className="size-3.5" />, title: "Tablet" },
              { value: "mobile", label: <Smartphone className="size-3.5" />, title: "Móvil" },
            ]}
          />
        </div>
        <div className="ml-auto flex items-center gap-1 sm:ml-0">
          <SaveIndicator status={status} />
          <Tooltip content={<>Deshacer <Kbd>Ctrl Z</Kbd></>}>
            <Button variant="ghost" size="icon" disabled={!canUndo} onClick={() => useEditor.getState().undo()} aria-label="Deshacer">
              <Undo2 className="size-4" />
            </Button>
          </Tooltip>
          <Tooltip content={<>Rehacer <Kbd>Ctrl ⇧ Z</Kbd></>}>
            <Button variant="ghost" size="icon" disabled={!canRedo} onClick={() => useEditor.getState().redo()} aria-label="Rehacer">
              <Redo2 className="size-4" />
            </Button>
          </Tooltip>
          <span className="mx-1 h-5 w-px bg-line" />
          <Tooltip content="Control de calidad">
            <Button variant="ghost" size="sm" onClick={() => setDialog("qa")} aria-label={`Control de calidad: ${qaScore}`}>
              <ShieldCheck className={cn("size-4", qaScore >= 90 ? "text-ok" : qaScore >= 70 ? "text-warn" : "text-danger")} />
              <span className="tabular-nums">{qaScore}</span>
            </Button>
          </Tooltip>
          <Tooltip content="Historial de versiones">
            <Button variant="ghost" size="icon" onClick={() => setDialog("history")} aria-label="Historial">
              <History className="size-4" />
            </Button>
          </Tooltip>
          <Tooltip content="Formularios recibidos">
            <Button variant="ghost" size="icon" onClick={() => setDialog("forms")} aria-label="Formularios">
              <Inbox className="size-4" />
            </Button>
          </Tooltip>
          <Tooltip content="Exportar código">
            <Button variant="ghost" size="icon" onClick={() => setDialog("export")} aria-label="Exportar">
              <Download className="size-4" />
            </Button>
          </Tooltip>
          <Tooltip content="Vista previa en una pestaña nueva">
            <Button variant="ghost" size="icon" onClick={openPreview} aria-label="Vista previa">
              <ExternalLink className="size-4" />
            </Button>
          </Tooltip>
          <Button variant="primary" size="sm" onClick={() => setDialog("publish")}>
            <Rocket className="size-3.5" /> Publicar
          </Button>
          <Tooltip content={panels.right ? "Ocultar propiedades" : "Mostrar propiedades"}>
            <Button variant="ghost" size="icon" onClick={() => setPanels((p) => ({ ...p, right: !p.right }))} aria-pressed={panels.right} aria-label="Panel derecho">
              <PanelRight className="size-4" />
            </Button>
          </Tooltip>
        </div>
      </header>
      <div className="flex min-h-0 flex-1">
        {panels.left ? (
          <aside className="flex w-64 shrink-0 flex-col border-r border-line bg-panel" aria-label="Estructura">
            <LeftPanel />
          </aside>
        ) : null}
        <main className="relative flex min-w-0 flex-1 flex-col" aria-label="Lienzo">
          <Preview onMedia={onMedia} />
          <Chat />
        </main>
        {panels.right ? (
          <aside className="flex w-[300px] shrink-0 flex-col border-l border-line bg-panel" aria-label="Propiedades">
            <RightPanel onPick={onMedia} />
          </aside>
        ) : null}
      </div>
      <QaDialog open={dialog === "qa"} onOpenChange={(o) => setDialog(o ? "qa" : null)} />
      <HistoryDialog open={dialog === "history"} onOpenChange={(o) => setDialog(o ? "history" : null)} onSaveNow={saveNow} />
      <PublishDialog open={dialog === "publish"} onOpenChange={(o) => setDialog(o ? "publish" : null)} onSaveNow={saveNow} />
      <ExportDialog open={dialog === "export"} onOpenChange={(o) => setDialog(o ? "export" : null)} onSaveNow={saveNow} />
      <SubmissionsDialog open={dialog === "forms"} onOpenChange={(o) => setDialog(o ? "forms" : null)} />
      <MediaPicker target={mediaTarget} onClose={() => setMediaTarget(null)} />
    </div>
  );
}

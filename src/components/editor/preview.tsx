"use client";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { googleFontsHref } from "@/engine/styles";
import { renderBody, renderCss, renderPage, type RenderTarget } from "@/render";
import type { Item, Section, SiteDocument } from "@/engine/schema";
import { cn } from "../ui";
import { useCurrentPage, useEditor } from "./store";

const WIDTHS = { desktop: 1440, tablet: 834, mobile: 390 } as const;

type BridgeMessage =
  | { type: "ready" }
  | { type: "select"; sectionId: string }
  | { type: "field"; sectionId: string; field: string; itemId?: string }
  | { type: "media"; sectionId: string; field: string; itemId?: string }
  | { type: "navigate"; href: string }
  | { type: "edit"; sectionId: string; field: string; itemId?: string; value: string };

/** Applies an inline text edit from the preview to the document. */
function inlineEdit(doc: SiteDocument, pageId: string, m: Extract<BridgeMessage, { type: "edit" }>) {
  const page = doc.pages.find((p) => p.id === pageId);
  const section = page?.sections.find((s) => s.id === m.sectionId);
  if (!section) return null;
  const content = { ...section.content } as Section["content"];
  const value = m.value.slice(0, 4000);
  if (m.itemId) {
    const items = (content.items ?? []).map((it) => (it.id === m.itemId ? ({ ...it, [m.field]: value } as Item) : it));
    return { items };
  }
  const ctaMatch = m.field.match(/^ctas\.(\d+)\.label$/);
  if (ctaMatch) {
    const i = Number(ctaMatch[1]);
    return { ctas: (content.ctas ?? []).map((c, idx) => (idx === i ? { ...c, label: value || c.label } : c)) };
  }
  if (m.field === "form.submitLabel" && content.form) return { form: { ...content.form, submitLabel: value || content.form.submitLabel } };
  if (["eyebrow", "heading", "subheading", "body", "note"].includes(m.field)) return { [m.field]: value };
  return null;
}

export function Preview({ onMedia }: { onMedia: (target: { sectionId: string; field: string; itemId?: string }) => void }) {
  const doc = useEditor((s) => s.doc);
  const projectId = useEditor((s) => s.projectId);
  const device = useEditor((s) => s.device);
  const sectionId = useEditor((s) => s.sectionId);
  const page = useCurrentPage();
  const iframe = useRef<HTMLIFrameElement>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const ready = useRef(false);
  const [scale, setScale] = useState(1);
  const [viewport, setViewport] = useState({ w: 0, h: 0 });

  const target = useMemo<RenderTarget>(() => ({ mode: "edit", projectId, appUrl: typeof window === "undefined" ? "" : window.location.origin }), [projectId]);

  // Full document only when the page changes; later edits are patched in place (no flicker, scroll kept).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const srcDoc = useMemo(() => renderPage(doc, page, target).html, [page.id, target]);

  useEffect(() => {
    ready.current = false;
  }, [srcDoc]);

  useEffect(() => {
    const win = iframe.current?.contentWindow;
    if (!win || !ready.current) return;
    const id = requestAnimationFrame(() => {
      win.postMessage({ source: "wb-editor", type: "update", css: renderCss(doc), body: renderBody(doc, page, target), fonts: googleFontsHref(doc.theme) }, "*");
    });
    return () => cancelAnimationFrame(id);
  }, [doc, page, target]);

  useEffect(() => {
    if (!ready.current) return;
    iframe.current?.contentWindow?.postMessage({ source: "wb-editor", type: "select", sectionId, scroll: true }, "*");
  }, [sectionId]);

  useEffect(() => {
    function onMessage(e: MessageEvent) {
      if (e.source !== iframe.current?.contentWindow || e.data?.source !== "wb-preview") return;
      const m = e.data as BridgeMessage;
      const st = useEditor.getState();
      switch (m.type) {
        case "ready":
          ready.current = true;
          // The document may have changed while the iframe was loading.
          iframe.current?.contentWindow?.postMessage({ source: "wb-editor", type: "update", css: renderCss(st.doc), body: renderBody(st.doc, st.doc.pages.find((p) => p.id === st.pageId) ?? st.doc.pages[0], target), fonts: googleFontsHref(st.doc.theme) }, "*");
          if (st.sectionId) iframe.current?.contentWindow?.postMessage({ source: "wb-editor", type: "select", sectionId: st.sectionId }, "*");
          break;
        case "select":
          st.select(m.sectionId);
          break;
        case "field":
          st.select(m.sectionId, { field: m.field, itemId: m.itemId });
          break;
        case "media":
          st.select(m.sectionId);
          onMedia({ sectionId: m.sectionId, field: m.field, itemId: m.itemId });
          break;
        case "navigate": {
          const path = m.href.split("#")[0] || "/";
          const target = st.doc.pages.find((p) => p.path === path);
          if (target && target.id !== st.pageId) st.setPage(target.id);
          break;
        }
        case "edit": {
          const content = inlineEdit(st.doc, st.pageId, m);
          if (content) st.apply([{ op: "update_section", pageId: st.pageId, sectionId: m.sectionId, patch: { content } }]);
          break;
        }
      }
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [onMedia, target]);

  useLayoutEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      const w = entry.contentRect.width - (device === "desktop" ? 0 : 48);
      const h = entry.contentRect.height - (device === "desktop" ? 0 : 48);
      const s = Math.min(1, w / WIDTHS[device]);
      setScale(s);
      setViewport({ w: WIDTHS[device], h: Math.max(400, h / s) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [device]);

  return (
    <div ref={wrap} className={cn("canvas-grid relative min-h-0 flex-1 overflow-hidden", device === "desktop" ? "" : "grid place-items-center")}>
      <div
        className={cn("origin-top-left bg-white", device === "desktop" ? "absolute top-0 left-0" : "relative overflow-hidden rounded-[18px] shadow-[0_0_0_1px_rgb(255_255_255/0.08),0_30px_80px_-20px_rgb(0_0_0/0.8)]")}
        style={{ width: viewport.w, height: viewport.h, transform: `scale(${scale})`, ...(device === "desktop" ? {} : { transformOrigin: "center center", marginTop: 0 }) }}
      >
        <iframe
          ref={iframe}
          title={`Vista previa: ${page.name}`}
          srcDoc={srcDoc}
          // Opaque origin: user HTML in the preview cannot reach the editor's cookies or storage.
          sandbox="allow-scripts allow-forms allow-popups"
          className="block size-full border-0"
        />
      </div>
    </div>
  );
}

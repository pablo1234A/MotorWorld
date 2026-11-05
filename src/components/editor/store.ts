"use client";
import { create } from "zustand";
import { applyOperations, type ApplyResult, type Operation } from "@/engine/ops";
import type { Section, SiteDocument } from "@/engine/schema";

export type Device = "desktop" | "tablet" | "mobile";
export type SaveStatus = "saved" | "dirty" | "saving" | "error" | "conflict";

const HISTORY_LIMIT = 120;
const COALESCE_MS = 900;

interface EditorState {
  projectId: string;
  slug: string;
  doc: SiteDocument;
  revision: number;
  savedJson: string;
  status: SaveStatus;
  lastVersionAt: number;
  past: SiteDocument[];
  future: SiteDocument[];
  lastCommit: { key: string; at: number } | null;
  pageId: string;
  sectionId: string | null;
  focusField: { field: string; itemId?: string } | null;
  device: Device;
  init: (p: { projectId: string; slug: string; doc: SiteDocument; revision: number }) => void;
  /** Replaces the document and records an undo step. Same `coalesceKey` within 900 ms merges steps (typing). */
  commit: (next: SiteDocument, coalesceKey?: string) => void;
  apply: (ops: Operation[], coalesceKey?: string) => ApplyResult;
  undo: () => void;
  redo: () => void;
  select: (sectionId: string | null, focus?: { field: string; itemId?: string } | null) => void;
  setPage: (pageId: string) => void;
  setDevice: (d: Device) => void;
  setStatus: (s: SaveStatus) => void;
  markSaved: (revision: number, json: string, versioned?: boolean) => void;
  setSlug: (slug: string) => void;
}

export const useEditor = create<EditorState>((set, get) => ({
  projectId: "",
  slug: "",
  doc: null as unknown as SiteDocument,
  revision: 0,
  savedJson: "",
  status: "saved",
  lastVersionAt: Date.now(),
  past: [],
  future: [],
  lastCommit: null,
  pageId: "",
  sectionId: null,
  focusField: null,
  device: "desktop",

  init: ({ projectId, slug, doc, revision }) =>
    set({ projectId, slug, doc, revision, savedJson: JSON.stringify(doc), status: "saved", past: [], future: [], pageId: doc.pages[0].id, sectionId: null, lastCommit: null }),

  commit: (next, coalesceKey) => {
    const { doc, past, lastCommit, pageId } = get();
    if (next === doc) return;
    const now = Date.now();
    const merge = !!coalesceKey && lastCommit?.key === coalesceKey && now - lastCommit.at < COALESCE_MS;
    const nextPast = merge ? past : [...past, doc].slice(-HISTORY_LIMIT);
    const pageExists = next.pages.some((p) => p.id === pageId);
    set({ doc: next, past: nextPast, future: [], lastCommit: coalesceKey ? { key: coalesceKey, at: now } : null, ...(pageExists ? {} : { pageId: next.pages[0].id, sectionId: null }) });
  },

  apply: (ops, coalesceKey) => {
    const r = applyOperations(get().doc, ops);
    if (r.applied.length) get().commit(r.doc, coalesceKey);
    return r;
  },

  undo: () => {
    const { past, doc, future } = get();
    if (!past.length) return;
    const prev = past[past.length - 1];
    set({ doc: prev, past: past.slice(0, -1), future: [doc, ...future].slice(0, HISTORY_LIMIT), lastCommit: null, ...fixSelection(prev, get()) });
  },

  redo: () => {
    const { past, doc, future } = get();
    if (!future.length) return;
    const next = future[0];
    set({ doc: next, past: [...past, doc], future: future.slice(1), lastCommit: null, ...fixSelection(next, get()) });
  },

  select: (sectionId, focus = null) => set({ sectionId, focusField: focus }),
  setPage: (pageId) => set({ pageId, sectionId: null, focusField: null }),
  setDevice: (device) => set({ device }),
  setStatus: (status) => set({ status }),
  markSaved: (revision, json, versioned) => set((s) => ({ revision, savedJson: json, status: JSON.stringify(s.doc) === json ? "saved" : "dirty", ...(versioned ? { lastVersionAt: Date.now() } : {}) })),
  setSlug: (slug) => set({ slug }),
}));

function fixSelection(doc: SiteDocument, s: { pageId: string; sectionId: string | null }) {
  const page = doc.pages.find((p) => p.id === s.pageId) ?? doc.pages[0];
  const sectionOk = s.sectionId ? page.sections.some((x) => x.id === s.sectionId) : true;
  return { pageId: page.id, ...(sectionOk ? {} : { sectionId: null }) };
}

export function useCurrentPage() {
  return useEditor((s) => s.doc.pages.find((p) => p.id === s.pageId) ?? s.doc.pages[0]);
}

export function useSelectedSection(): Section | null {
  return useEditor((s) => {
    if (!s.sectionId) return null;
    const page = s.doc.pages.find((p) => p.id === s.pageId);
    return page?.sections.find((x) => x.id === s.sectionId) ?? null;
  });
}

/** Convenience: patch the selected (or given) section, coalescing rapid edits to the same field. */
export function patchSection(sectionId: string, patch: Extract<Operation, { op: "update_section" }>["patch"], key?: string) {
  const s = useEditor.getState();
  return s.apply([{ op: "update_section", pageId: s.pageId, sectionId, patch }], key ? `${sectionId}:${key}` : undefined);
}

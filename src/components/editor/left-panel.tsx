"use client";
import { useState } from "react";
import { ChevronDown, ChevronUp, Copy, Eye, EyeOff, File, GripVertical, MoreHorizontal, Plus, Trash2, Bookmark, Sparkles } from "lucide-react";
import { toast } from "sonner";
import type { SectionType } from "@/engine/schema";
import { SECTION_LABELS, VARIANTS } from "@/engine/variants";
import { Button, cn, Dialog, Field, Input, Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger, Select, Tabs, TabsContent, TabsList, TabsTrigger } from "../ui";
import { AssetGrid, Dropzone, useAssets } from "../asset-library";
import { useCurrentPage, useEditor } from "./store";

const ADD_GROUPS: Array<{ label: string; types: SectionType[] }> = [
  { label: "Estructura", types: ["navbar", "hero", "footer", "cta"] },
  { label: "Contenido", types: ["features", "showcase", "steps", "stats", "timeline", "richtext", "faq"] },
  { label: "Prueba social", types: ["testimonials", "logos", "team"] },
  { label: "Negocio", types: ["pricing", "products", "menu", "contact", "newsletter"] },
  { label: "Visual", types: ["gallery", "marquee", "scene3d", "dashboard", "custom"] },
];

const PAGE_TEMPLATES: Record<string, { label: string; types: SectionType[] }> = {
  about: { label: "Sobre nosotros", types: ["showcase", "timeline", "team", "cta"] },
  services: { label: "Servicios", types: ["features", "steps", "faq", "cta"] },
  contact: { label: "Contacto", types: ["contact", "faq"] },
  pricing: { label: "Precios", types: ["pricing", "faq", "cta"] },
  shop: { label: "Tienda", types: ["products", "features"] },
  gallery: { label: "Galería", types: ["gallery", "cta"] },
  blank: { label: "En blanco", types: ["richtext"] },
};

function PagesTab() {
  const doc = useEditor((s) => s.doc);
  const pageId = useEditor((s) => s.pageId);
  const setPage = useEditor((s) => s.setPage);
  const apply = useEditor((s) => s.apply);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [tpl, setTpl] = useState("about");

  function add() {
    const r = apply([{ op: "add_page", name: name.trim(), sectionTypes: PAGE_TEMPLATES[tpl].types }]);
    if (r.errors.length) return toast.error(r.errors[0]);
    const created = useEditor.getState().doc.pages.at(-1);
    if (created) setPage(created.id);
    setOpen(false);
    setName("");
    toast.success(r.applied[0]);
  }

  return (
    <div className="p-2">
      <ul className="space-y-0.5">
        {doc.pages.map((p) => (
          <li key={p.id} className="group flex items-center">
            <button type="button" onClick={() => setPage(p.id)} aria-current={p.id === pageId ? "page" : undefined} className={cn("press flex h-8 min-w-0 flex-1 items-center gap-2 rounded-md px-2 text-left text-[13px]", p.id === pageId ? "bg-hover text-fg" : "text-muted hover:bg-hover hover:text-fg")}>
              <File className="size-3.5 shrink-0" />
              <span className="truncate">{p.name}</span>
              <span className="ml-auto font-mono text-[10px] text-faint">{p.path}</span>
            </button>
            {p.path !== "/" ? (
              <Button
                size="icon-sm"
                variant="ghost"
                className="opacity-0 group-hover:opacity-100 focus:opacity-100"
                aria-label={`Eliminar página ${p.name}`}
                onClick={() => {
                  if (!confirm(`¿Eliminar la página «${p.name}»? Puedes deshacerlo con Ctrl+Z.`)) return;
                  const r = apply([{ op: "remove_page", pageId: p.id }]);
                  if (r.errors.length) toast.error(r.errors[0]);
                }}
              >
                <Trash2 className="size-3.5" />
              </Button>
            ) : null}
          </li>
        ))}
      </ul>
      <Button size="sm" variant="ghost" className="mt-2 w-full justify-start" onClick={() => setOpen(true)}>
        <Plus className="size-3.5" /> Añadir página
      </Button>
      <Dialog
        open={open}
        onOpenChange={setOpen}
        title="Nueva página"
        description="Se crea con la navegación y el pie de la home, y se añade al menú automáticamente."
        size="sm"
        footer={
          <>
            <Button onClick={() => setOpen(false)}>Cancelar</Button>
            <Button variant="primary" disabled={!name.trim()} onClick={add}>
              Crear página
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <Field label="Nombre">
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Sobre nosotros" autoFocus onKeyDown={(e) => e.key === "Enter" && name.trim() && add()} />
          </Field>
          <Field label="Plantilla">
            <Select value={tpl} onChange={(e) => setTpl(e.target.value)}>
              {Object.entries(PAGE_TEMPLATES).map(([k, v]) => (
                <option key={k} value={k}>
                  {v.label}
                </option>
              ))}
            </Select>
          </Field>
        </div>
      </Dialog>
    </div>
  );
}

function LayersTab() {
  const page = useCurrentPage();
  const sectionId = useEditor((s) => s.sectionId);
  const select = useEditor((s) => s.select);
  const apply = useEditor((s) => s.apply);
  const [drag, setDrag] = useState<{ from: number; over: number } | null>(null);

  function move(id: string, toIndex: number) {
    apply([{ op: "move_section", pageId: page.id, sectionId: id, toIndex }]);
  }

  return (
    <ol className="p-2" aria-label="Secciones de la página">
      {page.sections.map((s, i) => {
        const hidden = !!(s.hidden?.desktop && s.hidden?.tablet && s.hidden?.mobile);
        const partly = !hidden && !!(s.hidden?.desktop || s.hidden?.tablet || s.hidden?.mobile);
        return (
          <li
            key={s.id}
            draggable
            onDragStart={(e) => {
              e.dataTransfer.effectAllowed = "move";
              setDrag({ from: i, over: i });
            }}
            onDragOver={(e) => {
              e.preventDefault();
              if (drag && drag.over !== i) setDrag({ ...drag, over: i });
            }}
            onDragEnd={() => setDrag(null)}
            onDrop={(e) => {
              e.preventDefault();
              if (drag && drag.from !== i) move(page.sections[drag.from].id, i);
              setDrag(null);
            }}
            className={cn("group relative flex items-center rounded-md", drag?.over === i && drag.from !== i ? "before:absolute before:inset-x-1 before:h-0.5 before:rounded before:bg-accent " + (drag.from < i ? "before:-bottom-px" : "before:-top-px") : "")}
          >
            <span className="cursor-grab px-0.5 text-faint opacity-0 group-hover:opacity-100" aria-hidden>
              <GripVertical className="size-3.5" />
            </span>
            <button type="button" onClick={() => select(s.id)} className={cn("press flex h-8 min-w-0 flex-1 items-center gap-2 rounded-md px-2 text-left text-[13px]", sectionId === s.id ? "bg-accent-soft text-fg" : "text-muted hover:bg-hover hover:text-fg", hidden && "opacity-50")}>
              <span className="shrink-0">{SECTION_LABELS[s.type]}</span>
              {s.content.heading && s.type !== "navbar" && s.type !== "footer" ? <span className="min-w-0 truncate text-[11px] text-faint">{s.content.heading}</span> : null}
              {s.sample ? <span className="ml-auto size-1.5 shrink-0 rounded-full bg-warn" title="Contiene datos de ejemplo" /> : null}
              {partly ? <EyeOff className="ml-auto size-3 shrink-0 text-faint" /> : null}
            </button>
            <div className="flex opacity-0 group-hover:opacity-100 focus-within:opacity-100">
              <Button size="icon-sm" variant="ghost" aria-label={hidden ? "Mostrar sección" : "Ocultar sección"} onClick={() => apply([{ op: "update_section", pageId: page.id, sectionId: s.id, patch: { hidden: { desktop: !hidden, tablet: !hidden, mobile: !hidden } } }])}>
                {hidden ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
              </Button>
              <Menu>
                <MenuTrigger asChild>
                  <Button size="icon-sm" variant="ghost" aria-label="Más acciones">
                    <MoreHorizontal className="size-3.5" />
                  </Button>
                </MenuTrigger>
                <MenuContent>
                  <MenuItem disabled={i === 0} onSelect={() => move(s.id, i - 1)}>
                    <ChevronUp className="size-3.5" /> Subir
                  </MenuItem>
                  <MenuItem disabled={i === page.sections.length - 1} onSelect={() => move(s.id, i + 1)}>
                    <ChevronDown className="size-3.5" /> Bajar
                  </MenuItem>
                  <MenuItem onSelect={() => apply([{ op: "duplicate_section", pageId: page.id, sectionId: s.id }])}>
                    <Copy className="size-3.5" /> Duplicar
                  </MenuItem>
                  <MenuItem
                    onSelect={() => {
                      const name = prompt("Nombre del componente", `${SECTION_LABELS[s.type]} ${useEditor.getState().doc.library.length + 1}`);
                      if (name?.trim()) {
                        apply([{ op: "save_component", pageId: page.id, sectionId: s.id, name: name.trim() }]);
                        toast.success("Guardado en tus componentes");
                      }
                    }}
                  >
                    <Bookmark className="size-3.5" /> Guardar como componente
                  </MenuItem>
                  <MenuSeparator />
                  <MenuItem danger onSelect={() => apply([{ op: "remove_section", pageId: page.id, sectionId: s.id }])}>
                    <Trash2 className="size-3.5" /> Eliminar
                  </MenuItem>
                </MenuContent>
              </Menu>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function AddTab() {
  const page = useCurrentPage();
  const sectionId = useEditor((s) => s.sectionId);
  const library = useEditor((s) => s.doc.library);
  const apply = useEditor((s) => s.apply);
  const select = useEditor((s) => s.select);

  function insertIndex() {
    const i = sectionId ? page.sections.findIndex((s) => s.id === sectionId) : -1;
    if (i >= 0) return i + 1;
    const f = page.sections.findIndex((s) => s.type === "footer");
    return f >= 0 ? f : page.sections.length;
  }

  function add(type: SectionType, variant?: string) {
    const index = insertIndex();
    const r = apply([{ op: "add_section", pageId: page.id, sectionType: type, index, ...(variant ? { patch: { variant } } : {}) }]);
    if (r.errors.length) return toast.error(r.errors[0]);
    const created = useEditor.getState().doc.pages.find((p) => p.id === page.id)?.sections[index];
    if (created) select(created.id);
  }

  return (
    <div className="space-y-4 p-3">
      <p className="text-[11px] text-faint">Se inserta {sectionId ? "después de la sección seleccionada" : "antes del pie de página"}.</p>
      {library.length ? (
        <div>
          <p className="mb-1.5 text-[11px] font-medium tracking-wide text-faint uppercase">Tus componentes</p>
          <ul className="space-y-1">
            {library.map((c) => (
              <li key={c.id} className="group flex items-center gap-1">
                <button type="button" onClick={() => apply([{ op: "insert_component", pageId: page.id, componentId: c.id, index: insertIndex() }])} className="press flex h-8 min-w-0 flex-1 items-center gap-2 rounded-md border border-line px-2 text-left text-xs hover:border-line-strong">
                  <Bookmark className="size-3 text-accent" />
                  <span className="truncate">{c.name}</span>
                  <span className="ml-auto text-[10px] text-faint">{SECTION_LABELS[c.section.type]}</span>
                </button>
                <Button size="icon-sm" variant="ghost" className="opacity-0 group-hover:opacity-100" aria-label="Eliminar componente" onClick={() => apply([{ op: "remove_component", componentId: c.id }])}>
                  <Trash2 className="size-3" />
                </Button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {ADD_GROUPS.map((g) => (
        <div key={g.label}>
          <p className="mb-1.5 text-[11px] font-medium tracking-wide text-faint uppercase">{g.label}</p>
          <div className="grid grid-cols-2 gap-1.5">
            {g.types.map((t) => (
              <Menu key={t}>
                <MenuTrigger asChild>
                  <button type="button" className="press flex h-9 items-center justify-between gap-1 rounded-md border border-line bg-panel px-2 text-left text-xs hover:border-line-strong hover:bg-hover">
                    <span className="truncate">{SECTION_LABELS[t]}</span>
                    <Plus className="size-3 shrink-0 text-faint" />
                  </button>
                </MenuTrigger>
                <MenuContent align="start">
                  {VARIANTS[t].map((v) => (
                    <MenuItem key={v.id} onSelect={() => add(t, v.id)}>
                      {v.label}
                    </MenuItem>
                  ))}
                </MenuContent>
              </Menu>
            ))}
          </div>
        </div>
      ))}
      <p className="flex items-start gap-1.5 text-[11px] text-faint">
        <Sparkles className="mt-0.5 size-3 shrink-0" /> También puedes pedirlo en el chat: «añade una sección de testimonios después del hero».
      </p>
    </div>
  );
}

function AssetsTab() {
  const projectId = useEditor((s) => s.projectId);
  const { assets, setAssets } = useAssets();
  const sectionId = useEditor((s) => s.sectionId);
  const page = useCurrentPage();
  const apply = useEditor((s) => s.apply);
  return (
    <div className="space-y-3 p-3">
      <Dropzone compact projectId={projectId} onFiles={(a) => setAssets((l) => [...a, ...(l ?? [])])} />
      <p className="text-[11px] text-faint">{sectionId ? "Haz clic en una imagen para usarla en la sección seleccionada." : "Selecciona una sección con imagen para insertar recursos."}</p>
      {assets ? (
        <AssetGrid
          assets={assets.filter((a) => a.kind !== "font")}
          onPick={(a) => {
            const s = page.sections.find((x) => x.id === sectionId);
            if (!s) return toast("Selecciona primero una sección");
            apply([{ op: "update_section", pageId: page.id, sectionId: s.id, patch: { content: { image: { kind: a.kind === "video" ? "video" : "image", src: a.url, alt: s.content.image?.alt || s.content.heading || a.filename, credit: { name: "", url: "", provider: "upload" } } } } }]);
            toast.success("Imagen aplicada");
          }}
        />
      ) : (
        <div className="skeleton h-24 rounded-lg" />
      )}
    </div>
  );
}

export function LeftPanel() {
  return (
    <Tabs defaultValue="layers" className="flex min-h-0 flex-1 flex-col">
      <TabsList>
        <TabsTrigger value="pages">Páginas</TabsTrigger>
        <TabsTrigger value="layers">Capas</TabsTrigger>
        <TabsTrigger value="add">Añadir</TabsTrigger>
        <TabsTrigger value="assets">Recursos</TabsTrigger>
      </TabsList>
      <div className="scroll-thin min-h-0 flex-1 overflow-y-auto">
        <TabsContent value="pages">
          <PagesTab />
        </TabsContent>
        <TabsContent value="layers">
          <LayersTab />
        </TabsContent>
        <TabsContent value="add">
          <AddTab />
        </TabsContent>
        <TabsContent value="assets">
          <AssetsTab />
        </TabsContent>
      </div>
    </Tabs>
  );
}

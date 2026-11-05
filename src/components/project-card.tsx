"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Copy, ExternalLink, MoreHorizontal, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { api, relativeTime } from "@/lib/api";
import { KIND_LABEL } from "@/lib/catalog";
import { Badge, Button, Dialog, Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from "./ui";

export interface ProjectSummary {
  id: string;
  name: string;
  slug: string;
  kind: string;
  engine: string;
  updatedAt: string;
  publishedAt: string | null;
  pages: number;
  theme: { style: string; mode: string; colors: { bg: string; surface: string; text: string; muted: string; primary: string; accent: string }; fonts: { display: string } };
}

const serif = (f: string) => /Serif|Garamond|Playfair|Bodoni|Fraunces|Newsreader|Gloock|Young/i.test(f);

/** A thumbnail drawn from the project's real design tokens (palette, type, mode). */
export function ProjectThumb({ p }: { p: ProjectSummary }) {
  const c = p.theme.colors;
  return (
    <div className="relative aspect-[16/10] overflow-hidden rounded-t-xl" style={{ background: c.bg }}>
      <div className="absolute inset-x-4 top-3 flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-[10px] font-semibold" style={{ color: c.text }}>
          <span className="size-2 rounded-sm" style={{ background: c.primary }} />
          {p.name}
        </span>
        <span className="flex gap-2">
          {[0, 1, 2].map((i) => (
            <span key={i} className="h-1 w-5 rounded-full" style={{ background: c.muted, opacity: 0.5 }} />
          ))}
        </span>
      </div>
      <div className="absolute inset-x-4 top-[34%]">
        <p className="line-clamp-2 text-[19px] leading-[1.05] tracking-tight" style={{ color: c.text, fontFamily: serif(p.theme.fonts.display) ? "Georgia, serif" : "inherit", fontWeight: serif(p.theme.fonts.display) ? 400 : 600 }}>
          {p.name}
        </p>
        <div className="mt-2 h-1.5 w-2/3 rounded-full" style={{ background: c.muted, opacity: 0.35 }} />
        <div className="mt-3 flex gap-1.5">
          <span className="h-4 w-14 rounded-full" style={{ background: c.primary }} />
          <span className="h-4 w-10 rounded-full border" style={{ borderColor: c.muted, opacity: 0.6 }} />
        </div>
      </div>
      <div className="absolute right-4 bottom-0 h-[38%] w-[34%] rounded-t-lg" style={{ background: `linear-gradient(160deg, ${c.primary}, ${c.accent})`, opacity: 0.85 }} />
    </div>
  );
}

export function ProjectCard({ p }: { p: ProjectSummary }) {
  const router = useRouter();
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);

  async function remove() {
    setBusy(true);
    try {
      await api(`/api/projects/${p.id}`, { method: "DELETE" });
      toast.success("Proyecto eliminado");
      setConfirm(false);
      router.refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="group relative rounded-xl border border-line bg-panel transition-colors hover:border-line-strong">
      <Link href={`/editor/${p.id}`} className="block focus-visible:rounded-xl" aria-label={`Abrir ${p.name}`}>
        <ProjectThumb p={p} />
        <div className="flex items-center justify-between gap-3 px-3.5 py-3">
          <div className="min-w-0">
            <p className="truncate text-[13px] font-medium">{p.name}</p>
            <p className="mt-0.5 text-[11px] text-faint">
              {KIND_LABEL[p.kind] ?? p.kind} · {p.pages} {p.pages === 1 ? "página" : "páginas"} · {relativeTime(p.updatedAt)}
            </p>
          </div>
          {p.publishedAt ? <Badge tone="ok">Publicado</Badge> : <Badge>Borrador</Badge>}
        </div>
      </Link>
      <div className="absolute top-2 right-2 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
        <Menu>
          <MenuTrigger asChild>
            <Button size="icon-sm" variant="secondary" aria-label="Opciones del proyecto">
              <MoreHorizontal className="size-4" />
            </Button>
          </MenuTrigger>
          <MenuContent>
            <MenuItem onSelect={() => router.push(`/editor/${p.id}`)}>Abrir en el editor</MenuItem>
            {p.publishedAt ? (
              <MenuItem onSelect={() => window.open(`/s/${p.slug}`, "_blank", "noopener")}>
                <ExternalLink className="size-3.5" /> Ver sitio publicado
              </MenuItem>
            ) : null}
            <MenuItem onSelect={() => navigator.clipboard.writeText(`${location.origin}/s/${p.slug}`).then(() => toast.success("Enlace copiado"))}>
              <Copy className="size-3.5" /> Copiar enlace
            </MenuItem>
            <MenuSeparator />
            <MenuItem danger onSelect={() => setConfirm(true)}>
              <Trash2 className="size-3.5" /> Eliminar
            </MenuItem>
          </MenuContent>
        </Menu>
      </div>
      <Dialog
        open={confirm}
        onOpenChange={setConfirm}
        title={`¿Eliminar «${p.name}»?`}
        description="Se borrarán el proyecto, su historial, sus envíos de formularios y la versión publicada. No se puede deshacer."
        size="sm"
        footer={
          <>
            <Button onClick={() => setConfirm(false)}>Cancelar</Button>
            <Button variant="danger" loading={busy} onClick={remove}>
              Eliminar definitivamente
            </Button>
          </>
        }
      >
        <p className="text-[13px] text-muted">Si solo quieres retirarlo de Internet, usa «Despublicar» en el editor.</p>
      </Dialog>
    </div>
  );
}

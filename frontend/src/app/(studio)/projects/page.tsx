"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { FolderKanban, Plus } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { Badge, Button, Card, Empty, Input, Label, PageHeader, Select, Textarea } from "@/components/ui";
import { api, errMsg, fmtDate } from "@/lib/api";
import type { Project } from "@/lib/types";

const KINDS: Record<string, string> = { general: "General", film: "Película", ad: "Anuncio", music: "Música", social: "Redes sociales" };

export default function ProjectsPage() {
  const qc = useQueryClient();
  const list = useQuery<{ items: Project[] }>({ queryKey: ["projects"], queryFn: () => api("/api/projects") });
  const [form, setForm] = useState({ name: "", description: "", kind: "general" });
  const create = async () => {
    try {
      await api("/api/projects", { method: "POST", json: form });
      setForm({ name: "", description: "", kind: "general" });
      qc.invalidateQueries({ queryKey: ["projects"] });
      toast.success("Proyecto creado");
    } catch (e) {
      toast.error(errMsg(e));
    }
  };
  return (
    <div>
      <PageHeader eyebrow="Proyectos" title={<>Tus <em className="text-muted">proyectos</em></>}>Agrupa archivos, generaciones, películas y montajes de una misma campaña o producción. Son privados.</PageHeader>
      <Card className="mb-8 grid gap-3 p-5 md:grid-cols-[1fr_180px] lg:grid-cols-[1fr_1.5fr_180px_auto] lg:items-end">
        <div><Label>Nombre</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Campaña lanzamiento GT" /></div>
        <div className="md:col-span-2 lg:col-span-1"><Label>Descripción</Label><Textarea rows={1} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
        <div><Label>Tipo</Label><Select value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })}>{Object.entries(KINDS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></div>
        <Button variant="primary" onClick={create} disabled={!form.name.trim()}><Plus className="h-4 w-4" /> Crear</Button>
      </Card>
      {list.data?.items.length ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {list.data.items.map((p) => (
            <Link key={p.id} href={`/projects/${p.id}`} className="rounded-2xl border border-line bg-panel p-5 transition hover:border-line-2 hover:bg-panel-2">
              <div className="flex items-center justify-between"><FolderKanban className="h-5 w-5 text-accent" /><Badge>{KINDS[p.kind] || p.kind}</Badge></div>
              <p className="mt-5 text-[16px] font-medium">{p.name}</p>
              {p.description && <p className="mt-1 line-clamp-2 text-[13px] text-muted">{p.description}</p>}
              <p className="mt-4 font-mono text-[11px] text-dim">{p.asset_count} archivos · {p.generation_count} generaciones · {p.film_count} películas · {fmtDate(p.updated_at)}</p>
            </Link>
          ))}
        </div>
      ) : (
        <Empty icon={<FolderKanban className="h-8 w-8" />} title="Sin proyectos todavía" />
      )}
    </div>
  );
}

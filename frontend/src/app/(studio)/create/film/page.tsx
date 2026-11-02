"use client";

import { useQuery } from "@tanstack/react-query";
import { Clapperboard, Plus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Button, Card, Empty, Input, Label, PageHeader, Select } from "@/components/ui";
import { api, errMsg, fmtDate } from "@/lib/api";

export default function FilmsPage() {
  const router = useRouter();
  const films = useQuery<{ items: any[] }>({ queryKey: ["films"], queryFn: () => api("/api/films") });
  const [title, setTitle] = useState("");
  const [ar, setAr] = useState("16:9");
  const [busy, setBusy] = useState(false);
  const create = async () => {
    setBusy(true);
    try {
      const f = await api<any>("/api/films", { method: "POST", json: { title: title || "Nueva película", aspect_ratio: ar } });
      router.push(`/create/film/${f.id}`);
    } catch (e) {
      toast.error(errMsg(e));
      setBusy(false);
    }
  };
  return (
    <div>
      <PageHeader eyebrow="Crear · Películas" title={<>Estudio de <em className="text-muted">producción</em></>}>
        De la idea al montaje final: argumento, escenas, diálogos, personajes con referencias visuales, storyboard, clips, voces, música y exportación.
      </PageHeader>
      <Card className="mb-8 grid gap-3 p-5 sm:grid-cols-[1fr_160px_auto] sm:items-end">
        <div><Label>Título provisional</Label><Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Última vuelta" /></div>
        <div>
          <Label>Formato</Label>
          <Select value={ar} onChange={(e) => setAr(e.target.value)}>
            <option value="16:9">16:9 cine/TV</option><option value="21:9">21:9 scope</option><option value="9:16">9:16 vertical</option><option value="1:1">1:1</option><option value="4:3">4:3</option>
          </Select>
        </div>
        <Button variant="primary" size="lg" onClick={create} loading={busy}><Plus className="h-4 w-4" /> Nueva producción</Button>
      </Card>
      {films.data?.items.length ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {films.data.items.map((f) => (
            <Link key={f.id} href={`/create/film/${f.id}`} className="group overflow-hidden rounded-2xl border border-line bg-panel transition hover:border-line-2">
              <div className="aspect-[2.39/1] bg-panel-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {f.cover_url ? <img src={f.cover_url} alt="" className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.03]" /> : <div className="grid h-full place-items-center text-dim"><Clapperboard className="h-7 w-7" /></div>}
              </div>
              <div className="p-4">
                <p className="display text-[22px] leading-tight">{f.title}</p>
                {f.logline && <p className="mt-1 line-clamp-2 text-[13px] text-muted">{f.logline}</p>}
                <p className="mt-3 font-mono text-[11px] text-dim">{f.scene_count} escenas · {f.shot_count} planos · {fmtDate(f.updated_at)}</p>
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <Empty icon={<Clapperboard className="h-8 w-8" />} title="Aún no hay producciones">Crea una para empezar a escribir tu película o anuncio.</Empty>
      )}
    </div>
  );
}

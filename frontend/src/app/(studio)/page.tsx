"use client";

import { ArrowUpRight, AudioLines, Clapperboard, ImagePlus, KeyRound, Scissors, Video, Wand2 } from "lucide-react";
import Link from "next/link";
import { GenerationCard } from "@/components/jobs";
import { Badge, Card, Empty, Section } from "@/components/ui";
import { fmtBytes, fmtUsd } from "@/lib/api";
import { useGenerations, useMe, useProviders } from "@/lib/hooks";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

const ACTIONS = [
  { href: "/create/image", title: "Fotografía hiperrealista", sub: "Texto a imagen, variaciones, estilos", icon: ImagePlus },
  { href: "/create/video", title: "Foto a vídeo", sub: "Imagen a vídeo, cámara, primer/último fotograma", icon: Video },
  { href: "/create/film", title: "Película o anuncio", sub: "Guion, personajes, storyboard y montaje", icon: Clapperboard },
  { href: "/edit/image", title: "Editar con un prompt", sub: "Fondos, objetos, iluminación, máscaras", icon: Wand2 },
  { href: "/edit/video", title: "Editar un vídeo", sub: "FFmpeg + modelos generativos", icon: Scissors },
  { href: "/studio", title: "Música y sonido", sub: "Voces, efectos, mezcla, timeline", icon: AudioLines },
];

export default function Home() {
  const me = useMe();
  const recent = useGenerations({ limit: 6 });
  const providers = useProviders();
  const usage = useQuery<any>({ queryKey: ["usage"], queryFn: () => api("/api/usage") });
  const cloud = providers.data?.items.filter((p) => p.kind === "cloud") || [];
  const configured = providers.data?.items.filter((p) => p.configured && p.kind !== "stock") || [];
  const noCloud = providers.data && cloud.every((p) => !p.configured);
  const hour = new Date().getHours();
  const greet = hour < 13 ? "Buenos días" : hour < 20 ? "Buenas tardes" : "Buenas noches";

  return (
    <div>
      <div className="grain relative mb-10 overflow-hidden rounded-3xl border border-line bg-panel px-6 py-10 sm:px-10 sm:py-14">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_85%_0%,#ff5a3622,transparent_55%),radial-gradient(ellipse_at_0%_100%,#ffb5470f,transparent_45%)]" />
        <div className="relative">
          <p className="mb-3 font-mono text-[11px] tracking-[0.22em] text-accent uppercase">● {greet}, {me.data?.display_name}</p>
          <h1 className="display max-w-3xl text-[44px] leading-[1] sm:text-[64px]">
            ¿Qué vamos a <em className="text-muted">rodar</em> hoy?
          </h1>
          <div className="mt-8 flex flex-wrap gap-x-8 gap-y-3 font-mono text-[12px] text-muted">
            <span>{configured.length} motores activos</span>
            <span>{usage.data ? `${usage.data.generations_by_status?.completed || 0} generaciones completadas` : "—"}</span>
            <span>{usage.data ? `${fmtBytes(usage.data.storage_bytes)} de ${fmtBytes(usage.data.storage_quota_bytes)}` : ""}</span>
            <span>{usage.data ? `Gasto estimado 30 días: ${fmtUsd(usage.data.estimated_spend_30d_usd)}` : ""}</span>
          </div>
        </div>
      </div>

      {noCloud && (
        <Card className="mb-10 flex flex-col gap-4 border-warn/30 bg-warn/[0.04] p-5 sm:flex-row sm:items-center">
          <KeyRound className="h-6 w-6 shrink-0 text-warn" />
          <div className="flex-1 text-sm">
            <p className="font-medium">Ningún proveedor de IA en la nube está configurado todavía.</p>
            <p className="mt-1 text-muted">
              El motor local (FFmpeg + Pillow) ya funciona: edición, montaje y audio. Para generar imágenes y vídeos con IA añade una API key (Hugging Face incluye créditos mensuales gratuitos) o conecta tu ComfyUI local.
            </p>
          </div>
          <Link href="/models?tab=providers" className="inline-flex h-10 items-center rounded-lg bg-panel-3 px-4 text-sm font-medium hover:bg-[#232329]">Ver proveedores</Link>
        </Card>
      )}

      <Section title="Empezar">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {ACTIONS.map((a) => (
            <Link key={a.href} href={a.href} className="group relative overflow-hidden rounded-2xl border border-line bg-panel p-5 transition hover:border-line-2 hover:bg-panel-2">
              <a.icon className="h-5 w-5 text-accent" strokeWidth={1.6} />
              <p className="mt-6 text-[16px] font-medium">{a.title}</p>
              <p className="mt-1 text-[13px] text-muted">{a.sub}</p>
              <ArrowUpRight className="absolute top-5 right-5 h-4 w-4 text-dim transition group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-text" />
            </Link>
          ))}
        </div>
      </Section>

      <Section title="Últimas generaciones" aside={<Link href="/history" className="text-[12px] text-muted hover:text-text">Ver todo →</Link>}>
        {recent.data?.items.length ? (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {recent.data.items.map((g) => (
              <GenerationCard key={g.id} g={g} />
            ))}
          </div>
        ) : (
          <Empty title="Aún no has generado nada" icon={<ImagePlus className="h-8 w-8" />}>
            Empieza por una imagen o sube un vídeo para editarlo.
          </Empty>
        )}
      </Section>

      <Section title="Motores" aside={<Link href="/models?tab=providers" className="text-[12px] text-muted hover:text-text">Panel de proveedores →</Link>}>
        <div className="flex flex-wrap gap-2">
          {providers.data?.items
            .filter((p) => p.kind !== "stock")
            .map((p) => (
              <span key={p.id} className="inline-flex items-center gap-2 rounded-lg border border-line bg-panel px-3 py-2 text-[13px]">
                <span className={`h-2 w-2 rounded-full ${p.configured ? "bg-ok" : "bg-line-2"}`} />
                {p.name}
                {p.configured ? <Badge tone="ok">activo</Badge> : <Badge>sin configurar</Badge>}
              </span>
            ))}
        </div>
      </Section>
    </div>
  );
}

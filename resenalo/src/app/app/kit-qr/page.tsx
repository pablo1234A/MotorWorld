"use client";
import Link from "next/link";
import { Download, Printer } from "lucide-react";
import { useApi } from "@/lib/useApi";
import { Alert, Card, CardHeader, PageHeader } from "@/components/ui/Display";
import { buttonClass } from "@/components/ui/button-class";
import { PageLoader } from "@/components/ui/Spinner";

export default function QrKitPage() {
  const b = useApi<{ business: { name: string; reviewUrl: string | null } }>("/api/v1/business");
  if (b.loading && !b.data) return <PageLoader />;
  const url = b.data?.business.reviewUrl;
  return (
    <>
      <PageHeader title="Kit QR para tu local" description="Para los clientes que pasan por el mostrador: escanean y dejan su opinión al momento. Complementa los envíos automáticos." />
      {!url ? (
        <Alert tone="warn">Configura el enlace de reseñas en <Link href="/app/negocio" className="underline">Configuración del negocio</Link> para generar tu código QR.</Alert>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[1fr_1.2fr]">
          <Card>
            {/* eslint-disable-next-line @next/next/no-img-element -- SVG generado por la API autenticada */}
            <img src="/api/v1/qr?format=svg" alt="Código QR del enlace de reseñas" className="mx-auto aspect-square w-full max-w-[320px] rounded-lg border border-ink-100" />
            <p className="mt-3 break-all text-center text-xs text-ink-500">{url}</p>
          </Card>
          <Card>
            <CardHeader title="Descargar e imprimir" description="Usa el cartel listo para imprimir o descarga el código para tus propios diseños (tarjetas, tickets, facturas)." />
            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
              <Link href="/cartel-qr" target="_blank" className={buttonClass("primary", "md")}><Printer className="h-4 w-4" />Cartel para imprimir (A5/A4)</Link>
              <a href="/api/v1/qr?format=png&download=1" className={buttonClass("secondary", "md")}><Download className="h-4 w-4" />PNG alta resolución</a>
              <a href="/api/v1/qr?format=svg&download=1" className={buttonClass("secondary", "md")}><Download className="h-4 w-4" />SVG (vectorial)</a>
            </div>
            <ul className="mt-6 list-disc space-y-1.5 pl-5 text-sm text-ink-600">
              <li>Colócalo junto a la caja, en la mesa o en el ticket.</li>
              <li>Pide la opinión a todos los clientes por igual; no ofrezcas nada a cambio de una reseña.</li>
              <li>Las reseñas que lleguen por el QR aparecerán en «Reseñas de Google» si tienes la ficha conectada.</li>
            </ul>
          </Card>
        </div>
      )}
    </>
  );
}

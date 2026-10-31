import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { LEGAL_PAGES, legalInfo } from "@/config/legal";
import { legalContent, ReviewNotice } from "@/content/legal";
import { DataRightsForm } from "@/components/marketing/DataRightsForm";

export const dynamic = "force-dynamic"; // los datos del titular vienen del entorno

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  return { title: LEGAL_PAGES.find((p) => p.slug === slug)?.title ?? "Legal" };
}

export default async function LegalPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const meta = LEGAL_PAGES.find((p) => p.slug === slug);
  if (!meta) notFound();
  const content = slug === "derechos" ? null : legalContent(slug);
  if (slug !== "derechos" && !content) notFound();
  return (
    <div className="container-page py-14 sm:py-20">
      <div className="mx-auto max-w-3xl">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-star-700">Legal</p>
        <h1 className="mt-3 text-3xl font-bold sm:text-4xl">{meta.title}</h1>
        <p className="mb-8 mt-2 text-sm text-ink-500">Última actualización: {legalInfo().lastUpdated}</p>
        <ReviewNotice />
        <article className="prose-legal">
          {slug === "derechos" ? (
            <>
              <p>
                Puedes ejercer tus derechos de acceso, rectificación, supresión, oposición, limitación del tratamiento y portabilidad (arts. 15‑22 RGPD).
                Si tienes cuenta, puedes descargar o eliminar tus datos directamente desde <strong>Panel → Perfil y seguridad</strong>.
              </p>
              <p>
                Si eres cliente de un negocio que usa Reseñalo, el responsable de tus datos es ese negocio; trasladaremos tu solicitud. Puedes darte de baja de
                las solicitudes en el enlace que aparece al pie de cada correo. Responderemos en un plazo máximo de un mes.
              </p>
              <DataRightsForm />
              <p className="mt-8">También puedes presentar una reclamación ante la Agencia Española de Protección de Datos (www.aepd.es).</p>
            </>
          ) : (
            content
          )}
        </article>
      </div>
    </div>
  );
}

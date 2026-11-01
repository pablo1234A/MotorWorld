import QRCode from "qrcode";
import { requirePageTenant } from "@/server/auth/page-auth";
import { StarMark } from "@/components/brand/Logo";
import { PrintButton } from "./PrintButton";

export const dynamic = "force-dynamic";
export const metadata = { title: "Cartel QR", robots: { index: false } };

/** Cartel imprimible con el QR de reseñas del negocio. */
export default async function Poster() {
  const { business } = await requirePageTenant("/cartel-qr");
  const svg = business.reviewUrl ? await QRCode.toString(business.reviewUrl, { type: "svg", margin: 1, errorCorrectionLevel: "M", color: { dark: "#2E2A29", light: "#FFFFFF" } }) : null;
  return (
    <main className="min-h-[100dvh] bg-white px-6 py-10 print:p-0">
      <div className="mx-auto mb-6 flex max-w-[148mm] justify-end print:hidden"><PrintButton /></div>
      <section className="mx-auto flex max-w-[148mm] flex-col items-center rounded-2xl border border-ink-200 px-10 py-12 text-center print:border-0">
        <StarMark className="h-12 w-12" />
        <h1 className="mt-6 text-[34px] font-bold leading-tight">¿Qué tal ha ido?</h1>
        <p className="mt-3 max-w-[100mm] text-lg text-ink-700">Tu opinión ayuda a {business.name} a mejorar y a otras personas a decidir. Escanea el código y cuéntanos tu experiencia.</p>
        {svg ? <div className="mt-8 w-[70mm] max-w-full" dangerouslySetInnerHTML={{ __html: svg }} /> : <p className="mt-8 text-bad-700">Configura el enlace de reseñas en tu panel.</p>}
        <p className="mt-8 font-display text-xl font-semibold">{business.name}</p>
        <p className="mt-1 text-sm text-ink-500">¡Gracias por tu confianza!</p>
      </section>
    </main>
  );
}

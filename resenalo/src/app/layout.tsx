import type { Metadata, Viewport } from "next";
import "./globals.css";
import { ToastProvider } from "@/components/ui/Toast";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.APP_URL ?? "http://localhost:3000"),
  title: { default: "Reseñalo — Automatiza las solicitudes de reseñas", template: "%s · Reseñalo" },
  description: "Reseñalo envía automáticamente solicitudes de reseña personalizadas a tus clientes desde tu propio Gmail u Outlook. Más reseñas, sin esfuerzo.",
  icons: { icon: "/icon.svg" },
  openGraph: { type: "website", locale: "es_ES", siteName: "Reseñalo", images: ["/brand/resenalo-logo.png"] },
};

export const viewport: Viewport = { themeColor: "#FCF9F2", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>
        <a href="#contenido" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[70] focus:rounded-md focus:bg-white focus:px-3 focus:py-2">
          Saltar al contenido
        </a>
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}

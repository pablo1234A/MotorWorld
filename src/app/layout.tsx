import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { Toaster } from "sonner";
import { TooltipProvider } from "@/components/ui/overlays";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || "http://127.0.0.1:3000"),
  title: { default: "AnunciaPro — Anuncios profesionales para todo tu catálogo", template: "%s · AnunciaPro" },
  description:
    "Crea, optimiza y organiza los anuncios de tus productos. Genera títulos y descripciones, impórtalos en lote desde CSV y adáptalos a cada marketplace.",
  applicationName: "AnunciaPro",
  openGraph: { type: "website", locale: "es_ES", siteName: "AnunciaPro" },
};

export const viewport: Viewport = { themeColor: "#faf8f4", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es">
      <body className="min-h-dvh">
        <a href="#contenido" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-lg focus:bg-ink focus:px-4 focus:py-2 focus:text-sm focus:text-white">
          Saltar al contenido
        </a>
        <TooltipProvider delayDuration={250}>{children}</TooltipProvider>
        <Toaster
          position="bottom-right"
          toastOptions={{
            classNames: {
              toast: "!rounded-xl !border !border-line !bg-surface !text-ink !shadow-raised !font-sans",
              description: "!text-muted",
            },
          }}
        />
      </body>
    </html>
  );
}

import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import "@fontsource-variable/inter";
import "./globals.css";
import { site } from "@/config/site";
import { Analytics } from "@/components/analytics";

export const metadata: Metadata = {
  metadataBase: new URL(site.url),
  title: {
    default: "Legalito · Aviso legal, privacidad y cookies para tu web",
    template: "%s · Legalito",
  },
  description: site.description,
  applicationName: site.name,
  openGraph: {
    type: "website",
    locale: site.locale,
    siteName: site.name,
    title: "Legalito · Textos legales para tu web, adaptados a tu negocio",
    description: site.description,
    url: site.url,
  },
  twitter: { card: "summary_large_image" },
  robots: { index: true, follow: true },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: "#1F3A5F",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="es" className="h-full">
      <body className="flex min-h-full flex-col">
        <a
          href="#contenido"
          className="sr-only z-50 rounded-md bg-navy px-4 py-2 text-white focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
        >
          Saltar al contenido
        </a>
        {children}
        <Suspense fallback={null}>
          <Analytics />
        </Suspense>
      </body>
    </html>
  );
}

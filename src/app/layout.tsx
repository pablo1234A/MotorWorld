import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Toaster } from "sonner";
import "./globals.css";

const geist = Geist({ subsets: ["latin"], variable: "--font-geist", display: "swap" });
const geistMono = Geist_Mono({ subsets: ["latin"], variable: "--font-geist-mono", display: "swap" });

export const metadata: Metadata = {
  title: { default: "World Builder AI", template: "%s · World Builder AI" },
  description: "Describe tu web y World Builder AI la diseña, la construye y la publica. Editor visual, edición por chat con Claude Opus 5.5, formularios, pagos y exportación de código.",
  applicationName: "World Builder AI",
};

export const viewport: Viewport = { themeColor: "#0b0b0d", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={`${geist.variable} ${geistMono.variable}`}>
      <body className="min-h-dvh">
        {children}
        <Toaster theme="dark" position="bottom-right" toastOptions={{ style: { background: "#18181c", border: "1px solid #26262c", color: "#ededf0", fontSize: 13 } }} />
      </body>
    </html>
  );
}

import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

import { BRAND } from "@/config/brand";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.APP_URL ?? "http://localhost:3000"),
  title: BRAND.name,
  description: BRAND.description,
  applicationName: BRAND.name,
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="es" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}

import type { ReactNode } from "react";
import { SiteFooter, SiteHeader } from "@/components/marketing/site-chrome";

/**
 * Las páginas públicas no leen la sesión: así se sirven prerenderizadas (rápidas y
 * cacheables). Quien ya ha iniciado sesión y pulsa «Entrar» es redirigido a su panel
 * por el proxy.
 */
export default function MarketingLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <SiteHeader />
      <main id="contenido">{children}</main>
      <SiteFooter />
    </>
  );
}

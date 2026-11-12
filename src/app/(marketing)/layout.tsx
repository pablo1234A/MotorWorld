import type { ReactNode } from "react";
import { SiteFooter, SiteHeader } from "@/components/marketing/site-chrome";
import { createClient } from "@/lib/supabase/server";

export default async function MarketingLayout({ children }: { children: ReactNode }) {
  let signedIn = false;
  try {
    const supabase = await createClient();
    // getSession solo lee la cookie: aquí únicamente decide qué botón mostrar, no autoriza nada.
    signedIn = Boolean((await supabase.auth.getSession()).data.session);
  } catch {
    signedIn = false;
  }
  return (
    <>
      <SiteHeader signedIn={signedIn} />
      <main id="contenido">{children}</main>
      <SiteFooter />
    </>
  );
}

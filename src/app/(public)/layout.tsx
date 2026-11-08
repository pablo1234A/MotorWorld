import type { ReactNode } from "react";

import { SiteFooter, SiteHeader } from "@/components/site/site-chrome";

export default function PublicLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <>
      <SiteHeader />
      <div className="flex flex-1 flex-col">{children}</div>
      <SiteFooter />
    </>
  );
}

import type { ReactNode } from "react";
export function AuthCard({ title, subtitle, children, footer }: { title: string; subtitle?: ReactNode; children: ReactNode; footer?: ReactNode }) {
  return (
    <>
      <div className="card p-6 sm:p-8">
        <h1 className="text-2xl font-semibold">{title}</h1>
        {subtitle ? <p className="mt-1.5 text-sm text-ink-500">{subtitle}</p> : null}
        <div className="mt-6">{children}</div>
      </div>
      {footer ? <div className="mt-5 text-center text-sm text-ink-600">{footer}</div> : null}
    </>
  );
}

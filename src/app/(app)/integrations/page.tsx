import { CheckCircle2, CircleDashed, ExternalLink } from "lucide-react";
import { Badge } from "@/components/ui";
import { integrationStatus } from "@/server/integrations";

export const metadata = { title: "Integraciones" };

export default function IntegrationsPage() {
  const list = integrationStatus();
  const groups = Array.from(new Set(list.map((i) => i.category)));
  return (
    <div className="mx-auto max-w-5xl px-5 pt-20 pb-16 lg:px-10 lg:pt-12">
      <header className="mb-8">
        <h1 className="text-[22px] font-semibold tracking-tight">Integraciones</h1>
        <p className="mt-1 max-w-2xl text-[13px] text-muted">
          Las claves se configuran como variables de entorno en el servidor (archivo <code className="font-mono text-fg">.env.local</code> o el panel de tu hosting) y nunca llegan al navegador. Una integración sin clave aparece como pendiente; no se simula.
        </p>
      </header>
      <div className="space-y-8">
        {groups.map((g) => (
          <section key={g}>
            <h2 className="mb-3 text-[11px] font-medium tracking-wide text-faint uppercase">{g}</h2>
            <ul className="grid gap-3 md:grid-cols-2">
              {list
                .filter((i) => i.category === g)
                .map((i) => (
                  <li key={i.id} className="rounded-xl border border-line bg-panel p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-2">
                        {i.configured ? <CheckCircle2 className="size-4 text-ok" /> : <CircleDashed className="size-4 text-faint" />}
                        <p className="text-[13px] font-medium">{i.name}</p>
                      </div>
                      {i.configured ? <Badge tone="ok">Activa</Badge> : <Badge>Pendiente</Badge>}
                    </div>
                    <p className="mt-2 text-[13px] text-muted">{i.description}</p>
                    {i.detail ? <p className="mt-1 text-xs text-faint">{i.detail}</p> : null}
                    <div className="mt-3 flex flex-wrap items-center gap-1.5">
                      {i.envVars.map((v) => (
                        <code key={v} className="rounded border border-line bg-bg px-1.5 py-0.5 font-mono text-[11px] text-muted">
                          {v}
                        </code>
                      ))}
                      <a href={i.docsUrl} target="_blank" rel="noopener noreferrer" className="ml-auto inline-flex items-center gap-1 text-xs text-muted hover:text-fg">
                        Documentación <ExternalLink className="size-3" />
                      </a>
                    </div>
                  </li>
                ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { Cookie, Lock, PenLine } from "lucide-react";
import { Alert, EmptyState } from "@/components/ui/feedback";
import { LinkButton } from "@/components/ui/button";
import { PageHeader, Panel } from "@/components/ui/layout";
import { BannerBuilder } from "@/components/app/banner-builder";
import { loadBannerData } from "@/lib/data/banner";
import { TAGGING_EXAMPLES } from "@/lib/cookie-banner";

export const metadata: Metadata = { title: "Banner de cookies" };

export default async function CookieBannerPage() {
  const data = await loadBannerData();
  return (
    <>
      <PageHeader
        title="Banner de cookies"
        description="Pide el consentimiento antes de activar la analítica, la publicidad o los contenidos de terceros. Se configura con las herramientas que indicaste en el formulario."
      />

      {data.state === "no_subscription" && (
        <Panel>
          <EmptyState
            icon={<Lock className="h-5 w-5" />}
            title="Incluido en las suscripciones"
            description="El banner de consentimiento está disponible en los planes Básico, Medium y Business, junto con las nuevas versiones de tus documentos."
            action={<LinkButton href="/precios">Ver planes</LinkButton>}
          />
        </Panel>
      )}

      {data.state === "needs_agency_plan" && (
        <Panel>
          <EmptyState
            icon={<Lock className="h-5 w-5" />}
            title="El banner de tus clientes está en el plan Agencia"
            description="Tu plan actual cubre tu propia web. Con el plan Agencia (49 €/mes) generas los documentos y el banner de cookies de todos tus clientes."
            action={<LinkButton href="/agencias-y-gestorias#planes">Ver el plan Agencia</LinkButton>}
          />
        </Panel>
      )}

      {data.state === "no_form" && (
        <Panel>
          <EmptyState
            icon={<PenLine className="h-5 w-5" />}
            title="Completa primero el formulario"
            description="El banner se configura con las herramientas de analítica, publicidad y contenidos que indiques en el apartado de cookies."
            action={<LinkButton href="/panel/generador">Ir al formulario</LinkButton>}
          />
        </Panel>
      )}

      {data.state === "ready" && data.categories.length === 0 && (
        <Panel>
          <EmptyState
            icon={<Cookie className="h-5 w-5" />}
            title="Según tus respuestas no necesitas banner de consentimiento"
            description="No has indicado herramientas que instalen cookies de analítica, publicidad o contenidos de terceros. Si añades alguna, actualiza el formulario y vuelve aquí."
            action={<LinkButton href="/panel/generador" variant="secondary">Revisar respuestas</LinkButton>}
          />
        </Panel>
      )}

      {data.state === "ready" && data.categories.length > 0 && (
        <div className="space-y-6">
          {data.hasCmp && (
            <Alert tone="info" title={`Indicaste que ya usas ${data.cmpName || "una herramienta de consentimiento"}`}>
              Puedes seguir usándola o sustituirla por este banner. No instales los dos a la vez.
            </Alert>
          )}
          {data.unclassified > 0 && (
            <Alert tone="warning" title="Hay cookies sin clasificar">
              Añadiste {data.unclassified === 1 ? "una cookie" : `${data.unclassified} cookies`} a mano. Si no son técnicas, marca sus scripts con la categoría que corresponda.
            </Alert>
          )}

          <Panel title="Categorías detectadas" description="Solo se piden las categorías que corresponden a tu web. Las cookies técnicas no necesitan consentimiento.">
            <ul className="divide-y divide-line">
              {data.categories.map((c) => (
                <li key={c.id} className="flex flex-wrap items-baseline justify-between gap-2 py-3 first:pt-0 last:pb-0">
                  <div>
                    <p className="font-medium text-ink">{c.label}</p>
                    <p className="text-sm text-muted">{c.description}</p>
                  </div>
                  <p className="text-sm text-ink-soft">{c.providers.join(", ")}</p>
                </li>
              ))}
            </ul>
          </Panel>

          <Panel title="Personaliza y copia el código">
            <BannerBuilder siteName={data.siteName} defaultPolicyUrl={data.defaultPolicyUrl} categories={data.categories} version={data.version} />
          </Panel>

          <Panel title="Cómo instalarlo" description="Tres cambios en la web. Si usas WordPress, un plugin de cabecera y pie (por ejemplo, «WPCode») permite pegar el código sin tocar el tema.">
            <ol className="space-y-6 text-[15px] text-ink-soft">
              <li>
                <p className="font-medium text-ink">1. Pega el código al principio del &lt;head&gt;</p>
                <p className="mt-1">Antes de cualquier otro script, para que nada se ejecute antes de la elección del visitante.</p>
              </li>
              <li>
                <p className="font-medium text-ink">2. Marca los scripts que necesitan consentimiento</p>
                <p className="mt-1">
                  Cambia <code className="rounded bg-sand px-1 text-[13px]">type</code> a <code className="rounded bg-sand px-1 text-[13px]">&quot;text/plain&quot;</code> y añade{" "}
                  <code className="rounded bg-sand px-1 text-[13px]">data-cookie-category</code> con <code className="rounded bg-sand px-1 text-[13px]">analitica</code>,{" "}
                  <code className="rounded bg-sand px-1 text-[13px]">publicitaria</code> o <code className="rounded bg-sand px-1 text-[13px]">preferencias</code>.
                </p>
                <div className="mt-3 space-y-3">
                  {TAGGING_EXAMPLES.map((ex) => (
                    <div key={ex.title} className="rounded-lg border border-line">
                      <p className="border-b border-line bg-sand/50 px-3 py-1.5 text-xs font-medium text-ink">{ex.title}</p>
                      <pre className="overflow-x-auto px-3 py-2 text-xs text-muted" tabIndex={0} aria-label={`${ex.title}: antes`}><code>{ex.before}</code></pre>
                      <pre className="overflow-x-auto border-t border-line px-3 py-2 text-xs text-ink" tabIndex={0} aria-label={`${ex.title}: después`}><code>{ex.after}</code></pre>
                    </div>
                  ))}
                </div>
                <p className="mt-2 text-sm text-muted">Si usas Google Analytics o Google Ads, el banner también actualiza el modo de consentimiento de Google.</p>
              </li>
              <li>
                <p className="font-medium text-ink">3. Añade un enlace para cambiar la elección</p>
                <p className="mt-1">
                  En el pie de página, junto a la política de cookies:{" "}
                  <code className="rounded bg-sand px-1 text-[13px]">&lt;a href=&quot;#&quot; data-cookie-settings&gt;Configurar cookies&lt;/a&gt;</code>. Retirar el consentimiento
                  debe ser tan fácil como darlo.
                </p>
              </li>
            </ol>
          </Panel>

          <p className="text-sm leading-relaxed text-muted">
            Comprueba después con las herramientas del navegador que no se instalan cookies no necesarias antes de aceptar. El banner ayuda a gestionar el consentimiento, pero su
            configuración y los textos deben revisarse junto con tu <Link href="/panel/documentos" className="text-link">política de cookies</Link>.
          </p>
        </div>
      )}
    </>
  );
}

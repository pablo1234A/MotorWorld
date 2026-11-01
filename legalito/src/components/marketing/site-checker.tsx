"use client";

import Link from "next/link";
import { useActionState } from "react";
import { AlertTriangle, ArrowRight, CheckCircle2, Info, Search, XCircle } from "lucide-react";
import { buttonClass } from "@/components/ui/button";
import { inputClass } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import { checkWebsite, type CheckerState } from "@/lib/actions/checker";
import type { Check } from "@/lib/checker/analyze";
import { cn } from "@/lib/cn";

const GROUPS: { id: Check["group"]; title: string }[] = [
  { id: "textos", title: "Textos legales" },
  { id: "cookies", title: "Cookies y consentimiento" },
  { id: "seguridad", title: "Seguridad y privacidad" },
];

const ICON = {
  ok: { Icon: CheckCircle2, cls: "text-success", label: "Correcto" },
  warn: { Icon: AlertTriangle, cls: "text-warning", label: "Revisar" },
  fail: { Icon: XCircle, cls: "text-danger", label: "Falta" },
  info: { Icon: Info, cls: "text-blue", label: "Información" },
} as const;

export function SiteChecker() {
  const [state, action] = useActionState<CheckerState, FormData>(checkWebsite, {});
  const r = state.report;
  const pct = r && r.total ? Math.round((r.passed / r.total) * 100) : 0;
  const failsTexts = r?.checks.some((c) => c.group === "textos" && c.status !== "ok" && c.status !== "info");
  const failsBanner = r?.checks.some((c) => c.id === "banner" && c.status === "fail");

  return (
    <div>
      <form action={action} className="mx-auto flex max-w-2xl flex-col gap-3 sm:flex-row" noValidate>
        <label htmlFor="url" className="sr-only">
          Dirección de la web
        </label>
        <input
          id="url"
          name="url"
          type="text"
          inputMode="url"
          autoComplete="url"
          placeholder="tuweb.es"
          required
          maxLength={300}
          aria-invalid={Boolean(state.error)}
          aria-describedby={state.error ? "url-error" : undefined}
          className={cn(inputClass, "h-12 flex-1 text-base")}
        />
        <SubmitButton size="lg" pendingLabel="Analizando…" className="h-12">
          <Search className="h-4 w-4" aria-hidden /> Comprobar gratis
        </SubmitButton>
      </form>
      {state.error && (
        <p id="url-error" role="alert" className="mx-auto mt-3 max-w-2xl rounded-lg border border-danger/25 bg-danger-bg px-3.5 py-2.5 text-sm text-danger">
          {state.error}
        </p>
      )}

      {r && (
        <section aria-labelledby="resultado" className="mx-auto mt-10 max-w-3xl animate-rise rounded-2xl border border-line bg-white p-6 shadow-[var(--shadow-lift)] sm:p-8">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-sm text-muted">Resultado para</p>
              <h2 id="resultado" className="text-xl font-semibold break-all text-navy-950">
                {r.host}
              </h2>
            </div>
            <p className="text-right">
              <span className="text-3xl font-semibold tabular-nums text-navy-950">
                {r.passed}/{r.total}
              </span>
              <span className="block text-xs text-muted">comprobaciones superadas</span>
            </p>
          </div>
          <div className="mt-4 h-2 overflow-hidden rounded-full bg-sand-200" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Comprobaciones superadas">
            <div className={cn("h-full rounded-full", pct >= 80 ? "bg-success" : pct >= 50 ? "bg-warning" : "bg-danger")} style={{ width: `${Math.max(pct, 3)}%` }} />
          </div>

          {GROUPS.map((g) => {
            const items = r.checks.filter((c) => c.group === g.id);
            if (!items.length) return null;
            return (
              <div key={g.id} className="mt-7">
                <h3 className="text-sm font-semibold text-ink">{g.title}</h3>
                <ul className="mt-3 divide-y divide-line rounded-xl border border-line">
                  {items.map((c) => {
                    const { Icon, cls, label } = ICON[c.status];
                    return (
                      <li key={c.id} className="flex gap-3 px-4 py-3">
                        <Icon className={cn("mt-0.5 h-5 w-5 shrink-0", cls)} aria-label={label} role="img" />
                        <div className="min-w-0">
                          <p className="font-medium text-ink">{c.title}</p>
                          <p className="mt-0.5 text-sm break-words text-muted">{c.detail}</p>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}

          <div className="mt-8 rounded-xl bg-blue-50 p-5">
            <p className="font-semibold text-navy-950">
              {failsTexts || failsBanner ? "Soluciónalo en unos minutos" : "¿Quieres tener tus textos siempre al día?"}
            </p>
            <p className="mt-1 text-[15px] text-ink-soft">
              {failsTexts
                ? "Responde un formulario sobre tu negocio y obtén tu aviso legal, tu política de privacidad y tu política de cookies, con vista previa gratis antes de pagar."
                : failsBanner
                  ? "Las suscripciones incluyen un banner de consentimiento configurado con las herramientas de tu web."
                  : "Con una suscripción recibes las nuevas versiones revisadas de tus documentos y un banner de cookies configurado para tu web."}
            </p>
            <div className="mt-4 flex flex-col gap-3 sm:flex-row">
              <Link href="/registro" className={buttonClass("primary", "md")}>
                Crear mis documentos <ArrowRight className="h-4 w-4" aria-hidden />
              </Link>
              <Link href="/agencias-y-gestorias" className={buttonClass("secondary", "md")}>
                Soy agencia o gestoría
              </Link>
            </div>
          </div>
          <p className="mt-5 text-xs leading-relaxed text-subtle">
            Comprobación automática y orientativa de la portada y de las páginas legales enlazadas. No revisa el contenido jurídico ni garantiza el cumplimiento normativo. No
            guardamos la dirección analizada.
          </p>
        </section>
      )}
    </div>
  );
}

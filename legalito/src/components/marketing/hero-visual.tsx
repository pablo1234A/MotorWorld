import { Check, Cookie, Download, FileCode2 } from "lucide-react";

/**
 * Composición del producto para la portada: una pregunta del formulario y el
 * documento que resulta de ella, con texto real (no barras de relleno).
 * Ilustración decorativa: se oculta a los lectores de pantalla.
 */
export function HeroVisual() {
  return (
    <div className="relative mx-auto w-full max-w-[540px] lg:mx-0" aria-hidden="true">
      {/* Ventana de la aplicación */}
      <div className="overflow-hidden rounded-2xl border border-line bg-white shadow-[0_30px_80px_-30px_rgb(15_30_51/0.35),0_2px_6px_rgb(15_30_51/0.06)]">
        <div className="flex items-center gap-2 border-b border-line bg-sand/50 px-4 py-2.5">
          <span className="h-2.5 w-2.5 rounded-full bg-line-strong" />
          <span className="h-2.5 w-2.5 rounded-full bg-line-strong" />
          <span className="h-2.5 w-2.5 rounded-full bg-line-strong" />
          <span className="ml-3 rounded-md bg-white px-2.5 py-0.5 text-[11px] text-subtle ring-1 ring-line">legalito.es/panel/documentos</span>
        </div>

        <div className="grid gap-0 sm:grid-cols-[0.95fr_1.05fr]">
          {/* Pregunta del formulario */}
          <div className="border-b border-line p-5 sm:border-r sm:border-b-0">
            <p className="text-[11px] font-medium text-blue">Paso 6 de 7 · Analítica y cookies</p>
            <div className="mt-2 h-1 overflow-hidden rounded-full bg-sand-200">
              <div className="h-full w-[82%] rounded-full bg-blue" />
            </div>
            <p className="mt-4 text-[13.5px] leading-snug font-semibold text-navy-950">¿Usas alguna herramienta de analítica web?</p>
            <div className="mt-3 space-y-1.5 text-[12.5px]">
              {[
                { l: "No uso analítica", on: false },
                { l: "Google Analytics", on: true },
                { l: "Matomo", on: false },
              ].map((o) => (
                <div key={o.l} className={o.on ? "flex items-center gap-2 rounded-lg border border-blue bg-blue-50 px-2.5 py-1.5 text-navy ring-1 ring-blue" : "flex items-center gap-2 rounded-lg border border-line px-2.5 py-1.5 text-ink-soft"}>
                  <span className={o.on ? "flex h-3.5 w-3.5 items-center justify-center rounded-full border-4 border-navy bg-white" : "h-3.5 w-3.5 rounded-full border border-line-strong"} />
                  {o.l}
                </div>
              ))}
            </div>
          </div>

          {/* Documento resultante */}
          <div className="bg-canvas p-5">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-[12px] font-semibold text-navy">
                <Cookie className="h-3.5 w-3.5" /> Política de cookies
              </span>
              <span className="rounded-md bg-success-bg px-1.5 py-0.5 text-[10px] font-medium text-success">Generado</span>
            </div>
            <p className="mt-3 text-[11.5px] font-semibold text-navy-950">2. Cookies que utiliza este sitio web</p>
            <div className="mt-2 overflow-hidden rounded-md border border-line bg-white text-[10.5px]">
              <div className="grid grid-cols-[1fr_1.3fr_0.9fr] bg-sand px-2 py-1 font-medium text-navy">
                <span>Cookie</span>
                <span>Finalidad</span>
                <span>Duración</span>
              </div>
              {[
                ["_ga", "Estadísticas de uso", "2 años"],
                ["_ga_<ID>", "Estado de la sesión", "2 años"],
                ["Sesión", "Inicio de sesión", "Sesión"],
              ].map((r) => (
                <div key={r[0]} className="grid grid-cols-[1fr_1.3fr_0.9fr] border-t border-line px-2 py-1 text-ink-soft">
                  <span className="font-mono text-navy">{r[0]}</span>
                  <span>{r[1]}</span>
                  <span>{r[2]}</span>
                </div>
              ))}
            </div>
            <p className="mt-3 text-[11.5px] font-semibold text-navy-950">3. Consentimiento</p>
            <p className="mt-1 text-[10.5px] leading-relaxed text-muted">Las cookies analíticas solo se instalan si las aceptas en el panel de configuración…</p>
            <div className="mt-4 flex gap-1.5">
              <span className="inline-flex items-center gap-1 rounded-md bg-navy px-2 py-1 text-[10.5px] font-medium text-white">
                <Download className="h-3 w-3" /> PDF
              </span>
              <span className="inline-flex items-center gap-1 rounded-md border border-line-strong bg-white px-2 py-1 text-[10.5px] font-medium text-navy">
                <FileCode2 className="h-3 w-3" /> HTML
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Tarjeta flotante: los tres documentos */}
      <div className="absolute -bottom-10 -left-3 hidden w-56 rounded-xl border border-line bg-white p-3.5 shadow-[var(--shadow-lift)] sm:block lg:-left-10">
        <p className="text-[11px] font-medium text-subtle">Tus documentos</p>
        <ul className="mt-2 space-y-1.5 text-[12.5px]">
          {["Aviso legal", "Política de privacidad", "Política de cookies"].map((d) => (
            <li key={d} className="flex items-center justify-between">
              <span className="text-ink">{d}</span>
              <span className="flex h-4 w-4 items-center justify-center rounded-full bg-success-bg">
                <Check className="h-3 w-3 text-success" />
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

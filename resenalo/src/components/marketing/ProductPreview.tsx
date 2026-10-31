import { CheckCircle2, Clock3, Mail, Send, Users } from "lucide-react";
import { StarMark } from "@/components/brand/Logo";

/**
 * Composición visual del producto para la landing. Es una ilustración
 * construida con los mismos componentes del panel; los datos son de ejemplo
 * y se etiquetan como tales.
 */
export function HeroComposition() {
  return (
    <div className="relative mx-auto w-full max-w-[560px]" aria-label="Ilustración del panel de Reseñalo con datos de ejemplo" role="img">
      {/* Panel */}
      <div className="card overflow-hidden">
        <div className="flex items-center gap-1.5 border-b border-ink-100 bg-cream-50 px-4 py-2.5">
          <span className="h-2.5 w-2.5 rounded-full bg-ink-200" />
          <span className="h-2.5 w-2.5 rounded-full bg-ink-200" />
          <span className="h-2.5 w-2.5 rounded-full bg-ink-200" />
          <span className="ml-3 text-[11px] font-medium text-ink-400">app.resenalo · Inicio</span>
        </div>
        <div className="p-4 sm:p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[11px] font-medium uppercase tracking-wider text-ink-400">Este mes</p>
              <p className="mt-0.5 font-display text-lg font-semibold">Clínica Dental Sonrisa</p>
            </div>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-ok-50 px-2.5 py-1 text-[11px] font-medium text-ok-700">
              <span className="h-1.5 w-1.5 rounded-full bg-current" /> Automatización activa
            </span>
          </div>
          <div className="mt-4 grid grid-cols-3 gap-2.5">
            {[
              { l: "Enviados", v: "42" },
              { l: "Pendientes", v: "6" },
              { l: "Disponibles", v: "22" },
            ].map((s) => (
              <div key={s.l} className="rounded-lg border border-ink-100 bg-white p-3">
                <p className="text-[11px] text-ink-500">{s.l}</p>
                <p className="mt-1 font-display text-xl font-semibold tabular-nums">{s.v}</p>
              </div>
            ))}
          </div>
          <div className="mt-3 rounded-lg border border-ink-100 p-3">
            <div className="flex items-center justify-between text-[11px] text-ink-500">
              <span>Consumo del plan Pro</span>
              <span className="tabular-nums">42 / 70</span>
            </div>
            <div className="mt-2 h-1.5 rounded-full bg-ink-100">
              <div className="h-full w-[60%] rounded-full bg-ink-800" />
            </div>
          </div>
          <ul className="mt-3 divide-y divide-ink-100 rounded-lg border border-ink-100">
            {[
              { n: "Laura Martín", s: "Limpieza dental", st: "Enviado", ok: true },
              { n: "Javier Ortega", s: "Revisión anual", st: "Programado · 18:00", ok: false },
              { n: "Carmen Ruiz", s: "Ortodoncia", st: "Enviado", ok: true },
            ].map((r) => (
              <li key={r.n} className="flex items-center justify-between gap-3 px-3 py-2.5">
                <div className="min-w-0">
                  <p className="truncate text-[13px] font-medium">{r.n}</p>
                  <p className="truncate text-[11px] text-ink-500">{r.s}</p>
                </div>
                <span className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${r.ok ? "bg-ok-50 text-ok-700" : "bg-info-50 text-info-700"}`}>
                  {r.ok ? <CheckCircle2 className="h-3 w-3" /> : <Clock3 className="h-3 w-3" />}
                  {r.st}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* Correo recibido por el cliente */}
      <div className="card absolute -bottom-20 -left-4 hidden w-[270px] p-4 shadow-pop sm:block lg:-left-12">
        <div className="flex items-center gap-2 text-[11px] text-ink-500">
          <Mail className="h-3.5 w-3.5" /> Bandeja de entrada de Laura
        </div>
        <p className="mt-2 text-[13px] font-semibold">¿Qué te ha parecido nuestro servicio?</p>
        <p className="mt-1 text-[12px] leading-relaxed text-ink-600">Hola Laura, desde Clínica Dental Sonrisa queremos agradecerte tu confianza…</p>
        <span className="mt-3 inline-flex items-center gap-1.5 rounded-md bg-ink-800 px-3 py-1.5 text-[12px] font-semibold text-white">
          <StarMark className="h-3.5 w-3.5" /> Dejar mi opinión
        </span>
      </div>
      <p className="mt-4 text-center text-[11px] text-ink-400 sm:mt-3 sm:pl-[260px] sm:text-right">Ilustración con datos de ejemplo</p>
      <div className="hidden h-16 sm:block" aria-hidden />
    </div>
  );
}

export function DashboardShowcase() {
  const bars = [3, 5, 2, 6, 4, 7, 5, 8, 6, 4, 7, 9, 6, 5];
  return (
    <div className="card overflow-hidden" role="img" aria-label="Vista del panel de estadísticas con datos de ejemplo">
      <div className="grid md:grid-cols-[200px_1fr]">
        <aside className="hidden border-r border-ink-100 bg-cream-50 p-4 md:block">
          <div className="mb-5 flex items-center gap-1.5">
            <StarMark className="h-4 w-4" />
            <span className="font-display text-sm font-extrabold">Reseñalo</span>
          </div>
          {["Inicio", "Clientes", "Automatizaciones", "Plantillas", "Historial", "Estadísticas"].map((s, i) => (
            <p key={s} className={`mb-1 rounded-md px-2.5 py-1.5 text-[12px] ${i === 5 ? "bg-white font-semibold shadow-card" : "text-ink-500"}`}>
              {s}
            </p>
          ))}
        </aside>
        <div className="p-4 sm:p-6">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div>
              <p className="font-display text-lg font-semibold">Estadísticas</p>
              <p className="text-[12px] text-ink-500">Últimos 14 días</p>
            </div>
            <div className="flex gap-2 text-[11px]">
              <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm bg-ink-800" />Enviados</span>
              <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm bg-star-300" />Clics en el enlace</span>
            </div>
          </div>
          <div className="mt-5 flex h-40 items-end gap-1.5 border-b border-ink-100 sm:gap-2.5">
            {bars.map((b, i) => (
              <div key={i} className="flex flex-1 items-end gap-0.5">
                <div className="flex-1 rounded-t-sm bg-ink-800" style={{ height: `${b * 15}px` }} />
                <div className="flex-1 rounded-t-sm bg-star-300" style={{ height: `${Math.max(1, Math.round(b * 0.45)) * 15}px` }} />
              </div>
            ))}
          </div>
          <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              { i: Send, l: "Enviados", v: "86" },
              { i: Clock3, l: "Pendientes", v: "5" },
              { i: Users, l: "Clics", v: "37" },
              { i: CheckCircle2, l: "Fallidos", v: "1" },
            ].map((s) => (
              <div key={s.l} className="rounded-lg border border-ink-100 p-3">
                <div className="flex items-center gap-1.5 text-[11px] text-ink-500">
                  <s.i className="h-3.5 w-3.5" /> {s.l}
                </div>
                <p className="mt-1 font-display text-lg font-semibold tabular-nums">{s.v}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

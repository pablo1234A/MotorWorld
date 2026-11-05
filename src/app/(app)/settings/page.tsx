import { aiEnabled, MODEL } from "@/ai/claude";
import { getCurrentUser } from "@/server/auth";

export const metadata = { title: "Ajustes" };

export default async function SettingsPage() {
  const user = (await getCurrentUser())!;
  const rows: Array<[string, string]> = [
    ["Nombre", user.name],
    ["Email", user.email],
    ["Motor de IA", aiEnabled() ? `Claude Opus 5.5 (${MODEL})` : "Motor local determinista: falta ANTHROPIC_API_KEY"],
    ["Base de datos", process.env.DATABASE_URL ? "Postgres (DATABASE_URL)" : "PGlite embebido (.data/pglite)"],
    ["Almacenamiento", "Disco local (UPLOAD_DIR)"],
    ["URL pública", process.env.APP_URL || "Se deduce de cada petición (configura APP_URL en producción)"],
  ];
  return (
    <div className="mx-auto max-w-3xl px-5 pt-20 pb-16 lg:px-10 lg:pt-12">
      <h1 className="text-[22px] font-semibold tracking-tight">Ajustes</h1>
      <p className="mt-1 text-[13px] text-muted">Tu cuenta y la configuración de esta instancia de World Builder AI.</p>
      <dl className="mt-8 divide-y divide-line rounded-xl border border-line bg-panel">
        {rows.map(([k, v]) => (
          <div key={k} className="grid gap-1 px-4 py-3 sm:grid-cols-[180px_1fr]">
            <dt className="text-[13px] text-muted">{k}</dt>
            <dd className="text-[13px]">{v}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-6 text-xs text-faint">El modelo se fija con WB_MODEL (por defecto claude-opus-5-5). Si la API rechaza una petición por políticas, se reintenta automáticamente en el modelo de respaldo que recomienda Anthropic y el editor indica qué motor produjo cada cambio.</p>
    </div>
  );
}

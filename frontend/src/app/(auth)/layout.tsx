import Link from "next/link";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[1.1fr_1fr]">
      <div className="grain relative hidden overflow-hidden border-r border-line lg:block">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_20%_10%,#ff5a3626,transparent_55%),radial-gradient(ellipse_at_90%_90%,#ffb54714,transparent_50%)]" />
        <div className="absolute inset-x-12 top-1/2 -translate-y-1/2">
          <p className="mb-6 font-mono text-[11px] tracking-[0.25em] text-accent uppercase">● REC — Estudio audiovisual IA</p>
          <h1 className="display text-[64px] leading-[0.98]">
            De una idea
            <br />
            <em className="text-muted">a la sala de montaje.</em>
          </h1>
          <p className="mt-6 max-w-md text-[15px] leading-relaxed text-muted">
            Imagen, vídeo, guion, personajes, sonido y montaje en un solo estudio. Elige el mejor modelo para cada plano y cambia de proveedor sin rehacer tu trabajo.
          </p>
          <div className="mt-10 grid max-w-md grid-cols-3 gap-px overflow-hidden rounded-xl border border-line bg-line font-mono text-[11px] text-muted">
            {["FLUX · Kling · Veo", "Wan · LTX · Hunyuan", "FFmpeg · OTIO"].map((t) => (
              <div key={t} className="bg-panel/80 px-3 py-3">{t}</div>
            ))}
          </div>
        </div>
        <div className="absolute right-12 bottom-8 left-12 flex justify-between font-mono text-[10px] text-dim">
          <span>TC 00:00:00:00</span>
          <span>24 FPS · 2.39:1</span>
        </div>
      </div>
      <div className="flex flex-col px-6 py-8 sm:px-12">
        <Link href="/" className="mb-auto flex items-center gap-2.5">
          <span className="relative grid h-8 w-8 place-items-center rounded-[10px] border border-line-2 bg-panel-2">
            <span className="h-3 w-3 rounded-full border-[2.5px] border-accent" />
          </span>
          <span className="text-[14px] font-semibold">MotorWorld <span className="display font-normal text-muted italic">Studio</span></span>
        </Link>
        <div className="mx-auto my-12 w-full max-w-sm">{children}</div>
        <div className="mt-auto flex gap-4 text-[12px] text-dim">
          <Link href="/legal/privacy" className="hover:text-muted">Privacidad</Link>
          <Link href="/legal/terms" className="hover:text-muted">Condiciones</Link>
        </div>
      </div>
    </div>
  );
}

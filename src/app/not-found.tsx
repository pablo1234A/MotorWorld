import { ButtonLink } from "@/components/ui/button";
import { Logo } from "@/components/logo";

export default function NotFound() {
  return (
    <main id="contenido" className="flex min-h-dvh flex-col items-center justify-center px-6 text-center">
      <Logo />
      <p className="mt-10 font-display text-7xl font-bold text-brand">404</p>
      <h1 className="mt-3 text-2xl font-semibold">Esta página no existe</h1>
      <p className="mt-2 max-w-sm text-sm text-muted">Puede que el enlace esté incompleto o que el contenido se haya eliminado.</p>
      <div className="mt-6 flex gap-2">
        <ButtonLink href="/">Volver al inicio</ButtonLink>
        <ButtonLink href="/app" variant="secondary">
          Ir a mi panel
        </ButtonLink>
      </div>
    </main>
  );
}

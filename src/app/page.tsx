import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, Code2, Globe, Layers, MessageSquare, ShieldCheck, Sparkles } from "lucide-react";
import { getCurrentUser } from "@/server/auth";
import { Logo } from "@/components/logo";

export default async function Landing() {
  if (await getCurrentUser()) redirect("/dashboard");
  const features = [
    { icon: Sparkles, title: "Del brief a la web", text: "Analiza tu negocio, planifica páginas y elige una dirección de arte propia en lugar de rellenar una plantilla." },
    { icon: MessageSquare, title: "Edita conversando", text: "«Haz este hero más premium, fondo oscuro». La IA cambia solo lo que pides, sin romper el resto." },
    { icon: Layers, title: "Editor visual real", text: "Capas, propiedades, tipografía, color, responsive y animaciones. Doble clic para editar cualquier texto." },
    { icon: ShieldCheck, title: "QA antes de publicar", text: "Enlaces, contraste, SEO, formularios y contenido de ejemplo: se revisan y se corrigen automáticamente." },
    { icon: Globe, title: "Publica en un clic", text: "Alojamiento integrado, despliegue en Vercel o ZIP estático para cualquier hosting." },
    { icon: Code2, title: "El código es tuyo", text: "Exporta HTML, CSS y JS limpios, sin dependencias ni CDNs de terceros." },
  ];
  return (
    <div className="min-h-dvh">
      <header className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5">
        <Logo />
        <nav className="flex items-center gap-2">
          <Link href="/login" className="press rounded-lg px-3 py-1.5 text-[13px] text-muted hover:text-fg">
            Entrar
          </Link>
          <Link href="/register" className="press rounded-lg bg-fg px-3 py-1.5 text-[13px] font-medium text-bg hover:bg-white">
            Crear cuenta
          </Link>
        </nav>
      </header>
      <main>
        <section className="mx-auto max-w-6xl px-5 pt-20 pb-16 sm:pt-28">
          <p className="mb-5 inline-flex items-center gap-2 rounded-full border border-line px-3 py-1 text-xs text-muted">
            <span className="size-1.5 rounded-full bg-accent" /> Construido sobre Claude Opus 5.5
          </p>
          <h1 className="max-w-4xl text-[clamp(2.4rem,6vw,4.6rem)] leading-[1.02] font-semibold tracking-[-0.035em] text-balance">Describe tu negocio. Recibe una web que parece hecha por un estudio.</h1>
          <p className="mt-6 max-w-xl text-[17px] leading-relaxed text-muted">World Builder AI diseña, escribe, revisa y publica sitios completos: tiendas, restaurantes, SaaS, portfolios, concesionarios y experiencias 3D. Después los editas a mano o conversando.</p>
          <div className="mt-9 flex flex-wrap gap-3">
            <Link href="/register" className="press inline-flex h-11 items-center gap-2 rounded-xl bg-accent px-5 text-sm font-medium text-white hover:bg-accent-hover">
              Empezar gratis <ArrowRight className="size-4" />
            </Link>
            <Link href="/login" className="press inline-flex h-11 items-center rounded-xl border border-line px-5 text-sm text-fg hover:bg-elev">
              Ya tengo cuenta
            </Link>
          </div>
        </section>
        <section className="mx-auto max-w-6xl px-5 pb-28">
          <ul className="grid gap-px overflow-hidden rounded-2xl border border-line bg-line sm:grid-cols-2 lg:grid-cols-3">
            {features.map(({ icon: Icon, title, text }) => (
              <li key={title} className="bg-panel p-6">
                <Icon className="size-5 text-accent" strokeWidth={1.75} />
                <h2 className="mt-4 text-[15px] font-medium">{title}</h2>
                <p className="mt-1.5 text-[13px] leading-relaxed text-muted">{text}</p>
              </li>
            ))}
          </ul>
        </section>
      </main>
      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-6xl flex-wrap justify-between gap-2 px-5 py-6 text-xs text-faint">
          <span>World Builder AI</span>
          <span>Tus proyectos, tu base de datos, tu código.</span>
        </div>
      </footer>
    </div>
  );
}

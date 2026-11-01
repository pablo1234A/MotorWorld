import Link from "next/link";
import { Alert } from "@/components/ui/feedback";
import { Logo } from "@/components/ui/logo";

/** Se muestra cuando falta configuración de servicios: nunca se simula su funcionamiento. */
export function NotConfigured({ service = "Supabase" }: { service?: string }) {
  return (
    <main id="contenido" className="mx-auto flex w-full max-w-lg flex-1 flex-col justify-center px-4 py-16">
      <Logo />
      <h1 className="mt-8 text-2xl font-semibold">Servicio no configurado</h1>
      <Alert tone="warning" className="mt-4" title={`${service} no está configurado en este entorno`}>
        El área privada necesita las variables de entorno de {service}. Consulta <code>docs/SUPABASE.md</code> y <code>.env.example</code>.
      </Alert>
      <Link href="/" className="mt-6 text-sm font-medium text-blue hover:underline">
        Volver al inicio
      </Link>
    </main>
  );
}

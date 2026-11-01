import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader, Panel } from "@/components/ui/layout";
import { BusinessForm, DeletionForm, EmailForm, ProfileForm } from "@/components/app/account-forms";
import { getProfile, requireOrganization } from "@/lib/auth";

export const metadata: Metadata = { title: "Mis datos" };

export default async function AccountPage() {
  const { user, org } = await requireOrganization();
  const profile = await getProfile();
  return (
    <>
      <PageHeader title="Mis datos" description="Gestiona los datos de tu negocio, tu cuenta y tus preferencias de comunicación." />
      <div className="space-y-6">
        <Panel title="Datos del negocio" description="Se usan para precargar el formulario. Para aplicarlos a tus documentos, revisa el formulario y regenera.">
          <BusinessForm org={org} />
          <p className="mt-4 text-sm text-muted">
            ¿Quieres actualizar también tus documentos? <Link href="/panel/generador" className="font-medium text-blue hover:underline">Revisa tus respuestas</Link>.
          </p>
        </Panel>
        {profile && (
          <Panel title="Perfil y comunicaciones">
            <ProfileForm profile={profile} />
          </Panel>
        )}
        <div className="grid gap-6 md:grid-cols-2">
          <Panel title="Email de acceso">
            <EmailForm email={user.email} />
          </Panel>
          <Panel title="Contraseña">
            <p className="text-sm text-muted">Te enviaremos un enlace para establecer una nueva contraseña.</p>
            <Link href="/recuperar" className="mt-4 inline-block text-sm font-medium text-blue hover:underline">
              Cambiar contraseña
            </Link>
          </Panel>
        </div>
        <Panel title="Supresión de la cuenta">
          <DeletionForm />
        </Panel>
      </div>
    </>
  );
}

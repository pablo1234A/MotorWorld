import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader, Panel } from "@/components/ui/layout";
import { BusinessForm, DeletionForm, EmailForm, ProfileForm } from "@/components/app/account-forms";
import { getProfile, requireOrganization } from "@/lib/auth";
import { accountLabel } from "@/lib/accounts";

export const metadata: Metadata = { title: "Mis datos" };

export default async function AccountPage() {
  const { user, org, account } = await requireOrganization();
  const profile = await getProfile();
  if (org.id !== account.root.id) {
    // Cliente de una agencia: solo sus datos de negocio; la cuenta y la facturación son de la agencia.
    return (
      <>
        <PageHeader title={`Datos de ${accountLabel(org)}`} description="Datos del negocio de este cliente. Se usan para precargar su formulario." />
        <Panel title="Datos del negocio" description="Para aplicarlos a sus documentos, revisa su formulario y regenera.">
          <BusinessForm org={org} />
          <p className="mt-4 text-sm text-muted">
            ¿Quieres actualizar también sus documentos? <Link href="/panel/generador" className="text-link">Revisa sus respuestas</Link>.
          </p>
        </Panel>
        <p className="mt-6 text-sm text-muted">
          Tu perfil, tu email de acceso y la supresión de la cuenta están en la cuenta principal. <Link href="/panel/clientes" className="text-link">Ir a clientes</Link>
        </p>
      </>
    );
  }
  return (
    <>
      <PageHeader title="Mis datos" description="Gestiona los datos de tu negocio, tu cuenta y tus preferencias de comunicación." />
      <div className="space-y-6">
        <Panel title="Datos del negocio" description="Se usan para precargar el formulario. Para aplicarlos a tus documentos, revisa el formulario y regenera.">
          <BusinessForm org={org} />
          <p className="mt-4 text-sm text-muted">
            ¿Quieres actualizar también tus documentos? <Link href="/panel/generador" className="text-link">Revisa tus respuestas</Link>.
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
            <Link href="/recuperar" className="mt-4 inline-block text-sm text-link">
              Cambiar contraseña
            </Link>
          </Panel>
        </div>
        {!account.isAgency && (
          <Panel title="¿Eres agencia web o gestoría?" description="Gestiona los textos legales de las webs de tus clientes desde esta misma cuenta.">
            <Link href="/panel/clientes" className="text-sm text-link">Conocer el modo agencia</Link>
          </Panel>
        )}
        <Panel title="Supresión de la cuenta">
          <DeletionForm />
        </Panel>
      </div>
    </>
  );
}

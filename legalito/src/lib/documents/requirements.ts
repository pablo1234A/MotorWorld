import type { DocumentContext } from "./context";

/**
 * Acciones que el cliente debe realizar además de publicar sus documentos.
 * Legalito no presenta los documentos como garantía de cumplimiento: esta lista
 * explica lo que un PDF no resuelve por sí solo.
 */
export interface Requirement {
  id: string;
  severity: "critical" | "recommended" | "info";
  title: string;
  detail: string;
}

export function computeRequirements(ctx: DocumentContext): Requirement[] {
  const out: Requirement[] = [
    {
      id: "publish_links",
      severity: "info",
      title: "Enlaza tus documentos en todas las páginas",
      detail: "Añade enlaces al aviso legal, la política de privacidad y la política de cookies en el pie de página de tu web, visibles en todo momento.",
    },
  ];

  if (ctx.cookies.has_nonessential && !ctx.cookies.has_cmp) {
    out.push({
      id: "install_cmp",
      severity: "critical",
      title: "Instala un sistema de gestión del consentimiento",
      detail: "Tu web usa cookies que necesitan consentimiento previo. Debes instalar un banner o gestor que bloquee esas cookies hasta que el usuario acepte, con opción de rechazar tan accesible como la de aceptar.",
    });
  }
  if (ctx.cookies.has_nonessential && ctx.cookies.has_cmp) {
    out.push({
      id: "verify_cmp",
      severity: "recommended",
      title: `Comprueba la configuración de ${ctx.cookies.cmp_name || "tu gestor de consentimiento"}`,
      detail: "Verifica que las cookies no necesarias no se instalan antes del consentimiento y que rechazar es tan sencillo como aceptar.",
    });
  }
  if (ctx.cookies.has_nonessential || ctx.cookies.uses_analytics) {
    out.push({
      id: "scan_cookies",
      severity: "recommended",
      title: "Verifica tus cookies con un escaneo",
      detail: "La tabla de cookies se elabora a partir de las herramientas que has indicado. Contrástala con un escaneo real de tu web y añade las que falten.",
    });
  }
  if (ctx.business.is_ecommerce) {
    out.push({
      id: "terms_of_sale",
      severity: "critical",
      title: "Necesitas condiciones generales de contratación",
      detail: "Una tienda online necesita condiciones de venta (precios, envíos, derecho de desistimiento, garantías). Legalito todavía no genera este documento.",
    });
  }
  if (ctx.data.contact_form || ctx.data.newsletter || ctx.data.accounts || ctx.data.bookings || ctx.data.job_applications) {
    out.push({
      id: "form_first_layer",
      severity: "recommended",
      title: "Informa en tus formularios",
      detail: "Junto a cada formulario incluye un texto breve con el responsable, la finalidad, tus derechos y un enlace a la política de privacidad.",
    });
  }
  if (ctx.data.newsletter) {
    out.push({
      id: "newsletter_consent",
      severity: "critical",
      title: "Recoge el consentimiento para la newsletter",
      detail: "Las comunicaciones comerciales por email requieren consentimiento previo y expreso (por ejemplo, una casilla sin marcar) y una forma sencilla de darse de baja en cada envío.",
    });
  }
  if (ctx.processors.length > 0) {
    out.push({
      id: "dpa_contracts",
      severity: "recommended",
      title: "Formaliza los contratos con tus proveedores",
      detail: "Los proveedores que tratan datos por tu cuenta (hosting, email, pagos…) deben tener firmado un contrato de encargo del tratamiento. La mayoría lo ofrece en sus condiciones.",
    });
  }
  if (ctx.data.special_categories || ctx.data.minors) {
    out.push({
      id: "professional_review",
      severity: "critical",
      title: "Revisión profesional recomendada",
      detail: "Tratas datos especialmente protegidos o de menores. Estos tratamientos exigen garantías adicionales y, en algunos casos, una evaluación de impacto. Consulta con un profesional.",
    });
  }
  return out;
}

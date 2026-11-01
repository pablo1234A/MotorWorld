import { escapeHtml } from "@/lib/documents/html";

/**
 * Plantillas de email transaccional con la identidad visual de Legalito.
 * Funciones puras: devuelven asunto, HTML y texto plano.
 */
export interface EmailContent {
  subject: string;
  html: string;
  text: string;
}

interface LayoutInput {
  preheader: string;
  heading: string;
  paragraphs: string[];
  cta?: { label: string; url: string };
  footnote?: string;
  siteUrl: string;
}

const C = { navy: "#1F3A5F", blue: "#2F5D8C", sand: "#F4F1EA", text: "#1d2533", muted: "#5f6b7a" };

function layout(i: LayoutInput): { html: string; text: string } {
  const ps = i.paragraphs
    .map((p) => `<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:${C.text}">${escapeHtml(p)}</p>`)
    .join("");
  const cta = i.cta
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 24px"><tr><td style="border-radius:8px;background:${C.navy}">
         <a href="${escapeHtml(i.cta.url)}" style="display:inline-block;padding:12px 22px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:8px">${escapeHtml(i.cta.label)}</a>
       </td></tr></table>`
    : "";
  const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(i.heading)}</title></head>
<body style="margin:0;padding:0;background:${C.sand};font-family:Inter,-apple-system,'Segoe UI',Roboto,Arial,sans-serif">
<span style="display:none;max-height:0;overflow:hidden;opacity:0">${escapeHtml(i.preheader)}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.sand};padding:32px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px">
<tr><td style="padding:0 4px 20px">
  <table role="presentation" cellpadding="0" cellspacing="0"><tr>
    <td style="width:28px;height:28px;background:${C.navy};border-radius:7px;text-align:center;vertical-align:middle;color:#fff;font-size:15px;font-weight:700">&#10003;</td>
    <td style="padding-left:10px;font-size:18px;font-weight:700;color:${C.navy};letter-spacing:-.01em">Legalito</td>
  </tr></table>
</td></tr>
<tr><td style="background:#ffffff;border-radius:14px;padding:32px 28px;border:1px solid #e6e1d6">
  <h1 style="margin:0 0 18px;font-size:22px;line-height:1.3;color:${C.navy}">${escapeHtml(i.heading)}</h1>
  ${ps}${cta}
  ${i.footnote ? `<p style="margin:0;font-size:13px;line-height:1.5;color:${C.muted}">${escapeHtml(i.footnote)}</p>` : ""}
</td></tr>
<tr><td style="padding:20px 8px;font-size:12px;line-height:1.5;color:${C.muted};text-align:center">
  Legalito · Documentos legales para tu web<br>
  Has recibido este email porque tienes una cuenta en Legalito. <a href="${escapeHtml(i.siteUrl)}/panel/datos" style="color:${C.blue}">Preferencias de comunicación</a>
</td></tr>
</table></td></tr></table></body></html>`;
  const text = [i.heading, "", ...i.paragraphs, ...(i.cta ? ["", `${i.cta.label}: ${i.cta.url}`] : []), ...(i.footnote ? ["", i.footnote] : []), "", "— Legalito"].join("\n");
  return { html, text };
}

export type EmailTemplate =
  | { template: "welcome"; data: { name?: string | null } }
  | { template: "purchase_confirmed"; data: { productName: string; amount: string } }
  | { template: "subscription_activated"; data: { productName: string; amount: string } }
  | { template: "subscription_cancel_scheduled"; data: { endDate: string } }
  | { template: "subscription_ended"; data: Record<string, never> }
  | { template: "renewal_reminder"; data: { date: string; amount: string } }
  | { template: "payment_failed"; data: { amount: string; attempt: number; nextAttempt?: string | null } }
  | { template: "documents_ready"; data: { documents: string[]; isDemo: boolean } }
  | { template: "legal_update"; data: { title: string; summary: string } }
  | { template: "support_received"; data: { subject: string } }
  | { template: "support_notification"; data: { subject: string; from: string; message: string } };

export function renderEmail(t: EmailTemplate, siteUrl: string): EmailContent {
  const panel = `${siteUrl}/panel`;
  switch (t.template) {
    case "welcome": {
      const l = layout({
        siteUrl,
        preheader: "Tu cuenta está lista. Prepara tus documentos legales en unos minutos.",
        heading: t.data.name ? `Hola, ${t.data.name}` : "Te damos la bienvenida a Legalito",
        paragraphs: [
          "Tu cuenta ya está verificada. Desde tu panel puedes responder el formulario sobre tu negocio y ver una vista previa de tu aviso legal, tu política de privacidad y tu política de cookies.",
          "Puedes dejar el formulario a medias: guardamos tus respuestas automáticamente.",
        ],
        cta: { label: "Empezar ahora", url: `${panel}/generador` },
        footnote: "Legalito no es un despacho de abogados ni sustituye el asesoramiento jurídico profesional.",
      });
      return { subject: "Bienvenida a Legalito", ...l };
    }
    case "purchase_confirmed": {
      const l = layout({
        siteUrl,
        preheader: "Hemos recibido tu pago.",
        heading: "Pago confirmado",
        paragraphs: [
          `Hemos recibido tu pago de ${t.data.amount} por «${t.data.productName}».`,
          "Tus documentos se generan automáticamente. Te avisaremos en cuanto estén disponibles para descargar.",
        ],
        cta: { label: "Ir a mis documentos", url: `${panel}/documentos` },
        footnote: "Puedes consultar tus facturas y recibos desde «Mi suscripción» en tu panel.",
      });
      return { subject: "Hemos recibido tu pago", ...l };
    }
    case "subscription_activated": {
      const l = layout({
        siteUrl,
        preheader: "Tu suscripción está activa.",
        heading: "Tu suscripción está activa",
        paragraphs: [
          `Gracias por suscribirte a «${t.data.productName}» (${t.data.amount}).`,
          "Podrás regenerar tus documentos cuando cambie tu negocio y acceder a las nuevas versiones de las plantillas cuando se publiquen tras una revisión documentada.",
        ],
        cta: { label: "Ver mis documentos", url: `${panel}/documentos` },
        footnote: "Puedes cancelar en cualquier momento desde «Mi suscripción».",
      });
      return { subject: "Tu suscripción a Legalito está activa", ...l };
    }
    case "subscription_cancel_scheduled": {
      const l = layout({
        siteUrl,
        preheader: "Hemos registrado la cancelación de tu suscripción.",
        heading: "Cancelación confirmada",
        paragraphs: [
          `Tu suscripción seguirá activa hasta el ${t.data.endDate}. Después no se te volverá a cobrar.`,
          "Conservarás la descarga de los documentos que ya hayas generado. Si cambias de opinión, puedes reactivarla antes de esa fecha.",
        ],
        cta: { label: "Gestionar suscripción", url: `${panel}/suscripcion` },
      });
      return { subject: "Hemos registrado la cancelación de tu suscripción", ...l };
    }
    case "subscription_ended": {
      const l = layout({
        siteUrl,
        preheader: "Tu suscripción ha finalizado.",
        heading: "Tu suscripción ha finalizado",
        paragraphs: [
          "Tu suscripción a Legalito ha terminado. Sigues pudiendo descargar los documentos que generaste mientras estaba activa.",
          "Ten en cuenta que ya no recibirás las nuevas versiones de las plantillas.",
        ],
        cta: { label: "Ver opciones", url: `${siteUrl}/precios` },
      });
      return { subject: "Tu suscripción a Legalito ha finalizado", ...l };
    }
    case "renewal_reminder": {
      const l = layout({
        siteUrl,
        preheader: "Tu suscripción se renovará en los próximos días.",
        heading: "Próxima renovación",
        paragraphs: [`Tu suscripción se renovará el ${t.data.date} por ${t.data.amount}.`, "No tienes que hacer nada. Si quieres cambiar tu método de pago o cancelar, puedes hacerlo desde tu panel."],
        cta: { label: "Gestionar suscripción", url: `${panel}/suscripcion` },
      });
      return { subject: "Tu suscripción a Legalito se renovará pronto", ...l };
    }
    case "payment_failed": {
      const l = layout({
        siteUrl,
        preheader: "No hemos podido cobrar tu suscripción.",
        heading: "No hemos podido procesar tu pago",
        paragraphs: [
          `El cobro de ${t.data.amount} no se ha completado (intento ${t.data.attempt}).`,
          t.data.nextAttempt
            ? `Volveremos a intentarlo el ${t.data.nextAttempt}. Para evitar interrupciones, revisa tu método de pago.`
            : "Revisa tu método de pago para mantener tu suscripción activa.",
          "Mientras el pago esté pendiente puedes seguir descargando tus documentos, pero no generar nuevas versiones.",
        ],
        cta: { label: "Actualizar método de pago", url: `${panel}/suscripcion` },
      });
      return { subject: "Problema con el pago de tu suscripción", ...l };
    }
    case "documents_ready": {
      const l = layout({
        siteUrl,
        preheader: "Tus documentos están listos para descargar.",
        heading: "Tus documentos están listos",
        paragraphs: [
          `Ya puedes descargar: ${t.data.documents.join(", ")}.`,
          "Revísalos antes de publicarlos en tu web y consulta en el panel las acciones recomendadas para tu caso.",
          ...(t.data.isDemo ? ["Atención: estos documentos se han generado con plantillas de demostración y no tienen validez."] : []),
        ],
        cta: { label: "Descargar documentos", url: `${panel}/documentos` },
      });
      return { subject: "Tus documentos legales están listos", ...l };
    }
    case "legal_update": {
      const l = layout({
        siteUrl,
        preheader: t.data.summary,
        heading: t.data.title,
        paragraphs: [t.data.summary, "Desde tu panel puedes consultar el detalle y regenerar tus documentos con la nueva versión."],
        cta: { label: "Ver actualización", url: `${panel}` },
        footnote: "Recibes este aviso porque tu suscripción incluye las actualizaciones de las plantillas. Puedes desactivarlo en tus preferencias.",
      });
      return { subject: `Actualización: ${t.data.title}`, ...l };
    }
    case "support_received": {
      const l = layout({
        siteUrl,
        preheader: "Hemos recibido tu mensaje.",
        heading: "Hemos recibido tu mensaje",
        paragraphs: [`Gracias por escribirnos sobre «${t.data.subject}». Te responderemos lo antes posible, normalmente en uno o dos días laborables.`],
      });
      return { subject: "Hemos recibido tu mensaje", ...l };
    }
    case "support_notification": {
      const l = layout({
        siteUrl,
        preheader: `Nueva consulta de ${t.data.from}`,
        heading: `Nueva consulta: ${t.data.subject}`,
        paragraphs: [`De: ${t.data.from}`, t.data.message],
        cta: { label: "Abrir en administración", url: `${siteUrl}/admin/soporte` },
      });
      return { subject: `[Soporte] ${t.data.subject}`, ...l };
    }
  }
}

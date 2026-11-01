/**
 * Preguntas frecuentes por defecto. Se usan como respaldo si la base de datos
 * no está disponible; la fuente principal es la tabla `faqs`, editable desde
 * administración (sembrada con este mismo contenido en supabase/seed/base.sql).
 */
export interface Faq {
  question: string;
  answer: string;
  category: string;
}

export const DEFAULT_FAQS: Faq[] = [
  {
    question: "¿Qué documentos genera Legalito?",
    answer: "Legalito genera tres documentos para tu página web: aviso legal, política de privacidad y política de cookies. Cada uno se construye a partir de tus respuestas al formulario.",
    category: "documentos",
  },
  {
    question: "¿Cómo se adaptan los documentos a mi negocio?",
    answer: "Las plantillas están divididas en bloques. Según tus respuestas (tipo de negocio, si vendes online, si usas formularios, analítica o cookies de terceros, etc.) se incluyen solo los bloques que te corresponden y se completan con tus datos. No se redacta texto libre de forma automática.",
    category: "documentos",
  },
  {
    question: "¿Qué ocurre si cambia mi negocio?",
    answer: "Puedes actualizar tus respuestas en cualquier momento. Con la suscripción regeneras tus documentos dentro del cupo mensual de tu plan (20 en Básico, 50 en Medium e ilimitados en Business), incluso de uno en uno. Con el pago único dispones de un número limitado de regeneraciones para corregir datos con la misma versión de plantilla que compraste.",
    category: "documentos",
  },
  {
    question: "¿Cómo descargo mis documentos?",
    answer: "Desde «Mis documentos» en tu panel puedes descargar cada documento en PDF y en HTML. El HTML está pensado para copiarlo y pegarlo en tu web.",
    category: "documentos",
  },
  {
    question: "¿Qué incluye la suscripción?",
    answer: "Hay tres planes: Básico (5,99 €/mes, hasta 20 documentos al mes), Medium (10,99 €/mes, hasta 50) y Business (30,99 €/mes, ilimitados). Todos incluyen aviso legal, privacidad y cookies, las nuevas versiones de las plantillas cuando se publiquen tras una revisión documentada, el historial de versiones y avisos de cambios relevantes.",
    category: "suscripcion",
  },
  {
    question: "¿Cómo cancelo la suscripción?",
    answer: "Desde «Mi suscripción» en tu panel accedes al portal seguro de Stripe, donde puedes cancelar en cualquier momento. Mantienes el acceso hasta el final del periodo ya pagado y conservas la descarga de los documentos generados.",
    category: "suscripcion",
  },
  {
    question: "¿Legalito sustituye a un abogado?",
    answer: "No. Legalito no es un despacho de abogados ni presta asesoramiento jurídico. Ofrece plantillas estructuradas y reglas de adaptación. Si tu actividad tiene particularidades (datos de salud, menores, sectores regulados) te recomendamos consultar con un profesional.",
    category: "general",
  },
  {
    question: "¿Tener estos documentos significa que mi web cumple la ley?",
    answer: "No necesariamente. Los textos legales son una parte del cumplimiento. Por ejemplo, si usas cookies no necesarias también necesitas un sistema de gestión del consentimiento, y debes aplicar realmente lo que dicen tus políticas.",
    category: "general",
  },
  {
    question: "¿Puedo ver los documentos antes de pagar?",
    answer: "Sí. Al terminar el formulario verás una vista previa de tus documentos. La descarga en PDF y HTML se habilita después de la compra.",
    category: "pagos",
  },
  {
    question: "¿Qué métodos de pago aceptáis?",
    answer: "Los pagos se procesan con Stripe, que admite tarjeta y otros métodos según tu país. Legalito no almacena los datos de tu tarjeta.",
    category: "pagos",
  },
];

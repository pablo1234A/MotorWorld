import { company, site } from "@/config/site";

/**
 * BORRADORES de las páginas legales de Legalito. Deben ser revisados por un
 * profesional antes del lanzamiento (ver docs/LAUNCH_CHECKLIST.md). Mientras
 * NEXT_PUBLIC_LEGAL_PAGES_REVIEWED no sea "true", se muestra un aviso visible.
 * Reflejan los tratamientos reales del software: si cambia un proveedor o un
 * tratamiento, actualiza también estos textos.
 */
export interface LegalSection {
  heading: string;
  paragraphs?: string[];
  bullets?: string[];
}
export interface LegalPage {
  slug: string;
  title: string;
  description: string;
  updated: string;
  sections: LegalSection[];
}

const c = company;

export const LEGAL_PAGES: LegalPage[] = [
  {
    slug: "aviso-legal",
    title: "Aviso legal",
    description: "Datos identificativos del titular de Legalito y condiciones de uso del sitio web.",
    updated: "1 de noviembre de 2026",
    sections: [
      {
        heading: "Titular del sitio web",
        bullets: [`Titular: ${c.legalName}`, `NIF: ${c.taxId}`, `Domicilio: ${c.address}`, `Datos registrales: ${c.registry}`, `Email: ${c.email}`],
      },
      {
        heading: "Objeto",
        paragraphs: [
          `Este sitio web (${site.url}) ofrece Legalito, un servicio en línea que permite generar documentos legales para páginas web a partir de plantillas estructuradas y de la información facilitada por el usuario.`,
          "Legalito no es un despacho de abogados ni presta servicios de asesoramiento jurídico.",
        ],
      },
      {
        heading: "Condiciones de uso",
        paragraphs: ["El usuario se compromete a utilizar el sitio web conforme a la ley y a estas condiciones, a facilitar información veraz y a no realizar acciones que puedan dañar el servicio o a terceros."],
      },
      {
        heading: "Propiedad intelectual",
        paragraphs: [
          "El software, el diseño, las plantillas y los contenidos de Legalito son titularidad del titular del sitio o de sus licenciantes. Los documentos generados pueden ser utilizados por el cliente en sus propias páginas web conforme a las condiciones de contratación.",
        ],
      },
      {
        heading: "Responsabilidad",
        paragraphs: [
          "El titular procura la disponibilidad y corrección del servicio, pero no garantiza la ausencia de interrupciones o errores. Los documentos se generan a partir de la información del usuario, que es responsable de su veracidad y de revisar los documentos antes de publicarlos.",
        ],
      },
      { heading: "Legislación aplicable", paragraphs: ["Este aviso legal se rige por la legislación española."] },
    ],
  },
  {
    slug: "privacidad",
    title: "Política de privacidad",
    description: "Cómo trata Legalito los datos personales de sus usuarios y clientes.",
    updated: "1 de noviembre de 2026",
    sections: [
      { heading: "Responsable", bullets: [`${c.legalName} (NIF ${c.taxId})`, `Domicilio: ${c.address}`, `Contacto: ${c.email}`] },
      {
        heading: "Qué datos tratamos y para qué",
        bullets: [
          "Datos de cuenta (email, nombre y contraseña cifrada): para crear y gestionar tu cuenta. Base: ejecución del contrato.",
          "Datos de tu negocio y respuestas al formulario (titular, NIF, domicilio, web, actividad, herramientas): para generar tus documentos. Base: ejecución del contrato.",
          "Datos de facturación y pagos: para cobrar los servicios y cumplir obligaciones fiscales. Los datos de tarjeta los trata Stripe; Legalito no los almacena. Base: contrato y obligación legal.",
          "Mensajes de soporte: para atender tus consultas. Base: consentimiento y ejecución del contrato.",
          "Emails transaccionales (verificación, compras, renovaciones, documentos disponibles y actualizaciones relevantes del servicio contratado). Base: ejecución del contrato.",
          "Comunicaciones comerciales: solo si las aceptas expresamente. Base: consentimiento, que puedes retirar en cualquier momento.",
          "Estadísticas de uso agregadas sin cookies ni identificadores de dispositivo. Base: interés legítimo en mejorar el servicio.",
          "Registros de seguridad (auditoría de operaciones y datos técnicos seudonimizados): para proteger el servicio. Base: interés legítimo.",
        ],
      },
      {
        heading: "Conservación",
        paragraphs: [
          "Conservamos los datos mientras mantengas tu cuenta. Tras su cierre, los datos de facturación se conservan bloqueados durante los plazos exigidos por la normativa fiscal y mercantil, y el resto se suprime.",
        ],
      },
      {
        heading: "Encargados del tratamiento",
        bullets: [
          "Supabase (base de datos, autenticación y almacenamiento de documentos).",
          "Proveedor de alojamiento de la aplicación web.",
          "Stripe (procesamiento de pagos y facturación).",
          "Resend (envío de emails transaccionales).",
        ],
        paragraphs: [
          "Algunos de estos proveedores pueden tratar datos fuera del Espacio Económico Europeo con garantías adecuadas, como decisiones de adecuación o cláusulas contractuales tipo. [PENDIENTE: confirmar regiones y garantías de cada proveedor contratado].",
        ],
      },
      {
        heading: "Tus derechos",
        paragraphs: [
          `Puedes ejercer los derechos de acceso, rectificación, supresión, oposición, limitación y portabilidad escribiendo a ${c.email} o desde la sección de ayuda de tu panel. También puedes reclamar ante la Agencia Española de Protección de Datos (www.aepd.es).`,
        ],
      },
    ],
  },
  {
    slug: "cookies",
    title: "Política de cookies",
    description: "Cookies que utiliza Legalito.",
    updated: "1 de noviembre de 2026",
    sections: [
      {
        heading: "Cookies que utilizamos",
        paragraphs: [
          "Legalito solo utiliza cookies técnicas estrictamente necesarias para mantener tu sesión iniciada de forma segura. Estas cookies no requieren consentimiento.",
          "No utilizamos cookies analíticas ni publicitarias. Las estadísticas de uso se obtienen sin cookies ni identificadores de dispositivo.",
        ],
        bullets: ["sb-*-auth-token (propia, técnica): mantiene la sesión del usuario autenticado. Duración: mientras la sesión esté activa."],
      },
      {
        heading: "Pagos",
        paragraphs: ["Al realizar un pago se te redirige a la página segura de Stripe, que puede utilizar sus propias cookies conforme a su política."],
      },
      {
        heading: "Cómo gestionarlas",
        paragraphs: ["Puedes eliminar las cookies desde la configuración de tu navegador. Si eliminas la cookie de sesión tendrás que volver a iniciar sesión."],
      },
    ],
  },
  {
    slug: "condiciones",
    title: "Condiciones de contratación",
    description: "Condiciones que regulan la contratación de Legalito.",
    updated: "1 de noviembre de 2026",
    sections: [
      {
        heading: "Objeto del servicio",
        paragraphs: [
          "Legalito permite generar aviso legal, política de privacidad y política de cookies a partir de plantillas estructuradas, versionadas y revisadas, y de la información facilitada por el cliente.",
          "Legalito no presta asesoramiento jurídico y no garantiza que la publicación de los documentos suponga por sí sola el cumplimiento de la normativa aplicable.",
        ],
      },
      {
        heading: "Modalidades y precios",
        bullets: [
          "Pago único: generación de los documentos incluidos, descarga en PDF y HTML, acceso permanente a los documentos comprados y un número limitado de regeneraciones con la versión de plantilla vigente en la compra. No incluye actualizaciones futuras.",
          "Suscripción mensual (planes Básico, Medium y Business): generación de los documentos incluidos dentro del cupo mensual del plan contratado (20, 50 o ilimitados por periodo de facturación), acceso a las nuevas versiones revisadas de las plantillas, historial y avisos. Se renueva automáticamente cada mes hasta su cancelación. El cupo no utilizado no se acumula.",
          "Los precios se muestran con impuestos incluidos en la página de precios y en el proceso de pago.",
        ],
      },
      {
        heading: "Pago",
        paragraphs: ["Los pagos se procesan a través de Stripe. Legalito no almacena los datos de tu tarjeta."],
      },
      {
        heading: "Derecho de desistimiento",
        paragraphs: [
          "Los documentos son contenido digital que se suministra de forma inmediata. Antes de pagar se te solicita el consentimiento expreso para el suministro inmediato y el reconocimiento de que, una vez generados los documentos, pierdes el derecho de desistimiento, conforme al artículo 103.m) del Texto Refundido de la Ley General para la Defensa de los Consumidores y Usuarios.",
          "[PENDIENTE DE REVISIÓN JURÍDICA: tratamiento del desistimiento en la suscripción y política de reembolsos].",
        ],
      },
      {
        heading: "Cancelación de la suscripción",
        paragraphs: [
          "Puedes cancelar en cualquier momento desde «Mi suscripción». La cancelación surte efecto al final del periodo ya pagado y conservas la descarga de los documentos generados. Si un pago de renovación falla, se reintentará automáticamente y, mientras tanto, no podrás generar nuevas versiones.",
        ],
      },
      {
        heading: "Actualizaciones de plantillas",
        paragraphs: ["Las nuevas versiones solo se publican tras una revisión documentada. Legalito no se compromete a publicar actualizaciones con una frecuencia determinada."],
      },
      {
        heading: "Responsabilidad",
        paragraphs: ["El cliente es responsable de la veracidad de la información facilitada y de revisar los documentos antes de publicarlos. [PENDIENTE DE REVISIÓN JURÍDICA: límites de responsabilidad]."],
      },
      { heading: "Ley aplicable", paragraphs: ["Estas condiciones se rigen por la legislación española. Si eres consumidor, serán competentes los tribunales de tu domicilio."] },
    ],
  },
];

/**
 * Textos legales EDITABLES. Son borradores de partida y NO constituyen asesoramiento
 * jurídico: deben ser revisados y completados por un profesional antes de publicar
 * comercialmente. Sustituye todos los marcadores [ENTRE CORCHETES] por datos reales.
 */
export type LegalSection = { heading: string; paragraphs?: string[]; list?: string[] };
export type LegalDocument = { slug: string; title: string; updated: string; intro: string; sections: LegalSection[] };

const OWNER = "[NOMBRE O RAZÓN SOCIAL DEL TITULAR]";
const CONTACT = "[CORREO DE CONTACTO]";

export const LEGAL_DOCUMENTS: Record<string, LegalDocument> = {
  privacidad: {
    slug: "privacidad",
    title: "Política de privacidad",
    updated: "[FECHA DE ÚLTIMA ACTUALIZACIÓN]",
    intro: "Esta política explica qué datos personales trata AnunciaPro, con qué finalidad y qué derechos tienes sobre ellos.",
    sections: [
      { heading: "1. Responsable del tratamiento", paragraphs: [`Responsable: ${OWNER}. Identificación fiscal: [NIF/CIF]. Domicilio: [DOMICILIO]. Contacto: ${CONTACT}.`] },
      {
        heading: "2. Datos que tratamos",
        list: [
          "Datos de registro: nombre, correo electrónico y contraseña (almacenada cifrada por nuestro proveedor de autenticación; no tenemos acceso a ella).",
          "Contenido que subes: productos, fotografías, archivos CSV y anuncios.",
          "Datos de uso: operaciones realizadas, consumo del plan y registros técnicos necesarios para la seguridad del servicio.",
          "Datos de facturación, cuando se activen los planes de pago: gestionados por el proveedor de pagos; AnunciaPro no almacena datos completos de tarjetas.",
          "Mensajes que nos envías a través del formulario de contacto.",
        ],
      },
      {
        heading: "3. Finalidades y bases jurídicas",
        list: [
          "Prestar el servicio contratado (ejecución del contrato).",
          "Garantizar la seguridad, prevenir abusos y resolver incidencias (interés legítimo).",
          "Atender tus consultas (consentimiento o medidas precontractuales).",
          "Cumplir obligaciones legales aplicables.",
        ],
      },
      {
        heading: "4. Encargados del tratamiento",
        paragraphs: ["Para prestar el servicio utilizamos proveedores que tratan datos por cuenta nuestra. [REVISAR Y COMPLETAR LA LISTA, UBICACIONES Y GARANTÍAS DE TRANSFERENCIA INTERNACIONAL]."],
        list: ["Supabase: base de datos, autenticación y almacenamiento de archivos.", "Proveedor de alojamiento de la aplicación: [PROVEEDOR DE HOSTING].", "Stripe: gestión de pagos (solo si los planes de pago están activos).", "Proveedor de IA: [SOLO SI SE ACTIVA UN PROVEEDOR EXTERNO DE GENERACIÓN]."],
      },
      { heading: "5. Conservación", paragraphs: ["Conservamos tus datos mientras mantengas la cuenta. Al eliminarla, se borran tus productos, anuncios y archivos. Algunos registros pueden conservarse el tiempo exigido por la ley. [DEFINIR PLAZOS CONCRETOS]."] },
      { heading: "6. Tus derechos", paragraphs: [`Puedes ejercer tus derechos de acceso, rectificación, supresión, oposición, limitación y portabilidad escribiendo a ${CONTACT}. También puedes presentar una reclamación ante la autoridad de control competente.`] },
      { heading: "7. Seguridad", paragraphs: ["Aplicamos medidas técnicas y organizativas como el aislamiento de datos por cuenta, el cifrado en tránsito y el control de acceso a los archivos."] },
    ],
  },
  condiciones: {
    slug: "condiciones",
    title: "Condiciones de uso",
    updated: "[FECHA DE ÚLTIMA ACTUALIZACIÓN]",
    intro: "Estas condiciones regulan el acceso y el uso de AnunciaPro. Al crear una cuenta las aceptas.",
    sections: [
      { heading: "1. Titular del servicio", paragraphs: [`AnunciaPro es un servicio de ${OWNER}, con identificación fiscal [NIF/CIF] y domicilio en [DOMICILIO].`] },
      { heading: "2. Descripción del servicio", paragraphs: ["AnunciaPro es una herramienta para crear, organizar, adaptar y exportar anuncios de productos. No publica anuncios en plataformas de terceros ni está afiliada a ellas."] },
      {
        heading: "3. Tu cuenta",
        list: ["Debes facilitar datos veraces y mantener la confidencialidad de tu contraseña.", "Eres responsable de la actividad realizada desde tu cuenta.", "Puedes eliminar tu cuenta en cualquier momento desde el panel."],
      },
      {
        heading: "4. Contenido y uso aceptable",
        list: [
          "Eres responsable de la veracidad y legalidad de la información de tus productos y de los anuncios que publiques.",
          "Revisa siempre el anuncio generado antes de publicarlo.",
          "No está permitido usar el servicio para productos ilegales, publicidad engañosa o infracción de derechos de terceros.",
          "No está permitido intentar acceder a datos de otros usuarios ni interferir en el funcionamiento del servicio.",
        ],
      },
      { heading: "5. Planes, límites y pagos", paragraphs: ["Cada plan incluye un número de generaciones mensuales y otros límites publicados en la página de precios. [COMPLETAR CONDICIONES DE CONTRATACIÓN, RENOVACIÓN, CANCELACIÓN, DESISTIMIENTO E IMPUESTOS CUANDO SE ACTIVEN LOS PAGOS]."] },
      { heading: "6. Propiedad intelectual", paragraphs: ["Conservas todos los derechos sobre el contenido que subes y sobre los anuncios que generas. El software y la marca AnunciaPro pertenecen a su titular."] },
      { heading: "7. Disponibilidad y responsabilidad", paragraphs: ["El servicio se presta «tal cual». [DEFINIR LIMITACIONES DE RESPONSABILIDAD Y NIVELES DE SERVICIO CONFORME A LA NORMATIVA APLICABLE]."] },
      { heading: "8. Suspensión de cuentas", paragraphs: ["Podemos suspender cuentas que incumplan estas condiciones, dejando constancia de la causa."] },
      { heading: "9. Legislación y jurisdicción", paragraphs: ["[LEGISLACIÓN APLICABLE Y JURISDICCIÓN COMPETENTE]."] },
    ],
  },
  cookies: {
    slug: "cookies",
    title: "Política de cookies",
    updated: "[FECHA DE ÚLTIMA ACTUALIZACIÓN]",
    intro: "AnunciaPro utiliza únicamente cookies técnicas necesarias para el funcionamiento del servicio.",
    sections: [
      { heading: "1. Qué cookies utilizamos", list: ["Cookies de sesión de autenticación (prefijo «sb-»): mantienen tu sesión iniciada de forma segura.", "Cookie «ap_recovery»: cookie temporal (15 minutos) usada durante el restablecimiento de contraseña."] },
      { heading: "2. Cookies de análisis y publicidad", paragraphs: ["Actualmente no se utilizan cookies de análisis, publicidad ni de terceros con fines de seguimiento. Si se incorporan en el futuro, se solicitará tu consentimiento previo. [ACTUALIZAR SI SE AÑADEN HERRAMIENTAS DE ANALÍTICA]."] },
      { heading: "3. Cómo gestionarlas", paragraphs: ["Puedes eliminar o bloquear las cookies desde la configuración de tu navegador. Si bloqueas las cookies técnicas no podrás iniciar sesión."] },
    ],
  },
};

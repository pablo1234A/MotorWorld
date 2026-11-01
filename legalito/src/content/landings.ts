/**
 * Páginas de captación orgánica (SEO). Cada una responde a una intención de
 * búsqueda concreta con contenido propio, sin texto duplicado entre ellas.
 */
export interface Landing {
  slug: string;
  navLabel: string;
  title: string;
  metaTitle: string;
  metaDescription: string;
  eyebrow: string;
  lead: string;
  sections: { heading: string; body: string[]; bullets?: string[] }[];
  faq: { q: string; a: string }[];
}

export const LANDINGS: Landing[] = [
  {
    slug: "generador-aviso-legal",
    navLabel: "Generador de aviso legal",
    title: "Generador de aviso legal para tu página web",
    metaTitle: "Generador de aviso legal para webs en España",
    metaDescription:
      "Crea el aviso legal de tu web con los datos que exige la LSSI-CE: titular, NIF, domicilio, contacto y datos registrales o colegiales. Adaptado a autónomos y empresas.",
    eyebrow: "Aviso legal",
    lead: "El aviso legal identifica a quién está detrás de una web. Legalito lo construye a partir de tus datos y de tu tipo de negocio, incluyendo solo los apartados que te corresponden.",
    sections: [
      {
        heading: "Qué información debe incluir",
        body: ["La Ley de Servicios de la Sociedad de la Información (LSSI-CE) obliga a quien presta servicios a través de una web a facilitar una serie de datos de forma permanente, fácil, directa y gratuita."],
        bullets: [
          "Nombre o razón social, NIF y domicilio.",
          "Un email u otro medio de contacto directo.",
          "Datos de inscripción registral si eres una sociedad.",
          "Colegio profesional, número de colegiado y título si ejerces una profesión regulada.",
        ],
      },
      {
        heading: "Por qué no conviene copiar el de otra web",
        body: [
          "Un aviso legal copiado suele arrastrar datos de otra actividad, apartados que no aplican (por ejemplo, de contratación online en una web informativa) o la falta de los que sí te afectan.",
          "Legalito pregunta qué tipo de negocio tienes y muestra solo las preguntas necesarias. Si eres una sociedad, te pedirá los datos registrales; si ejerces una profesión regulada, los colegiales.",
        ],
      },
    ],
    faq: [
      { q: "¿Un autónomo necesita aviso legal?", a: "Sí, si tu web forma parte de tu actividad económica, aunque sea solo informativa, debes identificarte como titular." },
      { q: "¿Dónde se coloca el aviso legal?", a: "Lo habitual es enlazarlo desde el pie de página de todas las páginas de la web, para que esté siempre accesible." },
    ],
  },
  {
    slug: "politica-de-privacidad-autonomos",
    navLabel: "Privacidad para autónomos",
    title: "Política de privacidad para autónomos y profesionales",
    metaTitle: "Política de privacidad para autónomos: qué incluir",
    metaDescription:
      "Genera la política de privacidad de tu web de autónomo según cómo recoges datos: formulario de contacto, newsletter, reservas o ventas. Finalidades, bases jurídicas y plazos.",
    eyebrow: "Política de privacidad",
    lead: "Si tu web tiene un formulario, una newsletter o un sistema de reservas, tratas datos personales y debes explicar cómo. Legalito adapta la política a los tratamientos que realmente haces.",
    sections: [
      {
        heading: "Adaptada a cómo recoges los datos",
        body: [
          "No es lo mismo un formulario de contacto que una tienda con cuentas de cliente. Cada tratamiento tiene su finalidad, su base jurídica y su plazo de conservación.",
          "Legalito construye una tabla con los tratamientos que marcas en el formulario y enumera los proveedores que acceden a los datos, como tu hosting o tu herramienta de email.",
        ],
        bullets: ["Formularios de contacto y emails.", "Newsletter y comunicaciones.", "Reservas, citas y pedidos.", "Envío de currículums y comentarios."],
      },
      {
        heading: "Lo que una política no resuelve sola",
        body: [
          "Además de publicar la política, debes informar junto a cada formulario, recoger el consentimiento cuando sea necesario y firmar los contratos de encargo con tus proveedores. Tras generar tus documentos, Legalito te muestra estas acciones según tu caso.",
        ],
      },
    ],
    faq: [
      { q: "¿Necesito política de privacidad si solo tengo un email de contacto?", a: "Sí. En cuanto tratas datos personales, aunque sea responder emails, debes informar a las personas." },
      { q: "¿Y si trato datos de salud?", a: "Legalito lo detecta en el formulario e incluye un apartado específico, pero te recomendamos revisarlo con un profesional por las garantías reforzadas que exige." },
    ],
  },
  {
    slug: "generador-politica-de-cookies",
    navLabel: "Generador de política de cookies",
    title: "Generador de política de cookies",
    metaTitle: "Generador de política de cookies con tabla de cookies",
    metaDescription:
      "Crea tu política de cookies a partir de las herramientas que usas (Google Analytics, píxeles publicitarios, YouTube, mapas…) con una tabla orientativa de cookies.",
    eyebrow: "Política de cookies",
    lead: "Indica qué herramientas usa tu web y Legalito preparará una política con la tabla de cookies orientativa de cada una. Y te dirá claramente si además necesitas un sistema de consentimiento.",
    sections: [
      {
        heading: "Política de cookies no es lo mismo que consentimiento",
        body: [
          "La política informa; el consentimiento se gestiona con un banner o una plataforma que bloquee las cookies no necesarias hasta que el usuario acepte. Si usas analítica con cookies o publicidad, necesitas ambas cosas.",
          "Legalito no instala un banner de cookies, pero te avisa cuando lo necesitas y adapta el texto si ya utilizas una herramienta de consentimiento.",
        ],
      },
      {
        heading: "Tabla de cookies a partir de tus herramientas",
        body: ["La tabla se elabora con la información pública de cada proveedor. Te recomendamos contrastarla con un escaneo real de tu web y añadir las cookies que falten desde el formulario."],
        bullets: ["Google Analytics, Matomo o Plausible.", "Google Ads, píxel de Meta, TikTok o LinkedIn.", "YouTube, Vimeo, Google Maps y reCAPTCHA."],
      },
    ],
    faq: [
      { q: "¿Necesito banner de cookies si solo uso cookies técnicas?", a: "Las cookies estrictamente necesarias no requieren consentimiento, aunque sí conviene informar de ellas." },
      { q: "¿Plausible necesita consentimiento?", a: "Plausible funciona sin cookies; Legalito lo refleja en tu política y no te pedirá un gestor de consentimiento solo por usarlo." },
    ],
  },
  {
    slug: "textos-legales-pagina-web",
    navLabel: "Textos legales para tu web",
    title: "Textos legales para tu página web",
    metaTitle: "Textos legales para páginas web: aviso legal, privacidad y cookies",
    metaDescription:
      "Los tres textos legales básicos de una web en España, generados a partir de un único formulario. Vista previa gratuita y descarga en PDF y HTML.",
    eyebrow: "Textos legales",
    lead: "Aviso legal, política de privacidad y política de cookies, a partir de un único formulario y sin pedirte la misma información dos veces.",
    sections: [
      {
        heading: "Un formulario, tres documentos coherentes",
        body: [
          "Los tres textos comparten datos: titular, contacto, proveedores, herramientas. Al generarlos juntos se mantienen coherentes entre sí y no tienes que rellenar lo mismo tres veces.",
          "Puedes descargarlos en PDF para tus archivos y en HTML para pegarlos directamente en tu web.",
        ],
      },
      {
        heading: "Plantillas estructuradas, no texto inventado",
        body: [
          "Cada documento se compone de bloques de una plantilla con versión y fecha de revisión. Las reglas deciden qué bloques aplican a tu caso. No se redactan cláusulas nuevas de forma automática.",
        ],
      },
    ],
    faq: [
      { q: "¿Puedo editar los documentos después?", a: "Puedes modificar tus respuestas y volver a generarlos. El HTML también puede editarse en tu web si lo necesitas." },
      { q: "¿En qué formatos se descargan?", a: "En PDF y en HTML listo para insertar en tu web." },
    ],
  },
  {
    slug: "documentos-legales-tienda-online",
    navLabel: "Legal para tiendas online",
    title: "Documentos legales para tiendas online",
    metaTitle: "Documentos legales para tiendas online en España",
    metaDescription:
      "Aviso legal, privacidad y cookies para tu ecommerce, con pedidos, pagos, envíos y píxeles publicitarios. Te indicamos además qué otros textos necesitas.",
    eyebrow: "Tiendas online",
    lead: "Una tienda online trata más datos y usa más herramientas que una web informativa. Legalito hace las preguntas propias de un ecommerce y adapta tus documentos a pedidos, pagos y envíos.",
    sections: [
      {
        heading: "Preguntas específicas para ecommerce",
        body: ["Si indicas que tienes una tienda online, el formulario te preguntará a quién vendes, si envías productos físicos, qué pasarelas de pago y empresas de transporte usas."],
        bullets: ["Tratamiento de pedidos, pagos y facturación.", "Proveedores de pago y logística.", "Cookies de sesión, carrito y publicidad."],
      },
      {
        heading: "Lo que todavía necesitas",
        body: [
          "Una tienda online necesita también condiciones generales de contratación (precios, envíos, derecho de desistimiento y garantías). Legalito todavía no genera ese documento y te lo indicará de forma clara en tu panel.",
        ],
      },
    ],
    faq: [
      { q: "¿Sirve para Shopify, WooCommerce o PrestaShop?", a: "Sí. Los documentos son independientes de la plataforma: puedes pegar el HTML en cualquier gestor." },
      { q: "¿Incluye las condiciones de venta?", a: "Todavía no. Te avisaremos de que las necesitas para que no se te pase." },
    ],
  },
];

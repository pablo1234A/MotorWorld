/**
 * Guías de contenido para captación orgánica (SEO). Contenido divulgativo y
 * general: no es asesoramiento jurídico. Revisar con un profesional antes de
 * publicar y cada vez que cambie la normativa (campo `updated`).
 */
export interface GuideSection {
  id: string;
  heading: string;
  paragraphs: string[];
  bullets?: string[];
  table?: { columns: string[]; rows: string[][] };
}

export interface Guide {
  slug: string;
  title: string;
  metaTitle: string;
  description: string;
  keyword: string;
  /** Etiqueta corta para menús y tarjetas. */
  navLabel: string;
  published: string;
  updated: string;
  readingMinutes: number;
  lead: string;
  sections: GuideSection[];
  faq: { q: string; a: string }[];
  relatedLanding: { href: string; label: string };
}

export const GUIDES: Guide[] = [
  {
    slug: "aviso-legal-que-es-y-que-debe-incluir",
    title: "Aviso legal de una web: qué es, quién lo necesita y qué debe incluir",
    metaTitle: "Aviso legal: qué es y qué debe incluir tu web (guía 2026)",
    description:
      "Qué es el aviso legal, qué webs están obligadas a tenerlo según la LSSI-CE, qué datos debe incluir, dónde colocarlo y qué errores evitar. Guía práctica para autónomos y empresas.",
    keyword: "aviso legal",
    navLabel: "Qué debe incluir el aviso legal",
    published: "2026-11-01",
    updated: "2026-11-01",
    readingMinutes: 7,
    lead: "El aviso legal es el documento que identifica a quién está detrás de una página web. Es breve, pero obligatorio para casi cualquier web que forme parte de una actividad económica, y es el primer sitio donde un cliente, un proveedor o una administración buscará tus datos.",
    sections: [
      {
        id: "que-es",
        heading: "Qué es el aviso legal",
        paragraphs: [
          "El aviso legal es la página en la que el titular de una web facilita sus datos identificativos y, normalmente, las condiciones de uso del sitio. Su origen está en el artículo 10 de la Ley 34/2002, de Servicios de la Sociedad de la Información y de Comercio Electrónico (LSSI-CE), que obliga a quien presta servicios a través de internet a ofrecer cierta información de forma permanente, fácil, directa y gratuita.",
          "No hay que confundirlo con la política de privacidad, que explica qué datos personales tratas, ni con la política de cookies, que informa de las cookies que instala la web. Son tres documentos distintos, aunque suelen enlazarse juntos en el pie de página.",
        ],
      },
      {
        id: "quien-lo-necesita",
        heading: "Quién está obligado a tenerlo",
        paragraphs: [
          "Están obligados los prestadores de servicios de la sociedad de la información. En la práctica, cualquier web vinculada a una actividad económica: la de un autónomo que presenta sus servicios, la de un restaurante, la de una tienda online o la de una empresa, aunque no venda nada directamente desde la web.",
          "También pueden estar obligadas las webs y blogs que generan ingresos, por ejemplo con publicidad o enlaces de afiliación. Una web puramente personal, sin ninguna actividad económica, queda en principio fuera, pero si tienes dudas lo prudente es incluirlo: no tiene coste y transmite confianza.",
        ],
      },
      {
        id: "que-debe-incluir",
        heading: "Qué datos debe incluir",
        paragraphs: ["Según el artículo 10 de la LSSI-CE, el aviso legal debe recoger, cuando corresponda:"],
        bullets: [
          "Nombre o razón social del titular.",
          "NIF o NIE.",
          "Domicilio (o el de un establecimiento permanente en España).",
          "Un email u otro medio de contacto directo y efectivo.",
          "Datos de inscripción en el Registro Mercantil u otro registro público, si eres una sociedad o entidad inscrita.",
          "Datos de la autorización administrativa, si tu actividad la necesita.",
          "En profesiones reguladas: colegio profesional, número de colegiado, título académico, Estado que lo expidió y normas profesionales aplicables.",
          "Códigos de conducta a los que estés adherido, si los hay.",
          "Si vendes, información clara sobre precios, impuestos incluidos y gastos de envío.",
        ],
      },
      {
        id: "donde-colocarlo",
        heading: "Dónde colocarlo en tu web",
        paragraphs: [
          "La ley exige que la información sea accesible de forma permanente, fácil, directa y gratuita. Lo habitual es crear una página propia llamada «Aviso legal» y enlazarla desde el pie de página, de modo que esté visible en todas las páginas de la web.",
          "No basta con incluirlo en un PDF escondido o en una página a la que solo se llega desde el blog. Si un usuario no lo encuentra en dos clics, probablemente no cumple el requisito de accesibilidad.",
        ],
      },
      {
        id: "errores",
        heading: "Errores frecuentes",
        paragraphs: ["Estos son los fallos que más se repiten en los avisos legales de pequeños negocios:"],
        bullets: [
          "Copiar el aviso legal de otra web y olvidar cambiar el NIF, la dirección o el nombre.",
          "Usar una plantilla de sociedad siendo autónomo (o al revés) y omitir los datos registrales cuando sí son obligatorios.",
          "Mezclar en un mismo texto el aviso legal, la privacidad y las cookies sin la información que exige cada norma.",
          "No actualizarlo cuando cambia el domicilio, la forma jurídica o el email de contacto.",
          "Incluir cláusulas de otra actividad (por ejemplo, de venta online en una web que solo es informativa).",
        ],
      },
      {
        id: "sanciones",
        heading: "Qué pasa si no lo tienes",
        paragraphs: [
          "La LSSI-CE considera infracción no ofrecer la información del artículo 10. Las infracciones leves pueden sancionarse con multas de hasta 30.000 € y las graves con importes superiores. Más allá de la multa, una web sin datos identificativos genera desconfianza en clientes y proveedores.",
        ],
      },
    ],
    faq: [
      { q: "¿Un autónomo necesita aviso legal?", a: "Sí, si su web forma parte de su actividad económica, aunque sea una web informativa sin venta online." },
      { q: "¿Puedo poner un apartado de correos en lugar de mi domicilio?", a: "La ley pide el domicilio o el de un establecimiento permanente. Un apartado de correos no sustituye a esa información." },
      { q: "¿El aviso legal y la política de privacidad pueden ir en la misma página?", a: "Es posible, pero se recomienda separarlos: cada documento responde a una norma distinta y así resulta más claro para el usuario." },
    ],
    relatedLanding: { href: "/generador-aviso-legal", label: "Generador de aviso legal" },
  },
  {
    slug: "politica-de-privacidad-que-debe-incluir",
    title: "Política de privacidad: qué es y qué debe incluir según el RGPD",
    metaTitle: "Política de privacidad: qué debe incluir según el RGPD",
    description:
      "Qué es la política de privacidad, cuándo es obligatoria, qué información exige el artículo 13 del RGPD, cómo informar en los formularios y los errores más comunes en webs de pequeños negocios.",
    keyword: "política de privacidad",
    navLabel: "Cómo hacer la política de privacidad",
    published: "2026-11-01",
    updated: "2026-11-01",
    readingMinutes: 8,
    lead: "Si tu web tiene un formulario de contacto, una newsletter, un área de clientes o una tienda, tratas datos personales. La política de privacidad es el documento con el que explicas a las personas qué haces con sus datos, y el Reglamento General de Protección de Datos (RGPD) fija con detalle qué debe contener.",
    sections: [
      {
        id: "que-es",
        heading: "Qué es la política de privacidad",
        paragraphs: [
          "Es el texto en el que informas, de forma clara y accesible, sobre los tratamientos de datos personales que realizas: quién eres, para qué usas los datos, con qué base legal, durante cuánto tiempo, a quién los comunicas y qué derechos tienen las personas.",
          "Es una obligación del RGPD (artículos 12 a 14) y de la Ley Orgánica 3/2018 de Protección de Datos (LOPDGDD). No es un trámite genérico: debe describir tus tratamientos reales.",
        ],
      },
      {
        id: "cuando-es-obligatoria",
        heading: "Cuándo es obligatoria",
        paragraphs: [
          "Siempre que recojas datos personales a través de la web: un formulario de contacto, una suscripción, registros de usuarios, pedidos, reservas, envío de currículums o comentarios. También si tratas datos de quienes te escriben por email desde la web.",
          "Incluso una web sin formularios suele tratar algún dato (por ejemplo, la dirección IP en los registros del servidor o en herramientas de analítica), por lo que en la práctica casi todas las webs necesitan una política de privacidad.",
        ],
      },
      {
        id: "contenido",
        heading: "Qué información debe incluir",
        paragraphs: ["El artículo 13 del RGPD exige informar, al menos, de:"],
        bullets: [
          "Identidad y datos de contacto del responsable del tratamiento.",
          "Datos de contacto del Delegado de Protección de Datos, si lo tienes.",
          "Finalidades del tratamiento y su base jurídica (consentimiento, contrato, obligación legal, interés legítimo…).",
          "Destinatarios o categorías de destinatarios, incluidos los proveedores que tratan datos por tu cuenta.",
          "Transferencias internacionales, si las hay, y las garantías aplicadas.",
          "Plazo de conservación o los criterios para determinarlo.",
          "Derechos de acceso, rectificación, supresión, oposición, limitación y portabilidad, y cómo ejercerlos.",
          "Derecho a retirar el consentimiento en cualquier momento.",
          "Derecho a presentar una reclamación ante la Agencia Española de Protección de Datos.",
          "Si existen decisiones automatizadas o elaboración de perfiles.",
        ],
      },
      {
        id: "tabla",
        heading: "Ejemplo: finalidades, bases jurídicas y plazos",
        paragraphs: ["Una forma clara de presentar los tratamientos es una tabla como esta (orientativa):"],
        table: {
          columns: ["Tratamiento", "Base jurídica habitual", "Conservación orientativa"],
          rows: [
            ["Formulario de contacto", "Consentimiento o medidas precontractuales", "Hasta responder y plazos de prescripción"],
            ["Newsletter", "Consentimiento", "Hasta la baja"],
            ["Pedidos y facturación", "Contrato y obligación legal", "Plazos fiscales y mercantiles"],
            ["Currículums", "Consentimiento", "Hasta finalizar el proceso de selección"],
          ],
        },
      },
      {
        id: "primera-capa",
        heading: "La información por capas en los formularios",
        paragraphs: [
          "La LOPDGDD permite informar por capas: junto a cada formulario incluyes un texto breve (responsable, finalidad, derechos y un enlace a la política completa) y en la política de privacidad desarrollas el resto. Es la forma más clara para el usuario y la que recomienda la AEPD.",
        ],
      },
      {
        id: "errores",
        heading: "Errores comunes",
        bullets: [
          "Copiar una política genérica que menciona tratamientos que no haces y omite los que sí haces.",
          "No citar a los proveedores (hosting, email, herramienta de newsletter, pasarela de pago).",
          "Indicar plazos de conservación indefinidos.",
          "Pedir el consentimiento con casillas premarcadas.",
          "No ofrecer una vía sencilla para ejercer los derechos.",
        ],
        paragraphs: [],
      },
      {
        id: "sanciones",
        heading: "Sanciones",
        paragraphs: [
          "Incumplir el deber de información es una infracción del RGPD. Las multas por vulnerar los derechos de los interesados pueden alcanzar importes muy elevados según el artículo 83 del RGPD; en la práctica, la AEPD gradúa la sanción según el tamaño del negocio y la gravedad, pero las pequeñas empresas y autónomos también reciben sanciones.",
        ],
      },
    ],
    faq: [
      { q: "¿Necesito política de privacidad si solo tengo un email de contacto?", a: "Sí. Al responder a quien te escribe tratas sus datos personales, por lo que debes informarle." },
      { q: "¿Tengo que nombrar a mi proveedor de hosting?", a: "Debes informar de los destinatarios o categorías de destinatarios. Indicar los proveedores principales es la opción más transparente." },
      { q: "¿Cada cuánto debo revisarla?", a: "Cada vez que cambies de herramientas, añadas formularios o empieces a vender online, y al menos una vez al año." },
    ],
    relatedLanding: { href: "/politica-de-privacidad-autonomos", label: "Política de privacidad para autónomos" },
  },
  {
    slug: "politica-de-cookies-y-banner-de-consentimiento",
    title: "Política de cookies: qué debe incluir y cuándo necesitas un banner",
    metaTitle: "Política de cookies y banner: qué necesita tu web en 2026",
    description:
      "Qué debe incluir la política de cookies, qué cookies necesitan consentimiento, cómo debe ser el banner según la guía de la AEPD y los errores más habituales.",
    keyword: "política de cookies",
    navLabel: "Cookies y banner de consentimiento",
    published: "2026-11-01",
    updated: "2026-11-01",
    readingMinutes: 7,
    lead: "Casi todas las webs instalan cookies: para que funcione el carrito, para medir visitas o para mostrar un vídeo de YouTube. La política de cookies informa de ellas, pero no es suficiente por sí sola: las cookies que no son necesarias exigen además el consentimiento previo del usuario.",
    sections: [
      {
        id: "que-son",
        heading: "Qué son las cookies y qué dice la ley",
        paragraphs: [
          "Las cookies son pequeños archivos que la web guarda en el dispositivo del usuario. El artículo 22.2 de la LSSI-CE exige informar de forma clara y completa sobre su uso y obtener el consentimiento del usuario antes de instalarlas, salvo en las cookies exentas.",
          "La Agencia Española de Protección de Datos (AEPD) publica una guía sobre el uso de las cookies que concreta cómo cumplir esta obligación y es la referencia práctica en España.",
        ],
      },
      {
        id: "exentas",
        heading: "Cookies que no necesitan consentimiento",
        paragraphs: ["Están exentas las cookies estrictamente necesarias para prestar el servicio que el usuario ha pedido, por ejemplo:"],
        bullets: [
          "Las que mantienen la sesión iniciada o el contenido del carrito.",
          "Las que recuerdan la elección del usuario sobre cookies.",
          "Las de seguridad o de equilibrio de carga.",
        ],
      },
      {
        id: "con-consentimiento",
        heading: "Cookies que sí necesitan consentimiento",
        paragraphs: [
          "Por regla general necesitan consentimiento las cookies analíticas (como las de Google Analytics), las publicitarias (píxeles de Meta, Google Ads o TikTok) y muchas de las que instalan contenidos de terceros (vídeos, mapas o chats integrados).",
          "Algunas herramientas de analítica funcionan sin cookies; en ese caso la situación cambia y conviene describirlo en la política.",
        ],
      },
      {
        id: "banner",
        heading: "Cómo debe ser el banner de cookies",
        paragraphs: ["Según la guía de la AEPD, el sistema de consentimiento debe:"],
        bullets: [
          "Mostrarse antes de instalar cookies no necesarias.",
          "Ofrecer la opción de rechazar con la misma facilidad que la de aceptar (por ejemplo, ambos botones en la primera capa).",
          "Permitir configurar las cookies por finalidades.",
          "No considerar consentimiento el simple hecho de seguir navegando o hacer scroll.",
          "Permitir retirar el consentimiento en cualquier momento de forma sencilla.",
          "Renovar el consentimiento periódicamente (la AEPD recomienda un máximo de 24 meses).",
        ],
      },
      {
        id: "contenido",
        heading: "Qué debe incluir la política de cookies",
        bullets: [
          "Qué son las cookies.",
          "Qué cookies usa la web: nombre, proveedor, finalidad, duración y tipo (técnica, analítica, publicitaria…).",
          "Si son propias o de terceros, y quiénes son esos terceros.",
          "Cómo aceptar, rechazar, configurar o retirar el consentimiento.",
          "Cómo desactivarlas desde el navegador.",
          "Transferencias internacionales, cuando las haya.",
        ],
        paragraphs: [],
      },
      {
        id: "errores",
        heading: "Errores frecuentes",
        bullets: [
          "Tener política de cookies pero instalar Google Analytics antes de que el usuario acepte.",
          "Un banner con «Aceptar» destacado y la opción de rechazar escondida en una segunda pantalla.",
          "Una tabla de cookies desactualizada que no refleja las herramientas reales de la web.",
          "Copiar la política de otra web con cookies que tú no usas.",
        ],
        paragraphs: [],
      },
    ],
    faq: [
      { q: "¿La política de cookies sustituye al banner?", a: "No. La política informa; el banner o gestor de consentimiento recoge el consentimiento. Si usas cookies no necesarias, necesitas ambos." },
      { q: "¿Necesito banner si solo uso cookies técnicas?", a: "No es necesario pedir consentimiento para cookies exentas, aunque es recomendable informar de ellas." },
      { q: "¿Cómo sé qué cookies usa mi web?", a: "Con un escáner de cookies o revisando las herramientas instaladas. Legalito parte de las herramientas que indicas y te recomienda contrastarlo con un escaneo real." },
    ],
    relatedLanding: { href: "/generador-politica-de-cookies", label: "Generador de política de cookies" },
  },
  {
    slug: "es-obligatorio-aviso-legal-privacidad-cookies",
    title: "¿Es obligatorio tener aviso legal, política de privacidad y de cookies?",
    metaTitle: "¿Es obligatorio el aviso legal, la privacidad y las cookies?",
    description:
      "Cuándo es obligatorio cada texto legal de una web en España, qué norma lo exige y qué riesgos tiene no tenerlos. Resumen claro para autónomos, empresas y tiendas online.",
    keyword: "textos legales obligatorios web",
    navLabel: "¿Qué textos legales son obligatorios?",
    published: "2026-11-01",
    updated: "2026-11-01",
    readingMinutes: 5,
    lead: "Es una de las preguntas más habituales al crear una web. La respuesta corta: si tu web forma parte de un negocio, casi siempre necesitas los tres documentos. La respuesta completa depende de lo que haga tu web.",
    sections: [
      {
        id: "resumen",
        heading: "Resumen: cuándo es obligatorio cada documento",
        paragraphs: [],
        table: {
          columns: ["Documento", "Cuándo es obligatorio", "Norma principal"],
          rows: [
            ["Aviso legal", "Si la web está vinculada a una actividad económica", "LSSI-CE, art. 10"],
            ["Política de privacidad", "Si tratas datos personales (formularios, emails, pedidos, analítica…)", "RGPD, arts. 12-14 y LOPDGDD"],
            ["Política de cookies", "Si la web usa cookies o tecnologías similares", "LSSI-CE, art. 22.2"],
            ["Condiciones de contratación", "Si vendes productos o servicios online", "Ley General para la Defensa de los Consumidores y Usuarios"],
          ],
        },
      },
      {
        id: "web-informativa",
        heading: "¿Y si mi web es solo informativa?",
        paragraphs: [
          "Una web informativa de un negocio sigue necesitando aviso legal, porque forma parte de una actividad económica. Si además tiene formulario o un email de contacto, necesitas política de privacidad. Y si instala cookies (algo muy habitual con plantillas, vídeos o analítica), también política de cookies.",
        ],
      },
      {
        id: "blog-personal",
        heading: "¿Y un blog personal?",
        paragraphs: [
          "Un blog sin ningún tipo de actividad económica puede quedar fuera de la LSSI-CE, pero en cuanto incorpora publicidad o enlaces de afiliación la situación cambia. La protección de datos y las cookies aplican igualmente si tratas datos o instalas cookies.",
        ],
      },
      {
        id: "riesgos",
        heading: "Riesgos de no tenerlos",
        bullets: [
          "Multas de la LSSI-CE (las leves, de hasta 30.000 €) y del RGPD.",
          "Reclamaciones de usuarios ante la AEPD.",
          "Pérdida de confianza de clientes y proveedores.",
          "Problemas con plataformas de publicidad o pago, que suelen exigir una política de privacidad publicada.",
        ],
        paragraphs: [],
      },
      {
        id: "no-basta",
        heading: "Tener los documentos no es todo",
        paragraphs: [
          "Los textos legales son necesarios, pero no suficientes: hay que aplicar lo que dicen. Por ejemplo, instalar un gestor de consentimiento si usas cookies no necesarias, informar en los formularios o firmar contratos con los proveedores que tratan datos por tu cuenta.",
        ],
      },
    ],
    faq: [
      { q: "¿Basta con un único texto con todo?", a: "Se recomienda separar los documentos: responden a normas distintas y así cada uno es más claro y fácil de mantener." },
      { q: "¿Tengo que registrar estos documentos en algún sitio?", a: "No. Basta con publicarlos en la web, accesibles desde todas las páginas." },
    ],
    relatedLanding: { href: "/textos-legales-pagina-web", label: "Textos legales para tu web" },
  },
  {
    slug: "textos-legales-tienda-online",
    title: "Textos legales para una tienda online: la lista completa",
    metaTitle: "Textos legales de una tienda online: lista completa 2026",
    description:
      "Qué documentos legales necesita una tienda online en España: aviso legal, privacidad, cookies, condiciones de venta, desistimiento, envíos y garantías. Checklist práctica.",
    keyword: "textos legales tienda online",
    navLabel: "Textos legales de una tienda online",
    published: "2026-11-01",
    updated: "2026-11-01",
    readingMinutes: 7,
    lead: "Una tienda online trata más datos, usa más herramientas y firma contratos con consumidores en cada pedido. Por eso necesita más textos legales que una web informativa. Esta es la lista completa.",
    sections: [
      {
        id: "basicos",
        heading: "Los tres textos básicos",
        bullets: [
          "Aviso legal, con los datos del titular de la tienda.",
          "Política de privacidad, que incluya pedidos, pagos, envíos, cuentas de cliente y newsletter si la tienes.",
          "Política de cookies, que refleje las cookies de sesión y carrito y las de analítica o publicidad.",
        ],
        paragraphs: [],
      },
      {
        id: "condiciones",
        heading: "Condiciones generales de contratación",
        paragraphs: [
          "Son el contrato con tus clientes. La normativa de consumidores exige facilitar antes de la compra información clara sobre el producto, el precio total con impuestos, los gastos de envío, las formas de pago, los plazos de entrega, el derecho de desistimiento y las garantías.",
          "Deben aceptarse antes de finalizar cada pedido y estar disponibles en todo momento.",
        ],
      },
      {
        id: "desistimiento",
        heading: "Derecho de desistimiento",
        paragraphs: [
          "Por regla general, el consumidor dispone de 14 días naturales para desistir de una compra a distancia sin dar explicaciones. Debes informar de este derecho, de sus excepciones (por ejemplo, productos personalizados o contenido digital suministrado de inmediato con consentimiento expreso) y facilitar un formulario de desistimiento.",
        ],
      },
      {
        id: "garantias",
        heading: "Garantías",
        paragraphs: [
          "Los productos vendidos a consumidores tienen una garantía legal frente a faltas de conformidad, que para los bienes adquiridos desde 2022 es de tres años. Debes informar de ella en tus condiciones.",
        ],
      },
      {
        id: "envios",
        heading: "Política de envíos y devoluciones",
        paragraphs: [
          "Aunque puede formar parte de las condiciones generales, muchas tiendas la publican como página independiente: zonas de envío, plazos, costes, transportistas y cómo se gestionan las devoluciones y reembolsos.",
        ],
      },
      {
        id: "checklist",
        heading: "Checklist final",
        bullets: [
          "Aviso legal, privacidad y cookies enlazados en el pie de página.",
          "Banner de consentimiento si usas analítica o píxeles publicitarios.",
          "Condiciones de venta aceptadas en el proceso de compra.",
          "Información de desistimiento y formulario.",
          "Precios con impuestos incluidos y gastos de envío visibles antes de pagar.",
          "Casilla separada y sin marcar para la newsletter.",
        ],
        paragraphs: [],
      },
    ],
    faq: [
      { q: "¿Legalito genera las condiciones de venta?", a: "Todavía no. Genera aviso legal, privacidad y cookies adaptados a tiendas online y te avisa de que necesitas condiciones de venta." },
      { q: "¿Shopify o WooCommerce ya incluyen los textos legales?", a: "Ofrecen plantillas genéricas que debes adaptar a tu negocio. No cubren tus datos ni tus herramientas reales." },
    ],
    relatedLanding: { href: "/documentos-legales-tienda-online", label: "Documentos legales para tiendas online" },
  },
  {
    slug: "rgpd-para-autonomos",
    title: "RGPD para autónomos: lo esencial para tu web y tu negocio",
    metaTitle: "RGPD para autónomos: guía práctica y sencilla (2026)",
    description:
      "Qué debe hacer un autónomo para cumplir el RGPD: informar, registro de actividades, contratos con proveedores, derechos, brechas de seguridad y newsletter. Guía práctica sin tecnicismos.",
    keyword: "RGPD autónomos",
    navLabel: "RGPD para autónomos",
    published: "2026-11-01",
    updated: "2026-11-01",
    readingMinutes: 7,
    lead: "El Reglamento General de Protección de Datos se aplica igual a una gran empresa que a un autónomo que guarda los datos de sus clientes. La buena noticia es que, para la mayoría de pequeños negocios, cumplir lo esencial es asumible si se sabe por dónde empezar.",
    sections: [
      {
        id: "informar",
        heading: "1. Informar a las personas",
        paragraphs: [
          "Debes explicar qué datos tratas y para qué: en tu web (política de privacidad y textos junto a los formularios) y también fuera de ella, por ejemplo en presupuestos o fichas de clientes.",
        ],
      },
      {
        id: "registro",
        heading: "2. Registro de actividades de tratamiento",
        paragraphs: [
          "Es un documento interno donde describes tus tratamientos: clientes, proveedores, newsletter, candidatos… La excepción para entidades de menos de 250 empleados no se aplica cuando el tratamiento no es ocasional, así que en la práctica la mayoría de negocios deberían tenerlo.",
        ],
      },
      {
        id: "proveedores",
        heading: "3. Contratos con tus proveedores",
        paragraphs: [
          "Si un proveedor trata datos por tu cuenta (hosting, gestoría, herramienta de email, software de facturación), necesitas un contrato de encargo del tratamiento (artículo 28 del RGPD). Muchos proveedores lo incluyen en sus condiciones: guárdalo.",
        ],
      },
      {
        id: "derechos",
        heading: "4. Atender los derechos",
        paragraphs: [
          "Cualquier persona puede pedirte acceso, rectificación, supresión, oposición, limitación o portabilidad de sus datos. Tienes un mes para responder, ampliable en casos complejos. Ten preparado un email o formulario para recibir estas solicitudes.",
        ],
      },
      {
        id: "seguridad",
        heading: "5. Seguridad y brechas",
        paragraphs: [
          "Aplica medidas razonables: contraseñas robustas, doble factor, copias de seguridad y acceso restringido. Si sufres una brecha de seguridad que suponga un riesgo para las personas, debes notificarla a la AEPD en 72 horas.",
        ],
      },
      {
        id: "newsletter",
        heading: "6. Newsletter y comunicaciones comerciales",
        paragraphs: [
          "Para enviar comunicaciones comerciales por email necesitas el consentimiento previo y expreso (LSSI-CE, artículo 21), salvo que exista una relación contractual previa y se trate de productos similares. Cada envío debe permitir darse de baja fácilmente.",
        ],
      },
      {
        id: "herramientas",
        heading: "Herramientas útiles",
        paragraphs: [
          "La AEPD ofrece herramientas gratuitas como «Facilita RGPD», pensada para negocios con tratamientos de bajo riesgo. Para tu web, Legalito te ayuda a preparar la política de privacidad, el aviso legal y la política de cookies a partir de tus respuestas.",
        ],
      },
    ],
    faq: [
      { q: "¿Necesito un Delegado de Protección de Datos?", a: "Solo en determinados casos (por ejemplo, tratamientos a gran escala de datos sensibles o seguimiento sistemático). La mayoría de autónomos no lo necesita." },
      { q: "¿Puedo usar WhatsApp con mis clientes?", a: "Sí, pero debes informarles y tener en cuenta que implica un proveedor externo. Separa el uso personal del profesional." },
    ],
    relatedLanding: { href: "/politica-de-privacidad-autonomos", label: "Política de privacidad para autónomos" },
  },
];

export function getGuide(slug: string): Guide | undefined {
  return GUIDES.find((g) => g.slug === slug);
}

export function formatGuideDate(iso: string): string {
  return new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${iso}T00:00:00Z`));
}

/** Guías relacionadas con una landing (para enlazado interno). */
export function guidesForLanding(href: string): Guide[] {
  return GUIDES.filter((g) => g.relatedLanding.href === href);
}

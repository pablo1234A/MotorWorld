import type { TemplateContent } from "../engine";

/**
 * PLANTILLA DE DEMOSTRACIÓN — NO REVISADA JURÍDICAMENTE.
 * Estructura de referencia basada en el art. 22.2 LSSI-CE y la Guía sobre el
 * uso de las cookies de la AEPD. Una política de cookies NO sustituye a un
 * sistema de gestión del consentimiento.
 */
export const cookiesDemo: TemplateContent = {
  title: "Política de cookies",
  intro: [
    {
      type: "paragraph",
      text: "En esta política te informamos sobre las cookies y tecnologías similares que se utilizan en el sitio web {{contact.website}}, titularidad de {{owner.legal_name}}, y sobre cómo puedes gestionarlas.",
    },
  ],
  sections: [
    {
      id: "que-son",
      heading: "¿Qué son las cookies?",
      blocks: [
        {
          type: "paragraph",
          text: "Las cookies son pequeños archivos que se descargan en tu dispositivo al visitar una página web. Permiten, entre otras cosas, que la web funcione correctamente, recordar tus preferencias o conocer cómo se utiliza.",
        },
      ],
    },
    {
      id: "cookies-utilizadas",
      heading: "Cookies que utiliza este sitio web",
      blocks: [
        {
          type: "table",
          columns: ["Cookie", "Proveedor", "Finalidad", "Duración", "Tipo"],
          source: "cookies.list",
          cellTexts: ["{{item.name}}", "{{item.provider}}", "{{item.purpose}}", "{{item.duration}}", "{{item.kind}}"],
          empty: "Este sitio web no utiliza cookies propias ni de terceros que requieran información adicional, más allá de las estrictamente necesarias para su funcionamiento.",
        },
        {
          type: "paragraph",
          when: { eq: ["cookies.analytics_tool", "plausible"] },
          text: "Para obtener estadísticas de uso se utiliza Plausible, una herramienta de analítica que no instala cookies en tu dispositivo.",
        },
        {
          type: "paragraph",
          when: { truthy: "cookies.has_chat" },
          text: "El servicio de chat integrado puede instalar cookies propias del proveedor del servicio para mantener la conversación. Consulta la política del proveedor para más detalle.",
        },
        {
          type: "paragraph",
          text: "Esta relación se ha elaborado a partir de las herramientas utilizadas en el sitio web y puede variar si los proveedores modifican sus servicios. La revisamos periódicamente.",
        },
      ],
    },
    {
      id: "consentimiento",
      heading: "Consentimiento",
      when: { truthy: "cookies.has_nonessential" },
      blocks: [
        {
          type: "paragraph",
          text: "Las cookies técnicas son necesarias para el funcionamiento del sitio web y no requieren tu consentimiento. El resto de cookies (analíticas, de preferencias o publicitarias) solo se instalan si las aceptas.",
        },
        {
          type: "paragraph",
          when: { truthy: "cookies.has_cmp" },
          text: "Al acceder por primera vez se muestra un panel, gestionado mediante {{cookies.cmp_name}}, en el que puedes aceptar, rechazar o configurar las cookies. Puedes cambiar tu elección o retirar tu consentimiento en cualquier momento desde ese mismo panel.",
        },
        {
          type: "paragraph",
          when: { falsy: "cookies.has_cmp" },
          text: "Antes de instalar estas cookies se te pedirá tu consentimiento, que podrás retirar en cualquier momento.",
        },
      ],
    },
    {
      id: "terceros",
      heading: "Cookies de terceros",
      when: { truthy: "cookies.has_third_party" },
      blocks: [
        {
          type: "paragraph",
          text: "Algunas cookies son gestionadas por terceros. Estos proveedores tratan la información conforme a sus propias políticas de privacidad, que te recomendamos consultar.",
        },
        {
          type: "paragraph",
          when: { truthy: "cookies.uses_advertising" },
          text: "Las herramientas publicitarias utilizadas ({{cookies.advertising_labels}}) pueden utilizar la información obtenida para mostrarte publicidad basada en tus hábitos de navegación.",
        },
        {
          type: "paragraph",
          when: { truthy: "international_transfers" },
          text: "Algunos de estos terceros pueden tratar los datos fuera del Espacio Económico Europeo con las garantías descritas en nuestra política de privacidad.",
        },
      ],
    },
    {
      id: "navegador",
      heading: "Cómo desactivar o eliminar las cookies desde el navegador",
      blocks: [
        { type: "paragraph", text: "También puedes bloquear o eliminar las cookies desde la configuración de tu navegador:" },
        {
          type: "list",
          items: [
            "Google Chrome: https://support.google.com/chrome/answer/95647",
            "Mozilla Firefox: https://support.mozilla.org/es/kb/habilitar-y-deshabilitar-cookies-sitios-web-rastrear-preferencias",
            "Safari: https://support.apple.com/es-es/guide/safari/sfri11471/mac",
            "Microsoft Edge: https://support.microsoft.com/es-es/microsoft-edge",
          ],
        },
        {
          type: "paragraph",
          text: "Si bloqueas todas las cookies, es posible que algunas funciones del sitio web no estén disponibles.",
        },
      ],
    },
    {
      id: "actualizacion",
      heading: "Actualización de esta política",
      blocks: [
        {
          type: "paragraph",
          text: "Actualizaremos esta política cuando cambien las cookies utilizadas. Para cualquier consulta puedes escribirnos a {{contact.email}}.",
        },
      ],
    },
  ],
  closing: [{ type: "paragraph", text: "Última actualización: {{meta.generated_date}}." }],
};

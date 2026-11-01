import type { TemplateContent } from "../engine";

/**
 * PLANTILLA DE DEMOSTRACIÓN — NO REVISADA JURÍDICAMENTE.
 * Estructura de referencia basada en el art. 10 de la LSSI-CE para que el
 * equipo jurídico la revise, corrija y apruebe como versión 1.0.0.
 */
export const avisoLegalDemo: TemplateContent = {
  title: "Aviso legal",
  intro: [
    {
      type: "paragraph",
      text: "En cumplimiento del deber de información recogido en el artículo 10 de la Ley 34/2002, de 11 de julio, de Servicios de la Sociedad de la Información y de Comercio Electrónico (LSSI-CE), se facilitan a continuación los datos identificativos del titular del sitio web {{contact.website}}.",
    },
  ],
  sections: [
    {
      id: "datos-identificativos",
      heading: "Datos identificativos del titular",
      blocks: [
        {
          type: "list",
          items: [
            "Titular: {{owner.legal_name}}",
            { text: "Nombre comercial: {{owner.trade_name}}", when: { nonEmpty: "owner.trade_name" } },
            "NIF: {{owner.nif}}",
            "Domicilio: {{owner.address_full}}",
            "Correo electrónico: {{contact.email}}",
            { text: "Teléfono: {{contact.phone}}", when: { nonEmpty: "contact.phone" } },
            { text: "Datos registrales: {{owner.registry_data}}", when: { truthy: "owner.is_company" } },
          ],
        },
      ],
    },
    {
      id: "profesion-regulada",
      heading: "Información sobre la profesión regulada",
      when: { truthy: "professional.regulated" },
      blocks: [
        {
          type: "list",
          items: [
            "Colegio profesional: {{professional.college}}",
            "Número de colegiado: {{professional.number}}",
            "Título académico y Estado de expedición: {{professional.title}}",
          ],
        },
        {
          type: "paragraph",
          text: "La actividad profesional se rige por las normas deontológicas y estatutarias aprobadas por {{professional.college}}, que pueden consultarse a través de los medios que dicho colegio pone a disposición del público.",
        },
      ],
    },
    {
      id: "objeto",
      heading: "Objeto",
      blocks: [
        {
          type: "paragraph",
          text: "Este aviso legal regula el acceso y el uso del sitio web {{contact.website}} (en adelante, el «sitio web»), mediante el cual {{owner.display_name}} ofrece información sobre su actividad: {{business.activity}}",
        },
        {
          type: "paragraph",
          text: "El acceso al sitio web atribuye la condición de usuario e implica la aceptación de este aviso legal. Si no estás de acuerdo con su contenido, te rogamos que no utilices el sitio web.",
        },
      ],
    },
    {
      id: "condiciones-uso",
      heading: "Condiciones de uso",
      blocks: [
        { type: "paragraph", text: "El usuario se compromete a hacer un uso adecuado del sitio web y, en particular, a no:" },
        {
          type: "list",
          items: [
            "Utilizarlo con fines ilícitos o contrarios a la buena fe y al orden público.",
            "Introducir o difundir virus informáticos o cualquier sistema que pueda causar daños.",
            "Intentar acceder a áreas restringidas o a cuentas de otros usuarios.",
            { text: "Publicar comentarios o reseñas con contenido ofensivo, falso o que vulnere derechos de terceros.", when: { truthy: "data.comments" } },
          ],
        },
      ],
    },
    {
      id: "propiedad-intelectual",
      heading: "Propiedad intelectual e industrial",
      blocks: [
        {
          type: "paragraph",
          text: "Los contenidos del sitio web (textos, imágenes, diseño, logotipos y código) son titularidad de {{owner.display_name}} o de terceros que han autorizado su uso. Queda prohibida su reproducción, distribución o transformación sin autorización expresa, salvo para uso personal y privado.",
        },
      ],
    },
    {
      id: "responsabilidad",
      heading: "Responsabilidad",
      blocks: [
        {
          type: "paragraph",
          text: "{{owner.display_name}} procura que la información del sitio web sea correcta y esté actualizada, pero no garantiza la ausencia de errores ni la disponibilidad ininterrumpida del sitio web. No será responsable de los daños derivados de un uso indebido del sitio web por parte del usuario.",
        },
      ],
    },
    {
      id: "enlaces",
      heading: "Enlaces a otros sitios web",
      blocks: [
        {
          type: "paragraph",
          text: "El sitio web puede contener enlaces a páginas de terceros. {{owner.display_name}} no controla dichos sitios y no se responsabiliza de sus contenidos, sin perjuicio de retirar el enlace cuando tenga conocimiento efectivo de su ilicitud.",
        },
      ],
    },
    {
      id: "contratacion",
      heading: "Contratación",
      when: { truthy: "business.is_ecommerce" },
      blocks: [
        {
          type: "paragraph",
          text: "La compra de productos o servicios a través del sitio web se rige por las condiciones generales de contratación publicadas en el propio sitio web, que el usuario debe aceptar antes de completar cada pedido.",
        },
      ],
    },
    {
      id: "proteccion-datos",
      heading: "Protección de datos y cookies",
      blocks: [
        {
          type: "paragraph",
          text: "El tratamiento de los datos personales de los usuarios se describe en la política de privacidad, y el uso de cookies en la política de cookies, ambas disponibles en el sitio web.",
        },
      ],
    },
    {
      id: "legislacion",
      heading: "Legislación aplicable y jurisdicción",
      blocks: [
        {
          type: "paragraph",
          text: "Este aviso legal se rige por la legislación española. Para la resolución de cualquier controversia serán competentes los juzgados y tribunales que correspondan conforme a la normativa aplicable. Cuando el usuario tenga la condición de consumidor, serán competentes los de su domicilio.",
        },
      ],
    },
  ],
  closing: [{ type: "paragraph", text: "Última actualización: {{meta.generated_date}}." }],
};

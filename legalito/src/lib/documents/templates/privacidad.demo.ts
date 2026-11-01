import type { TemplateContent } from "../engine";

/**
 * PLANTILLA DE DEMOSTRACIÓN — NO REVISADA JURÍDICAMENTE.
 * Estructura de referencia basada en los arts. 13 y 14 del RGPD y la LOPDGDD.
 */
export const privacidadDemo: TemplateContent = {
  title: "Política de privacidad",
  intro: [
    {
      type: "paragraph",
      text: "En esta política te explicamos cómo trata {{owner.display_name}} los datos personales de las personas que visitan el sitio web {{contact.website}} o se ponen en contacto a través de él, conforme al Reglamento (UE) 2016/679 (RGPD) y a la Ley Orgánica 3/2018 (LOPDGDD).",
    },
  ],
  sections: [
    {
      id: "responsable",
      heading: "Responsable del tratamiento",
      blocks: [
        {
          type: "list",
          items: [
            "Responsable: {{owner.legal_name}}",
            "NIF: {{owner.nif}}",
            "Domicilio: {{owner.address_full}}",
            "Correo electrónico: {{contact.email}}",
            { text: "Teléfono: {{contact.phone}}", when: { nonEmpty: "contact.phone" } },
            { text: "Delegado de Protección de Datos: {{data.dpo_contact}}", when: { truthy: "data.has_dpo" } },
          ],
        },
      ],
    },
    {
      id: "sin-recogida",
      heading: "Datos que tratamos",
      when: { falsy: "data.collects_any" },
      blocks: [
        {
          type: "paragraph",
          text: "Este sitio web no recoge datos personales mediante formularios ni registros. Si nos escribes por correo electrónico, trataremos los datos que nos facilites únicamente para responder a tu mensaje, sobre la base de tu consentimiento, y los conservaremos mientras sea necesario para atenderlo.",
        },
        {
          type: "paragraph",
          text: "Durante la navegación, el proveedor de alojamiento puede tratar datos técnicos, como la dirección IP, para garantizar el funcionamiento y la seguridad del sitio web.",
        },
      ],
    },
    {
      id: "finalidades",
      heading: "Finalidades, base jurídica y conservación",
      when: { truthy: "data.collects_any" },
      blocks: [
        {
          type: "table",
          columns: ["Finalidad", "Base jurídica", "Conservación"],
          rows: [
            {
              when: { truthy: "data.contact_form" },
              cells: [
                "Atender las consultas que nos envías a través del formulario de contacto o por correo electrónico.",
                "Tu consentimiento y, en su caso, la aplicación de medidas precontractuales a petición tuya (art. 6.1.a y 6.1.b RGPD).",
                "El tiempo necesario para responder y, después, durante los plazos de prescripción de las posibles responsabilidades.",
              ],
            },
            {
              when: { truthy: "data.newsletter" },
              cells: [
                "Enviarte nuestra newsletter y comunicaciones sobre nuestra actividad.",
                "Tu consentimiento (art. 6.1.a RGPD y art. 21 LSSI-CE).",
                "Hasta que te des de baja o retires tu consentimiento.",
              ],
            },
            {
              when: { truthy: "data.accounts" },
              cells: [
                "Gestionar tu cuenta de usuario y el acceso al área privada.",
                "La ejecución de la relación contractual (art. 6.1.b RGPD).",
                "Mientras mantengas tu cuenta activa y, después, durante los plazos legales aplicables.",
              ],
            },
            {
              when: { truthy: "data.orders" },
              cells: [
                "Gestionar tus pedidos, pagos, envíos, devoluciones y la facturación.",
                "La ejecución del contrato (art. 6.1.b RGPD) y el cumplimiento de obligaciones legales fiscales y mercantiles (art. 6.1.c RGPD).",
                "Durante la relación contractual y los plazos exigidos por la normativa fiscal y mercantil.",
              ],
            },
            {
              when: { truthy: "data.bookings" },
              cells: [
                "Gestionar tus reservas o citas.",
                "La ejecución de la relación contractual o de medidas precontractuales (art. 6.1.b RGPD).",
                "El tiempo necesario para prestar el servicio y, después, durante los plazos legales aplicables.",
              ],
            },
            {
              when: { truthy: "data.job_applications" },
              cells: [
                "Valorar tu candidatura en procesos de selección.",
                "Tu consentimiento y la aplicación de medidas precontractuales (art. 6.1.a y 6.1.b RGPD).",
                "Hasta la finalización del proceso de selección o, si lo autorizas, durante un máximo de un año para futuros procesos.",
              ],
            },
            {
              when: { truthy: "data.social_networks" },
              cells: [
                "Gestionar nuestros perfiles en redes sociales e interactuar con quienes nos siguen o nos escriben a través de ellas.",
                "Tu consentimiento al seguirnos o interactuar con nosotros (art. 6.1.a RGPD).",
                "Mientras sigas nuestros perfiles o no solicites la supresión. Cada red social trata además tus datos conforme a su propia política.",
              ],
            },
            {
              when: { truthy: "data.comments" },
              cells: [
                "Publicar y moderar los comentarios o reseñas que envías.",
                "Tu consentimiento (art. 6.1.a RGPD).",
                "Mientras el comentario permanezca publicado o hasta que solicites su supresión.",
              ],
            },
          ],
        },
      ],
    },
    {
      id: "categorias-especiales",
      heading: "Categorías especiales de datos",
      when: { truthy: "data.special_categories" },
      blocks: [
        {
          type: "paragraph",
          text: "Para prestar nuestros servicios podemos tratar categorías especiales de datos, como datos de salud. Solo los trataremos cuando sea imprescindible y con tu consentimiento explícito u otra causa legitimadora prevista en el artículo 9.2 del RGPD, aplicando medidas de seguridad reforzadas.",
        },
      ],
    },
    {
      id: "menores",
      heading: "Menores de edad",
      blocks: [
        {
          type: "paragraph",
          when: { truthy: "data.minors" },
          text: "Cuando los datos correspondan a menores de 14 años, solo los trataremos con el consentimiento de sus padres, madres o tutores legales, que podremos solicitar que acrediten.",
        },
        {
          type: "paragraph",
          when: { falsy: "data.minors" },
          text: "Este sitio web no está dirigido a menores de 14 años. Si tienes menos de esa edad, no nos facilites tus datos sin el consentimiento de tus padres, madres o tutores legales.",
        },
      ],
    },
    {
      id: "destinatarios",
      heading: "Destinatarios de los datos",
      blocks: [
        {
          type: "paragraph",
          text: "No cederemos tus datos a terceros salvo obligación legal. Para prestar nuestros servicios contamos con proveedores que pueden acceder a los datos en calidad de encargados del tratamiento, con los que mantenemos los contratos exigidos por el artículo 28 del RGPD:",
        },
        { type: "list", source: "processors", itemText: "{{item.name}}: {{item.purpose}}." },
      ],
    },
    {
      id: "transferencias",
      heading: "Transferencias internacionales",
      when: { truthy: "international_transfers" },
      blocks: [
        {
          type: "paragraph",
          text: "Algunos de los proveedores indicados pueden tratar datos fuera del Espacio Económico Europeo. En esos casos, las transferencias se amparan en decisiones de adecuación de la Comisión Europea, como el Marco de Privacidad de Datos UE-EE. UU. para las entidades adheridas, o en cláusulas contractuales tipo aprobadas por la Comisión.",
        },
      ],
    },
    {
      id: "derechos",
      heading: "Tus derechos",
      blocks: [
        {
          type: "paragraph",
          text: "Puedes ejercer en cualquier momento los siguientes derechos escribiendo a {{contact.email}}, indicando el derecho que deseas ejercer:",
        },
        {
          type: "list",
          items: [
            "Acceso a tus datos personales.",
            "Rectificación de los datos inexactos.",
            "Supresión de tus datos.",
            "Oposición al tratamiento y limitación del tratamiento.",
            "Portabilidad de tus datos.",
            "Retirada del consentimiento prestado, sin que ello afecte a la licitud del tratamiento previo.",
          ],
        },
        {
          type: "paragraph",
          text: "Si consideras que no hemos atendido correctamente tus derechos, puedes presentar una reclamación ante la Agencia Española de Protección de Datos (www.aepd.es).",
        },
      ],
    },
    {
      id: "perfiles",
      heading: "Decisiones automatizadas",
      blocks: [
        {
          type: "paragraph",
          when: { falsy: "cookies.uses_advertising" },
          text: "No tomamos decisiones basadas únicamente en el tratamiento automatizado de tus datos ni elaboramos perfiles.",
        },
        {
          type: "paragraph",
          when: { truthy: "cookies.uses_advertising" },
          text: "No tomamos decisiones basadas únicamente en el tratamiento automatizado de tus datos. Las cookies publicitarias de terceros que puedas aceptar pueden utilizarse para elaborar perfiles con fines publicitarios, tal como se explica en la política de cookies.",
        },
      ],
    },
    {
      id: "seguridad",
      heading: "Seguridad",
      blocks: [
        {
          type: "paragraph",
          text: "Aplicamos medidas técnicas y organizativas adecuadas para proteger tus datos frente a accesos no autorizados, pérdida o alteración.",
        },
      ],
    },
    {
      id: "cambios",
      heading: "Cambios en esta política",
      blocks: [
        {
          type: "paragraph",
          text: "Podemos actualizar esta política para adaptarla a cambios normativos o en nuestros tratamientos. Publicaremos siempre la versión vigente en el sitio web.",
        },
      ],
    },
  ],
  closing: [{ type: "paragraph", text: "Última actualización: {{meta.generated_date}}." }],
};

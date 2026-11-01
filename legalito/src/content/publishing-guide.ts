/** Instrucciones para publicar los documentos en las plataformas web más habituales. */
export interface PublishGuide {
  id: string;
  platform: string;
  steps: string[];
}

export const PUBLISH_GUIDES: PublishGuide[] = [
  {
    id: "wordpress",
    platform: "WordPress",
    steps: [
      "Ve a Páginas › Añadir nueva y ponle el título del documento (por ejemplo, «Aviso legal»).",
      "Añade un bloque «HTML personalizado» y pega el código copiado desde Legalito.",
      "Publica la página y enlázala desde el pie de página en Apariencia › Menús o en el editor del sitio.",
    ],
  },
  {
    id: "wix",
    platform: "Wix",
    steps: [
      "En el editor, añade una página nueva para cada documento.",
      "Inserta un elemento «Insertar código › HTML incrustado» y pega el código, o pega el texto del PDF en un cuadro de texto.",
      "Añade los enlaces en el pie de página, visible en todas las páginas.",
    ],
  },
  {
    id: "shopify",
    platform: "Shopify",
    steps: [
      "Ve a Tienda online › Páginas › Añadir página.",
      "Pulsa el botón «Mostrar HTML» (<>) del editor y pega el código.",
      "Añade las páginas al menú del pie en Tienda online › Navegación. Revisa también Configuración › Políticas.",
    ],
  },
  {
    id: "woocommerce",
    platform: "WooCommerce / PrestaShop",
    steps: [
      "Crea una página (WooCommerce) o una página CMS (PrestaShop › Diseño › Páginas).",
      "Pega el código en el modo HTML o código fuente del editor.",
      "Enlázala desde el pie de página y, en WooCommerce, asigna la política de privacidad en Ajustes › Privacidad.",
    ],
  },
  {
    id: "squarespace",
    platform: "Squarespace / Webflow",
    steps: [
      "Crea una página nueva para cada documento.",
      "Añade un bloque de código (Code block en Squarespace, Embed en Webflow) y pega el código.",
      "Enlaza las páginas desde el pie de página.",
    ],
  },
  {
    id: "html",
    platform: "Web propia (HTML)",
    steps: [
      "Sube el archivo HTML descargado a tu servidor (por ejemplo, /aviso-legal.html) o pega el código dentro de tu plantilla.",
      "Enlaza cada documento desde el pie de página de todas las páginas.",
      "Si tienes un programador, pásale el código copiado: ya incluye estilos básicos.",
    ],
  },
];

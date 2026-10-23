/* =====================================================================
 * RÉTAME — configuración central
 *
 * Es el ÚNICO sitio donde hay que tocar datos del titular, dominio o
 * publicidad. Los campos vacíos ("") son placeholders internos: la web
 * nunca los muestra al usuario. Si falta un dato obligatorio, la web
 * omite la frase que lo necesita y `npm run build` lo avisa en consola.
 *
 * Puedes sobrescribir siteUrl y basePath sin editar este archivo:
 *   SITE_URL=https://www.tudominio.es BASE_PATH= npm run build
 * =================================================================== */
var CONFIG = {
  name: "RÉTAME",

  /* OBLIGATORIO para producción. Dominio con https y sin barra final.
   * Mientras esté vacío, todas las páginas salen con
   * <meta name="robots" content="noindex"> para que ningún buscador
   * indexe URLs provisionales. */
  siteUrl: "",

  /* "" si la web vive en la raíz del dominio (recomendado).
   * "/subcarpeta" si se publica dentro de una carpeta. */
  basePath: "",

  /* OBLIGATORIO antes de activar anuncios (LSSI-CE, art. 10). */
  owner: "",          // Nombre y apellidos o razón social del titular
  ownerId: "",        // NIF / CIF (opcional pero recomendable si hay actividad económica)
  ownerAddress: "",   // Domicilio a efectos de notificaciones (opcional)
  contactEmail: "",   // Correo de contacto público

  /* Reto del día */
  launchDay: "2026-09-21",   // día del Reto del día n.º 1
  tz: "Europe/Madrid",       // zona horaria que decide cuándo cambia el reto

  /* Redes sociales: URL completa o "". Solo se enlazan las que tengan valor. */
  social: { instagram: "", tiktok: "", x: "", youtube: "" },

  /* Google AdSense. Déjalo vacío hasta que la cuenta esté aprobada.
   * client: "ca-pub-XXXXXXXXXXXXXXXX" (tu ID de editor real)
   * slots:  IDs numéricos de bloques de anuncio creados en AdSense.
   *         Un slot vacío = ese hueco no se pinta. Nunca uses "auto". */
  adsense: {
    client: "",
    slots: {
      home: "",       // portada, entre secciones
      content: "",    // páginas de categoría y de reto, bajo el contenido
      article: ""     // páginas informativas (cómo funciona, sobre RÉTAME)
    }
  },

  /* Consentimiento (EEE, Reino Unido y Suiza).
   * "google": usas el mensaje de «Privacidad y mensajes» de AdSense
   *           (CMP certificada por Google, TCF v2.2). Se activa en el
   *           panel de AdSense; el propio código de AdSense lo muestra.
   * "tcf":    usas otra CMP certificada por Google. Pon su script en
   *           cmpScript; los anuncios esperan a la señal TCF.
   * Sin client de AdSense no se carga nada, sea cual sea el modo. */
  consent: {
    mode: "google",
    cmpScript: ""
  },

  /* Analítica de producto: desactivada. Los eventos (daily_started,
   * duel_created…) se emiten como CustomEvent "retame:event" en window
   * para que puedas conectarlos a la herramienta que elijas. */
  analytics: { enabled: false }
};

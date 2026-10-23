/* =====================================================================
 * Iconos de RÉTAME: un solo trazo (2px, extremos redondeados) sobre una
 * rejilla de 24. Se insertan en línea para no pedir nada a la red.
 * =================================================================== */
var ICON_PATHS = {
  logica: '<path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 0 0-3.6 10.8c.6.5 1 1.2 1 2V16h5.2v-.2c0-.8.4-1.5 1-2A6 6 0 0 0 12 3z"/>',
  matematicas: '<path d="M5 7h5M7.5 4.5v5M14 7h5M5 16.5l4 4M9 16.5l-4 4M14 16h5M14 20h5"/>',
  palabras: '<path d="M3 19 8 5l5 14M4.8 14h6.4"/><path d="M15 12.5c.7-1 1.7-1.5 3-1.5 1.8 0 3 1 3 3v5"/><path d="M21 15.5c-.7-.4-1.6-.5-2.6-.5-2 0-3.4.9-3.4 2.3 0 1.2 1 2.2 2.6 2.2 1.6 0 2.8-.8 3.4-2"/>',
  memoria: '<rect x="3.5" y="3.5" width="7" height="7" rx="1.8"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.8"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.8"/><rect x="13.5" y="13.5" width="7" height="7" rx="1.8"/><circle cx="17" cy="17" r="1.3" fill="currentColor"/><circle cx="7" cy="7" r="1.3" fill="currentColor"/>',
  trivia: '<circle cx="12" cy="12" r="9"/><path d="M9.6 9.3a2.5 2.5 0 1 1 3.5 2.3c-.7.3-1.1.9-1.1 1.6v.6"/><path d="M12 16.8v.2"/>',
  estimacion: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.2"/>',
  observacion: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/>',
  ordenar: '<path d="M7 4v16M3.5 16.5 7 20l3.5-3.5"/><path d="M14 6h7M14 11h5M14 16h3"/>',
  grupo: '<circle cx="9" cy="8" r="3"/><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6"/><path d="M16 5.2a3 3 0 0 1 0 5.6M18 14.4c1.8.9 3 2.9 3 5.6"/>',
  sorpresa: '<rect x="3.5" y="3.5" width="17" height="17" rx="4"/><circle cx="8.5" cy="8.5" r="1.1" fill="currentColor"/><circle cx="15.5" cy="15.5" r="1.1" fill="currentColor"/><circle cx="15.5" cy="8.5" r="1.1" fill="currentColor"/><circle cx="8.5" cy="15.5" r="1.1" fill="currentColor"/><circle cx="12" cy="12" r="1.1" fill="currentColor"/>',
  flame: '<path d="M12 21c-3.9 0-7-2.8-7-6.6 0-2.7 1.6-4.6 3.2-6.2.4 1.6 1.3 2.7 2.4 3.1C10.4 8 12 5 14.6 3c-.2 2.8 1 4.6 2.5 6.3 1.2 1.4 1.9 3 1.9 5.1 0 3.8-3.1 6.6-7 6.6z"/>',
  trophy: '<path d="M8 4h8v5a4 4 0 0 1-8 0V4z"/><path d="M8 6H4.5v1.5A3.5 3.5 0 0 0 8 11M16 6h3.5v1.5A3.5 3.5 0 0 1 16 11"/><path d="M12 13v4M8.5 20.5h7M9.5 17h5v3.5h-5z"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.2"/>',
  duel: '<path d="M14.5 17.5 3 6V3h3l11.5 11.5M13 19l6-6M16 16l4 4M19 21l2-2"/><path d="M14.5 6.5 18 3h3v3l-3.5 3.5M5 14l4 4M7 17l-3 3M3 19l2 2"/>',
  share: '<circle cx="18" cy="5.5" r="2.5"/><circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="18.5" r="2.5"/><path d="m8.2 10.8 7.6-4.1M8.2 13.2l7.6 4.1"/>',
  copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>',
  arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  back: '<path d="M19 12H5M11 18l-6-6 6-6"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  chart: '<path d="M4 20V10M10 20V4M16 20v-7M21 20H3"/>',
  calendar: '<rect x="3.5" y="5" width="17" height="15.5" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
  star: '<path d="m12 3.5 2.6 5.4 5.9.8-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.8z"/>',
  play: '<path d="M7 4.8v14.4a1 1 0 0 0 1.5.9l11.3-7.2a1 1 0 0 0 0-1.7L8.5 3.9A1 1 0 0 0 7 4.8z"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8v.2"/>',
  repeat: '<path d="M4 12a8 8 0 0 1 13.7-5.6L20 8.5M20 4v4.5h-4.5"/><path d="M20 12a8 8 0 0 1-13.7 5.6L4 15.5M4 20v-4.5h4.5"/>',
  lock: '<rect x="5" y="10.5" width="14" height="10" rx="2"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5"/>',
  whatsapp: '<path d="M4 20l1.2-4.1A8 8 0 1 1 8.3 19z"/><path d="M9 8.5c0 3.4 3 6.5 6.5 6.5l1-1.5-2-1-1 .8a4.5 4.5 0 0 1-2.8-2.8l.8-1-1-2z"/>',
  telegram: '<path d="M21 4 3 11l6 2.2L19 7l-7.6 7.6.3 5.4 3-3.6 4.3 3.1z"/>',
  bolt: '<path d="M13 3 5 13.5h6L10 21l8-10.5h-6z"/>'
};

/* Devuelve un <svg> listo para insertar. `label` lo hace accesible;
 * sin label es decorativo (aria-hidden). */
function icon(name, label, cls) {
  var p = ICON_PATHS[name] || ICON_PATHS.info;
  return '<svg class="ico' + (cls ? " " + cls : "") + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"' +
    (label ? ' role="img" aria-label="' + label + '"' : ' aria-hidden="true" focusable="false"') + ">" + p + "</svg>";
}

/* Marca: una diana con mira. El centro amarillo es «tu marca». */
function brandMark(size) {
  var s = size || 32;
  return '<svg class="brand-mark" width="' + s + '" height="' + s + '" viewBox="0 0 64 64" aria-hidden="true" focusable="false">' +
    '<rect width="64" height="64" rx="16" fill="#5B21E8"/>' +
    '<circle cx="32" cy="32" r="18" fill="none" stroke="#fff" stroke-width="4"/>' +
    '<circle cx="32" cy="32" r="9" fill="none" stroke="#fff" stroke-width="4"/>' +
    '<circle cx="32" cy="32" r="3.6" fill="#FFC53D"/>' +
    '<path d="M32 6v8M32 50v8M6 32h8M50 32h8" stroke="#FFC53D" stroke-width="4" stroke-linecap="round"/></svg>';
}

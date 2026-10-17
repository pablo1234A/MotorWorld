/*!
 * Richard Mille — núcleo compartido (UMD)
 * Fuente única de verdad para el frontend (navegador) y el backend (Node):
 * boutiques, catálogos del formulario, cálculo de disponibilidad y validación.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.RM = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* ------------------------------------------------------------------ */
  /* Datos                                                               */
  /* ------------------------------------------------------------------ */

  // Horario semanal: índice 0 = domingo … 6 = sábado. null = cerrado.
  var STD = [null, [10, 19], [10, 19], [10, 19], [10, 19], [10, 19], [10, 18]];
  var MALL = [[10, 22], [10, 22], [10, 22], [10, 22], [10, 22], [10, 23], [10, 23]];
  var DAILY = [[11, 19], [11, 20], [11, 20], [11, 20], [11, 20], [11, 20], [11, 20]];

  var REGIONS = [
    { id: 'europa', label: 'Europa' },
    { id: 'americas', label: 'Américas' },
    { id: 'oriente-medio', label: 'Oriente Medio' },
    { id: 'asia', label: 'Asia-Pacífico' }
  ];

  var BOUTIQUES = [
    { id: 'paris', code: 'PAR', city: 'París', country: 'Francia', region: 'europa', address: 'Avenue Matignon, 75008', lat: 48.8705, lng: 2.3094, tz: 'Europe/Paris', hours: STD, flagship: true },
    { id: 'geneva', code: 'GVA', city: 'Ginebra', country: 'Suiza', region: 'europa', address: 'Rue du Rhône, 1204', lat: 46.2034, lng: 6.1466, tz: 'Europe/Zurich', hours: STD },
    { id: 'london', code: 'LON', city: 'Londres', country: 'Reino Unido', region: 'europa', address: 'Mount Street, Mayfair', lat: 51.5098, lng: -0.151, tz: 'Europe/London', hours: STD },
    { id: 'madrid', code: 'MAD', city: 'Madrid', country: 'España', region: 'europa', address: 'Calle de José Ortega y Gasset, Salamanca', lat: 40.431, lng: -3.6862, tz: 'Europe/Madrid', hours: STD },
    { id: 'monaco', code: 'MCO', city: 'Mónaco', country: 'Mónaco', region: 'europa', address: 'Avenue de Monte-Carlo', lat: 43.7396, lng: 7.427, tz: 'Europe/Monaco', hours: STD },
    { id: 'milan', code: 'MIL', city: 'Milán', country: 'Italia', region: 'europa', address: 'Quadrilatero della Moda', lat: 45.4699, lng: 9.1956, tz: 'Europe/Rome', hours: STD },
    { id: 'dubai', code: 'DXB', city: 'Dubái', country: 'Emiratos Árabes Unidos', region: 'oriente-medio', address: 'Fashion Avenue, The Dubai Mall', lat: 25.1972, lng: 55.2796, tz: 'Asia/Dubai', hours: MALL },
    { id: 'new-york', code: 'NYC', city: 'Nueva York', country: 'Estados Unidos', region: 'americas', address: 'Madison Avenue, Upper East Side', lat: 40.766, lng: -73.97, tz: 'America/New_York', hours: STD, flagship: true },
    { id: 'miami', code: 'MIA', city: 'Miami', country: 'Estados Unidos', region: 'americas', address: 'Bal Harbour Shops', lat: 25.888, lng: -80.125, tz: 'America/New_York', hours: [[12, 18], [10, 20], [10, 20], [10, 20], [10, 20], [10, 20], [10, 20]] },
    { id: 'beverly-hills', code: 'BVH', city: 'Beverly Hills', country: 'Estados Unidos', region: 'americas', address: 'Rodeo Drive', lat: 34.0696, lng: -118.4053, tz: 'America/Los_Angeles', hours: STD },
    { id: 'mexico', code: 'MEX', city: 'Ciudad de México', country: 'México', region: 'americas', address: 'Av. Presidente Masaryk, Polanco', lat: 19.4319, lng: -99.195, tz: 'America/Mexico_City', hours: STD },
    { id: 'tokyo', code: 'TYO', city: 'Tokio', country: 'Japón', region: 'asia', address: 'Ginza, Chūō', lat: 35.6717, lng: 139.765, tz: 'Asia/Tokyo', hours: DAILY },
    { id: 'hong-kong', code: 'HKG', city: 'Hong Kong', country: 'China', region: 'asia', address: 'Central', lat: 22.281, lng: 114.158, tz: 'Asia/Hong_Kong', hours: DAILY },
    { id: 'singapore', code: 'SIN', city: 'Singapur', country: 'Singapur', region: 'asia', address: 'Marina Bay Sands', lat: 1.2838, lng: 103.8591, tz: 'Asia/Singapore', hours: MALL },
    { id: 'shanghai', code: 'SHA', city: 'Shanghái', country: 'China', region: 'asia', address: 'Jing’an', lat: 31.224, lng: 121.454, tz: 'Asia/Shanghai', hours: DAILY },
    { id: 'seoul', code: 'SEL', city: 'Seúl', country: 'Corea del Sur', region: 'asia', address: 'Cheongdam-dong, Gangnam', lat: 37.525, lng: 127.047, tz: 'Asia/Seoul', hours: DAILY }
  ];

  var REASONS = [
    { id: 'discover', label: 'Descubrir la colección', hint: 'Una presentación privada de las piezas disponibles.' },
    { id: 'model', label: 'Un modelo concreto', hint: 'Ver y probar una referencia que ya tiene en mente.' },
    { id: 'service', label: 'Servicio posventa', hint: 'Revisión, mantenimiento o consulta técnica.' },
    { id: 'bespoke', label: 'Proyecto especial', hint: 'Encargos, ediciones limitadas y peticiones singulares.' }
  ];

  var INTERESTS = [
    { id: 'any', label: 'Sin preferencia' },
    { id: 'tourbillon', label: 'Tourbillons' },
    { id: 'chrono', label: 'Cronógrafos' },
    { id: 'automatic', label: 'Automáticos' },
    { id: 'ladies', label: 'Colección femenina' },
    { id: 'ultraflat', label: 'Ultraplanos' },
    { id: 'sport', label: 'Alianzas deportivas' },
    { id: 'rm002', label: 'RM 002-V2' }
  ];

  var LANGUAGES = [
    { id: 'es', label: 'Español' },
    { id: 'en', label: 'English' },
    { id: 'fr', label: 'Français' },
    { id: 'it', label: 'Italiano' }
  ];

  var BOOKING_WINDOW_DAYS = 60;
  var SLOT_MINUTES = 60;

  /* ------------------------------------------------------------------ */
  /* Utilidades de fecha (siempre en UTC sobre cadenas YYYY-MM-DD)      */
  /* ------------------------------------------------------------------ */

  function pad(n) { return (n < 10 ? '0' : '') + n; }

  function toISODate(d) {
    return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate());
  }

  function parseISODate(str) {
    if (typeof str !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(str)) return null;
    var p = str.split('-').map(Number);
    var d = new Date(Date.UTC(p[0], p[1] - 1, p[2]));
    return toISODate(d) === str ? d : null; // rechaza 2026-02-31
  }

  function addDays(d, n) { return new Date(d.getTime() + n * 864e5); }

  function startOfUTCDay(now) {
    var d = now ? new Date(now) : new Date();
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  }

  /** Primer y último día reservable: desde mañana y durante BOOKING_WINDOW_DAYS. */
  function bookingRange(now) {
    var today = startOfUTCDay(now);
    return { min: toISODate(addDays(today, 1)), max: toISODate(addDays(today, BOOKING_WINDOW_DAYS)) };
  }

  /* ------------------------------------------------------------------ */
  /* Disponibilidad                                                      */
  /* ------------------------------------------------------------------ */

  function getBoutique(id) {
    for (var i = 0; i < BOUTIQUES.length; i++) if (BOUTIQUES[i].id === id) return BOUTIQUES[i];
    return null;
  }

  // Hash FNV-1a + mulberry32: ocupación pseudoaleatoria pero estable por boutique y día.
  function hash(str) {
    var h = 2166136261;
    for (var i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  function rng(seed) {
    return function () {
      seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
      var t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function isOpenOn(boutique, dateStr) {
    var d = parseISODate(dateStr);
    return !!(d && boutique && boutique.hours[d.getUTCDay()]);
  }

  /**
   * Devuelve los huecos de un día: [{ time: '10:00', available: true }, …]
   * o un objeto { error } si la fecha no es válida para esa boutique.
   */
  function getAvailability(boutiqueId, dateStr, now) {
    var b = getBoutique(boutiqueId);
    if (!b) return { error: 'Boutique desconocida.' };
    var d = parseISODate(dateStr);
    if (!d) return { error: 'Fecha no válida.' };
    var range = bookingRange(now);
    if (dateStr < range.min || dateStr > range.max) return { error: 'Fecha fuera del periodo de reserva.' };
    var h = b.hours[d.getUTCDay()];
    if (!h) return { boutique: b.id, date: dateStr, closed: true, slots: [] };
    var rand = rng(hash(b.id + '|' + dateStr));
    var slots = [];
    for (var m = h[0] * 60; m + SLOT_MINUTES <= h[1] * 60; m += SLOT_MINUTES) {
      slots.push({ time: pad(Math.floor(m / 60)) + ':' + pad(m % 60), available: rand() > 0.34 });
    }
    // Garantiza al menos un hueco libre para que ningún día abierto quede bloqueado.
    if (slots.length && !slots.some(function (s) { return s.available; })) slots[slots.length - 1].available = true;
    return { boutique: b.id, date: dateStr, closed: false, slots: slots };
  }

  /* ------------------------------------------------------------------ */
  /* Validación                                                          */
  /* ------------------------------------------------------------------ */

  var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  var NAME_RE = /^[\p{L}][\p{L}\p{M}' .-]{0,59}$/u;
  var PHONE_RE = /^\+?[0-9 ()-]{6,20}$/;

  function inList(list, id) { return list.some(function (x) { return x.id === id; }); }
  function str(v) { return typeof v === 'string' ? v.trim() : ''; }

  /**
   * Valida una solicitud de cita. No tiene efectos secundarios.
   * @returns {{ ok: boolean, errors: Object<string,string>, value: Object }}
   */
  function validateAppointment(input, now) {
    input = input && typeof input === 'object' ? input : {};
    var v = {
      boutique: str(input.boutique),
      reason: str(input.reason),
      interest: str(input.interest) || 'any',
      date: str(input.date),
      time: str(input.time),
      firstName: str(input.firstName),
      lastName: str(input.lastName),
      email: str(input.email).toLowerCase(),
      phone: str(input.phone),
      language: str(input.language) || 'es',
      message: str(input.message),
      consent: input.consent === true
    };
    var e = {};

    if (!getBoutique(v.boutique)) e.boutique = 'Seleccione una boutique.';
    if (!inList(REASONS, v.reason)) e.reason = 'Indique el motivo de su visita.';
    if (!inList(INTERESTS, v.interest)) e.interest = 'Seleccione una opción válida.';

    if (!e.boutique) {
      var av = getAvailability(v.boutique, v.date, now);
      if (av.error) e.date = av.error;
      else if (av.closed) e.date = 'La boutique está cerrada ese día.';
      else {
        var slot = av.slots.filter(function (s) { return s.time === v.time; })[0];
        if (!slot) e.time = 'Seleccione una hora.';
        else if (!slot.available) e.time = 'Esa hora ya no está disponible.';
      }
    }

    if (!NAME_RE.test(v.firstName)) e.firstName = 'Introduzca su nombre.';
    if (!NAME_RE.test(v.lastName)) e.lastName = 'Introduzca sus apellidos.';
    if (!EMAIL_RE.test(v.email) || v.email.length > 120) e.email = 'Introduzca un correo electrónico válido.';
    if (v.phone && !PHONE_RE.test(v.phone)) e.phone = 'Introduzca un teléfono válido.';
    if (!inList(LANGUAGES, v.language)) e.language = 'Seleccione un idioma.';
    if (v.message.length > 600) e.message = 'Máximo 600 caracteres.';
    if (!v.consent) e.consent = 'Debe aceptar la política de privacidad.';

    return { ok: Object.keys(e).length === 0, errors: e, value: v };
  }

  /** Referencia legible: RM-PAR-261020-7K3Q */
  function makeReference(boutiqueId, dateStr, rand) {
    var b = getBoutique(boutiqueId);
    var alphabet = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
    var r = rand || Math.random, s = '';
    for (var i = 0; i < 4; i++) s += alphabet[Math.floor(r() * alphabet.length)];
    return 'RM-' + (b ? b.code : 'XXX') + '-' + String(dateStr).replace(/-/g, '').slice(2) + '-' + s;
  }

  return {
    REGIONS: REGIONS,
    BOUTIQUES: BOUTIQUES,
    REASONS: REASONS,
    INTERESTS: INTERESTS,
    LANGUAGES: LANGUAGES,
    BOOKING_WINDOW_DAYS: BOOKING_WINDOW_DAYS,
    SLOT_MINUTES: SLOT_MINUTES,
    getBoutique: getBoutique,
    getAvailability: getAvailability,
    isOpenOn: isOpenOn,
    bookingRange: bookingRange,
    validateAppointment: validateAppointment,
    makeReference: makeReference,
    parseISODate: parseISODate,
    toISODate: toISODate,
    addDays: addDays
  };
});

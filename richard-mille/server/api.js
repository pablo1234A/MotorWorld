'use strict';
/**
 * API REST pura (sin http ni fs): boutiques, disponibilidad y citas.
 * La usan el servidor Node (server.js) y el worker de Wix (wix/worker.js) con el mismo comportamiento.
 * El endpoint de citas es un MOCK: valida la solicitud y devuelve una referencia,
 * pero no guarda ni envía ningún dato a ninguna parte.
 */
const RM = require('../assets/js/core.js');

const MAX_BODY = 8 * 1024;

/* Limitador de peticiones (ventana fija, en memoria) */
function createRateLimiter(limit, windowMs) {
  const hits = new Map();
  return function allow(key, now = Date.now()) {
    const e = hits.get(key);
    if (!e || now - e.start > windowMs) { hits.set(key, { start: now, n: 1 }); return true; }
    e.n++;
    if (hits.size > 5000) hits.clear(); // evita crecer sin límite
    return e.n <= limit;
  };
}

function publicBoutique(b) {
  return {
    id: b.id, city: b.city, country: b.country, region: b.region, address: b.address,
    lat: b.lat, lng: b.lng, timezone: b.tz, flagship: !!b.flagship, hours: b.hours
  };
}

/**
 * options: { now, postLimit, log, random }
 * La función devuelta recibe la petición ya separada en partes y responde { status, body, headers }:
 *   { method, pathname, searchParams, contentType, ip, readBody }
 * readBody() devuelve el cuerpo como texto o lanza un error con status 413 si supera MAX_BODY.
 */
function createApi(options = {}) {
  const now = options.now || (() => new Date());
  const allowPost = createRateLimiter(options.postLimit || 20, 60 * 1000);
  const log = options.log || (() => {});
  const random = options.random || Math.random;
  const json = (status, body, headers) => ({ status, body, headers: headers || {} });

  return async function handle(req) {
    const route = req.pathname.replace(/\/+$/, '');
    const q = req.searchParams;

    if (route === '/api/health' && req.method === 'GET') {
      return json(200, { ok: true, service: 'rm-web', time: now().toISOString() });
    }

    if (route === '/api/boutiques' && req.method === 'GET') {
      const region = q.get('region');
      const list = RM.BOUTIQUES.filter((b) => !region || b.region === region).map(publicBoutique);
      return json(200, { regions: RM.REGIONS, boutiques: list }, { 'Cache-Control': 'public, max-age=300' });
    }

    const one = route.match(/^\/api\/boutiques\/([a-z-]+)$/);
    if (one && req.method === 'GET') {
      const b = RM.getBoutique(one[1]);
      return b ? json(200, publicBoutique(b)) : json(404, { error: 'Boutique no encontrada.' });
    }

    if (route === '/api/availability' && req.method === 'GET') {
      const av = RM.getAvailability(q.get('boutique'), q.get('date'), now());
      return json(av.error ? 400 : 200, av);
    }

    if (route === '/api/appointments') {
      if (req.method !== 'POST') return json(405, { error: 'Método no permitido.' }, { Allow: 'POST' });
      if (!/^application\/json\b/i.test(String(req.contentType || ''))) {
        return json(415, { error: 'Se esperaba application/json.' });
      }
      if (!allowPost(req.ip || 'unknown')) {
        return json(429, { error: 'Demasiadas solicitudes. Inténtelo en un minuto.' }, { 'Retry-After': '60' });
      }
      let input;
      try { input = JSON.parse(await req.readBody()); } catch (e) {
        if (e.status === 413) return json(413, { error: 'Solicitud demasiado grande.' }, { Connection: 'close' });
        return json(400, { error: 'JSON no válido.' });
      }
      const result = RM.validateAppointment(input, now());
      if (!result.ok) {
        const status = result.errors.time === 'Esa hora ya no está disponible.' ? 409 : 422;
        return json(status, { errors: result.errors });
      }
      const v = result.value;
      const reference = RM.makeReference(v.boutique, v.date, random);
      // MOCK: no se persiste ni se envía nada. Solo se registra la referencia, sin datos personales.
      log('cita simulada', reference);
      return json(201, {
        reference,
        status: 'simulated',
        appointment: { boutique: v.boutique, date: v.date, time: v.time, reason: v.reason, interest: v.interest },
        note: 'Entorno de demostración: la solicitud se ha validado pero no se ha almacenado ni enviado.'
      });
    }

    return json(404, { error: 'Ruta no encontrada.' });
  };
}

module.exports = { createApi, createRateLimiter, MAX_BODY };

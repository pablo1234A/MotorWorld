// Agendia — crea chatbots de reservas conectados a Google Calendar con un solo prompt.
import express from 'express';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

// Carga .env sin dependencias (formato CLAVE=valor).
const here = path.dirname(fileURLToPath(import.meta.url));
const envFile = path.join(here, '.env');
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, 'utf8').split('\n')) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line);
    if (m && !line.trim().startsWith('#') && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
  }
}
process.chdir(here);

const { loadDb, listBots, getBot, saveBot, deleteBot, newId, listBookings, flush } = await import('./src/db.js');
const { sign, unsign, rateLimit } = await import('./src/security.js');
const google = await import('./src/google.js');
const { generateConfig, sanitizeConfig, MODEL } = await import('./src/ai.js');
const { chat, resetSession } = await import('./src/agent.js');
const { cancelBooking, publicBooking, EMAIL_RE } = await import('./src/bookings.js');
const { localDate } = await import('./src/time.js');

loadDb();
const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 'loopback, linklocal, uniquelocal');
app.use(express.json({ limit: '200kb' }));

app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  // El chat se puede incrustar en cualquier web; el panel no.
  if (!req.path.startsWith('/chat/') && !req.path.startsWith('/api/public/')) res.setHeader('X-Frame-Options', 'DENY');
  next();
});

// ---------- Autenticación del panel ----------
const COOKIE = 'agendia_admin';
const authRequired = () => Boolean(process.env.ADMIN_PASSWORD);

function cookies(req) {
  return Object.fromEntries(
    (req.headers.cookie || '')
      .split(';')
      .map((c) => c.trim().split('='))
      .filter(([k]) => k)
      .map(([k, ...v]) => [k, decodeURIComponent(v.join('='))])
  );
}

function isAdmin(req) {
  if (!authRequired()) return true;
  const v = unsign(cookies(req)[COOKIE]);
  return Boolean(v && v.startsWith('admin:') && Number(v.slice(6)) > Date.now());
}

function requireAdmin(req, res, next) {
  if (isAdmin(req)) return next();
  res.status(401).json({ error: 'auth_required' });
}

const secureCookie = () => (google.baseUrl().startsWith('https://') ? '; Secure' : '');

app.post('/api/login', (req, res) => {
  if (!rateLimit(`login:${req.ip}`, 10, 15 * 60_000)) return res.status(429).json({ error: 'Demasiados intentos. Espera unos minutos.' });
  const given = Buffer.from(String(req.body?.password || ''));
  const expected = Buffer.from(String(process.env.ADMIN_PASSWORD || ''));
  if (!authRequired() || (given.length === expected.length && crypto.timingSafeEqual(given, expected))) {
    const exp = Date.now() + 30 * 86_400_000;
    res.setHeader('Set-Cookie', `${COOKIE}=${encodeURIComponent(sign(`admin:${exp}`))}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${30 * 86400}${secureCookie()}`);
    return res.json({ ok: true });
  }
  res.status(401).json({ error: 'Contraseña incorrecta' });
});

app.post('/api/logout', (req, res) => {
  res.setHeader('Set-Cookie', `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
  res.json({ ok: true });
});

app.get('/api/status', (req, res) => {
  res.json({
    authRequired: authRequired(),
    loggedIn: isAdmin(req),
    googleConfigured: google.googleConfigured(),
    anthropicConfigured: Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN),
    model: MODEL,
    baseUrl: google.baseUrl(),
    redirectUri: google.redirectUri(),
  });
});

// ---------- Bots (panel) ----------
function adminView(bot) {
  const { google: g, outbox, ...rest } = bot;
  return {
    ...rest,
    google: g ? { email: g.email, connectedAt: g.connectedAt, canEmail: Boolean(g.scope?.includes('gmail.send')) } : null,
    connected: google.isConnected(bot),
    outbox: outbox || [],
  };
}

const wrap = (fn) => (req, res) =>
  Promise.resolve(fn(req, res)).catch((e) => {
    console.error(e);
    const status = e.status && e.status >= 400 && e.status < 600 ? e.status : 500;
    res.status(status).json({ error: friendlyError(e) });
  });

function friendlyError(e) {
  const name = e?.constructor?.name || '';
  if (name === 'AuthenticationError') return 'La clave de Anthropic no es válida. Revisa ANTHROPIC_API_KEY en el archivo .env.';
  if (name === 'RateLimitError') return 'Hay demasiadas peticiones a la IA ahora mismo. Prueba de nuevo en unos segundos.';
  if (name === 'APIConnectionError') return 'No se pudo conectar con la IA. Revisa tu conexión.';
  if (e instanceof google.GoogleError) return `Google: ${e.message}`;
  return e?.message || 'Error inesperado';
}

function loadBot(req, res) {
  const bot = getBot(req.params.id);
  if (!bot) res.status(404).json({ error: 'No existe ese chatbot' });
  return bot;
}

app.get('/api/bots', requireAdmin, (req, res) => {
  res.json(
    listBots().map((b) => {
      const upcoming = listBookings(b.id).filter((x) => x.status === 'confirmed' && Date.parse(x.start) > Date.now()).length;
      return { id: b.id, status: b.status, businessEmail: b.businessEmail, name: b.config?.businessName || 'Borrador', brandColor: b.config?.brandColor, connected: google.isConnected(b), upcoming, createdAt: b.createdAt };
    })
  );
});

app.post('/api/bots', requireAdmin, (req, res) => {
  const email = String(req.body?.businessEmail || '').trim();
  if (!EMAIL_RE.test(email)) return res.status(400).json({ error: 'Introduce un email válido' });
  const bot = saveBot({ id: newId('bot'), status: 'draft', businessEmail: email, calendarId: 'primary', description: '', config: null, createdAt: new Date().toISOString() });
  res.json(adminView(bot));
});

app.get('/api/bots/:id', requireAdmin, (req, res) => {
  const bot = loadBot(req, res);
  if (!bot) return;
  const tz = bot.config?.timezone || 'Europe/Madrid';
  const bookings = listBookings(bot.id).map((b) => ({ ...publicBooking(b, tz), email: b.customer.email, phone: b.customer.phone, notes: b.notes, htmlLink: b.htmlLink, start: b.start }));
  res.json({ ...adminView(bot), bookings });
});

app.patch('/api/bots/:id', requireAdmin, (req, res) => {
  const bot = loadBot(req, res);
  if (!bot) return;
  const b = req.body || {};
  if (b.businessEmail !== undefined) {
    if (!EMAIL_RE.test(String(b.businessEmail).trim())) return res.status(400).json({ error: 'Email no válido' });
    bot.businessEmail = String(b.businessEmail).trim();
  }
  if (b.calendarId !== undefined) bot.calendarId = String(b.calendarId).slice(0, 300) || 'primary';
  if (b.calendarTimeZone !== undefined) bot.calendarTimeZone = String(b.calendarTimeZone).slice(0, 60);
  if (b.description !== undefined) bot.description = String(b.description).slice(0, 8000);
  if (b.config !== undefined && bot.config) bot.config = sanitizeConfig({ ...bot.config, ...b.config });
  if (b.status === 'paused' || b.status === 'live') bot.status = bot.config ? b.status : bot.status;
  saveBot(bot);
  res.json(adminView(bot));
});

app.delete('/api/bots/:id', requireAdmin, (req, res) => {
  const bot = loadBot(req, res);
  if (!bot) return;
  if (bot.google) google.disconnect(bot);
  deleteBot(bot.id);
  res.json({ ok: true });
});

app.post(
  '/api/bots/:id/generate',
  requireAdmin,
  wrap(async (req, res) => {
    const bot = loadBot(req, res);
    if (!bot) return;
    const description = String(req.body?.description ?? bot.description ?? '').trim();
    if (description.length < 15) return res.status(400).json({ error: 'Describe un poco más tu negocio (servicios, horario, cómo quieres que hable el bot…)' });
    bot.description = description.slice(0, 8000);
    const tz = bot.calendarTimeZone || null;
    bot.config = await generateConfig({
      description: bot.description,
      businessEmail: bot.businessEmail,
      timezoneHint: tz,
      today: localDate(Date.now(), tz || 'Europe/Madrid'),
    });
    bot.status = 'live';
    saveBot(bot);
    res.json(adminView(bot));
  })
);

app.post(
  '/api/bots/:id/refine',
  requireAdmin,
  wrap(async (req, res) => {
    const bot = loadBot(req, res);
    if (!bot) return;
    if (!bot.config) return res.status(400).json({ error: 'Primero crea la automatización' });
    const instruction = String(req.body?.instruction || '').trim().slice(0, 2000);
    if (!instruction) return res.status(400).json({ error: 'Escribe qué quieres cambiar' });
    bot.config = await generateConfig({ current: bot.config, instruction, timezoneHint: bot.config.timezone });
    saveBot(bot);
    res.json(adminView(bot));
  })
);

app.get(
  '/api/bots/:id/calendars',
  requireAdmin,
  wrap(async (req, res) => {
    const bot = loadBot(req, res);
    if (!bot) return;
    if (!google.isConnected(bot)) return res.json([]);
    res.json(await google.listCalendars(bot));
  })
);

app.post('/api/bots/:id/google/disconnect', requireAdmin, (req, res) => {
  const bot = loadBot(req, res);
  if (!bot) return;
  google.disconnect(bot);
  res.json(adminView(bot));
});

app.post(
  '/api/bots/:id/bookings/:code/cancel',
  requireAdmin,
  wrap(async (req, res) => {
    const bot = loadBot(req, res);
    if (!bot) return;
    const r = await cancelBooking(bot, { code: req.params.code }, { byAdmin: true });
    if (!r.ok) return res.status(400).json({ error: r.error });
    res.json(r);
  })
);

// ---------- Google OAuth ----------
app.get('/auth/google/start', requireAdmin, (req, res) => {
  const bot = getBot(String(req.query.bot || ''));
  if (!bot) return res.status(404).send('Chatbot no encontrado');
  if (!google.googleConfigured()) return res.redirect(`/#/bots/${bot.id}?google=not_configured`);
  const state = sign(`${bot.id}:${Date.now() + 15 * 60_000}`);
  res.redirect(google.authUrl(state, bot.businessEmail));
});

app.get(
  '/auth/google/callback',
  wrap(async (req, res) => {
    const raw = unsign(String(req.query.state || ''));
    const [botId, exp] = (raw || '').split(':');
    const bot = botId && getBot(botId);
    if (!bot || Number(exp) < Date.now()) return res.status(400).send('Enlace caducado. Vuelve al panel e inténtalo de nuevo.');
    if (req.query.error) return res.redirect(`/#/bots/${bot.id}?google=denied`);
    await google.connectWithCode(bot, String(req.query.code || ''));
    // Calendario principal por defecto, con su zona horaria.
    try {
      const cals = await google.listCalendars(bot);
      const primary = cals.find((c) => c.primary) || cals[0];
      if (primary && (!bot.calendarId || bot.calendarId === 'primary')) {
        bot.calendarId = primary.id;
        bot.calendarTimeZone = primary.timeZone;
        saveBot(bot);
      }
    } catch (e) {
      console.error('[calendars]', e.message);
    }
    res.redirect(`/#/bots/${bot.id}?google=connected`);
  })
);

// ---------- API pública del chatbot ----------
function publicBot(req, res) {
  const bot = getBot(req.params.id);
  if (!bot || !bot.config || (bot.status !== 'live' && !isAdmin(req))) {
    res.status(404).json({ error: 'Este asistente no está disponible' });
    return null;
  }
  return bot;
}

app.get('/api/public/bots/:id', (req, res) => {
  const bot = publicBot(req, res);
  if (!bot) return;
  const c = bot.config;
  res.json({
    id: bot.id,
    businessName: c.businessName,
    assistantName: c.assistantName,
    welcomeMessage: c.welcomeMessage,
    quickReplies: c.quickReplies,
    brandColor: c.brandColor,
    language: c.language,
    services: c.services.map(({ name, durationMinutes, price }) => ({ name, durationMinutes, price })),
    demo: !google.isConnected(bot),
  });
});

app.post(
  '/api/public/bots/:id/chat',
  wrap(async (req, res) => {
    const bot = publicBot(req, res);
    if (!bot) return;
    if (!rateLimit(`chat:${req.ip}`, 40, 10 * 60_000) || !rateLimit(`chatbot:${bot.id}`, 600, 60 * 60_000)) {
      return res.status(429).json({ error: 'Has enviado muchos mensajes seguidos. Espera un momento.' });
    }
    const message = String(req.body?.message || '').trim();
    if (!message) return res.status(400).json({ error: 'Mensaje vacío' });
    res.json(await chat(bot, String(req.body?.sessionId || ''), message));
  })
);

app.post('/api/public/bots/:id/reset', (req, res) => {
  resetSession(String(req.body?.sessionId || ''));
  res.json({ ok: true });
});

// ---------- Páginas ----------
const pub = path.join(here, 'public');
app.get('/chat/:id', (req, res) => res.sendFile(path.join(pub, 'chat.html')));
app.get('/widget.js', (req, res) => {
  res.setHeader('Cache-Control', 'public, max-age=300');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.sendFile(path.join(pub, 'widget.js'));
});
app.use(express.static(pub, { index: 'index.html', extensions: ['html'] }));

const port = Number(process.env.PORT || 3000);
const server = app.listen(port, () => {
  console.log(`\n  Agendia listo en ${google.baseUrl()}`);
  if (!google.googleConfigured()) console.log('  · Google sin configurar: los bots funcionarán en modo demo (calendario local).');
  if (!process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_AUTH_TOKEN) console.log('  · Falta ANTHROPIC_API_KEY: necesaria para crear y usar los chatbots.');
  if (!authRequired()) console.log('  · Panel sin contraseña (define ADMIN_PASSWORD antes de publicarlo en internet).');
  console.log('');
});

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    flush();
    server.close(() => process.exit(0));
  });
}

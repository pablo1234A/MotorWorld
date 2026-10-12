// Agendia — panel de control. SPA sin dependencias con rutas por hash.

// ---------- Plantillas seguras ----------
class Raw { constructor(s) { this.s = s; } }
const raw = (s) => new Raw(s);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const str = (v) => (v instanceof Raw ? v.s : Array.isArray(v) ? v.map(str).join('') : v == null || v === false ? '' : esc(v));
const html = (strings, ...vals) => raw(strings.reduce((a, s, i) => a + s + (i < vals.length ? str(vals[i]) : ''), ''));

const view = document.getElementById('view');
const $ = (sel, root = view) => root.querySelector(sel);
const $$ = (sel, root = view) => [...root.querySelectorAll(sel)];
const mount = (tpl) => {
  view.innerHTML = tpl.s;
  view.style.animation = 'none';
  void view.offsetWidth;
  view.style.animation = '';
};

// ---------- API ----------
async function api(path, opts = {}) {
  const res = await fetch(path, {
    method: opts.method || (opts.body ? 'POST' : 'GET'),
    headers: opts.body ? { 'Content-Type': 'application/json' } : {},
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && data.error === 'auth_required') {
    location.hash = '#/login';
    throw new Error('Inicia sesión para continuar');
  }
  if (!res.ok) throw new Error(data.error || `Error ${res.status}`);
  return data;
}

function toast(msg, type = '') {
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = msg;
  document.getElementById('toasts').append(el);
  setTimeout(() => {
    el.style.transition = 'opacity .3s, transform .3s';
    el.style.opacity = '0';
    el.style.transform = 'translateY(8px)';
    setTimeout(() => el.remove(), 300);
  }, type === 'err' ? 5200 : 3200);
}

async function busy(btn, fn) {
  const label = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span>';
  try {
    return await fn();
  } catch (e) {
    toast(e.message, 'err');
  } finally {
    if (btn.isConnected) {
      btn.disabled = false;
      btn.innerHTML = label;
    }
  }
}

async function copy(text, what = 'Copiado') {
  try {
    await navigator.clipboard.writeText(text);
    toast(`${what} ✓`);
  } catch {
    toast('No se pudo copiar automáticamente', 'err');
  }
}

// ---------- Estado global ----------
let status = null;
const WEEKDAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
const DAY_ES = { monday: 'lunes', tuesday: 'martes', wednesday: 'miércoles', thursday: 'jueves', friday: 'viernes', saturday: 'sábado', sunday: 'domingo' };

function renderTopStatus() {
  const el = document.getElementById('topStatus');
  if (!status) return (el.innerHTML = '');
  el.innerHTML = html`
    <span class="pill ${status.anthropicConfigured ? 'ok' : 'warn'}" title="${status.anthropicConfigured ? `Modelo: ${status.model}` : 'Falta ANTHROPIC_API_KEY en .env'}"><span class="dot"></span>IA ${status.anthropicConfigured ? 'activa' : 'sin clave'}</span>
    <span class="pill ${status.googleConfigured ? 'ok' : 'warn'}" title="${status.googleConfigured ? 'OAuth de Google configurado' : 'Sin credenciales de Google: modo demo'}"><span class="dot"></span>Google ${status.googleConfigured ? 'listo' : 'modo demo'}</span>
    ${status.authRequired && status.loggedIn ? html`<button class="btn btn-ghost btn-sm keep" id="logoutBtn">Salir</button>` : ''}
  `.s;
  const lo = document.getElementById('logoutBtn');
  if (lo) lo.onclick = async () => { await api('/api/logout', { body: {} }); status.loggedIn = false; location.hash = '#/login'; };
}

const initial = (s) => (String(s || '?').trim()[0] || '?').toUpperCase();
const color = (c) => (/^#[0-9a-f]{6}$/i.test(c || '') ? c : '#121216');

// ---------- Router ----------
function parseHash() {
  const [p, q = ''] = location.hash.replace(/^#/, '').split('?');
  return { parts: p.split('/').filter(Boolean), query: new URLSearchParams(q) };
}

let currentCleanup = null;
async function route() {
  if (currentCleanup) { currentCleanup(); currentCleanup = null; }
  const { parts, query } = parseHash();
  window.scrollTo({ top: 0 });
  try {
    if (!status) { status = await api('/api/status'); renderTopStatus(); }
    if (status.authRequired && !status.loggedIn && parts[0] !== 'login') return (location.hash = '#/login');
    if (parts[0] === 'login') return renderLogin();
    if (parts[0] === 'new') return renderWizard(null, 1);
    if (parts[0] === 'bots' && parts[1]) {
      if (parts[2] === 'setup') return renderWizard(parts[1], Number(query.get('step') || 2), query);
      return renderBot(parts[1], query);
    }
    return renderHome();
  } catch (e) {
    mount(html`<div class="empty" style="padding-top:20vh"><div class="big">Algo ha fallado</div><p>${e.message}</p><p style="margin-top:20px"><a class="btn btn-ghost" href="#/">Volver al inicio</a></p></div>`);
  }
}
window.addEventListener('hashchange', route);

// ---------- Login ----------
function renderLogin() {
  mount(html`
    <section class="login">
      <h1>Bienvenido <em>de nuevo</em></h1>
      <p class="muted">Introduce la contraseña del panel para gestionar tus asistentes.</p>
      <form id="loginForm">
        <input class="input input-xl" type="password" name="password" placeholder="Contraseña" autocomplete="current-password" required autofocus>
        <button class="btn btn-primary btn-lg" type="submit">Entrar</button>
      </form>
    </section>`);
  $('#loginForm').onsubmit = (e) => {
    e.preventDefault();
    busy(e.submitter, async () => {
      await api('/api/login', { body: { password: e.target.password.value } });
      status = null;
      location.hash = '#/';
    });
  };
}

// ---------- Inicio ----------
async function renderHome() {
  const bots = await api('/api/bots');
  const heroScene = html`
    <div class="scene" aria-hidden="true">
      <div class="card scene-cal">
        <div class="scene-cal-head">Google Calendar <span class="mono">SEMANA 42</span></div>
        <div class="cal-grid">
          <span></span>${['Lun', 'Mar', 'Mié', 'Jue', 'Vie'].map((d) => html`<span class="d">${d}</span>`)}
          ${['10:00', '11:00', '12:00', '13:00', '16:00', '17:00', '18:00'].map((h, r) => html`<span class="h">${h}</span>${[0, 1, 2, 3, 4].map((c) => html`<span class="c ${(r * 5 + c) % 4 === 1 || (r * 7 + c) % 6 === 0 ? 'busy' : ''} ${r === 4 && c === 3 ? 'new' : ''}"></span>`)}`)}
        </div>
      </div>
      <div class="card scene-mail">
        <span class="ic"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg></span>
        <div><b>Reserva confirmada</b><span>Email enviado a lucia@…</span></div>
      </div>
      <div class="card scene-chat">
        <div class="b u">¿Tenéis hueco el jueves por la tarde?</div>
        <div class="b a">¡Sí! El jueves tengo libre a estas horas:</div>
        <div class="b a chips"><i>16:00</i><i>16:30</i><i>18:00</i></div>
        <div class="b u">Las 16:30 perfecto 🙌</div>
      </div>
    </div>`;

  mount(html`
    <section class="hero">
      <div>
        <span class="eyebrow"><b>Nuevo</b> Correo + Google Calendar + 1 prompt</span>
        <h1>Tu recepcionista con IA, <em>en un solo prompt.</em></h1>
        <p class="lead">Describe tu negocio con tus palabras. Agendia crea un chatbot que responde a tus clientes, consulta tu Google Calendar en tiempo real y reserva las citas por ti. Si no hay hueco, lo dice y propone otro.</p>
        <div class="hero-cta">
          <a class="btn btn-accent btn-lg" href="#/new">Crear automatización <span class="arrow">→</span></a>
          ${bots.length ? html`<button class="btn btn-ghost btn-lg" id="seeBots">Ver mis asistentes</button>` : ''}
        </div>
        <div class="hero-note"><span>Sin código</span><span>Sin dobles reservas</span><span>Listo en 1 minuto</span></div>
      </div>
      ${heroScene}
    </section>

    <section class="steps-strip">
      <div><span class="n">01</span><h3>El correo del negocio</h3><p>Donde recibirás cada reserva y cancelación al instante.</p></div>
      <div><span class="n">02</span><h3>Tu Google Calendar</h3><p>El bot solo ofrece horas libres y crea el evento directamente en tu agenda.</p></div>
      <div><span class="n">03</span><h3>Un prompt</h3><p>Servicios, horarios, precios y cómo quieres que hable. La IA monta el resto.</p></div>
    </section>

    <div class="section-head" id="bots">
      <h2>Tus <em>asistentes</em></h2>
      ${bots.length ? html`<span class="muted">${bots.length} ${bots.length === 1 ? 'automatización' : 'automatizaciones'}</span>` : ''}
    </div>
    <div class="bots">
      ${bots.map((b) => html`
        <a class="card bot-card" href="${b.status === 'draft' ? `#/bots/${b.id}/setup?step=${b.connected ? 3 : 2}` : `#/bots/${b.id}`}">
          <div class="top">
            <span class="bot-ava" style="background:${color(b.brandColor)}">${initial(b.name)}</span>
            <div style="min-width:0;flex:1"><h3>${b.name}</h3><div class="sub">${b.businessEmail}</div></div>
            <span class="pill ${b.status}">${{ live: 'Activo', paused: 'Pausado', draft: 'Borrador' }[b.status]}</span>
          </div>
          <div class="meta"><span><b>${b.upcoming}</b> próximas citas</span><span>${b.connected ? 'Google Calendar' : 'Calendario demo'}</span></div>
        </a>`)}
      <a class="card new-card" href="#/new"><div><span class="plus">+</span>Crear automatización</div></a>
    </div>`);
  const see = $('#seeBots');
  if (see) see.onclick = () => $('#bots').scrollIntoView({ behavior: 'smooth' });
}

// ---------- Asistente de creación ----------
const EXAMPLES = [
  {
    label: 'Peluquería',
    text: 'Peluquería Lúa, en Madrid. Servicios: corte de mujer (45 min, 28 €), corte de hombre (30 min, 15 €), color (90 min, desde 45 €) y mechas (2 h, desde 70 €). Abrimos de martes a viernes de 10:00 a 14:00 y de 16:30 a 20:30, y los sábados de 9:00 a 14:00. Domingo y lunes cerrado. Reservas con al menos 3 horas de antelación. Quiero que el asistente sea cercano, tutee y use algún emoji. Si alguien quiere cancelar con menos de 24 h, que le recuerde amablemente nuestra política.',
  },
  {
    label: 'Clínica dental',
    text: 'Clínica Dental Sonrisa, Valencia. Primera visita gratuita (30 min), limpieza (45 min, 50 €), revisión (20 min, 25 €) y blanqueamiento (60 min, 180 €). Horario: lunes a jueves de 9:00 a 14:00 y de 16:00 a 20:00, viernes de 9:00 a 15:00. Cerramos del 1 al 15 de agosto. Tono profesional y tranquilizador, tratando de usted. Pide siempre el teléfono. Si alguien tiene dolor fuerte o una urgencia, que nos llame directamente.',
  },
  {
    label: 'Taller mecánico',
    text: 'Taller MotorWorld, Sevilla. Cambio de aceite y filtros (45 min, desde 69 €), diagnosis electrónica (60 min, 40 €), revisión pre-ITV (60 min, 35 €), cambio de neumáticos (45 min) y frenos (90 min, presupuesto previo). Lunes a viernes de 8:00 a 13:30 y de 15:30 a 19:00. Sábados y domingos cerrado. Deja 15 minutos entre citas para recibir el coche. Pide matrícula y modelo del coche en las notas. Tono directo y de confianza.',
  },
  {
    label: 'Fisioterapia',
    text: 'Centro de fisioterapia Kiné, Barcelona. Sesión de fisioterapia (50 min, 45 €), masaje deportivo (60 min, 50 €), punción seca (30 min, 35 €) y valoración inicial gratuita (20 min). Lunes a viernes de 8:00 a 21:00 y sábados de 9:00 a 13:00. Citas cada 30 minutos. Reserva con un mínimo de 2 horas. Pregunta qué molestia tiene para anotarla. Responde en castellano o catalán según escriba el cliente.',
  },
];

const CHECKS = [
  ['Servicios', /(servicio|corte|consulta|sesi[oó]n|cita|clase|tratamiento|revisi[oó]n|limpieza|masaje|cambio|visita)/i],
  ['Duraciones', /\d+\s*(min|h\b|hora)/i],
  ['Precios', /(€|\$|euros?|gratis|gratuit|precio)/i],
  ['Horario', /\d{1,2}(:\d{2})?\s*(a|-|–|hasta)\s*(las\s*)?\d{1,2}/i],
  ['Días que abres', /(lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bado|domingo|fines? de semana)/i],
  ['Tono del bot', /(tono|tutee|tutea|de usted|cercan|formal|emoji|profesional|simp[aá]tic|directo)/i],
];

function progress(step) {
  const s = ['Correo del negocio', 'Google Calendar', 'Descripción'];
  return html`<div class="progress">${s.map((t, i) => html`<div class="s ${i + 1 < step ? 'done' : i + 1 === step ? 'on' : ''}"><div><span>0${i + 1}</span>${t}</div></div>`)}</div>`;
}

async function renderWizard(botId, step, query = new URLSearchParams()) {
  let bot = botId ? await api(`/api/bots/${botId}`) : null;

  if (step === 1) {
    mount(html`
      <section class="wizard">
        ${progress(1)}
        <h1 class="wiz-title">¿Cuál es el <em>correo</em> de tu negocio?</h1>
        <p class="wiz-lead">Aquí te avisaremos de cada reserva y cancelación. Lo usaremos también para sugerir la cuenta de Google al conectar el calendario.</p>
        <form id="f1">
          <input class="input input-xl" type="email" name="email" placeholder="hola@tunegocio.com" value="${bot?.businessEmail || ''}" autocomplete="email" required autofocus>
          <div class="wiz-actions">
            <a class="btn btn-ghost" href="#/">Cancelar</a>
            <button class="btn btn-primary btn-lg" type="submit">Continuar <span class="arrow">→</span></button>
          </div>
        </form>
      </section>`);
    $('#f1').onsubmit = (e) => {
      e.preventDefault();
      busy(e.submitter, async () => {
        const b = await api('/api/bots', { body: { businessEmail: e.target.email.value } });
        location.hash = `#/bots/${b.id}/setup?step=2`;
      });
    };
    return;
  }

  if (step === 2) {
    const g = query.get('google');
    if (g === 'connected') toast('Google Calendar conectado ✓');
    if (g === 'denied') toast('No se concedió acceso a Google', 'err');
    let calendars = [];
    if (bot.connected) {
      try { calendars = await api(`/api/bots/${bot.id}/calendars`); } catch (e) { toast(e.message, 'err'); }
    }
    const googleIcon = html`<svg width="24" height="24" viewBox="0 0 48 48"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3 0 5.8 1.1 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3 0 5.8 1.1 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>`;

    mount(html`
      <section class="wizard">
        ${progress(2)}
        <h1 class="wiz-title">Conecta tu <em>Google Calendar</em></h1>
        <p class="wiz-lead">El asistente mirará tus huecos libres en tiempo real y pondrá cada cita directamente en tu calendario. Nunca ofrecerá una hora ocupada.</p>

        <div class="card connect">
          <div class="connect-row">
            <span class="g-logo">${googleIcon}</span>
            <div class="grow">
              <h3>${bot.connected ? `Conectado como ${bot.google.email}` : 'Cuenta de Google'}</h3>
              <p>${bot.connected ? 'Elige el calendario donde se guardarán las reservas.' : `Te sugeriremos ${bot.businessEmail}. Puedes usar cualquier cuenta.`}</p>
            </div>
            ${bot.connected
              ? html`<button class="btn btn-ghost btn-sm" id="disc">Cambiar cuenta</button>`
              : status.googleConfigured
                ? html`<a class="btn btn-primary" href="/auth/google/start?bot=${bot.id}">Conectar con Google</a>`
                : ''}
          </div>

          ${bot.connected && calendars.length ? html`
            <div class="field">
              <label for="cal">Calendario de reservas</label>
              <select class="select" id="cal">
                ${calendars.map((c) => html`<option value="${c.id}" data-tz="${c.timeZone}" ${c.id === bot.calendarId ? raw('selected') : ''}>${c.name}${c.primary ? ' (principal)' : ''} · ${c.timeZone}</option>`)}
              </select>
            </div>` : ''}

          ${!bot.connected ? html`
            <div class="scopes">
              <div><b>Ver disponibilidad</b>Solo consulta si un hueco está libre u ocupado.</div>
              <div><b>Crear citas</b>Añade y cancela los eventos de las reservas.</div>
              <div><b>Enviar avisos</b>Confirmaciones por Gmail desde tu cuenta.</div>
            </div>` : ''}

          ${!status.googleConfigured ? html`
            <div class="notice">
              <span>⚠️</span>
              <div><b>Google aún no está configurado en este servidor.</b> Puedes seguir en <b>modo demo</b>: las reservas se guardan en un calendario local y los emails se muestran en el panel. Para conectar tu Google Calendar real, añade <code>GOOGLE_CLIENT_ID</code> y <code>GOOGLE_CLIENT_SECRET</code> al archivo <code>.env</code> con la URI de redirección <code>${status.redirectUri}</code> (ver README).</div>
            </div>` : ''}
        </div>

        <div class="wiz-actions">
          <a class="btn btn-ghost" href="#/bots/${bot.id}/setup?step=1" id="back">← Atrás</a>
          <button class="btn btn-primary btn-lg" id="next">${bot.connected ? 'Continuar' : 'Continuar en modo demo'} <span class="arrow">→</span></button>
        </div>
      </section>`);

    $('#back').onclick = (e) => {
      e.preventDefault();
      renderEmailEdit(bot);
    };
    const disc = $('#disc');
    if (disc) disc.onclick = () => busy(disc, async () => { await api(`/api/bots/${bot.id}/google/disconnect`, { body: {} }); route(); });
    $('#next').onclick = (e) =>
      busy(e.currentTarget, async () => {
        const sel = $('#cal');
        if (sel) {
          await api(`/api/bots/${bot.id}`, { method: 'PATCH', body: { calendarId: sel.value, calendarTimeZone: sel.selectedOptions[0].dataset.tz } });
        }
        location.hash = `#/bots/${bot.id}/setup?step=3`;
      });
    return;
  }

  // Paso 3: descripción
  mount(html`
    <section class="wizard">
      ${progress(3)}
      <h1 class="wiz-title">Describe <em>cómo lo quieres</em></h1>
      <p class="wiz-lead">Escribe como se lo contarías a un recepcionista nuevo: qué ofreces, cuánto dura y cuesta, cuándo abres y cómo debe hablar. La IA se encarga del resto.</p>
      <div class="card prompt-box">
        <textarea class="textarea" id="desc" placeholder="Ej.: Somos una peluquería en Madrid. Hacemos cortes (30 min, 15 €) y color (90 min)… Abrimos de martes a sábado de 10 a 20 h. Quiero que el bot sea cercano y tutee." maxlength="8000">${bot.description || ''}</textarea>
        <div class="prompt-foot">
          <span class="hint" id="count">0 / 8000</span>
          <button class="btn btn-accent" id="create">Crear automatización <span class="arrow">→</span></button>
        </div>
      </div>
      <div class="checklist" id="checks">${CHECKS.map(([t]) => html`<span>${t}</span>`)}</div>
      <div class="examples">
        <span class="label">¿Sin inspiración? Empieza con un ejemplo:</span>
        ${EXAMPLES.map((ex, i) => html`<button class="chip" data-ex="${i}">${ex.label}</button>`)}
      </div>
      <div class="wiz-actions"><a class="btn btn-ghost" href="#/bots/${bot.id}/setup?step=2">← Atrás</a><span></span></div>
    </section>`);

  const desc = $('#desc');
  const update = () => {
    $('#count').textContent = `${desc.value.length} / 8000`;
    $$('#checks span').forEach((el, i) => el.classList.toggle('on', CHECKS[i][1].test(desc.value)));
  };
  desc.addEventListener('input', update);
  update();
  desc.focus();
  $$('[data-ex]').forEach((b) => (b.onclick = () => { desc.value = EXAMPLES[b.dataset.ex].text; update(); desc.focus(); }));
  $('#create').onclick = () => generate(bot, desc.value);
}

function renderEmailEdit(bot) {
  mount(html`
    <section class="wizard">
      ${progress(1)}
      <h1 class="wiz-title">¿Cuál es el <em>correo</em> de tu negocio?</h1>
      <p class="wiz-lead">Aquí te avisaremos de cada reserva y cancelación.</p>
      <form id="f1">
        <input class="input input-xl" type="email" name="email" value="${bot.businessEmail}" required autofocus>
        <div class="wiz-actions"><span></span><button class="btn btn-primary btn-lg" type="submit">Continuar <span class="arrow">→</span></button></div>
      </form>
    </section>`);
  $('#f1').onsubmit = (e) => {
    e.preventDefault();
    busy(e.submitter, async () => {
      await api(`/api/bots/${bot.id}`, { method: 'PATCH', body: { businessEmail: e.target.email.value } });
      route();
    });
  };
}

async function generate(bot, description) {
  if (description.trim().length < 15) return toast('Cuéntanos un poco más sobre tu negocio', 'err');
  const steps = ['Leyendo la descripción de tu negocio', 'Definiendo servicios, duraciones y precios', 'Montando tu horario y reglas de reserva', `Conectando con ${bot.connected ? 'tu Google Calendar' : 'el calendario demo'}`, 'Entrenando la personalidad del asistente'];
  mount(html`
    <section class="building">
      <div class="orb"><i></i></div>
      <h2>Creando tu <em>asistente</em>…</h2>
      <p class="muted" style="margin-top:8px">Suele tardar entre 15 y 40 segundos.</p>
      <ol class="build-steps">${steps.map((s) => html`<li>${s}</li>`)}</ol>
    </section>`);
  const items = $$('.build-steps li');
  let i = 0;
  items[0].classList.add('on');
  const timer = setInterval(() => {
    if (i < items.length - 1) {
      items[i].classList.replace('on', 'done');
      items[++i].classList.add('on');
    }
  }, 4200);
  try {
    const res = await api(`/api/bots/${bot.id}/generate`, { body: { description } });
    clearInterval(timer);
    items.forEach((el) => { el.classList.remove('on'); el.classList.add('done'); });
    await new Promise((r) => setTimeout(r, 600));
    toast(`¡${res.config.assistantName} está listo para reservar! 🎉`);
    location.hash = `#/bots/${bot.id}?new=1`;
  } catch (e) {
    clearInterval(timer);
    toast(e.message, 'err');
    renderWizard(bot.id, 3);
  }
}

// ---------- Panel del bot ----------
async function renderBot(id, query) {
  const g = query.get('google');
  let bot = await api(`/api/bots/${id}`);
  if (!bot.config) {
    location.hash = `#/bots/${id}/setup?step=${g ? 2 : bot.connected ? 3 : 2}${g ? `&google=${g}` : ''}`;
    return;
  }
  if (g === 'connected') toast('Google Calendar conectado ✓');
  if (g === 'denied') toast('No se concedió acceso a Google', 'err');
  let tab = query.get('tab') || 'summary';
  const c = bot.config;
  const upcoming = bot.bookings.filter((b) => b.status === 'confirmed' && Date.parse(b.start) > Date.now());
  const chatUrl = `${status.baseUrl}/chat/${bot.id}`;

  mount(html`
    <section class="bot-head">
      <span class="bot-ava" style="background:${color(c.brandColor)}">${initial(c.assistantName)}</span>
      <div class="grow">
        <h1>${c.businessName}</h1>
        <div class="sub">
          <span class="pill ${bot.status}">${bot.status === 'live' ? 'Activo' : 'Pausado'}</span>
          <span>${c.assistantName} · ${c.businessType}</span>
          <span>·</span>
          <span>${bot.connected ? `📅 ${bot.google.email}` : '📅 Calendario demo'}</span>
        </div>
      </div>
      <div class="actions">
        <button class="btn btn-ghost btn-sm" id="toggle">${bot.status === 'live' ? 'Pausar' : 'Activar'}</button>
        <a class="btn btn-ghost btn-sm" href="${chatUrl}" target="_blank" rel="noopener">Abrir chat ↗</a>
        <button class="btn btn-primary btn-sm" data-go="install">Instalar en mi web</button>
      </div>
    </section>

    <div class="bot-layout">
      <div>
        <nav class="tabs" role="tablist">
          ${[['summary', 'Resumen'], ['bookings', 'Reservas', upcoming.length], ['settings', 'Ajustes'], ['install', 'Instalar'], ...(bot.outbox.length ? [['mail', 'Correos demo', 0]] : [])].map(
            ([k, t, n]) => html`<button role="tab" data-tab="${k}" class="${k === tab ? 'on' : ''}">${t}${n ? html`<span class="count">${n}</span>` : ''}</button>`
          )}
        </nav>
        <div id="tabBody"></div>
      </div>
      <aside class="card preview">
        <div class="preview-head"><span><span class="live-dot"></span>Prueba tu asistente</span><button class="btn btn-ghost btn-sm" id="reload">Reiniciar</button></div>
        <iframe id="previewFrame" src="/chat/${bot.id}?fresh=1" title="Vista previa del chatbot"></iframe>
      </aside>
    </div>`);

  const reloadPreview = () => {
    const f = $('#previewFrame');
    try { f.contentWindow.sessionStorage.removeItem(`agendia:${bot.id}`); } catch {}
    f.src = `/chat/${bot.id}?fresh=1&t=${Date.now()}`;
  };
  $('#reload').onclick = reloadPreview;
  $('#toggle').onclick = (e) =>
    busy(e.currentTarget, async () => {
      await api(`/api/bots/${bot.id}`, { method: 'PATCH', body: { status: bot.status === 'live' ? 'paused' : 'live' } });
      toast(bot.status === 'live' ? 'Asistente pausado: ya no atiende en tu web' : 'Asistente activo');
      renderBot(id, new URLSearchParams({ tab }));
    });

  // Refresca reservas cuando se reserva desde la vista previa.
  const onMsg = async (e) => {
    if (e.origin !== location.origin || !['agendia:booking'].includes(e.data?.type)) return;
    bot = await api(`/api/bots/${id}`);
    showTab(tab);
  };
  window.addEventListener('message', onMsg);
  const poll = setInterval(async () => {
    const fresh = await api(`/api/bots/${id}`).catch(() => null);
    if (fresh && (fresh.bookings.length !== bot.bookings.length || fresh.bookings.some((b, i) => b.status !== bot.bookings[i]?.status))) {
      bot = fresh;
      if (tab !== 'settings') showTab(tab);
    }
  }, 8000);
  currentCleanup = () => { window.removeEventListener('message', onMsg); clearInterval(poll); };

  const showTab = (t) => {
    tab = t;
    $$('.tabs button').forEach((b) => b.classList.toggle('on', b.dataset.tab === t));
    const body = $('#tabBody');
    const up = bot.bookings.filter((b) => b.status === 'confirmed' && Date.parse(b.start) > Date.now());
    const cnt = $('.tabs [data-tab="bookings"]');
    cnt.innerHTML = html`Reservas${up.length ? html`<span class="count">${up.length}</span>` : ''}`.s;
    ({ summary: tabSummary, bookings: tabBookings, settings: tabSettings, install: tabInstall, mail: tabMail })[t](body, bot, {
      reload: async (fresh) => { bot = fresh || (await api(`/api/bots/${id}`)); showTab(tab); reloadPreview(); },
      reloadData: async () => { bot = await api(`/api/bots/${id}`); showTab(tab); },
    });
  };
  $$('.tabs button').forEach((b) => (b.onclick = () => showTab(b.dataset.tab)));
  $$('[data-go]').forEach((b) => (b.onclick = () => showTab(b.dataset.go)));
  showTab(tab);
}

function tabSummary(el, bot, { reload }) {
  const c = bot.config;
  const confirmed = bot.bookings.filter((b) => b.status === 'confirmed');
  const week = confirmed.filter((b) => Date.parse(b.start) > Date.now() && Date.parse(b.start) < Date.now() + 7 * 86_400_000).length;
  el.innerHTML = html`
    <div class="panel">
      <form class="card refine" id="refine">
        <svg class="ic" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l1.9 5.8L20 10l-5 3.8L16.5 20 12 16.6 7.5 20 9 13.8 4 10l6.1-1.2z"/></svg>
        <input name="instruction" placeholder="Ajusta con IA: «los sábados cerramos a las 13:00», «añade depilación láser 30 min 40 €»…" autocomplete="off" maxlength="2000">
        <button class="btn btn-primary btn-sm" type="submit">Aplicar</button>
      </form>

      <div class="stats">
        <div><b>${confirmed.filter((b) => Date.parse(b.start) > Date.now()).length}</b><span>Próximas citas</span></div>
        <div><b>${week}</b><span>Esta semana</span></div>
        <div><b>${c.services.length}</b><span>Servicios</span></div>
        <div><b>${bot.bookings.filter((b) => b.status === 'cancelled').length}</b><span>Cancelaciones</span></div>
      </div>

      ${c.assumptions?.length ? html`
        <div class="card block">
          <div class="block-head"><h3>Revisa estos supuestos <small>la IA los decidió porque no venían en tu descripción</small></h3></div>
          <ul class="assume">${c.assumptions.map((a) => html`<li>${a}</li>`)}</ul>
        </div>` : ''}

      <div class="card block">
        <div class="block-head"><h3>Servicios</h3><button class="btn btn-ghost btn-sm" data-edit>Editar</button></div>
        <div class="services">
          ${c.services.map((s) => html`<div class="svc"><b>${s.name}</b><span class="dur">${s.durationMinutes} min</span><span class="price">${s.price || '—'}</span>${s.description ? html`<p>${s.description}</p>` : ''}</div>`)}
        </div>
      </div>

      <div class="card block">
        <div class="block-head"><h3>Horario <small>${c.timezone}</small></h3><button class="btn btn-ghost btn-sm" data-edit>Editar</button></div>
        <div class="week">
          ${c.weeklyHours.map((d) => html`<div class="day ${d.open ? '' : 'closed'}"><span class="n">${DAY_ES[d.day].slice(0, 3)}</span>${d.open ? d.ranges.map((r) => html`<span class="r">${r.start}–${r.end}</span>`) : html`<span class="x">Cerrado</span>`}</div>`)}
        </div>
        ${c.closedDates.length ? html`<p class="hint" style="margin-top:12px">Días cerrados: ${c.closedDates.join(', ')}</p>` : ''}
      </div>

      <div class="card block">
        <div class="block-head"><h3>Reglas de reserva</h3><button class="btn btn-ghost btn-sm" data-edit>Editar</button></div>
        <div class="kv">
          <div><span>Huecos cada</span><b>${c.slotIntervalMinutes} min</b></div>
          <div><span>Margen entre citas</span><b>${c.bufferMinutes} min</b></div>
          <div><span>Antelación mínima</span><b>${c.minNoticeHours} h</b></div>
          <div><span>Reservas hasta</span><b>${c.maxDaysAhead} días vista</b></div>
          <div><span>Datos que pide</span><b>Nombre, email${c.collectPhone ? ', teléfono' : ''}</b></div>
          <div><span>Avisos al negocio</span><b>${bot.businessEmail}</b></div>
        </div>
      </div>

      <div class="card block">
        <div class="block-head"><h3>Personalidad</h3><button class="btn btn-ghost btn-sm" data-edit>Editar</button></div>
        <p class="prose"><b>Tono:</b> ${c.tone}</p>
        ${c.policies ? html`<p class="prose" style="margin-top:10px"><b>Políticas:</b> ${c.policies}</p>` : ''}
        ${c.extraInstructions ? html`<p class="prose" style="margin-top:10px"><b>Instrucciones:</b> ${c.extraInstructions}</p>` : ''}
      </div>
    </div>`.s;

  $$('[data-edit]', el).forEach((b) => (b.onclick = () => document.querySelector('.tabs [data-tab="settings"]').click()));
  $('#refine', el).onsubmit = (e) => {
    e.preventDefault();
    const instruction = e.target.instruction.value.trim();
    if (!instruction) return;
    busy(e.submitter, async () => {
      const fresh = await api(`/api/bots/${bot.id}/refine`, { body: { instruction } });
      toast('Asistente actualizado ✓');
      reload({ ...bot, ...fresh });
    });
  };
}

function tabBookings(el, bot, { reloadData }) {
  const now = Date.now();
  const list = [...bot.bookings].sort((a, b) => a.start.localeCompare(b.start));
  const up = list.filter((b) => Date.parse(b.start) > now);
  const past = list.filter((b) => Date.parse(b.start) <= now).reverse();
  const row = (b) => {
    const [y, m, d] = b.date.split('-').map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d));
    const mon = new Intl.DateTimeFormat('es', { month: 'short', timeZone: 'UTC' }).format(dt);
    const wd = new Intl.DateTimeFormat('es', { weekday: 'long', timeZone: 'UTC' }).format(dt);
    return html`
      <div class="bk ${b.status}">
        <div class="bk-date"><small>${mon}</small><b>${d}</b></div>
        <div class="bk-main">
          <b>${b.time}–${b.endTime} · ${b.service}</b>
          <div>${b.name} · ${b.email}${b.phone ? ` · ${b.phone}` : ''} · <span class="mono">${b.code}</span> · ${wd}</div>
          ${b.notes ? html`<div>📝 ${b.notes}</div>` : ''}
        </div>
        <div style="display:flex;gap:6px">
          ${b.htmlLink ? html`<a class="btn btn-ghost btn-sm" href="${b.htmlLink}" target="_blank" rel="noopener">Ver en Calendar</a>` : ''}
          ${b.status === 'confirmed' && Date.parse(b.start) > now ? html`<button class="btn btn-danger btn-sm" data-cancel="${b.code}">Cancelar</button>` : b.status === 'cancelled' ? html`<span class="pill paused">Cancelada</span>` : ''}
        </div>
      </div>`;
  };
  el.innerHTML = html`
    <div class="panel">
      <div class="card block">
        <div class="block-head"><h3>Próximas citas</h3><span class="hint">Se sincronizan con ${bot.connected ? 'tu Google Calendar' : 'el calendario demo'}</span></div>
        ${up.length ? up.map(row) : html`<div class="empty"><div class="big">Aún no hay citas</div><p>Prueba a reservar desde el chat de la derecha.</p></div>`}
      </div>
      ${past.length ? html`<div class="card block"><div class="block-head"><h3>Historial</h3></div>${past.slice(0, 30).map(row)}</div>` : ''}
    </div>`.s;
  $$('[data-cancel]', el).forEach(
    (b) =>
      (b.onclick = () => {
        if (!confirm('¿Cancelar esta reserva? Se eliminará del calendario y se avisará al cliente.')) return;
        busy(b, async () => {
          await api(`/api/bots/${bot.id}/bookings/${b.dataset.cancel}/cancel`, { body: {} });
          toast('Reserva cancelada');
          reloadData();
        });
      })
  );
}

function tabInstall(el, bot) {
  const chatUrl = `${status.baseUrl}/chat/${bot.id}`;
  const snippet = `<script src="${status.baseUrl}/widget.js" data-bot="${bot.id}" async></script>`;
  const colored = html`<span class="t">&lt;script</span> <span class="a">src</span>=<span class="s">"${status.baseUrl}/widget.js"</span> <span class="a">data-bot</span>=<span class="s">"${bot.id}"</span> <span class="a">async</span><span class="t">&gt;&lt;/script&gt;</span>`;
  el.innerHTML = html`
    <div class="panel">
      <div class="card block">
        <div class="block-head"><h3>1 · Botón flotante en tu web</h3><button class="btn btn-primary btn-sm" id="cpSnippet">Copiar código</button></div>
        <p class="muted" style="margin-bottom:14px">Pega esta línea antes de <code class="mono">&lt;/body&gt;</code> en tu web (WordPress, Wix, Shopify, Webflow o HTML). Aparecerá un botón «Reservar cita» con el color de tu marca.</p>
        <div class="code">${colored}</div>
        <p class="hint" style="margin-top:12px">Opcional: <span class="mono">data-label="Pide cita"</span> cambia el texto, <span class="mono">data-position="left"</span> lo coloca a la izquierda y <span class="mono">Agendia.open()</span> lo abre desde tus propios botones.</p>
      </div>
      <div class="card block">
        <div class="block-head"><h3>2 · Enlace directo</h3></div>
        <p class="muted" style="margin-bottom:14px">Para Instagram, WhatsApp, Google Business o tu firma de email.</p>
        <div class="copy-row"><input class="input" readonly value="${chatUrl}"><button class="btn btn-ghost" id="cpLink">Copiar</button></div>
      </div>
      ${!bot.connected ? html`<div class="notice"><span>💡</span><div>Este asistente usa el <b>calendario demo</b>. Conecta tu Google Calendar en <b>Ajustes</b> antes de publicarlo para que las citas lleguen a tu agenda real.</div></div>` : ''}
      ${bot.status !== 'live' ? html`<div class="notice"><span>⏸</span><div>El asistente está <b>pausado</b>: tus clientes verán un aviso de no disponible hasta que lo actives.</div></div>` : ''}
    </div>`.s;
  $('#cpSnippet', el).onclick = () => copy(snippet, 'Código copiado');
  $('#cpLink', el).onclick = () => copy(chatUrl, 'Enlace copiado');
}

function tabMail(el, bot) {
  el.innerHTML = html`
    <div class="panel">
      <div class="notice info"><span>✉️</span><div>Modo demo: estos son los correos que se habrían enviado. Con Google conectado se envían de verdad desde tu Gmail.</div></div>
      <div>${bot.outbox.map((m, i) => html`<details class="mail" ${i === 0 ? raw('open') : ''}><summary><b>${m.subject}</b><span>para ${m.to} · ${new Date(m.at).toLocaleString('es')}</span></summary><iframe sandbox="" data-i="${i}" title="${m.subject}"></iframe></details>`)}</div>
    </div>`.s;
  $$('iframe[data-i]', el).forEach((f) => (f.srcdoc = bot.outbox[f.dataset.i].html));
}

async function tabSettings(el, bot, { reload }) {
  const c = structuredClone(bot.config);
  let calendars = [];
  if (bot.connected) calendars = await api(`/api/bots/${bot.id}/calendars`).catch(() => []);

  const svcRow = (s, i) => html`
    <div class="svc-edit" data-svc="${i}">
      <input class="input" data-k="name" value="${s.name}" placeholder="Servicio" aria-label="Nombre del servicio">
      <input class="input" data-k="durationMinutes" type="number" min="5" step="5" value="${s.durationMinutes}" aria-label="Duración en minutos" title="Minutos">
      <input class="input price-in" data-k="price" value="${s.price}" placeholder="Precio" aria-label="Precio">
      <button type="button" class="btn btn-danger btn-sm" data-del="${i}" aria-label="Eliminar servicio">✕</button>
    </div>`;

  const draw = () => {
    el.innerHTML = html`
      <form class="panel" id="settings">
        <div class="card block">
          <div class="block-head"><h3>Conexiones</h3></div>
          <div class="form-grid">
            <div class="field"><label>Correo del negocio</label><input class="input" type="email" name="businessEmail" value="${bot.businessEmail}" required><span class="hint">Recibe un aviso con cada reserva y cancelación.</span></div>
            <div class="field">
              <label>Google Calendar</label>
              ${bot.connected
                ? html`<select class="select" name="calendarId">${calendars.map((cal) => html`<option value="${cal.id}" ${cal.id === bot.calendarId ? raw('selected') : ''}>${cal.name}${cal.primary ? ' (principal)' : ''}</option>`)}</select>
                       <span class="hint">Conectado como ${bot.google.email} · <a href="#" id="disc">desconectar</a></span>`
                : status.googleConfigured
                  ? html`<a class="btn btn-ghost" href="/auth/google/start?bot=${bot.id}">Conectar Google Calendar</a><span class="hint">Ahora mismo usa el calendario demo.</span>`
                  : html`<div class="notice" style="padding:10px 12px;font-size:13px"><div>Calendario demo activo. Configura Google en <code>.env</code> para conectar tu calendario real.</div></div>`}
            </div>
          </div>
        </div>

        <div class="card block">
          <div class="block-head"><h3>Identidad</h3></div>
          <div class="form-grid">
            <div class="field"><label>Nombre del negocio</label><input class="input" name="businessName" value="${c.businessName}"></div>
            <div class="field"><label>Nombre del asistente</label><input class="input" name="assistantName" value="${c.assistantName}"></div>
            <div class="field full"><label>Mensaje de bienvenida</label><textarea class="textarea" name="welcomeMessage" rows="2" style="min-height:70px">${c.welcomeMessage}</textarea></div>
            <div class="field full"><label>Respuestas rápidas <span class="hint">(separadas por |)</span></label><input class="input" name="quickReplies" value="${c.quickReplies.join(' | ')}"></div>
            <div class="field"><label>Color de marca</label><div class="color-in"><input type="color" name="brandColor" value="${c.brandColor}"><span class="mono muted">${c.brandColor}</span></div></div>
            <div class="field"><label>Zona horaria</label><input class="input" name="timezone" value="${c.timezone}"></div>
          </div>
        </div>

        <div class="card block">
          <div class="block-head"><h3>Servicios</h3><button type="button" class="btn btn-ghost btn-sm" id="addSvc">+ Añadir</button></div>
          <div id="svcs">${c.services.map(svcRow)}</div>
          <span class="hint">Nombre · minutos · precio</span>
        </div>

        <div class="card block">
          <div class="block-head"><h3>Horario semanal</h3></div>
          <div class="hours-edit">
            ${c.weeklyHours.map((d, di) => html`
              <div class="d"><label class="switch"><input type="checkbox" data-open="${di}" ${d.open ? raw('checked') : ''} aria-label="Abierto ${DAY_ES[d.day]}"><span></span></label>${DAY_ES[d.day]}</div>
              <div class="ranges">
                ${d.open ? d.ranges.map((r, ri) => html`<span class="rg"><input inputmode="numeric" pattern="[0-2]?[0-9]:[0-5][0-9]" maxlength="5" data-r="${di}:${ri}:start" value="${r.start}" aria-label="Desde"> – <input inputmode="numeric" pattern="[0-2]?[0-9]:[0-5][0-9]" maxlength="5" data-r="${di}:${ri}:end" value="${r.end}" aria-label="Hasta"><button type="button" class="btn btn-sm" data-rdel="${di}:${ri}" aria-label="Quitar tramo">✕</button></span>`) : html`<span class="hint">Cerrado</span>`}
                ${d.open ? html`<button type="button" class="btn btn-ghost btn-sm" data-radd="${di}">+ tramo</button>` : ''}
              </div>`)}
          </div>
          <div class="field" style="margin-top:16px"><label>Días cerrados <span class="hint">(YYYY-MM-DD separados por comas)</span></label><input class="input mono" name="closedDates" value="${c.closedDates.join(', ')}"></div>
        </div>

        <div class="card block">
          <div class="block-head"><h3>Reglas de reserva</h3></div>
          <div class="form-grid">
            <div class="field"><label>Huecos cada (min)</label><input class="input" type="number" name="slotIntervalMinutes" min="5" value="${c.slotIntervalMinutes}"></div>
            <div class="field"><label>Margen entre citas (min)</label><input class="input" type="number" name="bufferMinutes" min="0" value="${c.bufferMinutes}"></div>
            <div class="field"><label>Antelación mínima (horas)</label><input class="input" type="number" name="minNoticeHours" min="0" step="0.5" value="${c.minNoticeHours}"></div>
            <div class="field"><label>Reservar hasta (días vista)</label><input class="input" type="number" name="maxDaysAhead" min="1" value="${c.maxDaysAhead}"></div>
            <div class="field full" style="flex-direction:row;align-items:center;gap:12px"><label class="switch"><input type="checkbox" name="collectPhone" ${c.collectPhone ? raw('checked') : ''}><span></span></label><span>Pedir teléfono al reservar</span></div>
          </div>
        </div>

        <div class="card block">
          <div class="block-head"><h3>Personalidad y reglas</h3></div>
          <div class="form-grid">
            <div class="field full"><label>Tono</label><input class="input" name="tone" value="${c.tone}"></div>
            <div class="field full"><label>Políticas</label><textarea class="textarea" name="policies">${c.policies}</textarea></div>
            <div class="field full"><label>Instrucciones especiales</label><textarea class="textarea" name="extraInstructions">${c.extraInstructions}</textarea></div>
          </div>
        </div>

        <div class="card block">
          <div class="block-head"><h3>Zona de peligro</h3></div>
          <button type="button" class="btn btn-danger" id="del">Eliminar asistente</button>
        </div>

        <div class="save-bar"><button type="button" class="btn btn-ghost" id="discard">Descartar</button><button class="btn btn-primary" type="submit">Guardar cambios</button></div>
      </form>`.s;
    bind();
  };

  // Vuelca los campos dinámicos (servicios, horario) al objeto antes de re-dibujar.
  const collect = () => {
    const f = $('#settings', el);
    $$('[data-svc]', f).forEach((row) => {
      const s = c.services[row.dataset.svc];
      $$('[data-k]', row).forEach((inp) => (s[inp.dataset.k] = inp.dataset.k === 'durationMinutes' ? Number(inp.value) : inp.value));
    });
    $$('[data-r]', f).forEach((inp) => {
      const [di, ri, k] = inp.dataset.r.split(':');
      c.weeklyHours[di].ranges[ri][k] = inp.value;
    });
    for (const k of ['businessName', 'assistantName', 'welcomeMessage', 'brandColor', 'timezone', 'tone', 'policies', 'extraInstructions']) c[k] = f[k].value;
    for (const k of ['slotIntervalMinutes', 'bufferMinutes', 'minNoticeHours', 'maxDaysAhead']) c[k] = Number(f[k].value);
    c.collectPhone = f.collectPhone.checked;
    c.quickReplies = f.quickReplies.value.split('|').map((s) => s.trim()).filter(Boolean);
    c.closedDates = f.closedDates.value.split(/[,\s]+/).map((s) => s.trim()).filter(Boolean);
    return f;
  };

  const bind = () => {
    const f = $('#settings', el);
    f.brandColor.oninput = (e) => (e.target.nextElementSibling.textContent = e.target.value);
    $('#addSvc', f).onclick = () => { collect(); c.services.push({ name: '', durationMinutes: 30, price: '', description: '' }); draw(); };
    $$('[data-del]', f).forEach((b) => (b.onclick = () => { collect(); c.services.splice(b.dataset.del, 1); draw(); }));
    $$('[data-open]', f).forEach((b) => (b.onchange = () => {
      collect();
      const d = c.weeklyHours[b.dataset.open];
      d.open = b.checked;
      if (d.open && !d.ranges.length) d.ranges = [{ start: '09:00', end: '14:00' }];
      draw();
    }));
    $$('[data-radd]', f).forEach((b) => (b.onclick = () => { collect(); c.weeklyHours[b.dataset.radd].ranges.push({ start: '16:00', end: '20:00' }); draw(); }));
    $$('[data-rdel]', f).forEach((b) => (b.onclick = () => {
      collect();
      const [di, ri] = b.dataset.rdel.split(':');
      const d = c.weeklyHours[di];
      d.ranges.splice(ri, 1);
      if (!d.ranges.length) d.open = false;
      draw();
    }));
    const disc = $('#disc', f);
    if (disc) disc.onclick = async (e) => {
      e.preventDefault();
      if (!confirm('¿Desconectar Google Calendar? El asistente pasará al calendario demo.')) return;
      const fresh = await api(`/api/bots/${bot.id}/google/disconnect`, { body: {} });
      reload({ ...bot, ...fresh });
    };
    $('#discard', f).onclick = () => reload();
    $('#del', f).onclick = (e) => {
      if (!confirm(`¿Eliminar «${c.businessName}» y todas sus reservas? Esta acción no se puede deshacer.`)) return;
      busy(e.currentTarget, async () => {
        await api(`/api/bots/${bot.id}`, { method: 'DELETE' });
        toast('Asistente eliminado');
        location.hash = '#/';
      });
    };
    f.onsubmit = (e) => {
      e.preventDefault();
      collect();
      busy(e.submitter, async () => {
        const body = { config: c, businessEmail: f.businessEmail.value };
        if (f.calendarId) body.calendarId = f.calendarId.value;
        const fresh = await api(`/api/bots/${bot.id}`, { method: 'PATCH', body });
        toast('Cambios guardados ✓');
        reload({ ...bot, ...fresh });
      });
    };
  };
  draw();
}

route();

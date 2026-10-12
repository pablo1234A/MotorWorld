const botId = location.pathname.split('/').filter(Boolean)[1];
const params = new URLSearchParams(location.search);
const embed = params.has('embed');
const $ = (id) => document.getElementById(id);
const log = $('log');
const input = $('input');
const quick = $('quick');
const storeKey = `agendia:${botId}`;

let bot = null;
let sessionId = '';
let transcript = [];
let busy = false;

const store = {
  load() {
    try { return JSON.parse(sessionStorage.getItem(storeKey) || 'null'); } catch { return null; }
  },
  save() {
    try { sessionStorage.setItem(storeKey, JSON.stringify({ sessionId, transcript: transcript.slice(-60) })); } catch {}
  },
  clear() {
    try { sessionStorage.removeItem(storeKey); } catch {}
  },
};

if (embed) {
  document.body.classList.add('embed');
  $('closeBtn').hidden = false;
  $('closeBtn').onclick = () => parent.postMessage({ type: 'agendia:close' }, '*');
}
if (params.get('theme')) document.documentElement.dataset.theme = params.get('theme');

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

// Markdown mínimo y seguro: negrita, cursiva, listas y párrafos.
function md(text) {
  const blocks = esc(text).split(/\n{2,}/);
  return blocks
    .map((b) => {
      const lines = b.split('\n');
      if (lines.every((l) => /^\s*[-•*]\s+/.test(l))) {
        return `<ul>${lines.map((l) => `<li>${inline(l.replace(/^\s*[-•*]\s+/, ''))}</li>`).join('')}</ul>`;
      }
      return `<p>${lines.map(inline).join('<br>')}</p>`;
    })
    .join('');
}
function inline(s) {
  return s.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/(^|\W)_(.+?)_(?=\W|$)/g, '$1<i>$2</i>');
}

function readableInk(hex) {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [n >> 16, (n >> 8) & 255, n & 255].map((v) => {
    v /= 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.45 ? '#111' : '#fff';
}

function dayLabel(date) {
  const [y, m, d] = date.split('-').map(Number);
  return new Intl.DateTimeFormat(bot?.language || 'es', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }).format(new Date(Date.UTC(y, m - 1, d)));
}

function scroll() {
  requestAnimationFrame(() => (log.scrollTop = log.scrollHeight));
}

function render(item, animate = true) {
  let el;
  if (item.type === 'user' || item.type === 'bot' || item.type === 'error') {
    el = document.createElement('div');
    el.className = `msg ${item.type}`;
    el.innerHTML = item.type === 'bot' ? md(item.text) : esc(item.text);
  } else if (item.type === 'slots') {
    el = document.createElement('div');
    el.className = 'slots';
    for (const day of item.data.days) {
      const wrap = document.createElement('div');
      wrap.innerHTML = `<div class="slot-day">${esc(dayLabel(day.date))}</div>`;
      // Agrupa por franjas para que encontrar «por la tarde» sea inmediato.
      const groups = [['Mañana', (t) => t < '14:00'], ['Tarde', (t) => t >= '14:00' && t < '20:00'], ['Noche', (t) => t >= '20:00']]
        .map(([name, fn]) => [name, day.times.filter(fn)])
        .filter(([, ts]) => ts.length);
      for (const [name, ts] of groups) {
        const g = document.createElement('div');
        g.className = groups.length > 1 ? 'slot-group' : '';
        if (groups.length > 1) g.innerHTML = `<span>${name}</span>`;
        const row = document.createElement('div');
        row.className = 'slot-row';
        ts.forEach((t, i) => {
          const b = document.createElement('button');
          b.className = 'slot';
          b.textContent = t;
          b.hidden = i >= 6;
          b.onclick = () => send(`Me viene bien el ${dayLabel(day.date)} a las ${t}`);
          row.append(b);
        });
        if (ts.length > 6) {
          const more = document.createElement('button');
          more.className = 'slot-more';
          more.textContent = `+${ts.length - 6} más`;
          more.onclick = () => {
            row.querySelectorAll('.slot[hidden]').forEach((x) => (x.hidden = false));
            more.remove();
          };
          row.append(more);
        }
        g.append(row);
        wrap.append(g);
      }
      el.append(wrap);
    }
  } else if (item.type === 'booking' || item.type === 'cancelled') {
    const b = item.data;
    const ok = item.type === 'booking';
    el = document.createElement('div');
    el.className = `ticket${ok ? '' : ' cancel'}`;
    el.innerHTML = `
      <div class="ticket-top">
        ${ok ? '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>Reserva confirmada' : '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>Reserva cancelada'}
      </div>
      <div class="ticket-body">
        <div class="ticket-when">${esc(dayLabel(b.date))} · ${esc(b.time)}</div>
        <div class="ticket-sub">${esc(b.service)} · ${esc(b.name)}</div>
        <div class="ticket-code" title="Código de reserva">${esc(b.code)}</div>
      </div>`;
  }
  if (!animate) el.style.animation = 'none';
  log.append(el);
  scroll();
}

function push(item) {
  transcript.push(item);
  render(item);
  store.save();
}

function showQuick(list) {
  quick.innerHTML = '';
  for (const q of list || []) {
    const b = document.createElement('button');
    b.textContent = q;
    b.onclick = () => send(q);
    quick.append(b);
  }
}

function typing(on) {
  const t = $('typing');
  if (on && !t) {
    const el = document.createElement('div');
    el.className = 'typing';
    el.id = 'typing';
    el.innerHTML = '<i></i><i></i><i></i>';
    log.append(el);
    scroll();
  } else if (!on && t) t.remove();
}

async function send(text) {
  text = text.trim();
  if (!text || busy) return;
  busy = true;
  $('sendBtn').disabled = true;
  showQuick([]);
  push({ type: 'user', text });
  input.value = '';
  autosize();
  typing(true);
  try {
    const res = await fetch(`/api/public/bots/${botId}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId, message: text }),
    });
    const data = await res.json().catch(() => ({}));
    typing(false);
    if (!res.ok) throw new Error(data.error || 'No se pudo enviar el mensaje');
    sessionId = data.sessionId;
    push({ type: 'bot', text: data.reply });
    if (data.booking) push({ type: 'booking', data: data.booking });
    if (data.cancelled) push({ type: 'cancelled', data: data.cancelled });
    if (data.slots?.days?.length) push({ type: 'slots', data: data.slots });
    if (data.booking) parent.postMessage({ type: 'agendia:booking', booking: data.booking }, '*');
  } catch (e) {
    typing(false);
    push({ type: 'error', text: e.message || 'Error de conexión' });
  } finally {
    busy = false;
    $('sendBtn').disabled = false;
    if (!matchMedia('(pointer: coarse)').matches) input.focus();
  }
}

function autosize() {
  input.style.height = 'auto';
  input.style.height = `${Math.min(input.scrollHeight, 140)}px`;
}

function start() {
  log.innerHTML = '';
  transcript = [];
  sessionId = '';
  push({ type: 'bot', text: bot.welcomeMessage || `¡Hola! Soy ${bot.assistantName}. ¿En qué te ayudo?` });
  showQuick(bot.quickReplies);
}

$('composer').addEventListener('submit', (e) => {
  e.preventDefault();
  send(input.value);
});
input.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
    e.preventDefault();
    send(input.value);
  }
});
input.addEventListener('input', autosize);
$('resetBtn').onclick = () => {
  if (sessionId) fetch(`/api/public/bots/${botId}/reset`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sessionId }) });
  store.clear();
  start();
};

(async () => {
  const res = await fetch(`/api/public/bots/${botId}`);
  if (!res.ok) {
    $('chat').hidden = true;
    $('unavailable').hidden = false;
    return;
  }
  bot = await res.json();
  document.title = `${bot.businessName} · Reservas`;
  document.documentElement.lang = bot.language || 'es';
  const root = document.documentElement.style;
  root.setProperty('--brand', bot.brandColor);
  root.setProperty('--brand-ink', readableInk(bot.brandColor));
  $('avatar').textContent = (bot.assistantName || '?').trim()[0].toUpperCase();
  $('assistantName').textContent = bot.assistantName;
  $('businessName').textContent = bot.businessName;
  $('demoBadge').hidden = !bot.demo;

  const saved = params.has('fresh') ? null : store.load();
  if (saved?.transcript?.length) {
    sessionId = saved.sessionId;
    transcript = saved.transcript;
    transcript.forEach((t) => render(t, false));
  } else {
    start();
  }
})();

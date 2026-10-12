/*! Agendia widget — <script src="https://TU-DOMINIO/widget.js" data-bot="bot_xxx" async></script> */
(function () {
  var script = document.currentScript || document.querySelector('script[data-bot][src*="widget.js"]');
  if (!script || window.__agendiaWidget) return;
  window.__agendiaWidget = true;
  var botId = script.getAttribute('data-bot');
  var origin = new URL(script.src).origin;
  var position = script.getAttribute('data-position') === 'left' ? 'left' : 'right';
  var label = script.getAttribute('data-label') || 'Reservar cita';

  var css =
    '.agw-btn{position:fixed;bottom:20px;' + position + ':20px;z-index:2147483000;display:flex;align-items:center;gap:10px;height:56px;padding:0 20px 0 16px;border:0;border-radius:28px;cursor:pointer;font:600 15px/1 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;box-shadow:0 12px 32px -8px rgba(0,0,0,.35),0 2px 6px rgba(0,0,0,.12);transition:transform .2s cubic-bezier(.2,.8,.2,1),box-shadow .2s;-webkit-tap-highlight-color:transparent}' +
    '.agw-btn:hover{transform:translateY(-2px);box-shadow:0 18px 40px -10px rgba(0,0,0,.4),0 2px 6px rgba(0,0,0,.12)}' +
    '.agw-btn:active{transform:scale(.97)}' +
    '.agw-btn svg{flex:none}' +
    '.agw-frame{position:fixed;bottom:88px;' + position + ':20px;z-index:2147483001;width:400px;height:min(660px,calc(100vh - 120px));border:0;border-radius:22px;overflow:hidden;background:#fff;box-shadow:0 30px 80px -20px rgba(0,0,0,.45),0 0 0 1px rgba(0,0,0,.06);opacity:0;transform:translateY(16px) scale(.97);transform-origin:bottom ' + position + ';pointer-events:none;transition:opacity .22s ease,transform .28s cubic-bezier(.2,.9,.25,1)}' +
    '.agw-open .agw-frame{opacity:1;transform:none;pointer-events:auto}' +
    '@media (max-width:520px){.agw-frame{inset:0;width:100%;height:100%;border-radius:0;bottom:0}.agw-open .agw-btn{display:none}}' +
    '@media (prefers-reduced-motion:reduce){.agw-btn,.agw-frame{transition:none}}';
  var style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);

  var root = document.createElement('div');
  root.className = 'agw';
  var btn = document.createElement('button');
  btn.className = 'agw-btn';
  btn.setAttribute('aria-label', label);
  btn.innerHTML =
    '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4.5" width="18" height="16" rx="3"/><path d="M8 2.5v4M16 2.5v4M3 10h18"/><path d="m9.5 15 2 2 3.5-3.5"/></svg><span></span>';
  btn.querySelector('span').textContent = label;
  btn.style.background = '#111';
  btn.style.color = '#fff';
  var frame = null;

  function open() {
    if (!frame) {
      frame = document.createElement('iframe');
      frame.className = 'agw-frame';
      frame.title = label;
      frame.allow = 'clipboard-write';
      frame.src = origin + '/chat/' + encodeURIComponent(botId) + '?embed=1';
      root.appendChild(frame);
      frame.getBoundingClientRect();
    }
    root.classList.add('agw-open');
  }
  function close() {
    root.classList.remove('agw-open');
  }
  btn.onclick = function () {
    root.classList.contains('agw-open') ? close() : open();
  };
  window.addEventListener('message', function (e) {
    if (e.origin !== origin || !e.data) return;
    if (e.data.type === 'agendia:close') close();
    if (e.data.type === 'agendia:booking') {
      document.dispatchEvent(new CustomEvent('agendia:booking', { detail: e.data.booking }));
    }
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') close();
  });

  fetch(origin + '/api/public/bots/' + encodeURIComponent(botId))
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (bot) {
      if (!bot) return;
      btn.style.background = bot.brandColor;
      var n = parseInt(bot.brandColor.slice(1), 16);
      var lum = (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
      btn.style.color = lum > 0.62 ? '#111' : '#fff';
      root.appendChild(btn);
      document.body.appendChild(root);
      window.Agendia = { open: open, close: close };
    });
})();

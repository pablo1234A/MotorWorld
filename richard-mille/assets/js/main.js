/*!
 * Richard Mille — interacción y animación
 * Vanilla JS, sin dependencias. Funciona abriendo index.html directamente
 * o servido por el backend (server/server.js), que activa la API de citas.
 */
(function () {
  'use strict';

  var RM = window.RM;
  var SCENE = window.RM_SCENE;

  /* ====================================================================== */
  /* Utilidades                                                              */
  /* ====================================================================== */
  var $ = function (s, c) { return (c || document).querySelector(s); };
  var $$ = function (s, c) { return Array.prototype.slice.call((c || document).querySelectorAll(s)); };
  var clamp = function (v, a, b) { return v < a ? a : v > b ? b : v; };
  var lerp = function (a, b, t) { return a + (b - a) * t; };
  var range = function (v, a, b) { return clamp((v - a) / (b - a), 0, 1); };
  var damp = function (a, b, lambda, dt) { return lerp(a, b, 1 - Math.exp(-lambda * dt)); };
  var easeIO = function (t) { return t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; };
  var easeOut = function (t) { return 1 - Math.pow(1 - t, 3); };
  var pad2 = function (n) { return (n < 10 ? '0' : '') + n; };
  // En la versión de un solo archivo las imágenes van incrustadas en window.RM_ASSETS
  var asset = function (path) { return (window.RM_ASSETS && window.RM_ASSETS[path]) || path; };

  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  var vw = window.innerWidth, vh = window.innerHeight;

  function onResize(fn) {
    var t;
    window.addEventListener('resize', function () { clearTimeout(t); t = setTimeout(fn, 120); });
  }

  function escapeHTML(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  var toastEl = $('#toast'), toastT;
  function toast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.add('is-on');
    clearTimeout(toastT);
    toastT = setTimeout(function () { toastEl.classList.remove('is-on'); }, 3200);
  }

  /* ====================================================================== */
  /* API (solo si la página se sirve por HTTP desde server/server.js)        */
  /* ====================================================================== */
  var api = { enabled: false };
  api.ready = (function () {
    if (!/^https?:$/.test(location.protocol) || !window.fetch) return Promise.resolve(false);
    var ctrl = window.AbortController ? new AbortController() : null;
    var t = setTimeout(function () { ctrl && ctrl.abort(); }, 1500);
    return fetch('api/health', { cache: 'no-store', signal: ctrl && ctrl.signal })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) { api.enabled = !!(j && j.ok); return api.enabled; })
      .catch(function () { return false; })
      .then(function (v) { clearTimeout(t); return v; });
  })();

  /* ====================================================================== */
  /* Preloader                                                               */
  /* ====================================================================== */
  function preload() {
    $$('.preloader__mark span').forEach(function (s, i) { s.style.setProperty('--i', i); });
    var srcs = [asset('assets/img/rm-assembled.webp')].concat(SCENE.parts.map(function (p) { return asset('assets/img/parts/' + p[0] + '.webp'); }));
    var total = srcs.length + 1, loaded = 0, shown = 0, done = false;
    var bar = $('#preloaderBar'), count = $('#preloaderCount');
    var tick = function () { loaded++; };
    srcs.forEach(function (src) { var im = new Image(); im.onload = im.onerror = tick; im.src = src; });
    (document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve()).then(tick);
    var started = performance.now();

    function step() {
      var target = loaded / total * 100;
      if (performance.now() - started > 7000) target = 100; // red lenta: no bloquear
      shown = Math.min(target, shown + Math.max(.6, (target - shown) * .08));
      bar.style.transform = 'scaleX(' + shown / 100 + ')';
      count.textContent = ('00' + Math.round(shown)).slice(-3);
      if (shown >= 99.9 && !done) {
        done = true;
        setTimeout(finish, 280);
        return;
      }
      requestAnimationFrame(step);
    }
    function finish() {
      $('#preloader').classList.add('is-done');
      document.body.classList.remove('is-loading');
      document.body.classList.add('is-ready');
      measureAll();
      setTimeout(function () { $('#preloader').remove(); }, 1400);
    }
    if (reduced) { loaded = total; shown = 99; }
    requestAnimationFrame(step);
  }

  /* ====================================================================== */
  /* Texto dividido y reveals                                                */
  /* ====================================================================== */
  function splitWords(el) {
    var idx = 0;
    (function walk(node) {
      Array.prototype.slice.call(node.childNodes).forEach(function (n) {
        if (n.nodeType === 3) {
          var frag = document.createDocumentFragment();
          n.textContent.split(/(\s+)/).forEach(function (part) {
            if (!part) return;
            if (/^\s+$/.test(part)) { frag.appendChild(document.createTextNode(' ')); return; }
            var w = document.createElement('span'); w.className = 'w';
            var i = document.createElement('span'); i.textContent = part; i.style.setProperty('--wi', idx++);
            w.appendChild(i); frag.appendChild(w);
          });
          node.replaceChild(frag, n);
        } else if (n.nodeType === 1 && n.tagName !== 'BR') walk(n);
      });
    })(el);
  }

  function reveals() {
    $$('[data-split]').forEach(splitWords);
    $$('.families__list .family').forEach(function (li, i) { li.style.setProperty('--d', i); });
    var targets = $$('.reveal, [data-split]');
    if (!('IntersectionObserver' in window) || reduced) {
      targets.forEach(function (t) { t.classList.add('is-in'); });
      return;
    }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) { e.target.classList.add('is-in'); io.unobserve(e.target); }
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: .12 });
    targets.forEach(function (t) { io.observe(t); });
  }

  /* ====================================================================== */
  /* Navegación                                                              */
  /* ====================================================================== */
  var nav = $('#nav'), burger = $('#burger'), menu = $('#menu');
  var lastY = 0;

  function navUpdate(y) {
    var open = document.body.classList.contains('menu-open');
    nav.classList.toggle('is-solid', y > 40 || open);
    if (!open) {
      if (y > lastY + 6 && y > 240) nav.classList.add('is-hidden');
      else if (y < lastY - 6 || y < 240) nav.classList.remove('is-hidden');
    }
    lastY = y;
  }

  function setMenu(open) {
    burger.setAttribute('aria-expanded', open);
    burger.setAttribute('aria-label', open ? 'Cerrar menú' : 'Abrir menú');
    document.body.classList.toggle('menu-open', open);
    if (open) { menu.hidden = false; requestAnimationFrame(function () { menu.classList.add('is-open'); }); }
    else { menu.classList.remove('is-open'); setTimeout(function () { if (!menu.classList.contains('is-open')) menu.hidden = true; }, 800); }
    nav.classList.remove('is-hidden');
  }

  function initNav() {
    burger.addEventListener('click', function () { setMenu(burger.getAttribute('aria-expanded') !== 'true'); });
    $$('a', menu).forEach(function (a) { a.addEventListener('click', function () { setMenu(false); }); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && document.body.classList.contains('menu-open')) setMenu(false); });

    // Enlace activo según la sección visible
    var links = $$('[data-nav]');
    if ('IntersectionObserver' in window) {
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (e) {
          if (!e.isIntersecting) return;
          links.forEach(function (l) { l.classList.toggle('is-active', l.getAttribute('href') === '#' + e.target.id); });
        });
      }, { rootMargin: '-45% 0px -50% 0px' });
      links.forEach(function (l) { var s = $(l.getAttribute('href')); if (s) io.observe(s); });
    }

    // Enlaces que preseleccionan una colección en el formulario
    $$('[data-preset-interest]').forEach(function (a) {
      a.addEventListener('click', function () { booking.presetInterest(a.getAttribute('data-preset-interest')); });
    });
  }

  /* ====================================================================== */
  /* Cursor y botones magnéticos                                             */
  /* ====================================================================== */
  function initCursor() {
    if (!finePointer || reduced) return;
    document.documentElement.classList.add('has-cursor');
    var c = $('.cursor'), dot = $('.cursor__dot'), ring = $('.cursor__ring'), label = $('.cursor__label');
    var x = vw / 2, y = vh / 2, rx = x, ry = y;
    window.addEventListener('pointermove', function (e) {
      x = e.clientX; y = e.clientY;
      dot.style.transform = 'translate(' + x + 'px,' + y + 'px)';
      c.classList.remove('is-hidden');
    }, { passive: true });
    document.addEventListener('pointerleave', function () { c.classList.add('is-hidden'); });
    document.addEventListener('pointerover', function (e) {
      var t = e.target.closest('a, button, [role="radio"], select, .bcard, .check, [data-cursor]');
      var lab = t && t.getAttribute('data-cursor');
      c.classList.toggle('is-hover', !!t && !lab);
      c.classList.toggle('is-label', !!lab);
      if (lab) label.textContent = lab;
    });
    (function loop() {
      rx = lerp(rx, x, .2); ry = lerp(ry, y, .2);
      ring.style.transform = 'translate(' + rx + 'px,' + ry + 'px)';
      requestAnimationFrame(loop);
    })();
  }

  function initMagnetic() {
    if (!finePointer || reduced) return;
    $$('[data-magnetic]').forEach(function (el) {
      el.addEventListener('pointermove', function (e) {
        var r = el.getBoundingClientRect();
        var dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2);
        el.style.transform = 'translate(' + dx * .22 + 'px,' + dy * .3 + 'px)';
      });
      el.addEventListener('pointerleave', function () { el.style.transform = ''; });
    });
  }

  /* ====================================================================== */
  /* Motor de scroll: escenas ligadas al desplazamiento                      */
  /* ====================================================================== */
  var scenes = [];
  function measureAll() {
    vw = window.innerWidth; vh = window.innerHeight;
    scenes.forEach(function (s) { s.measure && s.measure(); });
  }
  function sectionProgress(cache, y) {
    var dist = cache.height - vh;
    return dist > 0 ? clamp((y - cache.top) / dist, 0, 1) : 0;
  }
  function cacheOf(el) {
    var r = el.getBoundingClientRect();
    return { top: r.top + window.scrollY, height: r.height };
  }

  /* ---------------------------------------------------------------------- */
  /* 01 · Despiece del RM 002-V2                                            */
  /* ---------------------------------------------------------------------- */
  var PART_INFO = {
    'crystal': ['Cristal de zafiro', 0], 'bezel': ['Bisel · Carbon TPT®', .06], 'dial': ['Esfera esqueletizada', .12],
    'movement': ['Calibre', .18], 'tourbillon': ['Platina y tourbillon', .26], 'case': ['Carrura tonel', .32],
    'strap-top': ['Correa · caucho técnico', .36], 'strap-bottom': ['Correa · caucho técnico', .4],
    'l-bridge-a': ['Puente de barrilete'], 'l-arc': ['Puente lateral'], 'l-screw-a': ['Tornillo spline'], 'l-screw-b': ['Tornillo de titanio'],
    'l-train': ['Tren de rodaje'], 'l-wheel': ['Rueda de transmisión'], 'l-lever': ['Palanca de remontuar'],
    'r-stem': ['Tija y piñón'], 'r-bridges': ['Puentes de titanio'], 'r-nut': ['Casquillo'], 'r-bridge-b': ['Puente de rueda'],
    'r-bridge-c': ['Puente de áncora'], 'r-bridge-d': ['Brida'], 'r-bridge-e': ['Puente de volante'], 'r-jewel': ['Rubí'], 'r-screw': ['Tornillo de titanio']
  };
  // Reloj montado a partir de sus propias piezas: [x, y, escala] sobre el lienzo 1920×1280.
  // Las capas se apilan en la misma perspectiva 3/4 que el despiece, así que no hay cambio de imagen.
  var STACK = {
    'crystal': [960, 578, .98], 'bezel': [960, 606, .9], 'dial': [960, 640, 1], 'movement': [960, 668, .88],
    'tourbillon': [960, 690, .9], 'case': [960, 668, .86], 'strap-top': [960, 676, .56], 'strap-bottom': [960, 690, .56]
  };
  // Orden de apilado (de abajo arriba): las piezas pequeñas quedan ocultas dentro del reloj y salen de él.
  var Z_ORDER = ['strap-bottom', 'strap-top', 'case'];
  var Z_TOP = ['tourbillon', 'movement', 'dial', 'bezel', 'crystal'];
  var LABELS = [
    { at: 'crystal', x: 1127, y: 89, dir: 'r', len: 90, n: '01', name: 'Cristal de zafiro', sub: 'Abombado · antirreflejo' },
    { at: 'bezel', x: 1186, y: 300, dir: 'r', len: 70, n: '02', name: 'Bisel', sub: 'Carbon TPT®' },
    { at: 'dial', x: 1149, y: 488, dir: 'r', len: 90, n: '03', name: 'Esfera esqueletizada', sub: 'Índices luminiscentes' },
    { at: 'side', x: 296, y: 700, dir: 'l', len: 46, n: '04', name: 'Puentes y ruedas', sub: 'Titanio grado 5' },
    { at: 'tourbillon', x: 1184, y: 905, dir: 'r', len: 90, n: '05', name: 'Tourbillon', sub: 'Una rotación por minuto' },
    { at: 'case', x: 288, y: 1060, dir: 'l', len: 56, n: '06', name: 'Caja tonel', sub: 'Tres cuerpos' },
    { at: 'strap', x: 1702, y: 1012, dir: 'r', len: 40, n: '07', name: 'Correa', sub: 'Caucho técnico' }
  ];
  var CONTENT = { x: 270, y: 20, w: 1530, h: 1240 }; // zona útil del lienzo

  function explodeScene() {
    var section = $('#desmontaje'), stage = $('#stage'), partsEl = $('#parts'), whole = $('#whole');
    var labelsEl = $('#labels'), intro = $('#intro'), outro = $('#outro'), hint = $('#scrollhint');
    var hudCount = $('#hudCount'), hudTicker = $('#hudTicker'), phaseBar = $('#phaseBar');
    var phaseItems = $$('#phases li');
    var cache, fit = { s: 1, tx: 0, ty: 0, mobile: false }, p = 0, pointer = { x: 0, y: 0, sx: 0, sy: 0 };

    // Construcción de las piezas
    var byId = {};
    SCENE.parts.forEach(function (d) { byId[d[0]] = d; });
    var sideIds = SCENE.parts.map(function (d) { return d[0]; }).filter(function (id) { return /^[lr]-/.test(id); });
    // Las piezas laterales salen en orden de distancia al centro del calibre
    sideIds.sort(function (a, b) {
      var A = byId[a], B = byId[b];
      return Math.abs(A[1] + A[3] / 2 - 960) - Math.abs(B[1] + B[3] / 2 - 960);
    });
    var order = Z_ORDER.concat(sideIds, Z_TOP);
    var seed = 7;
    var rand = function () { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };

    var parts = order.map(function (id) {
      var d = byId[id], cx = d[1] + d[3] / 2, cy = d[2] + d[4] / 2;
      var img = document.createElement('img');
      img.src = asset('assets/img/parts/' + id + '.webp');
      img.alt = ''; img.decoding = 'async'; img.draggable = false;
      if (id === 'crystal') img.className = 'is-glass';
      img.style.left = d[1] + 'px'; img.style.top = d[2] + 'px'; img.style.width = d[3] + 'px'; img.style.height = d[4] + 'px';
      partsEl.appendChild(img);
      var side = sideIds.indexOf(id);
      var info = PART_INFO[id] || [id];
      var target = STACK[id] || [960 + (rand() - .5) * 90, 672 + (rand() - .5) * 40, .62];
      return {
        id: id, el: img, name: info[0], side: side >= 0,
        start: side >= 0 ? .2 + side / sideIds.length * .26 : info[1],
        dx: target[0] - cx, dy: target[1] - cy,
        rot: side >= 0 ? (rand() - .5) * 50 : 0,
        s0: target[2], t: -1
      };
    });
    $('#hudTotal').textContent = parts.length;
    // Movimiento reducido: se muestra el despiece final; el titular queda para lectores de pantalla
    if (reduced) { intro.classList.add('sr-only'); hint.hidden = true; }

    var labels = LABELS.map(function (l, i) {
      var el = document.createElement('div');
      el.className = 'plabel plabel--' + (l.dir === 'l' ? 'left' : 'right');
      el.innerHTML = '<span class="plabel__dot"></span><span class="plabel__line" style="--len:' + l.len + 'px"></span>' +
        '<span class="plabel__text"><b><em>' + l.n + '</em>' + l.name + '</b><span>' + l.sub + '</span></span>';
      labelsEl.appendChild(el);
      return { cfg: l, el: el, start: .8 + i * .02 };
    });

    function measure() {
      cache = cacheOf(section);
      fit.mobile = vw < 980;
      var aw = vw * (fit.mobile ? 1.02 : .9), ah = vh * (fit.mobile ? .6 : .84);
      fit.s = Math.min(aw / CONTENT.w, ah / CONTENT.h);
      fit.cx = vw / 2;
      fit.cy = vh / 2 + (fit.mobile ? vh * .1 : vh * .015);
      render(p, true);
    }

    if (finePointer && !reduced) {
      window.addEventListener('pointermove', function (e) {
        pointer.x = e.clientX / vw - .5; pointer.y = e.clientY / vh - .5;
      }, { passive: true });
    }

    var lastPhase = -1, lastCount = -1, lastTicker = '';

    // Curva suave (smoothstep): arranca y frena sin tirones, como un plano de cámara
    var soft = function (t) { return t * t * (3 - 2 * t); };

    function render(prog, force) {
      // Cámara: se acerca mientras el reloj se inclina (mantiene su tamaño en pantalla) y se aleja
      // poco a poco durante el despiece para revelar todas las piezas. Paralaje suave con el ratón.
      var explodeQ = range(prog, .18, .84);
      var a = soft(range(prog, .01, .24));
      var pull = soft(range(prog, .18, .74));
      var cam = lerp(1 + .78 * a, 1, pull) * (1 + .04 * soft(range(prog, .8, 1)));
      var zf = clamp((cam - 1) / .78, 0, 1);
      var fx = lerp(CONTENT.x + CONTENT.w / 2, 960, zf), fy = lerp(CONTENT.y + CONTENT.h / 2, 640, zf);
      var S = fit.s * cam;
      var tx = fit.cx - fx * S + pointer.sx * 14;
      var ty = fit.cy - fy * S + pointer.sy * 10;
      stage.style.transform = 'translate3d(' + tx.toFixed(2) + 'px,' + ty.toFixed(2) + 'px,0) scale(' + S.toFixed(5) + ')';

      // Plano 1: el reloj de frente se centra y se inclina hacia atrás hasta la vista 3/4 del despiece,
      // fundiéndose con el mismo reloj montado a partir de sus piezas (ambos siguen moviéndose: sin corte).
      var heroShift = fit.mobile ? 0 : Math.min(420, vw * .24);
      var heroScale = fit.mobile ? 1.3 : 1;
      var wx = heroShift * (1 - a), wy = (fit.mobile ? 120 : 0) * (1 - a) + 10 * a;
      var ws = lerp(heroScale, .53, a);
      whole.style.transform = 'translate3d(' + wx.toFixed(2) + 'px,' + wy.toFixed(2) + 'px,0) perspective(2200px) rotateX(' + (62 * a).toFixed(2) + 'deg) scale(' + ws.toFixed(4) + ')';
      var mix = soft(range(prog, .13, .23));
      whole.style.opacity = (1 - mix).toFixed(3);
      whole.style.visibility = mix >= 1 ? 'hidden' : '';
      partsEl.style.opacity = mix.toFixed(3);
      var pt0 = soft(range(prog, .08, .26));
      partsEl.style.transform = 'perspective(2200px) rotateX(' + (22 * (1 - pt0)).toFixed(2) + 'deg) scale(' + lerp(1.12, 1, pt0).toFixed(4) + ')';

      // Piezas
      var count = 0, ticker = null;
      for (var i = 0; i < parts.length; i++) {
        var pt = parts[i];
        var lt = range(explodeQ, pt.start, pt.start + .42);
        if (lt >= .98) count++;
        if (lt > 0 && lt < 1 && (!ticker || pt.start > ticker.start)) ticker = pt;
        if (!force && Math.abs(lt - pt.t) < .0005) continue;
        pt.t = lt;
        var e = soft(lt), inv = 1 - e;
        var sc = lerp(pt.s0, 1, e) * (1 + .03 * Math.sin(Math.PI * e));
        pt.el.style.transform = 'translate3d(' + (pt.dx * inv).toFixed(2) + 'px,' + (pt.dy * inv).toFixed(2) + 'px,0) rotate(' + (pt.rot * inv).toFixed(2) + 'deg) scale(' + sc.toFixed(4) + ')';
      }

      // HUD
      if (count !== lastCount) { hudCount.textContent = pad2(count); lastCount = count; }
      var tickTxt = ticker ? ticker.name : (prog < .18 ? 'Ensamblado' : count === parts.length ? 'Despiece completo' : 'Apertura de la caja');
      if (tickTxt !== lastTicker) {
        hudTicker.innerHTML = (ticker ? '<em>' + pad2(parts.indexOf(ticker) + 1) + '</em>' : '') + escapeHTML(tickTxt);
        lastTicker = tickTxt;
      }
      var phase = prog < .08 ? 0 : prog < .22 ? 1 : prog < .84 ? 2 : 3;
      if (phase !== lastPhase) {
        phaseItems.forEach(function (li, k) { li.classList.toggle('is-active', k === phase); });
        lastPhase = phase;
      }
      phaseBar.style.transform = 'scaleY(' + prog.toFixed(4) + ')';
      section.classList.toggle('is-active', prog > .06);

      // Etiquetas
      if (!fit.mobile) {
        labels.forEach(function (l) {
          var t = easeOut(range(prog, l.start, l.start + .06));
          var X = tx + l.cfg.x * S, Y = ty + l.cfg.y * S;
          l.el.style.opacity = t > 0 ? 1 : 0;
          l.el.style.setProperty('--t', t.toFixed(3));
          l.el.style.transform = 'translate3d(' + X.toFixed(1) + 'px,' + Y.toFixed(1) + 'px,0) translate(' + (l.cfg.dir === 'l' ? '-100%' : '0') + ',-50%)';
        });
      }

      // Textos
      var io = range(prog, .015, .1);
      intro.style.opacity = reduced ? '' : (1 - io).toFixed(3);
      if (!reduced) intro.style.transform = (fit.mobile ? '' : 'translateY(-46%) ') + 'translateY(' + (-60 * easeIO(io)).toFixed(1) + 'px)';
      intro.style.visibility = io >= 1 && !reduced ? 'hidden' : '';
      hint.style.opacity = 1 - range(prog, 0, .03);
      var oo = easeOut(range(prog, .86, .95));
      outro.style.opacity = oo.toFixed(3);
      outro.style.transform = 'translateY(' + (30 * (1 - oo)).toFixed(1) + 'px)';
    }

    return {
      measure: measure,
      update: function (dt, y) {
        if (!cache) return;
        if (y + vh < cache.top - 200 || y > cache.top + cache.height + 200) return;
        var target = reduced ? 1 : sectionProgress(cache, y);
        pointer.sx = damp(pointer.sx, pointer.x, 4, dt);
        pointer.sy = damp(pointer.sy, pointer.y, 4, dt);
        // Inercia suave: el despiece "fluye" tras el scroll en lugar de saltar con cada rueda del ratón
        p = Math.abs(target - p) < .0002 ? target : damp(p, target, 4.2, dt);
        render(p, false);
      }
    };
  }

  /* ---------------------------------------------------------------------- */
  /* 02 · Manifiesto: las palabras se encienden al leer                      */
  /* ---------------------------------------------------------------------- */
  function manifestoScene() {
    var el = $('#manifestoText');
    var words = el.textContent.trim().split(/\s+/);
    el.innerHTML = words.map(function (w) { return '<span class="mw">' + escapeHTML(w) + '</span>'; }).join(' ');
    var spans = $$('.mw', el), lit = -1, cache;
    if (reduced) spans.forEach(function (s) { s.classList.add('is-lit'); });
    return {
      measure: function () { cache = cacheOf(el); },
      update: function (dt, y) {
        if (reduced || !cache) return;
        var top = cache.top - y;
        var pr = clamp((vh * .82 - top) / (cache.height + vh * .3), 0, 1);
        var n = Math.round(pr * spans.length * 1.08);
        if (n === lit) return;
        for (var i = 0; i < spans.length; i++) spans[i].classList.toggle('is-lit', i < n);
        lit = n;
      }
    };
  }

  /* ---------------------------------------------------------------------- */
  /* 03 · Historia: scroll vertical → recorrido horizontal                  */
  /* ---------------------------------------------------------------------- */
  function historyScene() {
    var section = $('#historia'), track = $('#historyTrack'), bar = $('#historyBar'), yearEl = $('#historyYear');
    var chapters = $$('.chapter', track);
    var mq = window.matchMedia('(max-width: 980px), (max-height: 560px)');
    var cache, dist = 0, x = 0, active = -1, horizontal = false;

    function setActive(i) {
      if (i === active) return;
      active = i;
      chapters.forEach(function (c, k) { c.classList.toggle('is-active', k === i); });
      yearEl.textContent = chapters[i].querySelector('.chapter__year').getAttribute('data-year');
    }

    if ('IntersectionObserver' in window) {
      // Modo vertical (móvil): cada capítulo se activa al entrar en pantalla
      var io = new IntersectionObserver(function (es) {
        if (horizontal) return;
        es.forEach(function (e) { if (e.isIntersecting) e.target.classList.add('is-active'); });
      }, { rootMargin: '0px 0px -25% 0px' });
      chapters.forEach(function (c) { io.observe(c); });
    }

    return {
      measure: function () {
        horizontal = !mq.matches && !reduced;
        if (horizontal) {
          dist = Math.max(0, track.scrollWidth - vw);
          section.style.height = (dist + vh * 1.25) + 'px';
          chapters.forEach(function (c) { c.classList.remove('is-active'); });
          active = -1;
        } else {
          section.style.height = '';
          track.style.transform = '';
        }
        cache = cacheOf(section);
      },
      update: function (dt, y) {
        if (!horizontal || !cache) return;
        if (y + vh < cache.top || y > cache.top + cache.height) return;
        var pr = sectionProgress(cache, y);
        var pp = range(pr, .04, .94);
        x = damp(x, -pp * dist, 8, dt);
        track.style.transform = 'translate3d(' + x.toFixed(2) + 'px,0,0)';
        bar.style.transform = 'scaleX(' + pp.toFixed(4) + ')';
        // Capítulo activo: el más cercano al 35 % del ancho de pantalla
        var best = 0, bd = Infinity, focus = vw * .35;
        for (var i = 0; i < chapters.length; i++) {
          var c = chapters[i], left = c.offsetLeft + x;
          var d = Math.abs(left + c.offsetWidth * .3 - focus);
          if (d < bd) { bd = d; best = i; }
        }
        setActive(best);
      }
    };
  }

  /* ---------------------------------------------------------------------- */
  /* 04 · Ingeniería: zoom progresivo hacia el tourbillon                   */
  /* ---------------------------------------------------------------------- */
  function engineScene() {
    var section = $('#ingenieria'), media = $('#engineMedia'), reticle = $('#reticle');
    var circle = $('circle', reticle), steps = $$('#engineSteps li');
    var cache, p = 0, active = 0;
    return {
      measure: function () {
        cache = cacheOf(section);
        // Punto del tourbillon en la imagen (1920×1280) → píxeles de pantalla con object-fit: cover
        var sc = Math.max(vw / 1920, vh / 1280);
        var ox = (vw - 1920 * sc) * .5, oy = (vh - 1280 * sc) * .6;
        var fx = ox + 935 * sc, fy = oy + 940 * sc;
        media.style.transformOrigin = fx.toFixed(1) + 'px ' + fy.toFixed(1) + 'px';
        reticle.style.left = fx.toFixed(1) + 'px';
        reticle.style.top = fy.toFixed(1) + 'px';
      },
      update: function (dt, y) {
        if (!cache || y + vh < cache.top || y > cache.top + cache.height) return;
        var target = reduced ? .5 : sectionProgress(cache, y);
        p = damp(p, target, 6, dt);
        var z = easeIO(range(p, .04, .86));
        media.style.transform = 'scale(' + (1 + z * 1.7).toFixed(4) + ')';
        var r = range(p, .62, .82);
        reticle.style.opacity = r.toFixed(3);
        reticle.style.transform = 'translate(-50%,-50%) rotate(' + (p * 120).toFixed(1) + 'deg) scale(' + (1.25 - r * .25).toFixed(3) + ')';
        circle.style.strokeDashoffset = (1 - r).toFixed(3);
        var a = p < .34 ? 0 : p < .64 ? 1 : 2;
        if (a !== active) { active = a; steps.forEach(function (s, k) { s.classList.toggle('is-active', k === a); }); }
      }
    };
  }

  /* ---------------------------------------------------------------------- */
  /* Puente: referencias en bucle que se aceleran con el scroll             */
  /* ---------------------------------------------------------------------- */
  function refsScene() {
    var section = $('.refs'), cache, lastY = window.scrollY, boost = 0;
    var rows = $$('.refs__row', section).map(function (row) {
      var r = { el: row, track: $('.refs__track', row), dir: +row.dataset.dir, x: 0, w: 0, hover: false, hf: 1 };
      row.addEventListener('pointerenter', function () { r.hover = true; });
      row.addEventListener('pointerleave', function () { r.hover = false; });
      row.addEventListener('focusin', function () { r.hover = true; });
      row.addEventListener('focusout', function () { r.hover = false; });
      return r;
    });
    return {
      measure: function () {
        cache = cacheOf(section);
        rows.forEach(function (r) { r.w = $('.refs__set', r.track).offsetWidth; if (r.dir > 0) r.x = -r.w; });
      },
      update: function (dt, y) {
        var vel = dt > 0 ? Math.abs(y - lastY) / dt : 0;
        lastY = y;
        if (reduced || !cache || y + vh < cache.top || y > cache.top + cache.height) return;
        // Velocidad base + impulso proporcional a la velocidad del scroll; se frena al pasar el ratón
        boost = damp(boost, Math.min(vel * .35, 900), 6, dt);
        rows.forEach(function (r) {
          r.hf = damp(r.hf, r.hover ? 0 : 1, 5, dt);
          r.x += r.dir * (36 + boost) * r.hf * dt;
          if (r.x <= -r.w) r.x += r.w;
          if (r.x > 0) r.x -= r.w;
          r.track.style.transform = 'translate3d(' + r.x.toFixed(2) + 'px,0,0)';
        });
      }
    };
  }

  /* ---------------------------------------------------------------------- */
  /* Footer: la firma emerge al final                                       */
  /* ---------------------------------------------------------------------- */
  function footerScene() {
    var word = $('.footer__word'), cache, last = -1;
    return {
      measure: function () { cache = cacheOf(word); },
      update: function (dt, y) {
        if (!cache) return;
        var fp = reduced ? 1 : easeOut(clamp((y + vh - cache.top) / (cache.height + vh * .25), 0, 1));
        if (Math.abs(fp - last) < .001) return;
        last = fp;
        word.style.setProperty('--fp', fp.toFixed(3));
      }
    };
  }

  function startLoop() {
    var last = performance.now();
    (function frame(now) {
      var dt = Math.min(.05, (now - last) / 1000); last = now;
      var y = window.scrollY;
      navUpdate(y);
      for (var i = 0; i < scenes.length; i++) scenes[i].update(dt, y);
      requestAnimationFrame(frame);
    })(last);
  }

  /* ====================================================================== */
  /* Materiales: inclinación y reflejo según el puntero                      */
  /* ====================================================================== */
  function initTilt() {
    if (!finePointer || reduced) return;
    $$('[data-tilt]').forEach(function (card) {
      card.addEventListener('pointermove', function (e) {
        var r = card.getBoundingClientRect();
        var mx = (e.clientX - r.left) / r.width, my = (e.clientY - r.top) / r.height;
        card.classList.add('is-tilting');
        card.style.setProperty('--mx', mx.toFixed(3));
        card.style.setProperty('--my', my.toFixed(3));
        card.style.setProperty('--rx', ((.5 - my) * 9).toFixed(2) + 'deg');
        card.style.setProperty('--ry', ((mx - .5) * 11).toFixed(2) + 'deg');
      });
      card.addEventListener('pointerleave', function () {
        card.classList.remove('is-tilting');
        card.style.setProperty('--rx', '0deg');
        card.style.setProperty('--ry', '0deg');
      });
    });
  }

  /* ====================================================================== */
  /* Colección: imagen flotante que sigue al cursor                          */
  /* ====================================================================== */
  function initFamilies() {
    if (!finePointer || reduced) return;
    var list = $('#families'), float = $('#familiesFloat'), img = $('img', float);
    var x = 0, y = 0, fx = 0, fy = 0, rot = 0, on = false, running = false;
    $$('.family', list).forEach(function (li) {
      $('a', li).setAttribute('data-cursor', 'Reservar');
      li.addEventListener('pointerenter', function () {
        if (img.getAttribute('src') !== li.dataset.img) img.src = li.dataset.img;
        img.style.objectPosition = li.dataset.pos;
        float.classList.add('is-on'); on = true;
        if (!running) { running = true; requestAnimationFrame(loop); }
      });
    });
    list.addEventListener('pointerleave', function () { float.classList.remove('is-on'); on = false; });
    window.addEventListener('pointermove', function (e) {
      x = e.clientX; y = e.clientY;
      if (!on) { fx = x; fy = y; }
    }, { passive: true });
    function loop() {
      var px = fx;
      fx = lerp(fx, x, .14); fy = lerp(fy, y, .14);
      rot = lerp(rot, clamp((fx - px) * .35, -9, 9), .12);
      float.style.transform = 'translate3d(' + (fx + 30) + 'px,' + (fy - 110) + 'px,0) rotate(' + rot.toFixed(2) + 'deg)';
      if (on || Math.abs(fx - x) > .5) requestAnimationFrame(loop); else running = false;
    }
  }

  /* ====================================================================== */
  /* Boutiques: mapa de puntos + listado con estado en tiempo real          */
  /* ====================================================================== */
  var boutiques = (function () {
    var map = SCENE.map;
    var canvas = $('#mapCanvas'), ctx = canvas.getContext('2d');
    var pinsEl = $('#mapPins'), listEl = $('#boutiqueList'), filtersEl = $('#regionFilters');
    var dots = [], W = 0, H = 0, dpr = 1, region = 'all', activeId = null;
    var hl = { x: 0, y: 0, tx: 0, ty: 0, a: 0, ta: 0 }, animating = false;
    var cards = {}, pins = {};

    // Decodifica la máscara RLE del mapa (filas separadas por "|", tramos alternos agua/tierra)
    var cells = [];
    map.rle.split('|').forEach(function (row, r) {
      var c = 0, land = false;
      row.split('.').forEach(function (n) {
        n = parseInt(n, 36);
        if (land) for (var k = 0; k < n; k++) cells.push([c + k, r]);
        c += n; land = !land;
      });
    });

    function project(lat, lng) {
      return { x: (lng + 180) / 360, y: (map.lat0 - lat) / (map.lat0 - map.lat1) };
    }

    function size() {
      var r = canvas.getBoundingClientRect();
      dpr = Math.min(2, window.devicePixelRatio || 1);
      W = r.width; H = r.height;
      canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
      var cw = W / map.cols, ch = H / map.rows;
      dots = cells.map(function (c) { return [(c[0] + .5) * cw, (c[1] + .5) * ch]; });
      if (activeId) { var b = RM.getBoutique(activeId), pr = project(b.lat, b.lng); hl.x = hl.tx = pr.x * W; hl.y = hl.ty = pr.y * H; }
      draw();
    }

    function draw() {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);
      var rad = Math.max(.9, Math.min(W / map.cols, H / map.rows) * .3);
      var R = W * .075, R2 = R * R;
      for (var i = 0; i < dots.length; i++) {
        var d = dots[i], dx = d[0] - hl.x, dy = d[1] - hl.y;
        var g = hl.a * Math.exp(-(dx * dx + dy * dy) / R2);
        ctx.fillStyle = g > .04 ? 'rgba(' + Math.round(236 - g * 10) + ',' + Math.round(232 - g * 150) + ',' + Math.round(225 - g * 140) + ',' + (.16 + g * .7).toFixed(3) + ')' : 'rgba(236,232,225,.16)';
        ctx.beginPath(); ctx.arc(d[0], d[1], rad * (1 + g * .5), 0, 6.2832); ctx.fill();
      }
    }

    function animate() {
      if (animating) return;
      animating = true;
      var last = performance.now();
      (function step(now) {
        var dt = Math.min(.05, (now - last) / 1000); last = now;
        hl.x = damp(hl.x, hl.tx, 6, dt); hl.y = damp(hl.y, hl.ty, 6, dt); hl.a = damp(hl.a, hl.ta, 5, dt);
        draw();
        if (Math.abs(hl.x - hl.tx) + Math.abs(hl.y - hl.ty) + Math.abs(hl.a - hl.ta) > .3 / W) requestAnimationFrame(step);
        else animating = false;
      })(last);
    }

    // Estado de apertura en la zona horaria de cada boutique
    var WD = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
    var DAYS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
    function localNow(tz) {
      var parts = {};
      new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
        .formatToParts(new Date()).forEach(function (p) { parts[p.type] = p.value; });
      return { wd: WD[parts.weekday], h: +parts.hour, m: +parts.minute };
    }
    function status(b) {
      var n = localNow(b.tz), mins = n.h * 60 + n.m, today = b.hours[n.wd];
      var time = pad2(n.h) + ':' + pad2(n.m);
      if (today && mins >= today[0] * 60 && mins < today[1] * 60) return { open: true, text: 'Abierta · cierra a las ' + today[1] + ':00', time: time };
      if (today && mins < today[0] * 60) return { open: false, text: 'Cerrada · abre a las ' + today[0] + ':00', time: time };
      for (var k = 1; k <= 7; k++) {
        var wd = (n.wd + k) % 7;
        if (b.hours[wd]) return { open: false, text: 'Cerrada · abre ' + (k === 1 ? 'mañana' : 'el ' + DAYS[wd]) + ' a las ' + b.hours[wd][0] + ':00', time: time };
      }
      return { open: false, text: 'Cerrada', time: time };
    }
    function refreshStatus() {
      RM.BOUTIQUES.forEach(function (b) {
        var s = status(b), el = $('.bcard__status', cards[b.id]);
        el.classList.toggle('is-open', s.open);
        el.innerHTML = '<i></i>' + s.text + '<small>' + s.time + ' local</small>';
      });
    }

    function select(id, opts) {
      opts = opts || {};
      var b = RM.getBoutique(id);
      if (!b) return;
      activeId = id;
      Object.keys(cards).forEach(function (k) {
        cards[k].classList.toggle('is-active', k === id);
        cards[k].setAttribute('aria-current', k === id ? 'true' : 'false');
        pins[k].classList.toggle('is-active', k === id);
      });
      var pr = project(b.lat, b.lng);
      hl.tx = pr.x * W; hl.ty = pr.y * H; hl.ta = 1;
      if (opts.instant) { hl.x = hl.tx; hl.y = hl.ty; hl.a = 1; draw(); } else animate();
      if (opts.scrollList && listEl.scrollHeight > listEl.clientHeight) {
        var c = cards[id];
        listEl.scrollTo({ top: c.offsetTop - listEl.offsetTop - 8, behavior: reduced ? 'auto' : 'smooth' });
      }
    }

    function filter(reg) {
      region = reg;
      $$('.chip', filtersEl).forEach(function (c) { c.setAttribute('aria-selected', c.dataset.region === reg); });
      var first = null;
      RM.BOUTIQUES.forEach(function (b) {
        var vis = reg === 'all' || b.region === reg;
        cards[b.id].classList.toggle('is-hidden', !vis);
        pins[b.id].classList.toggle('is-dim', !vis);
        if (vis && !first) first = b.id;
      });
      var cur = RM.getBoutique(activeId);
      if (!cur || (reg !== 'all' && cur.region !== reg)) select(first, { scrollList: true });
    }

    function build() {
      // Filtros
      var counts = { all: RM.BOUTIQUES.length };
      RM.BOUTIQUES.forEach(function (b) { counts[b.region] = (counts[b.region] || 0) + 1; });
      [{ id: 'all', label: 'Todas' }].concat(RM.REGIONS).forEach(function (r) {
        var c = document.createElement('button');
        c.type = 'button'; c.className = 'chip'; c.dataset.region = r.id;
        c.setAttribute('role', 'tab'); c.setAttribute('aria-selected', r.id === 'all');
        c.innerHTML = escapeHTML(r.label) + '<sup>' + counts[r.id] + '</sup>';
        c.addEventListener('click', function () { filter(r.id); });
        filtersEl.appendChild(c);
      });

      RM.BOUTIQUES.forEach(function (b) {
        var pr = project(b.lat, b.lng);
        var pin = document.createElement('button');
        pin.type = 'button';
        pin.className = 'pin' + (b.flagship ? ' is-flagship' : '');
        pin.style.left = (pr.x * 100).toFixed(3) + '%';
        pin.style.top = (pr.y * 100).toFixed(3) + '%';
        pin.setAttribute('aria-label', 'Boutique de ' + b.city);
        pin.innerHTML = '<span class="pin__label">' + escapeHTML(b.city) + '</span>';
        pin.addEventListener('click', function () { select(b.id, { scrollList: true }); });
        pinsEl.appendChild(pin);
        pins[b.id] = pin;

        var card = document.createElement('article');
        card.className = 'bcard';
        card.setAttribute('role', 'listitem');
        card.tabIndex = 0;
        card.innerHTML =
          '<div class="bcard__top"><h3>' + escapeHTML(b.city) + (b.flagship ? '<span class="bcard__flag">FLAGSHIP</span>' : '') + '</h3>' +
          '<span class="bcard__country mono">' + escapeHTML(b.country) + '</span></div>' +
          '<p class="bcard__addr">' + escapeHTML(b.address) + '</p>' +
          '<p class="bcard__status"></p>' +
          '<button type="button" class="bcard__cta">Reservar en esta boutique <span aria-hidden="true">→</span></button>';
        card.addEventListener('click', function (e) {
          if (e.target.closest('.bcard__cta')) return;
          select(b.id);
        });
        card.addEventListener('keydown', function (e) {
          if ((e.key === 'Enter' || e.key === ' ') && e.target === card) { e.preventDefault(); select(b.id); }
        });
        $('.bcard__cta', card).addEventListener('click', function () {
          booking.setBoutique(b.id, true);
          $('#cita').scrollIntoView({ behavior: reduced ? 'auto' : 'smooth' });
          toast('Boutique seleccionada: ' + b.city);
        });
        listEl.appendChild(card);
        cards[b.id] = card;
      });

      refreshStatus();
      setInterval(refreshStatus, 30000);

      // Preselección: la boutique de la zona horaria del visitante, o París
      var tz = '';
      try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone; } catch (e) { /* noop */ }
      var near = RM.BOUTIQUES.filter(function (b) { return b.tz === tz; })[0];
      size();
      select(near ? near.id : 'paris', { instant: true });
      onResize(size);
    }

    return { build: build, select: select };
  })();

  /* ====================================================================== */
  /* Reserva de cita                                                         */
  /* ====================================================================== */
  var booking = (function () {
    var form = $('#bookingForm'), stepsEls = $$('.step', form), stepperItems = $$('#stepper li');
    var stepperBar = $('#stepperBar'), prevBtn = $('#prevBtn'), nextBtn = $('#nextBtn');
    var selBoutique = $('#f-boutique'), selInterest = $('#f-interest'), selLang = $('#f-language');
    var reasonWrap = $('#reasonChoices'), calGrid = $('#calGrid'), calMonth = $('#calMonth'), slotsEl = $('#slots');
    var done = $('#done'), stepper = $('#stepper'), panel = $('.booking__panel');
    var STEP_FIELDS = [['boutique', 'reason', 'interest'], ['date', 'time'], ['firstName', 'lastName', 'email', 'phone', 'language', 'message', 'consent']];
    var FIELD_STEP = {};
    STEP_FIELDS.forEach(function (fs, i) { fs.forEach(function (f) { FIELD_STEP[f] = i; }); });

    var state = { step: 0, boutique: '', reason: '', interest: 'any', date: '', time: '', view: null, slotsReq: 0, ref: '' };
    var rangeD = RM.bookingRange();
    var monthFmt = new Intl.DateTimeFormat('es-ES', { month: 'long', year: 'numeric', timeZone: 'UTC' });
    var longFmt = new Intl.DateTimeFormat('es-ES', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
    var shortFmt = new Intl.DateTimeFormat('es-ES', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });

    function labelOf(list, id) { var x = list.filter(function (i) { return i.id === id; })[0]; return x ? x.label : ''; }

    function build() {
      // Boutiques agrupadas por región
      selBoutique.innerHTML = '<option value="">Seleccione una boutique</option>' + RM.REGIONS.map(function (r) {
        return '<optgroup label="' + escapeHTML(r.label) + '">' + RM.BOUTIQUES.filter(function (b) { return b.region === r.id; }).map(function (b) {
          return '<option value="' + b.id + '">' + escapeHTML(b.city + ' — ' + b.address) + '</option>';
        }).join('') + '</optgroup>';
      }).join('');
      selInterest.innerHTML = RM.INTERESTS.map(function (i) { return '<option value="' + i.id + '">' + escapeHTML(i.label) + '</option>'; }).join('');
      selLang.innerHTML = RM.LANGUAGES.map(function (l) { return '<option value="' + l.id + '">' + escapeHTML(l.label) + '</option>'; }).join('');

      reasonWrap.innerHTML = RM.REASONS.map(function (r, i) {
        return '<button type="button" class="choice" role="radio" aria-checked="false" tabindex="' + (i === 0 ? 0 : -1) + '" data-value="' + r.id + '"><b>' + escapeHTML(r.label) + '</b><small>' + escapeHTML(r.hint) + '</small></button>';
      }).join('');
      var choices = $$('.choice', reasonWrap);
      choices.forEach(function (c, i) {
        c.addEventListener('click', function () { setReason(c.dataset.value); });
        c.addEventListener('keydown', function (e) {
          var d = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 }[e.key];
          if (!d) return;
          e.preventDefault();
          var n = choices[(i + d + choices.length) % choices.length];
          n.focus(); setReason(n.dataset.value);
        });
      });

      selBoutique.addEventListener('change', function () { setBoutique(selBoutique.value); clearError('boutique'); });
      selInterest.addEventListener('change', function () { state.interest = selInterest.value; updateSummary('interest'); });
      $$('[data-cal]').forEach(function (b) {
        b.addEventListener('click', function () { shiftMonth(+b.dataset.cal); });
      });
      var msg = $('#f-message'), cnt = $('#msgCount');
      msg.addEventListener('input', function () { cnt.textContent = msg.value.length + '/600'; });
      $$('input, textarea', form).forEach(function (el) {
        el.addEventListener('input', function () { clearError(el.name); });
        el.addEventListener('change', function () { clearError(el.name); });
      });

      form.addEventListener('submit', function (e) { e.preventDefault(); next(); });
      prevBtn.addEventListener('click', function () { go(state.step - 1); });
      $('#againBtn').addEventListener('click', reset);
      $('#icsBtn').addEventListener('click', downloadICS);

      var v = RM.parseISODate(rangeD.min);
      state.view = new Date(Date.UTC(v.getUTCFullYear(), v.getUTCMonth(), 1));
      renderCalendar();
      updateSummary();
    }

    /* ---------- Datos del estado ---------- */
    function setReason(id) {
      state.reason = id;
      $$('.choice', reasonWrap).forEach(function (c) {
        var on = c.dataset.value === id;
        c.setAttribute('aria-checked', on); c.tabIndex = on ? 0 : -1;
      });
      clearError('reason');
      updateSummary('reason');
    }

    function setBoutique(id, fromOutside) {
      state.boutique = id;
      selBoutique.value = id;
      if (state.date && !RM.isOpenOn(RM.getBoutique(id), state.date)) { state.date = ''; state.time = ''; }
      else if (state.date) loadSlots();
      if (!state.date) renderSlotsEmpty();
      renderCalendar();
      var b = RM.getBoutique(id);
      $('#slotsTz').textContent = b ? '· hora local de ' + b.city : '';
      updateSummary('boutique');
      if (fromOutside && state.step > 2) go(0);
      if (fromOutside && id) boutiques.select(id, { scrollList: true });
    }

    function presetInterest(id) {
      if (!RM.INTERESTS.some(function (i) { return i.id === id; })) return;
      state.interest = id; selInterest.value = id;
      if (!state.reason) setReason(id === 'any' ? 'discover' : 'model');
      updateSummary('interest');
    }

    function collect() {
      var fd = new FormData(form);
      return {
        boutique: state.boutique, reason: state.reason, interest: state.interest, date: state.date, time: state.time,
        firstName: fd.get('firstName') || '', lastName: fd.get('lastName') || '', email: fd.get('email') || '',
        phone: fd.get('phone') || '', language: fd.get('language') || 'es', message: fd.get('message') || '',
        consent: $('#f-consent').checked
      };
    }

    /* ---------- Resumen lateral ---------- */
    var sum = {};
    $$('[data-sum]').forEach(function (d) { sum[d.dataset.sum] = d; });
    function updateSummary(changed) {
      var b = RM.getBoutique(state.boutique);
      var vals = {
        boutique: b ? b.city : '—',
        reason: labelOf(RM.REASONS, state.reason) || '—',
        interest: labelOf(RM.INTERESTS, state.interest) || '—',
        date: state.date ? cap(shortFmt.format(RM.parseISODate(state.date))) : '—',
        time: state.time ? state.time + (b ? ' · ' + b.city : '') : '—'
      };
      Object.keys(vals).forEach(function (k) {
        if (sum[k].textContent === vals[k]) return;
        sum[k].textContent = vals[k];
        if (changed) { sum[k].classList.remove('is-flash'); void sum[k].offsetWidth; sum[k].classList.add('is-flash'); }
      });
      updateWatch();
    }

    /* ---------- Reloj del resumen: el de la colección elegida ---------- */
    var watchImg = $('#summaryWatch'), defaultWatch = watchImg.getAttribute('src'), swapT;
    function watchFor(interest) {
      // La imagen se toma de la propia fila de la Colección, así nunca se desincronizan
      var link = $('.family [data-preset-interest="' + interest + '"]');
      if (link && interest !== 'any') return link.closest('.family').getAttribute('data-img');
      if (interest === 'rm002') return $('.piece__frame img').getAttribute('src');
      return defaultWatch;
    }
    function updateWatch() {
      var src = watchFor(state.interest);
      if (watchImg.getAttribute('src') === src) return;
      clearTimeout(swapT);
      watchImg.classList.add('is-swapping');
      swapT = setTimeout(function () {
        watchImg.onload = function () { watchImg.classList.remove('is-swapping'); };
        watchImg.loading = 'eager';
        watchImg.src = src;
        watchImg.classList.toggle('is-product', src !== defaultWatch);
        if (watchImg.complete) watchImg.classList.remove('is-swapping');
      }, reduced ? 0 : 260);
    }
    function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

    /* ---------- Calendario ---------- */
    function shiftMonth(d) {
      var v = state.view;
      state.view = new Date(Date.UTC(v.getUTCFullYear(), v.getUTCMonth() + d, 1));
      renderCalendar(true);
    }

    function renderCalendar(anim) {
      var v = state.view, b = RM.getBoutique(state.boutique);
      var y = v.getUTCFullYear(), m = v.getUTCMonth();
      calMonth.textContent = cap(monthFmt.format(v));
      var minD = RM.parseISODate(rangeD.min), maxD = RM.parseISODate(rangeD.max);
      $('[data-cal="-1"]').disabled = y * 12 + m <= minD.getUTCFullYear() * 12 + minD.getUTCMonth();
      $('[data-cal="1"]').disabled = y * 12 + m >= maxD.getUTCFullYear() * 12 + maxD.getUTCMonth();
      var first = new Date(Date.UTC(y, m, 1)), offset = (first.getUTCDay() + 6) % 7;
      var days = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
      var today = RM.toISODate(new Date());
      var html = '';
      for (var i = 0; i < offset; i++) html += '<span></span>';
      for (var d = 1; d <= days; d++) {
        var iso = RM.toISODate(new Date(Date.UTC(y, m, d)));
        var inRange = iso >= rangeD.min && iso <= rangeD.max;
        var open = b ? RM.isOpenOn(b, iso) : true;
        var ok = inRange && open && !!b;
        var cls = 'day' + (iso === state.date ? ' is-selected' : '') + (iso === today ? ' is-today' : '') + (inRange && !open ? ' is-closed' : '');
        var label = cap(longFmt.format(RM.parseISODate(iso))) + (inRange && !open ? ', cerrado' : '');
        html += '<button type="button" role="gridcell" class="' + cls + '" style="--n:' + (d + offset) + '" data-date="' + iso + '"' +
          (ok ? '' : ' disabled') + ' aria-label="' + label + '"' + (iso === state.date ? ' aria-selected="true"' : '') + '>' + d + '</button>';
      }
      calGrid.innerHTML = html;
      calGrid.classList.toggle('is-anim', !!anim && !reduced);
      $$('.day:not([disabled])', calGrid).forEach(function (btn) {
        btn.addEventListener('click', function () { pickDate(btn.dataset.date); });
      });
    }

    function pickDate(iso) {
      state.date = iso; state.time = '';
      $$('.day', calGrid).forEach(function (d) {
        var on = d.dataset.date === iso;
        d.classList.toggle('is-selected', on);
        if (on) d.setAttribute('aria-selected', 'true'); else d.removeAttribute('aria-selected');
      });
      clearError('date'); clearError('time');
      updateSummary('date');
      loadSlots();
    }

    /* ---------- Horas ---------- */
    function renderSlotsEmpty(msg) {
      slotsEl.innerHTML = '<p class="slots__empty">' + (msg || 'Seleccione primero un día.') + '</p>';
    }

    function fetchAvailability(boutique, date) {
      if (api.enabled) {
        return fetch('api/availability?boutique=' + encodeURIComponent(boutique) + '&date=' + encodeURIComponent(date), { cache: 'no-store' })
          .then(function (r) { return r.json(); })
          .catch(function () { return RM.getAvailability(boutique, date); });
      }
      // Sin servidor: mismo algoritmo en local, con una latencia simulada
      return new Promise(function (res) { setTimeout(function () { res(RM.getAvailability(boutique, date)); }, 380); });
    }

    function loadSlots() {
      var req = ++state.slotsReq;
      slotsEl.innerHTML = new Array(8).join('<span class="slots__skeleton"></span>');
      fetchAvailability(state.boutique, state.date).then(function (av) {
        if (req !== state.slotsReq) return; // respuesta obsoleta
        if (!av || av.error) { renderSlotsEmpty(av && av.error); return; }
        if (av.closed || !av.slots.length) { renderSlotsEmpty('La boutique está cerrada ese día.'); return; }
        slotsEl.innerHTML = av.slots.map(function (s, i) {
          return '<button type="button" role="radio" class="slot" style="--n:' + i + '" data-time="' + s.time + '" aria-checked="' + (s.time === state.time) + '"' +
            (s.available ? '' : ' disabled aria-label="' + s.time + ', no disponible"') + '>' + s.time + '</button>';
        }).join('');
        $$('.slot:not([disabled])', slotsEl).forEach(function (btn) {
          btn.addEventListener('click', function () {
            state.time = btn.dataset.time;
            $$('.slot', slotsEl).forEach(function (s) { s.setAttribute('aria-checked', s === btn); });
            clearError('time');
            updateSummary('time');
          });
        });
      });
    }

    /* ---------- Errores ---------- */
    function showErrors(errors, fields) {
      var firstEl = null;
      fields.forEach(function (f) {
        var msg = errors[f] || '';
        var holder = $('[data-error="' + f + '"]', form);
        if (holder) holder.textContent = msg;
        var input = form.elements[f];
        if (input && input.nodeType === 1) {
          input.setAttribute('aria-invalid', msg ? 'true' : 'false');
          var field = input.closest('.field'); if (field) field.classList.toggle('has-error', !!msg);
          if (msg && !firstEl) firstEl = input;
        } else if (msg && !firstEl) {
          firstEl = f === 'reason' ? $('.choice', reasonWrap) : f === 'date' ? $('.day:not([disabled])', calGrid) : f === 'time' ? $('.slot:not([disabled])', slotsEl) : null;
        }
      });
      if (firstEl) firstEl.focus({ preventScroll: false });
    }
    function clearError(f) {
      var holder = $('[data-error="' + f + '"]', form);
      if (holder) holder.textContent = '';
      var input = form.elements[f];
      if (input && input.nodeType === 1) {
        input.removeAttribute('aria-invalid');
        var field = input.closest('.field'); if (field) field.classList.remove('has-error');
      }
    }

    /* ---------- Navegación entre pasos ---------- */
    function go(n, back) {
      n = clamp(n, 0, 3);
      var isBack = back !== undefined ? back : n < state.step;
      state.step = n;
      stepsEls.forEach(function (s, i) {
        s.classList.toggle('is-active', i === n);
        s.classList.toggle('is-back', i === n && isBack);
      });
      stepperItems.forEach(function (li, i) {
        li.classList.toggle('is-current', i === n);
        li.classList.toggle('is-done', i < n);
        if (i === n) li.setAttribute('aria-current', 'step'); else li.removeAttribute('aria-current');
      });
      stepperBar.style.transform = 'scaleX(' + (n + 1) / 4 + ')';
      prevBtn.hidden = n === 0;
      $('span', nextBtn).textContent = n === 3 ? 'Confirmar cita' : 'Continuar';
      if (n === 1) renderCalendar(true);
      if (n === 3) renderReview();
      var r = panel.getBoundingClientRect();
      if (r.top < 0 || r.top > vh * .6) panel.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
      var focusable = $('.step.is-active input, .step.is-active select, .step.is-active .choice[tabindex="0"], .step.is-active .day:not([disabled])', form);
      if (focusable && n !== 3) setTimeout(function () { focusable.focus({ preventScroll: true }); }, 60);
    }

    function next() {
      var res = RM.validateAppointment(collect());
      if (state.step < 3) {
        var fields = STEP_FIELDS[state.step];
        var stepErrors = fields.filter(function (f) { return res.errors[f]; });
        if (stepErrors.length) { showErrors(res.errors, fields); return; }
        go(state.step + 1);
        return;
      }
      if (!res.ok) { jumpToErrors(res.errors); return; }
      submit(res.value);
    }

    function jumpToErrors(errors) {
      var first = Math.min.apply(null, Object.keys(errors).map(function (f) { return FIELD_STEP[f] !== undefined ? FIELD_STEP[f] : 2; }));
      go(first);
      setTimeout(function () { showErrors(errors, STEP_FIELDS[first]); }, 80);
      if (errors.time) loadSlots();
    }

    function renderReview() {
      var v = collect(), b = RM.getBoutique(v.boutique);
      var rows = [
        ['Boutique', b ? b.city + ' — ' + b.address : '', 0],
        ['Motivo', labelOf(RM.REASONS, v.reason), 0],
        ['Colección', labelOf(RM.INTERESTS, v.interest), 0],
        ['Fecha y hora', v.date ? cap(longFmt.format(RM.parseISODate(v.date))) + ' · ' + v.time + ' h' : '', 1],
        ['Nombre', v.firstName + ' ' + v.lastName, 2],
        ['Correo', v.email, 2],
        ['Teléfono', v.phone || '—', 2],
        ['Idioma', labelOf(RM.LANGUAGES, v.language), 2]
      ];
      if (v.message) rows.push(['Mensaje', v.message, 2]);
      $('#review').innerHTML = rows.map(function (r) {
        return '<div><dt>' + r[0] + '</dt><dd>' + escapeHTML(r[1]) + '</dd><button type="button" data-goto="' + r[2] + '">Editar</button></div>';
      }).join('');
      $$('#review [data-goto]').forEach(function (b) { b.addEventListener('click', function () { go(+b.dataset.goto); }); });
    }

    /* ---------- Envío simulado ---------- */
    function submit(value) {
      nextBtn.classList.add('is-loading'); nextBtn.disabled = true; prevBtn.disabled = true;
      var p;
      if (api.enabled) {
        p = fetch('api/appointments', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(value)
        }).then(function (r) {
          return r.json().then(function (j) { return { status: r.status, body: j }; });
        });
      } else {
        // Sin backend: validación y referencia generadas en el navegador. No se envía nada.
        p = new Promise(function (res) {
          setTimeout(function () {
            var check = RM.validateAppointment(value);
            res(check.ok ? { status: 201, body: { reference: RM.makeReference(value.boutique, value.date) } } : { status: 422, body: { errors: check.errors } });
          }, 1100);
        });
      }
      p.then(function (r) {
        if (r.status === 201 && r.body.reference) { success(value, r.body.reference); return; }
        if (r.body && r.body.errors) { jumpToErrors(r.body.errors); toast('Revise los datos marcados.'); return; }
        toast('No se ha podido completar la solicitud. Inténtelo de nuevo.');
      }).catch(function () {
        toast('Sin conexión con el servidor. Inténtelo de nuevo.');
      }).then(function () {
        nextBtn.classList.remove('is-loading'); nextBtn.disabled = false; prevBtn.disabled = false;
      });
    }

    var lastBooking = null;
    function success(v, ref) {
      var b = RM.getBoutique(v.boutique);
      lastBooking = { v: v, ref: ref, b: b };
      $('#doneRef').textContent = ref;
      $('#doneText').textContent = v.firstName + ', su visita a la boutique de ' + b.city + ' el ' + longFmt.format(RM.parseISODate(v.date)) +
        ' a las ' + v.time + ' h ha quedado registrada. En un entorno real recibiría la confirmación en ' + v.email + '. En esta demostración no se ha enviado ningún dato.';
      form.hidden = true; stepper.hidden = true; done.hidden = false;
      done.focus({ preventScroll: true });
      var r = panel.getBoundingClientRect();
      if (r.top < 0) panel.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth' });
    }

    function reset() {
      form.reset();
      $('#msgCount').textContent = '0/600';
      state.reason = ''; state.date = ''; state.time = ''; state.interest = 'any';
      setReason('');
      selInterest.value = 'any';
      renderSlotsEmpty();
      renderCalendar();
      updateSummary();
      form.hidden = false; stepper.hidden = false; done.hidden = true;
      go(0, false);
    }

    function downloadICS() {
      if (!lastBooking) return;
      var v = lastBooking.v, b = lastBooking.b;
      var start = v.date.replace(/-/g, '') + 'T' + v.time.replace(':', '') + '00';
      var endH = pad2(+v.time.slice(0, 2) + RM.SLOT_MINUTES / 60);
      var end = v.date.replace(/-/g, '') + 'T' + endH + v.time.slice(3) + '00';
      var stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
      var ics = [
        'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//RM Concept//Cita//ES', 'CALSCALE:GREGORIAN', 'BEGIN:VEVENT',
        'UID:' + lastBooking.ref + '@rm-concept', 'DTSTAMP:' + stamp,
        'DTSTART;TZID=' + b.tz + ':' + start, 'DTEND;TZID=' + b.tz + ':' + end,
        'SUMMARY:Cita privada · Richard Mille ' + b.city,
        'LOCATION:' + (b.address + ', ' + b.city + ', ' + b.country).replace(/,/g, '\\,'),
        'DESCRIPTION:Referencia ' + lastBooking.ref + ' (demostración)',
        'END:VEVENT', 'END:VCALENDAR'
      ].join('\r\n');
      var url = URL.createObjectURL(new Blob([ics], { type: 'text/calendar;charset=utf-8' }));
      var a = document.createElement('a');
      a.href = url; a.download = 'cita-richard-mille-' + b.id + '.ics';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    }

    return { build: build, setBoutique: setBoutique, presetInterest: presetInterest };
  })();

  /* ====================================================================== */
  /* Reloj del footer (hora de la manufactura)                               */
  /* ====================================================================== */
  function initClock() {
    var el = $('#clock');
    var fmt = new Intl.DateTimeFormat('es-ES', { timeZone: 'Europe/Zurich', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' });
    var tick = function () { el.textContent = fmt.format(new Date()); };
    tick(); setInterval(tick, 1000);
  }

  /* ====================================================================== */
  /* Arranque                                                                */
  /* ====================================================================== */
  function init() {
    reveals();
    initNav();
    initCursor();
    initMagnetic();
    initTilt();
    initFamilies();
    boutiques.build();
    booking.build();
    initClock();

    scenes.push(explodeScene(), manifestoScene(), historyScene(), engineScene(), refsScene(), footerScene());
    measureAll();
    onResize(measureAll);
    if (window.ResizeObserver) {
      var rt;
      new ResizeObserver(function () { clearTimeout(rt); rt = setTimeout(measureAll, 150); }).observe(document.body);
    }
    window.addEventListener('load', measureAll);
    startLoop();
    preload();
    api.ready.then(function (on) {
      if (window.console) console.info('[RM] ' + (on ? 'API conectada: disponibilidad y validación desde el servidor.' : 'Modo estático: lógica de reservas en el navegador.'));
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();

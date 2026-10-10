/* Angolatiens — JavaScript sin dependencias. Mejora progresiva: todo el contenido
   está en el HTML; este archivo añade buscador, comparador, calculadoras y copiar. */
(function () {
  'use strict';

  var $ = function (s, c) { return (c || document).querySelector(s); };
  var $$ = function (s, c) { return Array.prototype.slice.call((c || document).querySelectorAll(s)); };
  var esc = function (s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };
  var norm = function (s) {
    return String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  };
  var store = {
    get: function (k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } },
    set: function (k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* sin almacenamiento */ } }
  };

  // Modo archivo único (angolatiens.html): rutas en el hash (#/guias/...).
  var SINGLE = !!window.ANG_SINGLE;
  var currentPath = function () {
    return SINGLE ? (location.hash.slice(1).split(/[?#]/)[0] || '/') : location.pathname;
  };
  var currentParams = function () {
    if (!SINGLE) return new URLSearchParams(location.search);
    var h = location.hash.slice(1).split('#')[0];
    var i = h.indexOf('?');
    return new URLSearchParams(i > -1 ? h.slice(i + 1) : '');
  };
  var setUrl = function (qs, frag) {
    history.replaceState(null, '', (SINGLE ? '#' : '') + currentPath() + (qs ? '?' + qs : '') + (frag && !SINGLE ? frag : ''));
  };

  /* ---------- Copiar prompts ---------- */
  function initCopy() {
  $$('pre.prompt[data-copy]').forEach(function (pre) {
    var wrap = document.createElement('div');
    wrap.className = 'prompt-wrap';
    pre.parentNode.insertBefore(wrap, pre);
    wrap.appendChild(pre);
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'copy-btn';
    b.textContent = 'Copiar';
    b.addEventListener('click', function () {
      var done = function (ok) {
        b.textContent = ok ? 'Copiado' : 'Selecciona y copia';
        setTimeout(function () { b.textContent = 'Copiar'; }, 2000);
      };
      var fallback = function () {
        var range = document.createRange();
        range.selectNodeContents(pre);
        var sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
        var copied = false;
        try { copied = document.execCommand('copy'); } catch (e) { copied = false; }
        if (copied) sel.removeAllRanges();
        done(copied);
      };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(pre.textContent).then(function () { done(true); }, fallback);
      } else { fallback(); }
    });
    wrap.appendChild(b);
  });
  }

  /* ---------- Datos de herramientas ---------- */
  var toolsPromise = null;
  function loadTools() {
    if (!toolsPromise && window.ANG_TOOLS) toolsPromise = Promise.resolve(window.ANG_TOOLS);
    if (!toolsPromise) {
      toolsPromise = fetch('/assets/tools.json').then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      });
    }
    return toolsPromise;
  }

  /* ---------- Selección para comparar ---------- */
  var SEL_KEY = 'ang-compare';
  var selection = store.get(SEL_KEY) || [];
  var MAX = 3;
  function syncCompareUI() {
    $$('[data-compare]').forEach(function (btn) {
      var on = selection.indexOf(btn.getAttribute('data-compare')) > -1;
      btn.setAttribute('aria-pressed', on ? 'true' : 'false');
      btn.textContent = on ? '✓ En comparación' : '+ Comparar';
    });
    var bar = $('#compare-bar');
    if (!bar) return;
    bar.hidden = selection.length === 0;
    $('#compare-count', bar).textContent = selection.length + ' de ' + MAX + ' seleccionadas';
    $('#compare-go', bar).href = '/comparar/?h=' + selection.join(',');
  }
  document.addEventListener('click', function (e) {
    var btn = e.target.closest && e.target.closest('[data-compare]');
    if (btn) {
      var id = btn.getAttribute('data-compare');
      var i = selection.indexOf(id);
      if (i > -1) selection.splice(i, 1);
      else {
        if (selection.length >= MAX) selection.shift();
        selection.push(id);
      }
      store.set(SEL_KEY, selection);
      syncCompareUI();
    }
    if (e.target.id === 'compare-clear') {
      selection = [];
      store.set(SEL_KEY, selection);
      syncCompareUI();
    }
  });
  syncCompareUI();

  /* ---------- Buscador por necesidades ---------- */
  // Reglas: palabras (sin tildes, por raíz) → etiquetas de tarea del catálogo.
  var RULES = [
    [['whatsapp', 'wasap'], ['whatsapp']],
    [['respond', 'contest', 'mensaj', 'consulta', 'atend', 'atencion', 'pregunt', 'dudas'], ['atencion', 'preguntas']],
    [['chatbot', 'bot', 'chat'], ['chatbot']],
    [['presupuest', 'cotiza', 'propuesta', 'oferta'], ['presupuestos', 'propuestas']],
    [['factur', 'cobr'], ['facturas']],
    [['verifactu'], ['verifactu']],
    [['contab', 'gastos', 'impuest', 'iva'], ['contabilidad', 'gestion']],
    [['automat', 'repetit', 'conectar', 'integrar', 'flujo', 'ahorrar tiempo', 'automatic'], ['automatizar']],
    [['formulario'], ['formularios']],
    [['excel', 'hoja de calculo', 'hojas', 'tabla', 'sheets'], ['excel']],
    [['instagram', 'insta'], ['instagram', 'redes']],
    [['redes', 'publicac', 'post', 'facebook', 'tiktok', 'contenido', 'social'], ['redes', 'contenido']],
    [['disen', 'cartel', 'logo', 'flyer', 'imagen', 'imagenes', 'foto'], ['diseno', 'imagenes', 'carteles']],
    [['presentac', 'diapositiva'], ['presentaciones']],
    [['reunion', 'acta', 'llamada', 'zoom', 'meet', 'teams'], ['reuniones', 'actas']],
    [['transcrib', 'audio a texto', 'dictar'], ['transcribir']],
    [['email', 'correo', 'mail'], ['emails']],
    [['newsletter', 'boletin', 'campana', 'mailing'], ['newsletter']],
    [['web', 'pagina', 'dominio', 'online'], ['web', 'presencia']],
    [['tienda'], ['tienda', 'ventas']],
    [['voz', 'locuc', 'podcast'], ['voz', 'locucion']],
    [['video'], ['video']],
    [['organiz', 'ordenar', 'notas', 'tareas', 'proyecto', 'procedim'], ['organizar', 'proyectos', 'notas']],
    [['cita', 'reserva', 'agenda'], ['reservas', 'citas']],
    [['client', 'captar', 'vender', 'ventas', 'venta', 'leads', 'nuevos clientes'], ['captar', 'ventas']],
    [['crm', 'seguimiento'], ['crm']],
    [['redact', 'escrib', 'texto', 'carta'], ['redactar']],
    [['resum', 'leer', 'documento', 'contrato', 'pdf'], ['resumir', 'documentos']],
    [['tradu', 'idioma', 'ingles'], ['traducir']],
    [['idea'], ['ideas']],
    [['recordator', 'aviso', 'notific'], ['recordatorios', 'avisos']],
    [['agente'], ['agentes']]
  ];
  var TAG_LABEL = {
    whatsapp: 'WhatsApp', atencion: 'atender clientes', preguntas: 'preguntas frecuentes', chatbot: 'chatbot',
    presupuestos: 'presupuestos', propuestas: 'propuestas', facturas: 'facturación', verifactu: 'Verifactu',
    contabilidad: 'contabilidad', gestion: 'gestión', automatizar: 'automatizar', formularios: 'formularios',
    excel: 'hojas de cálculo', instagram: 'Instagram', redes: 'redes sociales', contenido: 'contenido',
    diseno: 'diseño', imagenes: 'imágenes', carteles: 'carteles', presentaciones: 'presentaciones',
    reuniones: 'reuniones', actas: 'actas', transcribir: 'transcribir', emails: 'emails', newsletter: 'boletines',
    web: 'página web', presencia: 'presencia online', tienda: 'tienda online', ventas: 'ventas', voz: 'voz',
    locucion: 'locuciones', video: 'vídeo', organizar: 'organización', proyectos: 'proyectos', notas: 'notas',
    reservas: 'reservas', citas: 'citas', captar: 'captar clientes', crm: 'seguimiento de clientes',
    redactar: 'redactar', resumir: 'resumir', documentos: 'documentos', traducir: 'traducir', ideas: 'ideas',
    recordatorios: 'recordatorios', avisos: 'avisos', agentes: 'agentes de IA'
  };

  function interpret(query) {
    var q = ' ' + norm(query) + ' ';
    var tags = {};
    RULES.forEach(function (r) {
      if (r[0].some(function (w) { return q.indexOf(w) > -1; })) r[1].forEach(function (t) { tags[t] = 1; });
    });
    return {
      tags: Object.keys(tags),
      wantsFree: /gratis|gratuit|sin pagar|0 ?euros|barat/.test(q),
      nonTech: /no se|sin conocimientos|facil|sencill|no tecnic|principiante|novato/.test(q),
      words: q.split(/[^a-z0-9ñ]+/).filter(function (w) { return w.length > 3; })
    };
  }

  function rank(tools, intent, f) {
    return tools.map(function (t) {
      var matched = intent.tags.filter(function (tag) { return t.tasks.indexOf(tag) > -1; });
      var score = matched.length * 3;
      var hay = norm(t.name + ' ' + t.summary + ' ' + t.bestFor);
      intent.words.forEach(function (w) {
        if (norm(t.name).indexOf(w) > -1) score += 6;
        else if (hay.indexOf(w) > -1) score += 1;
      });
      if (intent.nonTech && !t.technical) score += 1;
      if (intent.nonTech && t.technical) score -= 4;
      score += t.ease * 0.1;
      return { t: t, score: score, matched: matched };
    }).filter(function (r) {
      if (f.free && r.t.free.has !== true) return false;
      if (f.spanish && r.t.spanish !== 'si') return false;
      if (f.nontech && r.t.technical) return false;
      if (f.cat && r.t.cat !== f.cat) return false;
      if (f.hasQuery) return r.score >= 1;
      return true;
    }).sort(function (a, b) { return b.score - a.score; });
  }

  function priceText(t) {
    if (t.price.level === 'sin-verificar') return 'Precio: consulta la web oficial';
    return t.price.text + (t.price.level === 'terceros' ? ' (fuentes secundarias)' : ' (web oficial)');
  }
  function freeTag(t) {
    if (t.free.has === true) return '<span class="tag tag--ok">Plan gratuito</span>';
    if (t.free.has === 'trial') return '<span class="tag">Prueba gratuita</span>';
    return '<span class="tag">Sin plan gratuito</span>';
  }
  var ES = { si: 'En español', parcial: 'Español parcial', no: 'En inglés' };
  function toolItemHTML(r) {
    var t = r.t;
    var reason = r.matched && r.matched.length
      ? '<p class="match-reason">Encaja con: ' + r.matched.map(function (m) { return esc(TAG_LABEL[m] || m); }).join(', ') + '</p>'
      : '';
    return '<article class="tool-item">' +
      '<div><a class="kicker" href="/herramientas/?cat=' + esc(t.cat) + '">' + esc(t.catLabel) + '</a>' +
      '<h3><a href="/herramientas/' + esc(t.slug) + '/">' + esc(t.name) + '</a></h3></div>' +
      '<button type="button" class="chip compare-toggle" data-compare="' + esc(t.slug) + '" aria-pressed="false">+ Comparar</button>' +
      '<p>' + esc(t.summary) + '</p>' +
      '<div class="tags">' + freeTag(t) + '<span class="tag">' + ES[t.spanish] + '</span>' +
      (t.technical ? '<span class="tag tag--brand">Requiere perfil técnico</span>' : '') +
      '<span class="tag">' + esc(priceText(t)) + '</span></div>' + reason +
      '</article>';
  }

  function initFinder() {
  var finder = $('#finder');
  if (finder) {
    var out = $('#finder-results');
    var input = $('#finder-q', finder);
    var params = currentParams();
    if (params.get('q')) input.value = params.get('q');
    if (params.get('cat') && $('#f-cat', finder)) $('#f-cat', finder).value = params.get('cat');
    if (params.get('gratis') && $('#f-free', finder)) $('#f-free', finder).checked = true;

    var run = function (pushState) {
      var f = {
        free: $('#f-free', finder) ? $('#f-free', finder).checked : false,
        spanish: $('#f-es', finder) ? $('#f-es', finder).checked : false,
        nontech: $('#f-nontech', finder) ? $('#f-nontech', finder).checked : false,
        cat: $('#f-cat', finder) ? $('#f-cat', finder).value : ''
      };
      var q = input.value.trim();
      var active = q || f.free || f.spanish || f.nontech || f.cat;
      if (!active && finder.hasAttribute('data-keep-default')) {
        out.innerHTML = '';
        if ($('#default-list')) $('#default-list').hidden = false;
        if (pushState) setUrl('');
        return;
      }
      if (!active) { out.innerHTML = ''; return; }
      out.setAttribute('aria-busy', 'true');
      out.innerHTML = '<div class="state" role="status"><strong>Buscando…</strong>Cargando el catálogo de herramientas.</div>';
      loadTools().then(function (tools) {
        var intent = interpret(q);
        if (intent.wantsFree) f.free = true;
        f.hasQuery = !!q;
        var res = rank(tools, intent, f);
        if (pushState) {
          var p = new URLSearchParams();
          if (q) p.set('q', q);
          if (f.cat) p.set('cat', f.cat);
          setUrl(p.toString(), '#resultados');
        }
        if (!res.length) {
          out.innerHTML = '<div class="state" role="status"><strong>No hemos encontrado herramientas para esa búsqueda</strong>' +
            'Prueba a describir la tarea con otras palabras (por ejemplo «responder WhatsApp», «hacer presupuestos» o «automatizar facturas») o quita algún filtro.</div>';
        } else {
          var note = intent.wantsFree ? ' · Mostrando solo herramientas con plan gratuito' : '';
          out.innerHTML = '<div class="result-head"><h2 class="h3" id="resultados" tabindex="-1">' + res.length +
            (res.length === 1 ? ' herramienta recomendada' : ' herramientas recomendadas') + '</h2><span class="meta">Ordenadas por encaje con tu necesidad' + note + '</span></div>' +
            '<div class="tool-list">' + res.slice(0, 12).map(toolItemHTML).join('') + '</div>' +
            '<p class="hint">El buscador funciona con reglas sobre nuestro catálogo revisado, no con un modelo de IA. Comprueba siempre precio y condiciones en la web oficial.</p>';
        }
        out.setAttribute('aria-busy', 'false');
        syncCompareUI();
        var dflt = $('#default-list');
        if (dflt) dflt.hidden = true;
      }).catch(function () {
        out.setAttribute('aria-busy', 'false');
        out.innerHTML = '<div class="state" role="alert"><strong>No se ha podido cargar el catálogo</strong>Revisa tu conexión y vuelve a intentarlo. También puedes navegar por <a href="/herramientas/">todas las herramientas</a>.</div>';
      });
    };
    finder.addEventListener('submit', function (e) {
      if (finder.getAttribute('data-target')) { // formulario de portada: navega a /herramientas/
        if (SINGLE) { e.preventDefault(); goSearch(); }
        return;
      }
      e.preventDefault();
      run(true);
    });
    $$('[data-suggest]', finder).forEach(function (c) {
      c.addEventListener('click', function () {
        input.value = c.getAttribute('data-suggest');
        if (finder.getAttribute('data-target')) goSearch(); else run(true);
      });
    });
    $$('input[type=checkbox], select', finder).forEach(function (el) {
      el.addEventListener('change', function () { run(true); });
    });
    var goSearch = function () {
      var q = encodeURIComponent(input.value.trim());
      if (SINGLE) location.hash = '/herramientas/' + (q ? '?q=' + q : '');
      else location.href = '/herramientas/' + (q ? '?q=' + q : '');
    };
    if (!finder.getAttribute('data-target') && (params.get('q') || params.get('cat') || params.get('gratis'))) run(false);
  }
  }

  /* ---------- Comparador ---------- */
  function initComparator() {
  var cmp = $('#comparator');
  if (cmp) {
    var selects = $$('select', cmp);
    var tableBox = $('#compare-table');
    var initial = (currentParams().get('h') || '').split(',').filter(Boolean).slice(0, 3);
    loadTools().then(function (tools) {
      var by = {};
      tools.forEach(function (t) { by[t.slug] = t; });
      selects.forEach(function (s, i) {
        s.innerHTML = '<option value="">— Elige herramienta —</option>' + tools.map(function (t) {
          return '<option value="' + esc(t.slug) + '">' + esc(t.name) + ' · ' + esc(t.catShort) + '</option>';
        }).join('');
        if (initial[i] && by[initial[i]]) s.value = initial[i];
        s.addEventListener('change', render);
      });
      function row(label, fn, chosen) {
        return '<tr><th scope="row">' + label + '</th>' + chosen.map(function (t) { return '<td>' + fn(t) + '</td>'; }).join('') + '</tr>';
      }
      function render() {
        var chosen = selects.map(function (s) { return by[s.value]; }).filter(Boolean);
        var ids = chosen.map(function (t) { return t.slug; });
        setUrl(ids.length ? 'h=' + ids.join(',') : '');
        selection = ids.slice();
        store.set(SEL_KEY, selection);
        if (chosen.length < 2) {
          tableBox.innerHTML = '<div class="state" role="status"><strong>Elige al menos dos herramientas</strong>Puedes empezar por una comparativa habitual: ' +
            '<a href="/comparar/?h=make,zapier,n8n">Make, Zapier y n8n</a> · <a href="/comparar/?h=chatgpt,claude,gemini">ChatGPT, Claude y Gemini</a> · <a href="/comparar/?h=tidio,manychat,whatsapp-business">Tidio, ManyChat y WhatsApp Business</a>.</div>';
          return;
        }
        var stars = function (n) { return '<span aria-label="' + n + ' de 5">' + '●●●●●'.slice(0, n) + '<span style="color:#ccc">' + '●●●●●'.slice(n) + '</span></span>'; };
        tableBox.innerHTML = '<div class="table-scroll"><table class="table"><caption class="sr-only">Comparativa de herramientas</caption><thead><tr><th scope="col">Criterio</th>' +
          chosen.map(function (t) { return '<th scope="col"><a href="/herramientas/' + t.slug + '/">' + esc(t.name) + '</a></th>'; }).join('') + '</tr></thead><tbody>' +
          row('Categoría', function (t) { return esc(t.catLabel); }, chosen) +
          row('Para qué sirve', function (t) { return esc(t.summary); }, chosen) +
          row('Ideal para', function (t) { return esc(t.bestFor); }, chosen) +
          row('Plan gratuito', function (t) { return (t.free.has === true ? 'Sí' : t.free.has === 'trial' ? 'Prueba gratuita' : 'No') + '<br><small>' + esc(t.free.note) + '</small>'; }, chosen) +
          row('Precio', function (t) { return esc(priceText(t)) + (t.price.source ? '<br><small>Fuente: ' + esc(t.price.source) + '</small>' : ''); }, chosen) +
          row('Idioma', function (t) { return ES[t.spanish]; }, chosen) +
          row('Facilidad de uso', function (t) { return stars(t.ease) + '<br><small>Valoración editorial preliminar</small>'; }, chosen) +
          row('Perfil técnico', function (t) { return t.technical ? 'Recomendable' : 'No necesario'; }, chosen) +
          row('Ventajas', function (t) { return '<ul>' + t.pros.map(function (p) { return '<li>' + esc(p) + '</li>'; }).join('') + '</ul>'; }, chosen) +
          row('Limitaciones', function (t) { return '<ul>' + t.cons.map(function (p) { return '<li>' + esc(p) + '</li>'; }).join('') + '</ul>'; }, chosen) +
          row('Web oficial', function (t) {
            var href = t.affiliateUrl || t.url;
            return '<a href="' + esc(href) + '" rel="' + (t.affiliateUrl ? 'sponsored noopener' : 'noopener') + '" target="_blank">Visitar ' + esc(t.name) + '</a>' +
              (t.affiliateUrl ? '<br><small>Enlace de afiliado</small>' : '');
          }, chosen) +
          '</tbody></table></div><p class="hint">Datos revisados en ' + esc(cmp.getAttribute('data-reviewed')) + '. Los precios y planes cambian: confírmalos en la web oficial.</p>';
      }
      render();
    }).catch(function () {
      tableBox.innerHTML = '<div class="state" role="alert"><strong>No se ha podido cargar el catálogo</strong>Recarga la página para volver a intentarlo.</div>';
    });
  }
  }

  /* ---------- Calculadoras ---------- */
  var eur = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
  var eur2 = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2, maximumFractionDigits: 2 });
  var num = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 1 });
  var WEEKS_MONTH = 52 / 12;

  function readNum(form, name) {
    var el = form.elements[name];
    var v = parseFloat(String(el.value).replace(',', '.'));
    var min = el.min !== '' ? parseFloat(el.min) : -Infinity;
    var max = el.max !== '' ? parseFloat(el.max) : Infinity;
    if (isNaN(v) || v < min || v > max) { el.setAttribute('aria-invalid', 'true'); return null; }
    el.removeAttribute('aria-invalid');
    return v;
  }
  function setOut(form, key, value) {
    var el = $('[data-out="' + key + '"]', form.closest('.calc'));
    if (el) el.textContent = value;
  }
  var CALCS = {
    ahorro: function (f) {
      var n = readNum(f, 'veces'), m = readNum(f, 'minutos'), r = readNum(f, 'reduccion'), h = readNum(f, 'hora'),
        c = readNum(f, 'coste'), s = readNum(f, 'setup');
      if ([n, m, r, h, c, s].indexOf(null) > -1) return false;
      var hoursMonth = n * m * WEEKS_MONTH / 60;
      var saved = hoursMonth * r / 100;
      var value = saved * h;
      var net = value - c;
      var payback = net > 0 ? (s / net) : null;
      setOut(f, 'big', eur.format(net * 12) + ' al año');
      setOut(f, 'horas-mes', num.format(hoursMonth) + ' h');
      setOut(f, 'ahorro-mes', num.format(saved) + ' h');
      setOut(f, 'valor-mes', eur.format(value));
      setOut(f, 'neto-mes', eur.format(net));
      setOut(f, 'payback', payback === null ? 'No se recupera con estos supuestos' : (payback < 1 ? 'Menos de 1 mes' : num.format(payback) + ' meses'));
      return true;
    },
    hora: function (f) {
      var ing = readNum(f, 'ingresos'), gas = readNum(f, 'gastos'), cuota = readNum(f, 'cuota'), hs = readNum(f, 'horas'),
        fact = readNum(f, 'facturables'), sem = readNum(f, 'semanas');
      if ([ing, gas, cuota, hs, fact, sem].indexOf(null) > -1) return false;
      var netYear = ing - gas - cuota * 12;
      var billableHours = hs * sem * fact / 100;
      var totalHours = hs * sem;
      if (billableHours <= 0 || totalHours <= 0) return false;
      setOut(f, 'big', eur2.format(netYear / totalHours) + ' por hora trabajada');
      setOut(f, 'neto', eur.format(netYear));
      setOut(f, 'h-total', num.format(totalHours) + ' h');
      setOut(f, 'h-fact', num.format(billableHours) + ' h');
      setOut(f, 'por-fact', eur2.format(netYear / billableHours));
      return true;
    },
    compensa: function (f) {
      var precio = readNum(f, 'precio'), h = readNum(f, 'hora'), ahorro = readNum(f, 'ahorro');
      if ([precio, h, ahorro].indexOf(null) > -1 || h <= 0) return false;
      var breakeven = precio / h * 60;
      var value = ahorro / 60 * h;
      var ok = value >= precio;
      setOut(f, 'big', ok ? 'Sí compensa' : 'Con estos datos, no compensa');
      setOut(f, 'minimo', num.format(breakeven) + ' min/mes');
      setOut(f, 'valor', eur.format(value));
      setOut(f, 'balance', eur.format(value - precio));
      return true;
    }
  };
  function initCalcs() {
  $$('form[data-calc]').forEach(function (form) {
    var fn = CALCS[form.getAttribute('data-calc')];
    var err = $('.calc-error', form.closest('.calc'));
    var update = function () {
      var ok = fn(form);
      if (err) err.hidden = ok;
    };
    form.addEventListener('input', update);
    form.addEventListener('submit', function (e) { e.preventDefault(); update(); });
    update();
  });

  }

  /* ---------- Formularios de correo (sin backend) ---------- */
  function initForms() {
  $$('form[data-mailto]').forEach(function (form) {
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var to = form.getAttribute('data-mailto');
      var status = $('.form-status', form);
      if (!form.checkValidity()) { form.reportValidity(); return; }
      if (!to) {
        status.textContent = 'El formulario aún no está conectado a un buzón. Vuelve pronto.';
        return;
      }
      var data = new FormData(form);
      var body = [];
      data.forEach(function (v, k) { if (k !== 'asunto') body.push(k + ': ' + v); });
      location.href = 'mailto:' + to + '?subject=' + encodeURIComponent(data.get('asunto') || 'Contacto web') + '&body=' + encodeURIComponent(body.join('\n'));
      status.textContent = 'Se ha abierto tu programa de correo con el mensaje preparado.';
    });
  });
  }

  /* ---------- Arranque ---------- */
  function initPage() {
    initCopy();
    initFinder();
    initComparator();
    initCalcs();
    initForms();
    syncCompareUI();
  }
  window.AngInit = initPage;
  if (!SINGLE) initPage();
})();

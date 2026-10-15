/* Restaurante Puerto Rico · Madrid — interacción ligera, sin dependencias */
(function () {
  'use strict';

  var $ = function (s, c) { return (c || document).querySelector(s); };
  var $$ = function (s, c) { return Array.prototype.slice.call((c || document).querySelectorAll(s)); };
  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- Cabecera sólida al hacer scroll + barra móvil ---------- */
  var cabecera = $('#cabecera');
  var barra = $('#barra-movil');
  var hero = $('.hero');
  var ticking = false;
  function onScroll() {
    var y = window.scrollY;
    var limite = hero ? hero.offsetHeight - 90 : 40;
    if (cabecera) cabecera.classList.toggle('es-solida', y > 24);
    if (barra) barra.classList.toggle('visible', y > Math.min(limite, 320));
    ticking = false;
  }
  window.addEventListener('scroll', function () {
    if (!ticking) { window.requestAnimationFrame(onScroll); ticking = true; }
  }, { passive: true });
  onScroll();

  /* ---------- Menú móvil ---------- */
  var menu = $('#menu-movil');
  var abrir = $('#abrir-menu');
  var cerrar = $('#cerrar-menu');
  var ultimoFoco = null;

  function abrirMenu() {
    if (!menu) return;
    ultimoFoco = document.activeElement;
    menu.hidden = false;
    requestAnimationFrame(function () {
      menu.classList.add('esta-abierto');
      cerrar.focus();
    });
    document.documentElement.style.overflow = 'hidden';
    abrir.setAttribute('aria-expanded', 'true');
  }
  function cerrarMenu(volverFoco) {
    if (!menu || menu.hidden) return;
    menu.classList.remove('esta-abierto');
    document.documentElement.style.overflow = '';
    abrir.setAttribute('aria-expanded', 'false');
    setTimeout(function () { menu.hidden = true; }, reduceMotion ? 0 : 300);
    if (volverFoco !== false && ultimoFoco) ultimoFoco.focus();
  }
  if (abrir) abrir.addEventListener('click', abrirMenu);
  if (cerrar) cerrar.addEventListener('click', cerrarMenu);
  if (menu) {
    $$('a', menu).forEach(function (a) { a.addEventListener('click', function () { cerrarMenu(false); }); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') cerrarMenu(); });
    menu.addEventListener('keydown', function (e) {
      if (e.key === 'Tab') { // mantener el foco dentro del menú
        var focos = $$('a, button', menu);
        var primero = focos[0], ultimo = focos[focos.length - 1];
        if (e.shiftKey && document.activeElement === primero) { e.preventDefault(); ultimo.focus(); }
        else if (!e.shiftKey && document.activeElement === ultimo) { e.preventDefault(); primero.focus(); }
      }
    });
  }
  window.addEventListener('resize', function () { if (window.innerWidth >= 900) cerrarMenu(false); });

  /* ---------- Aparición progresiva ---------- */
  var revelables = $$('.revelar');
  if ('IntersectionObserver' in window && !reduceMotion) {
    var io = new IntersectionObserver(function (entradas) {
      entradas.forEach(function (en) {
        if (en.isIntersecting) { en.target.classList.add('visto'); io.unobserve(en.target); }
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
    revelables.forEach(function (el) { io.observe(el); });
  } else {
    revelables.forEach(function (el) { el.classList.add('visto'); });
  }

  /* ---------- Imágenes: fundido al cargar ---------- */
  $$('img.carga-suave').forEach(function (img) {
    if (img.complete && img.naturalWidth) { img.classList.add('cargada'); return; }
    img.addEventListener('load', function () { img.classList.add('cargada'); }, { once: true });
  });

  /* ---------- Horario: hoy + abierto/cerrado (hora de Madrid) ---------- */
  var filas = $$('#horario tr[data-dia]');
  function minutos(hhmm) { var p = hhmm.split(':'); return (+p[0]) * 60 + (+p[1]); }
  function ahoraMadrid() {
    try {
      var partes = new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Europe/Madrid', weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
      }).formatToParts(new Date());
      var o = {}; partes.forEach(function (p) { o[p.type] = p.value; });
      var dias = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };
      return { dia: dias[o.weekday], min: (+o.hour % 24) * 60 + (+o.minute) };
    } catch (e) {
      var d = new Date(); return { dia: d.getDay() || 7, min: d.getHours() * 60 + d.getMinutes() };
    }
  }
  function tramo(fila) {
    if (!fila || fila.hasAttribute('data-cerrado')) return null;
    var a = minutos(fila.getAttribute('data-abre')), c = minutos(fila.getAttribute('data-cierra'));
    if (c <= a) c += 1440; // cierra pasada la medianoche
    return { a: a, c: c, abre: fila.getAttribute('data-abre'), cierra: fila.getAttribute('data-cierra') };
  }
  if (filas.length) {
    var ahora = ahoraMadrid();
    var porDia = {}; filas.forEach(function (f) { porDia[f.getAttribute('data-dia')] = f; });
    var hoy = porDia[ahora.dia];
    if (hoy) hoy.classList.add('hoy');
    var ayer = tramo(porDia[ahora.dia === 1 ? 7 : ahora.dia - 1]);
    var t = tramo(hoy);
    var abierto = false, texto;
    if (t && ahora.min >= t.a && ahora.min < t.c) { abierto = true; texto = 'Abierto ahora · hasta las ' + t.cierra; }
    else if (ayer && ahora.min + 1440 < ayer.c) { abierto = true; texto = 'Abierto ahora · hasta las ' + ayer.cierra; }
    else if (t && ahora.min < t.a) { texto = 'Cerrado ahora · abre hoy a las ' + t.abre; }
    else {
      var manana = tramo(porDia[ahora.dia === 7 ? 1 : ahora.dia + 1]);
      texto = manana ? 'Cerrado ahora · abre mañana a las ' + manana.abre : 'Cerrado ahora';
    }
    $$('[data-estado]').forEach(function (el) {
      el.textContent = texto;
      el.classList.add(abierto ? 'abierto' : 'cerrado');
    });
  }

  /* ---------- Carta: categoría activa en la navegación ---------- */
  var enlacesCarta = $$('.carta-nav a');
  if (enlacesCarta.length && 'IntersectionObserver' in window) {
    var mapa = {}; enlacesCarta.forEach(function (a) { mapa[a.getAttribute('href').slice(1)] = a; });
    var ioCarta = new IntersectionObserver(function (entradas) {
      entradas.forEach(function (en) {
        if (!en.isIntersecting) return;
        enlacesCarta.forEach(function (a) { a.classList.remove('activo'); a.removeAttribute('aria-current'); });
        var a = mapa[en.target.id];
        if (a) {
          a.classList.add('activo'); a.setAttribute('aria-current', 'true');
          var ul = a.closest('ul');
          if (ul && ul.scrollWidth > ul.clientWidth) ul.scrollTo({ left: a.offsetLeft - 16, behavior: reduceMotion ? 'auto' : 'smooth' });
        }
      });
    }, { rootMargin: '-45% 0px -50% 0px' });
    $$('.carta__categoria').forEach(function (s) { ioCarta.observe(s); });
  }

  /* ---------- Galería con lightbox ---------- */
  var lb = $('#lightbox');
  var lbImg = $('#lightbox-img');
  var lbPie = $('#lightbox-pie');
  var lbCont = $('#lightbox-contador');
  var indice = 0;
  function botonesGaleria() { return $$('#galeria-rejilla .galeria__item button'); }
  function mostrar(i) {
    var bs = botonesGaleria(); if (!bs.length) return;
    indice = (i + bs.length) % bs.length;
    var b = bs[indice], img = $('img', b);
    lbImg.alt = img ? img.alt : '';
    lbImg.src = (img && img.currentSrc) || b.getAttribute('data-grande');
    // intenta la versión grande; si no existe se mantiene la que ya está cargada
    var grande = new Image();
    grande.onload = function () { if (botonesGaleria()[indice] === b) lbImg.src = grande.src; };
    grande.src = b.getAttribute('data-grande');
    lbPie.textContent = img ? img.alt : '';
    lbCont.textContent = (indice + 1) + ' / ' + bs.length;
    var unica = bs.length < 2;
    $$('[data-prev],[data-next]', lb).forEach(function (n) { n.hidden = unica; });
  }
  if (lb && typeof lb.showModal === 'function') {
    var rejilla = $('#galeria-rejilla');
    if (rejilla) rejilla.addEventListener('click', function (e) {
      var b = e.target.closest('button'); if (!b) return;
      mostrar(botonesGaleria().indexOf(b));
      lb.showModal();
    });
    $('[data-cerrar]', lb).addEventListener('click', function () { lb.close(); });
    $('[data-prev]', lb).addEventListener('click', function () { mostrar(indice - 1); });
    $('[data-next]', lb).addEventListener('click', function () { mostrar(indice + 1); });
    lb.addEventListener('click', function (e) { if (e.target === lb || e.target.classList.contains('lightbox__escena')) lb.close(); });
    lb.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowLeft') mostrar(indice - 1);
      if (e.key === 'ArrowRight') mostrar(indice + 1);
    });
    var x0 = null;
    lb.addEventListener('touchstart', function (e) { x0 = e.touches[0].clientX; }, { passive: true });
    lb.addEventListener('touchend', function (e) {
      if (x0 === null) return;
      var dx = e.changedTouches[0].clientX - x0;
      if (Math.abs(dx) > 50) mostrar(indice + (dx < 0 ? 1 : -1));
      x0 = null;
    });
    lb.addEventListener('close', function () {
      var b = botonesGaleria()[indice]; if (b) b.focus();
    });
  }

  /* ---------- Mapa: se carga bajo demanda ---------- */
  var MAPA_SRC = 'https://maps.google.com/maps?q=Restaurante+Puerto+Rico,+Calle+de+Chinchilla+2,+28013+Madrid&z=17&hl=es&output=embed';
  var contMapa = $('#mapa');
  var btnMapa = $('#cargar-mapa');
  function cargarMapa() {
    if (!contMapa || $('iframe', contMapa)) return;
    var f = document.createElement('iframe');
    f.src = MAPA_SRC;
    f.title = 'Mapa: Restaurante Puerto Rico, Calle de Chinchilla 2, Madrid';
    f.loading = 'lazy';
    f.referrerPolicy = 'no-referrer-when-downgrade';
    f.allowFullscreen = true;
    contMapa.appendChild(f);
    var fachada = $('.mapa__fachada', contMapa); if (fachada) fachada.remove();
    try { localStorage.setItem('mapaAceptado', '1'); } catch (e) { /* sin almacenamiento */ }
  }
  if (btnMapa) btnMapa.addEventListener('click', cargarMapa);
  try { if (localStorage.getItem('mapaAceptado') === '1') cargarMapa(); } catch (e) { /* sin almacenamiento */ }

  /* ---------- Botones de llamada ----------
     Los enlaces tel: abren la app de teléfono en el móvil. Si en unos instantes
     no se ha abierto nada (ordenador sin app de llamadas, vista previa que bloquea
     el enlace…), se muestra el número grande para marcarlo o copiarlo. */
  var dlgLlamar = $('#dialogo-llamar');
  if (dlgLlamar && typeof dlgLlamar.showModal === 'function') {
    var telefono = '+34915219834';
    // Dentro de un visor/iframe, el enlace se abre en la ventana principal para que el
    // sistema pueda lanzar la app de teléfono (los iframes suelen bloquearlo).
    var enIframe = false;
    try { enIframe = window.self !== window.top; } catch (err) { enIframe = true; }
    if (enIframe) $$('a[href^="tel:"]').forEach(function (a) { a.target = '_top'; });
    var temporizador = null;
    var cancelar = function () { clearTimeout(temporizador); temporizador = null; };
    window.addEventListener('blur', cancelar);
    window.addEventListener('pagehide', cancelar);
    document.addEventListener('visibilitychange', function () { if (document.hidden) cancelar(); });

    document.addEventListener('click', function (e) {
      var a = e.target.closest('a[href^="tel:"]');
      if (!a || a.hasAttribute('data-sin-respaldo')) return;
      var sinTelefono = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
      if (sinTelefono) { e.preventDefault(); dlgLlamar.showModal(); return; }
      cancelar();
      temporizador = setTimeout(function () {
        if (!document.hidden && !dlgLlamar.open) dlgLlamar.showModal();
      }, 1500);
    });
    $('[data-cerrar-llamar]', dlgLlamar).addEventListener('click', function () { dlgLlamar.close(); });
    dlgLlamar.addEventListener('click', function (e) { if (e.target === dlgLlamar) dlgLlamar.close(); });
    var copiar = $('#copiar-telefono');
    copiar.addEventListener('click', function () {
      var hecho = function () { copiar.textContent = 'Número copiado ✓'; setTimeout(function () { copiar.textContent = 'Copiar número'; }, 2200); };
      if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(telefono).then(hecho, function () { copiar.textContent = '915 21 98 34'; });
      } else {
        var t = document.createElement('textarea'); t.value = telefono; document.body.appendChild(t); t.select();
        try { document.execCommand('copy'); hecho(); } catch (err) { copiar.textContent = '915 21 98 34'; }
        t.remove();
      }
    });
  }

  /* ---------- Año del pie ---------- */
  $$('[data-anio]').forEach(function (el) { el.textContent = new Date().getFullYear(); });
})();

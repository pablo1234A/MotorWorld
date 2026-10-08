/* Aquiles · Fisioterapia Córdoba — interacción del sitio (sin dependencias) */
(() => {
  'use strict';

  const doc = document.documentElement;
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const $ = (s, c = document) => c.querySelector(s);
  const $$ = (s, c = document) => Array.from(c.querySelectorAll(s));
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

  /* ---------- Cabecera ---------- */
  const header = $('.site-header');
  const onScrollHeader = () => header && header.classList.toggle('is-scrolled', window.scrollY > 8);
  onScrollHeader();
  window.addEventListener('scroll', onScrollHeader, { passive: true });

  /* ---------- Menú móvil ---------- */
  const toggle = $('.menu-toggle');
  const menu = $('#mobile-menu');
  if (toggle && menu) {
    const setMenu = (open) => {
      doc.classList.toggle('menu-open', open);
      document.body.classList.toggle('menu-open', open);
      toggle.setAttribute('aria-expanded', String(open));
      toggle.setAttribute('aria-label', open ? 'Cerrar menú' : 'Abrir menú');
      if (open) { menu.removeAttribute('inert'); const first = $('a', menu); first && first.focus({ preventScroll: true }); }
      else { menu.setAttribute('inert', ''); }
    };
    toggle.addEventListener('click', () => setMenu(toggle.getAttribute('aria-expanded') !== 'true'));
    $$('a', menu).forEach((a) => a.addEventListener('click', () => setMenu(false)));
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && toggle.getAttribute('aria-expanded') === 'true') { setMenu(false); toggle.focus(); }
    });
    window.matchMedia('(min-width: 1081px)').addEventListener('change', (e) => e.matches && setMenu(false));
  }

  /* ---------- Aparición suave (una sola vez) ---------- */
  const revealEls = $$('[data-reveal]');
  if ('IntersectionObserver' in window && !reduceMotion.matches) {
    const io = new IntersectionObserver((entries) => {
      entries.forEach((en) => {
        if (en.isIntersecting) { en.target.classList.add('is-in'); io.unobserve(en.target); }
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
    revealEls.forEach((el) => io.observe(el));
  } else {
    revealEls.forEach((el) => el.classList.add('is-in'));
  }

  /* ---------- Contadores (se ejecutan una vez al entrar en pantalla) ---------- */
  const fmt = new Intl.NumberFormat('es-ES');
  const counters = $$('[data-count]');
  const runCounter = (el) => {
    const target = Number(el.dataset.count);
    if (reduceMotion.matches) { el.textContent = fmt.format(target); return; }
    const dur = 1600;
    const t0 = performance.now();
    const tick = (now) => {
      const p = clamp((now - t0) / dur, 0, 1);
      const eased = 1 - Math.pow(1 - p, 4);
      el.textContent = fmt.format(Math.round(target * eased));
      if (p < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  };
  if ('IntersectionObserver' in window && counters.length) {
    const cio = new IntersectionObserver((entries) => {
      entries.forEach((en) => {
        if (en.isIntersecting) { runCounter(en.target); cio.unobserve(en.target); }
      });
    }, { threshold: 0.6 });
    counters.forEach((el) => {
      const r = el.getBoundingClientRect();
      // Si ya está visible al cargar, se deja el valor final (sin animar).
      if (r.top < window.innerHeight && r.bottom > 0) return;
      cio.observe(el);
    });
  }

  /* ---------- Línea de proceso: se dibuja con el scroll (movimiento → recuperación) ---------- */
  const process = $('#process');
  if (process) {
    const svg = $('.process__line', process);
    const base = $('path.base', svg);
    const draw = $('path.draw', svg);
    const steps = $$('.step', process);
    let len = 0;
    let stops = [];

    const build = () => {
      const box = process.getBoundingClientRect();
      const dots = steps.map((s) => {
        const d = $('.step__dot', s).getBoundingClientRect();
        return { x: d.left - box.left + d.width / 2, y: d.top - box.top + d.height / 2 };
      });
      if (!dots.length) return;
      const w = box.width;
      svg.setAttribute('viewBox', `0 0 ${w} 60`);
      svg.style.top = (dots[0].y - 30) + 'px';
      svg.style.height = '60px';
      // Curva orgánica que pasa por el centro de cada paso, con un leve vaivén
      let d = `M ${dots[0].x} 30`;
      for (let i = 1; i < dots.length; i++) {
        const a = dots[i - 1].x, b = dots[i].x, span = b - a;
        const amp = (i % 2 ? -1 : 1) * 16;
        d += ` C ${a + span * 0.35} ${30 + amp}, ${b - span * 0.35} ${30 + amp}, ${b} 30`;
      }
      base.setAttribute('d', d);
      draw.setAttribute('d', d);
      len = draw.getTotalLength();
      draw.style.strokeDasharray = `${len} ${len}`;
      // Distancia a lo largo del trazo de cada parada
      stops = dots.map((p, i) => (i === 0 ? 0 : len * (i / (dots.length - 1))));
      update();
    };

    const update = () => {
      if (!len) return;
      const r = process.getBoundingClientRect();
      const vh = window.innerHeight;
      // 0 cuando el bloque asoma por abajo, 1 cuando su centro pasa el 45% de la pantalla
      const p = reduceMotion.matches ? 1 : clamp((vh * 0.92 - r.top) / (vh * 0.92 - vh * 0.45 + r.height * 0.15), 0, 1);
      draw.style.strokeDashoffset = String(len * (1 - p));
      steps.forEach((s, i) => s.classList.toggle('is-reached', len * p >= stops[i] - 2));
    };

    let ticking = false;
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => { ticking = false; window.innerWidth > 760 ? update() : mobileSteps(); });
    };
    const mobileSteps = () => {
      const vh = window.innerHeight;
      steps.forEach((s) => {
        const r = s.getBoundingClientRect();
        if (r.top < vh * 0.7) s.classList.add('is-reached');
      });
    };
    const init = () => (window.innerWidth > 760 ? build() : mobileSteps());
    init();
    window.addEventListener('scroll', onScroll, { passive: true });
    let rt;
    window.addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(init, 120); });
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(init);
  }

  /* ---------- Parallax muy sutil (sólo escritorio, sin reduced motion) ---------- */
  const px = $$('[data-parallax]');
  const fine = window.matchMedia('(hover: hover) and (pointer: fine)');
  if (px.length && fine.matches && !reduceMotion.matches) {
    let raf = 0;
    const base = new Map(px.map((el) => [el, el.style.transform || '']));
    const run = () => {
      raf = 0;
      const vh = window.innerHeight;
      px.forEach((el) => {
        const host = el.parentElement.getBoundingClientRect();
        if (host.bottom < 0 || host.top > vh) return;
        const k = Number(el.dataset.parallax) || 0.04;
        const off = (host.top + host.height / 2 - vh / 2) * k;
        el.style.transform = `${base.get(el)} translate3d(0, ${off.toFixed(1)}px, 0)`;
      });
    };
    window.addEventListener('scroll', () => { if (!raf) raf = requestAnimationFrame(run); }, { passive: true });
    run();
  }

  /* ---------- Carrusel de opiniones (scroll nativo + botones) ---------- */
  const track = $('#reviews-track');
  if (track) {
    const btns = $$('.reviews__btns .icon-btn');
    const step = () => {
      const card = track.querySelector('.review');
      return card ? card.getBoundingClientRect().width + 20 : track.clientWidth * 0.8;
    };
    const sync = () => {
      const max = track.scrollWidth - track.clientWidth - 2;
      btns.forEach((b) => { b.disabled = b.dataset.dir === '-1' ? track.scrollLeft <= 2 : track.scrollLeft >= max; });
    };
    btns.forEach((b) => b.addEventListener('click', () => {
      track.scrollBy({ left: step() * Number(b.dataset.dir), behavior: reduceMotion.matches ? 'auto' : 'smooth' });
    }));
    track.addEventListener('scroll', () => requestAnimationFrame(sync), { passive: true });
    track.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        e.preventDefault();
        track.scrollBy({ left: step() * (e.key === 'ArrowRight' ? 1 : -1), behavior: 'smooth' });
      }
    });
    window.addEventListener('resize', sync);
    sync();
  }

  /* ---------- Estado "abierto ahora" (hora de Madrid) ---------- */
  const status = $('[data-open-status]');
  if (status) {
    try {
      const parts = new Intl.DateTimeFormat('es-ES', { timeZone: 'Europe/Madrid', weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date());
      const get = (t) => (parts.find((p) => p.type === t) || {}).value || '';
      const wd = get('weekday').toLowerCase();
      const mins = Number(get('hour')) * 60 + Number(get('minute'));
      const weekday = !/^(sáb|dom)/.test(wd);
      const open = weekday && mins >= 540 && mins < 1320;
      const dot = status.previousElementSibling;
      if (open) status.textContent = 'Abierto ahora · hasta las 22:00';
      else {
        status.textContent = weekday && mins < 540 ? 'Abrimos hoy a las 09:00' : (/^(vie)/.test(wd) || !weekday ? 'Cerrado · abrimos el lunes a las 09:00' : 'Cerrado · abrimos mañana a las 09:00');
        if (dot) dot.style.background = 'var(--stone-2)', dot.style.boxShadow = 'none';
      }
    } catch (e) { /* se mantiene el horario estático */ }
  }

  /* ---------- Barra móvil: aparece tras el hero, se oculta en la sección de contacto ---------- */
  const bar = $('.mobile-bar');
  if (bar) {
    const hero = $('.hero') || $('.page-hero');
    const contact = $('#contacto');
    let heroOut = !hero, contactIn = false;
    const apply = () => bar.classList.toggle('is-visible', heroOut && !contactIn);
    if ('IntersectionObserver' in window) {
      if (hero) new IntersectionObserver(([en]) => { heroOut = !en.isIntersecting; apply(); }, { threshold: 0, rootMargin: '-35% 0px 0px 0px' }).observe(hero);
      if (contact) new IntersectionObserver(([en]) => { contactIn = en.isIntersecting; apply(); }, { threshold: 0.15 }).observe(contact);
    } else { heroOut = true; apply(); }
    apply();
  }

  /* ---------- Formulario de cita ----------
     Sin servidor: valida y prepara el mensaje para enviarlo por WhatsApp o email.
     En producción, conectar el submit a un endpoint propio (p. ej. PHP/Node o un servicio de formularios). */
  const form = $('#cita');
  if (form) {
    const fields = $('.form__fields', form);
    const done = $('.form__done', form);
    const rules = {
      'f-name': (v) => (v.trim().length >= 2 ? '' : 'Escribe tu nombre.'),
      'f-phone': (v) => (/^(\+?34)?[\s.-]*[6789](?:[\s.-]*\d){8}$/.test(v.trim()) ? '' : 'Escribe un teléfono válido, por ejemplo 600 123 456.'),
      'f-email': (v) => (!v.trim() || /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim()) ? '' : 'Revisa el email, parece incompleto.'),
      'f-need': (v) => (v ? '' : 'Elige el motivo de tu consulta.'),
      'f-privacy': (_, el) => (el.checked ? '' : 'Necesitamos que aceptes la política de privacidad.'),
    };
    const check = (id) => {
      const el = document.getElementById(id);
      const msg = rules[id](el.value, el);
      const err = document.getElementById(id + '-err');
      const wrap = el.closest('.field');
      if (err) err.textContent = msg;
      if (wrap) wrap.classList.toggle('has-error', !!msg);
      el.setAttribute('aria-invalid', msg ? 'true' : 'false');
      if (err) el.setAttribute('aria-describedby', [err.id, el.getAttribute('aria-describedby')].filter(Boolean).filter((v, i, a) => a.indexOf(v) === i).join(' '));
      return !msg;
    };
    Object.keys(rules).forEach((id) => {
      const el = document.getElementById(id);
      el.addEventListener('blur', () => el.value && check(id));
      el.addEventListener('change', () => el.closest('.field.has-error') && check(id));
      el.addEventListener('input', () => el.closest('.field.has-error') && check(id));
    });
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const ids = Object.keys(rules);
      const ok = ids.map(check);
      if (ok.includes(false)) {
        const first = document.getElementById(ids[ok.indexOf(false)]);
        first.focus();
        return;
      }
      const data = new FormData(form);
      const lines = [
        'Hola, me gustaría pedir cita en Aquiles.',
        `Nombre: ${data.get('nombre')}`,
        `Teléfono: ${data.get('telefono')}`,
        data.get('email') ? `Email: ${data.get('email')}` : '',
        `Motivo: ${data.get('motivo')}`,
        `Mejor franja para llamarme: ${data.get('franja')}`,
        data.get('mensaje') ? `Comentario: ${data.get('mensaje')}` : '',
      ].filter(Boolean);
      const text = lines.join('\n');
      $('[data-send="wa"]', form).href = 'https://wa.me/34661125257?text=' + encodeURIComponent(text);
      $('[data-send="mail"]', form).href = 'mailto:info@fisioterapiaencordobaaquiles.com?subject=' + encodeURIComponent('Solicitud de cita · ' + data.get('nombre')) + '&body=' + encodeURIComponent(text);
      fields.hidden = true;
      done.hidden = false;
      done.focus();
    });
    $('[data-reset]', form).addEventListener('click', () => { done.hidden = true; fields.hidden = false; document.getElementById('f-name').focus(); });
  }

  /* ---------- Índice de la página de tratamientos ---------- */
  const tocLinks = $$('.toc a');
  if (tocLinks.length && 'IntersectionObserver' in window) {
    const map = new Map(tocLinks.map((a) => [a.getAttribute('href').slice(1), a]));
    const tio = new IntersectionObserver((entries) => {
      entries.forEach((en) => {
        if (!en.isIntersecting) return;
        tocLinks.forEach((a) => a.classList.remove('is-active'));
        const a = map.get(en.target.id);
        if (a) {
          a.classList.add('is-active');
          const ul = a.closest('ul');
          ul.scrollTo({ left: a.offsetLeft - ul.clientWidth / 2 + a.offsetWidth / 2, behavior: reduceMotion.matches ? 'auto' : 'smooth' });
        }
      });
    }, { rootMargin: '-40% 0px -55% 0px' });
    map.forEach((_, id) => { const s = document.getElementById(id); s && tio.observe(s); });
  }

  /* ---------- Año ---------- */
  $$('[data-year]').forEach((el) => { el.textContent = String(new Date().getFullYear()); });
})();

import { VILLAS, GALLERY, bySlug } from '../data/villas.js';
import { icon } from '../ui/icons.js';
import { mountViewingForm } from '../ui/form.js';
import { counters, depthTiles, magnetic, parallax, reveals } from '../ui/fx.js';
import { clamp, coarse, img, lerp, money, narrow, num, reduced, smooth } from '../ui/utils.js';

/* ---------------------------------------------------------------- plan data
   Rooms are in villa-local metres (the same coordinates the 3D generator uses). */
const PLAN = {
  ground: [
    { id: 'entry', name: 'Entrance hall', rect: [-17, -7, -10, 7], shot: 'front', note: 'A timber-slatted screen filters light toward the salon and holds the first view of the sea back until you turn the corner.' },
    { id: 'salon', name: 'Salon', rect: [-10, -7, 2, 7], shot: 'living', note: 'Double-aspect living room with six metres of sliding glass, a stone fireplace wall and seating arranged toward the horizon.' },
    { id: 'kitchen', name: 'Kitchen & dining', rect: [2, -7, 17, 7], shot: 'kitchen', note: 'A five-metre stone island, a concealed pantry and a dining table for twelve beneath the floating oak stair.' },
    { id: 'terrace', name: 'Covered terrace', rect: [-9, -13.5, 18, -7], shot: 'terrace', note: 'Shaded by the cantilevered suite above: outdoor lounge, summer dining and a timber ceiling with warm recessed light.' },
    { id: 'pool', name: 'Infinity pool', rect: [-9, -28.5, 15, -18.5], shot: 'pool', note: 'Twenty-four metres, heated, edged in stone and set flush with the cliff so the water meets the sea.' },
  ],
  upper: [
    { id: 'suite', name: 'Principal suite', rect: [-3, -9, 17, 7], shot: 'suite', note: 'A calm, timber-floored room with a bed that faces the water, a seating nook at the glass and a dressing room behind.' },
    { id: 'bath', name: 'Bathroom', rect: [-12, -9, -3, 7], shot: 'bath', note: 'Oak-clad wall, double vanity with backlit mirror, a walk-in rain shower and a freestanding tub against the glass.' },
    { id: 'balcony', name: 'Sunrise balcony', rect: [-4, -13.5, 17.4, -9], shot: 'terrace', note: 'A glass-balustraded balcony over the pool, two loungers and morning light from the east.' },
  ],
};

const COMPASS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];

export function villaPage(slug) {
  const v = bySlug(slug);
  if (!v) return null;
  const idx = VILLAS.indexOf(v);
  const next = VILLAS[(idx + 1) % VILLAS.length];
  const galleryItems = [
    { key: 'front', label: 'Arrival' }, ...GALLERY, { key: 'aerial', label: 'The estate' },
  ];

  const el = document.createElement('main');
  el.id = 'main';
  el.className = 'page page--villa';
  el.innerHTML = `
    <header class="vhero">
      <div class="vhero__media" aria-hidden="false"><div class="vhero__img" data-parallax="0.12">${img(v.slug, 'hero', { eager: true, alt: `${v.name}, ${v.place}` })}</div></div>
      <div class="vhero__scrim" aria-hidden="true"></div>
      <div class="wrap vhero__inner">
        <a class="vhero__back link" href="#collection" data-go-id="collection" data-home>${icon.prev} All residences</a>
        <div class="vhero__title">
          <h1 class="display vhero__h" data-reveal="words">${v.name}</h1>
          <p class="vhero__place">${icon.pin}<span>${v.place} · ${v.region}</span></p>
        </div>
        <div class="vhero__foot">
          <dl class="vhero__facts tnum">
            <div><dt>Price</dt><dd>${money(v.price)}</dd></div>
            <div><dt>Built</dt><dd>${num(v.area)} m²</dd></div>
            <div><dt>Bedrooms</dt><dd>${v.beds}</dd></div>
          </dl>
          <a class="btn btn--brass" href="#vv-form" data-go-id="vv-form" data-magnetic>Request a private viewing <span class="btn__dot">${icon.arrowUR}</span></a>
        </div>
      </div>
    </header>

    <section class="vintro" aria-label="About ${v.name}">
      <div class="wrap vintro__grid">
        <p class="display vintro__lead" data-reveal="words">${v.blurb}</p>
        <div class="vintro__side">
          ${v.description.map((p, i) => `<p class="body" data-reveal style="--d:${i * 0.08}s">${p}</p>`).join('')}
          <dl class="vintro__meta" data-reveal>
            <div><dt>Type</dt><dd>${v.type}</dd></div>
            <div><dt>Completed</dt><dd class="tnum">${v.year}</dd></div>
            <div><dt>Plot</dt><dd class="tnum">${num(v.plot)} m²</dd></div>
            <div><dt>Outlook</dt><dd>${v.view}</dd></div>
          </dl>
        </div>
      </div>
    </section>

    <section class="vnums" aria-label="The property in numbers">
      <div class="wrap">
        <div class="vnums__grid tnum">
          ${v.highlights.map((h, i) => `
            <div class="vnum vnum--${i}" data-reveal style="--d:${i * 0.08}s">
              <p class="vnum__n display"><span data-count="${h.n}">${num(h.n)}</span>${h.u ? `<small>${h.u}</small>` : ''}</p>
              <p class="vnum__l">${h.l}</p>
            </div>`).join('')}
        </div>
        <ul class="vnums__list" role="list">
          ${v.features.map((f, i) => `<li data-reveal style="--d:${(i % 3) * 0.07}s"><span class="vnums__tick">${icon.check}</span>${f}</li>`).join('')}
        </ul>
      </div>
    </section>

    <section class="vgal" aria-label="Gallery">
      <div class="vgal__pin">
        <div class="vgal__head wrap"><h2 class="display" data-reveal="words">Room by room</h2><p class="vgal__hint small" aria-hidden="true">${coarse() ? 'Swipe' : 'Keep scrolling'} →</p></div>
        <ul class="vgal__track" role="list">
          ${galleryItems.map((g, i) => `
            <li class="vgal__item vgal__item--${i % 4}">
              <button type="button" class="vgal__btn" data-i="${i}" data-cursor="Open" aria-label="Open ${g.label} full screen">
                <span class="vgal__frame">${img(v.slug, g.key, { sizes: '(min-width: 900px) 46vw, 82vw', alt: `${v.name} — ${g.label}` })}</span>
                <span class="vgal__cap"><span class="vgal__name">${g.label}</span></span>
              </button>
            </li>`).join('')}
        </ul>
        <div class="vgal__bar" aria-hidden="true"><i></i></div>
      </div>
    </section>

    <section class="vtime" aria-labelledby="vt-h">
      <div class="wrap">
        <div class="vtime__head">
          <h2 class="display" id="vt-h" data-reveal="words">One house, <em>three</em> lights</h2>
          <p class="body" data-reveal>Drag through the day. The glass, the stone and the water answer to every hour.</p>
        </div>
        <div class="vtime__stage" data-reveal>
          <div class="vtime__imgs">
            <div class="vtime__layer" data-l="day">${img(v.slug, 'hero-day', { alt: `${v.name} by day` })}</div>
            <div class="vtime__layer" data-l="dusk">${img(v.slug, 'hero', { alt: `${v.name} at golden hour` })}</div>
            <div class="vtime__layer" data-l="night">${img(v.slug, 'hero-night', { alt: `${v.name} at night` })}</div>
          </div>
          <div class="vtime__hud">
            <p class="vtime__clock tnum" aria-live="off"><span class="vtime__time">13:00</span><span class="vtime__name">Day</span></p>
          </div>
        </div>
        <div class="vtime__ctl" data-reveal>
          <button type="button" class="vtime__stop" data-t="0" aria-label="Day">${icon.sun}<span>Day</span></button>
          <div class="vtime__range"><input type="range" min="0" max="200" value="0" step="1" aria-label="Time of day"><i class="vtime__fill"></i></div>
          <button type="button" class="vtime__stop" data-t="100" aria-label="Golden hour">${icon.dusk}<span>Golden hour</span></button>
          <button type="button" class="vtime__stop" data-t="200" aria-label="Night">${icon.moon}<span>Night</span></button>
        </div>
      </div>
    </section>

    <section class="vplan" aria-labelledby="vp-h">
      <div class="wrap vplan__grid">
        <div class="vplan__copy">
          <h2 class="display" id="vp-h" data-reveal="words">Walk the plan</h2>
          <p class="body" data-reveal>Choose a floor, then a room. Each space opens to a view of how it feels to stand there.</p>
          <div class="vplan__floors" role="tablist" aria-label="Floor" data-reveal>
            <button type="button" role="tab" aria-selected="true" data-floor="ground">Ground floor</button>
            <button type="button" role="tab" aria-selected="false" data-floor="upper">Upper floor</button>
          </div>
          <article class="vplan__card" aria-live="polite">
            <div class="vplan__thumb"><img alt="" decoding="async"></div>
            <h3 class="display vplan__name"></h3>
            <p class="vplan__area tnum"></p>
            <p class="body vplan__note"></p>
          </article>
        </div>
        <div class="vplan__svgwrap" data-reveal><svg class="vplan__svg" viewBox="0 0 900 830" role="group" aria-label="Floor plan of ${v.name}"></svg></div>
      </div>
    </section>

    <section class="vloc" aria-labelledby="vl-h">
      <div class="wrap vloc__grid">
        <div class="vloc__copy">
          <h2 class="display" id="vl-h" data-reveal="words">Where it sits</h2>
          <p class="body" data-reveal>${v.place}, ${v.region}. ${v.coords.lat}, ${v.coords.lon}. The shoreline lies to the south; rings show distance in kilometres.</p>
          <ul class="vloc__list" role="list">
            ${v.pois.map((p, i) => `
              <li><button type="button" class="poi" data-i="${i}">
                <span class="poi__kind">${p.kind}</span><span class="poi__name">${p.name}</span>
                <span class="poi__d tnum">${p.km < 10 ? p.km.toFixed(1) : Math.round(p.km)} km <small>· ${Math.max(2, Math.round(p.km * 1.35 + 2))} min</small></span>
              </button></li>`).join('')}
          </ul>
        </div>
        <div class="vloc__map" data-reveal><svg class="vloc__svg" viewBox="-330 -330 660 660" role="img" aria-label="Distances from ${v.name} to nearby places"></svg></div>
      </div>
    </section>

    <section class="viewing viewing--villa" id="vv-form" aria-labelledby="vv-h">
      <div class="wrap viewing__grid">
        <div class="viewing__intro">
          <h2 class="display viewing__h" id="vv-h" data-reveal="words">Private <em>viewing</em></h2>
          <p class="viewing__sub display" data-reveal>Discover the property in person.</p>
          <p class="lede" data-reveal>${v.name} is shown by appointment, to one party at a time.</p>
        </div>
        <div class="viewing__form" data-reveal id="vf-host"></div>
      </div>
    </section>

    <a class="vnext" href="#/villa/${next.slug}" data-cursor="Next">
      <div class="vnext__media" data-parallax="0.1">${img(next.slug, 'hero', { alt: '' })}</div>
      <div class="vnext__scrim"></div>
      <div class="wrap vnext__inner">
        <p class="vnext__k">Next residence</p>
        <p class="display vnext__h">${next.name}</p>
        <p class="vnext__p">${next.place} · ${money(next.price)}</p>
      </div>
    </a>

    <dialog class="lightbox" aria-label="Gallery viewer">
      <button class="lightbox__close" type="button" aria-label="Close">${icon.close}</button>
      <button class="lightbox__nav lightbox__nav--prev" type="button" aria-label="Previous">${icon.prev}</button>
      <figure class="lightbox__fig"><img alt=""><figcaption></figcaption></figure>
      <button class="lightbox__nav lightbox__nav--next" type="button" aria-label="Next">${icon.next}</button>
    </dialog>`;

  const offs = [];
  const q = (s) => el.querySelector(s);

  /* ------------------------------------------------------------- gallery */
  function gallery() {
    const sec = q('.vgal'), pin = q('.vgal__pin'), track = q('.vgal__track'), bar = q('.vgal__bar i');
    let max = 0;
    const measure = () => {
      if (narrow() || coarse()) { sec.style.height = ''; sec.classList.add('is-swipe'); max = 0; return; }
      sec.classList.remove('is-swipe');
      max = Math.max(0, track.scrollWidth - innerWidth + parseFloat(getComputedStyle(track).paddingLeft) * 1);
      sec.style.height = `${max + innerHeight * 1.05}px`;
    };
    let tx = 0, cur = 0, raf = 0;
    const tick = () => {
      cur += (tx - cur) * 0.12;
      track.style.transform = `translate3d(${-cur}px,0,0)`;
      track.style.setProperty('--shift', `${(tx - cur) * 0.06}px`);
      raf = Math.abs(tx - cur) > 0.3 ? requestAnimationFrame(tick) : 0;
    };
    const onScroll = () => {
      if (!max) return;
      const r = sec.getBoundingClientRect();
      const p = clamp(-r.top / Math.max(1, sec.offsetHeight - innerHeight));
      tx = p * max; bar.style.transform = `scaleX(${p})`;
      if (!raf) raf = requestAnimationFrame(tick);
    };
    measure(); onScroll();
    const onResize = () => { measure(); onScroll(); };
    addEventListener('resize', onResize);
    addEventListener('scroll', onScroll, { passive: true });
    // images may change track width after load
    const ro = new ResizeObserver(() => { measure(); onScroll(); }); ro.observe(track);
    offs.push(() => { removeEventListener('scroll', onScroll); removeEventListener('resize', onResize); ro.disconnect(); cancelAnimationFrame(raf); });

    /* lightbox */
    const lb = q('.lightbox'), lbImg = lb.querySelector('img'), cap = lb.querySelector('figcaption');
    let i = 0;
    const show = (n, dir = 0) => {
      i = (n + galleryItems.length) % galleryItems.length;
      const g = galleryItems[i];
      const next = new Image();
      next.onload = () => {
        lbImg.animate([{ opacity: 1 }, { opacity: 0 }], { duration: reduced() ? 1 : 180, fill: 'forwards' }).finished.then(() => {
          lbImg.src = next.src; lbImg.alt = `${v.name} — ${g.label}`; cap.textContent = `${g.label} · ${i + 1} / ${galleryItems.length}`;
          lbImg.animate([{ opacity: 0, transform: `translateX(${dir * 24}px) scale(1.01)` }, { opacity: 1, transform: 'none' }], { duration: reduced() ? 1 : 600, easing: 'cubic-bezier(0.16,1,0.3,1)', fill: 'forwards' });
        });
      };
      next.src = `assets/villas/${v.slug}/${g.key}.webp`;
    };
    el.querySelectorAll('.vgal__btn').forEach((b) => b.addEventListener('click', () => {
      i = +b.dataset.i; lb.showModal();
      const g = galleryItems[i]; lbImg.src = `assets/villas/${v.slug}/${g.key}.webp`; lbImg.alt = `${v.name} — ${g.label}`; cap.textContent = `${g.label} · ${i + 1} / ${galleryItems.length}`;
      lbImg.getAnimations().forEach((a) => a.cancel());
    }));
    lb.querySelector('.lightbox__close').addEventListener('click', () => lb.close());
    lb.querySelector('.lightbox__nav--prev').addEventListener('click', () => show(i - 1, -1));
    lb.querySelector('.lightbox__nav--next').addEventListener('click', () => show(i + 1, 1));
    lb.addEventListener('click', (e) => { if (e.target === lb) lb.close(); });
    lb.addEventListener('keydown', (e) => { if (e.key === 'ArrowRight') show(i + 1, 1); if (e.key === 'ArrowLeft') show(i - 1, -1); });
    let sx = 0;
    lb.addEventListener('touchstart', (e) => { sx = e.touches[0].clientX; }, { passive: true });
    lb.addEventListener('touchend', (e) => { const d = e.changedTouches[0].clientX - sx; if (Math.abs(d) > 50) show(i + (d < 0 ? 1 : -1), d < 0 ? 1 : -1); });
  }

  /* ----------------------------------------------------------- day / night */
  function dayNight() {
    const imgs = q('.vtime__imgs'), dusk = q('[data-l="dusk"]'), night = q('[data-l="night"]');
    const range = q('.vtime input'), fill = q('.vtime__fill'), time = q('.vtime__time'), name = q('.vtime__name');
    let tween = 0;
    const apply = (t) => {          // t: 0…2
      dusk.style.opacity = smooth(0, 1, t).toFixed(3);
      night.style.opacity = smooth(1, 2, t).toFixed(3);
      const warm = 1 - Math.abs(t - 1);
      imgs.style.setProperty('--grade', `${(clamp(warm) * 0.12).toFixed(3)}`);
      fill.style.transform = `scaleX(${(t / 2).toFixed(3)})`;
      range.style.setProperty('--v', (t / 2 * 100).toFixed(1));
      const minutes = t <= 1 ? lerp(13 * 60, 19 * 60 + 40, t) : lerp(19 * 60 + 40, 22 * 60 + 45, t - 1);
      time.textContent = `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(Math.round(minutes % 60)).padStart(2, '0')}`;
      name.textContent = t < 0.55 ? 'Day' : t < 1.45 ? 'Golden hour' : 'Night';
      range.setAttribute('aria-valuetext', `${time.textContent}, ${name.textContent}`);
    };
    range.addEventListener('input', () => { cancelAnimationFrame(tween); apply(range.value / 100); });
    el.querySelectorAll('.vtime__stop').forEach((b) => b.addEventListener('click', () => {
      const to = +b.dataset.t, from = +range.value, t0 = performance.now(), dur = reduced() ? 1 : 1400;
      cancelAnimationFrame(tween);
      const step = (now) => {
        const p = clamp((now - t0) / dur), e = p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
        const val = lerp(from, to, e); range.value = val; apply(val / 100);
        if (p < 1) tween = requestAnimationFrame(step);
      };
      tween = requestAnimationFrame(step);
    }));
    apply(0);
    offs.push(() => cancelAnimationFrame(tween));
  }

  /* ---------------------------------------------------------------- plan */
  function plan() {
    const svg = q('.vplan__svg');
    const S = 20, OX = 30 + 22 * S, OY = 30 + 28.5 * S;          // metres → px
    const X = (x) => OX + x * S, Y = (z) => OY + z * S;
    const k = v.area / 780;
    const card = q('.vplan__card'), thumb = card.querySelector('img');
    let floor = 'ground', current = null;

    const room = (r) => {
      const [x0, z0, x1, z1] = r.rect;
      return `<g class="room" data-id="${r.id}" role="button" tabindex="0" aria-label="${r.name}">
        <rect x="${X(x0)}" y="${Y(z0)}" width="${(x1 - x0) * S}" height="${(z1 - z0) * S}" rx="2"/>
        <text x="${X((x0 + x1) / 2)}" y="${Y((z0 + z1) / 2)}" text-anchor="middle" dominant-baseline="middle">${r.name}</text>
      </g>`;
    };
    const furniture = {
      ground: `
        <g class="furn">
          <rect x="${X(-7.4)}" y="${Y(-0.8)}" width="${4.3 * S}" height="${1.1 * S}" rx="6"/><rect x="${X(-4.5)}" y="${Y(-5.6)}" width="${S * 0.9}" height="${S * 0.9}" rx="8"/><rect x="${X(-8)}" y="${Y(-5.6)}" width="${S * 0.9}" height="${S * 0.9}" rx="8"/>
          <circle cx="${X(-5.2)}" cy="${Y(-2.5)}" r="${S * 0.6}"/>
          <rect x="${X(3.6)}" y="${Y(0.4)}" width="${4.8 * S}" height="${1.15 * S}"/>
          <rect x="${X(11.4)}" y="${Y(-3.55)}" width="${3.2 * S}" height="${1.1 * S}"/>
          ${Array.from({ length: 12 }, (_, i) => `<line x1="${X(16.4 - i * 0.58)}" x2="${X(16.4 - i * 0.58)}" y1="${Y(5.2)}" y2="${Y(6.85)}"/>`).join('')}
          <rect x="${X(-3.5)}" y="${Y(-11.4)}" width="${3.4 * S}" height="${1.05 * S}" rx="5"/><rect x="${X(8.2)}" y="${Y(-10.7)}" width="${2.6 * S}" height="${1 * S}"/>
          ${[-5, -2, 1, 4, 7].map((x, i) => `<rect x="${X(x - 4)}" y="${Y(-16.8)}" width="${0.8 * S}" height="${2 * S}" rx="3"/>`).join('')}
          <g class="water">${[-8, -6, -4].map((d) => `<line x1="${X(-9)}" x2="${X(15)}" y1="${Y(-28.5 + (d + 8) * 0.0 + (d + 8) * 2.2)}" y2="${Y(-28.5 + (d + 8) * 2.2)}"/>`).join('')}</g>
        </g>`,
      upper: `
        <g class="furn">
          <rect x="${X(2.4)}" y="${Y(3.6)}" width="${2.4 * S}" height="${2.5 * S}" rx="4"/><rect x="${X(0.9)}" y="${Y(6.2)}" width="${0.6 * S}" height="${0.6 * S}"/><rect x="${X(5.5)}" y="${Y(6.2)}" width="${0.6 * S}" height="${0.6 * S}"/>
          <circle cx="${X(12.3)}" cy="${Y(-5.6)}" r="${S * 0.42}"/><rect x="${X(10.7)}" y="${Y(-4.9)}" width="${S * 0.95}" height="${S * 0.95}" rx="8"/><rect x="${X(12.9)}" y="${Y(-4.9)}" width="${S * 0.95}" height="${S * 0.95}" rx="8"/>
          <rect x="${X(-8.2)}" y="${Y(-7.0)}" width="${2.0 * S}" height="${0.92 * S}" rx="12"/><rect x="${X(-11.6)}" y="${Y(-2.1)}" width="${0.58 * S}" height="${3 * S}"/>
          <line x1="${X(-9)}" x2="${X(-9)}" y1="${Y(2.6)}" y2="${Y(6.8)}"/>
          <rect x="${X(5)}" y="${Y(-12.4)}" width="${0.8 * S}" height="${2 * S}" rx="3"/><rect x="${X(7.9)}" y="${Y(-12.4)}" width="${0.8 * S}" height="${2 * S}" rx="3"/>
          <rect x="${X(9.2)}" y="${Y(5.15)}" width="${7.4 * S}" height="${1.7 * S}" stroke-dasharray="4 4"/>
        </g>`,
    };
    const walls = (f) => f === 'ground'
      ? `<rect class="shell" x="${X(-17)}" y="${Y(-7)}" width="${34 * S}" height="${14 * S}"/><rect class="deck" x="${X(-22)}" y="${Y(-28.5)}" width="${44 * S}" height="${21.5 * S}"/>`
      : `<rect class="shell" x="${X(-12)}" y="${Y(-9)}" width="${29 * S}" height="${16 * S}"/><rect class="deck" x="${X(-12)}" y="${Y(-13.5)}" width="${29.4 * S}" height="${4.5 * S}"/>`;

    const draw = () => {
      svg.innerHTML = `<g class="plan-base">${walls(floor)}</g>
        <g class="rooms">${PLAN[floor].map(room).join('')}</g>${furniture[floor]}
        <g class="north" transform="translate(850 70)"><circle r="22"/><path d="M0 -14 6 8 0 3 -6 8Z"/><text y="-30" text-anchor="middle">N</text></g>
        <g class="scale" transform="translate(40 800)"><line x2="${10 * S}"/><line y1="-5" y2="5"/><line x1="${10 * S}" x2="${10 * S}" y1="-5" y2="5"/><text x="${10 * S + 12}" y="4">10 m</text></g>`;
      svg.querySelectorAll('.room').forEach((g) => {
        const pick = () => select(g.dataset.id);
        g.addEventListener('click', pick);
        g.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(); } });
        g.addEventListener('pointerenter', () => { if (!coarse()) select(g.dataset.id, true); });
      });
      select(PLAN[floor].find((r) => r.id === current)?.id || PLAN[floor][floor === 'ground' ? 1 : 0].id, true);
    };

    function select(id, soft = false) {
      const r = PLAN[floor].find((x) => x.id === id); if (!r) return;
      current = id;
      svg.querySelectorAll('.room').forEach((g) => g.classList.toggle('is-on', g.dataset.id === id));
      const area = Math.round(((r.rect[2] - r.rect[0]) * (r.rect[3] - r.rect[1]) * k) / 2) * 2;
      card.querySelector('.vplan__name').textContent = r.name;
      card.querySelector('.vplan__area').textContent = `≈ ${num(area)} m²`;
      card.querySelector('.vplan__note').textContent = r.note;
      const src = `assets/villas/${v.slug}/${r.shot}-960.webp`;
      if (!thumb.src.endsWith(src)) {
        thumb.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 120, fill: 'forwards' }).finished.then(() => { thumb.src = src; thumb.alt = `${r.name}`; thumb.animate([{ opacity: 0, transform: 'scale(1.04)' }, { opacity: 1, transform: 'none' }], { duration: 700, easing: 'cubic-bezier(0.16,1,0.3,1)', fill: 'forwards' }); });
      }
    }

    el.querySelectorAll('.vplan__floors button').forEach((b) => b.addEventListener('click', () => {
      floor = b.dataset.floor; current = null;
      el.querySelectorAll('.vplan__floors button').forEach((x) => x.setAttribute('aria-selected', String(x === b)));
      draw();
    }));
    draw();
  }

  /* ------------------------------------------------------------ location */
  function location() {
    const svg = q('.vloc__svg');
    const R = 290, MAX = 120, rings = [5, 15, 40, 100];
    const rr = (km) => R * Math.pow(Math.min(km, MAX) / MAX, 0.4);
    const pt = (km, b) => { const a = (b - 90) * Math.PI / 180; return [Math.cos(a) * rr(km), Math.sin(a) * rr(km)]; };
    // greedy label placement: keep labels on the same side at least 15px apart
    const labels = v.pois.map((p, i) => { const [x, y] = pt(p.km, p.bearing); return { ...p, i, x, y, ly: y }; });
    for (const side of [true, false]) {
      const col = labels.filter((l) => (l.x > 0) === side).sort((a, b) => a.y - b.y);
      for (let k = 1; k < col.length; k++) if (col[k].ly - col[k - 1].ly < 16) col[k].ly = col[k - 1].ly + 16;
    }
    const sea = `M -330 70 C -200 36 -120 96 0 78 S 220 22 330 62 L 330 330 L -330 330 Z`;
    svg.innerHTML = `
      <defs><clipPath id="vl-clip"><circle r="${R + 20}"/></clipPath>
      <linearGradient id="vl-sea" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1d3b4f" stop-opacity=".9"/><stop offset="1" stop-color="#0d1b27" stop-opacity=".9"/></linearGradient></defs>
      <g clip-path="url(#vl-clip)"><circle r="${R + 20}" class="map-bg"/><path d="${sea}" fill="url(#vl-sea)"/><path d="M -330 70 C -200 36 -120 96 0 78 S 220 22 330 62" class="coast"/></g>
      ${rings.map((km) => `<circle class="ring" r="${rr(km)}"/><text class="ring-t" x="${rr(km) * 0.7071 + 4}" y="${-rr(km) * 0.7071 - 4}">${km} km</text>`).join('')}
      <g class="axes">${COMPASS.map((c, i) => { const a = (i * 45 - 90) * Math.PI / 180; return `<line x1="0" y1="0" x2="${Math.cos(a) * (R + 20)}" y2="${Math.sin(a) * (R + 20)}"/><text x="${Math.cos(a) * (R + 30)}" y="${Math.sin(a) * (R + 30)}" text-anchor="middle" dominant-baseline="middle">${c}</text>`; }).join('')}</g>
      ${labels.map((p) => `<g class="pin" data-i="${p.i}"><circle class="pin__halo" cx="${p.x}" cy="${p.y}" r="14"/><circle class="pin__dot" cx="${p.x}" cy="${p.y}" r="5"/><text x="${p.x + (p.x > 0 ? 12 : -12)}" y="${p.ly + 4}" text-anchor="${p.x > 0 ? 'start' : 'end'}">${p.name}</text></g>`).join('')}
      <g class="home"><circle r="22" class="home__halo"/><circle r="7" class="home__dot"/><text y="-30" text-anchor="middle">${v.name}</text></g>`;
    const set = (i, on) => {
      svg.querySelectorAll('.pin').forEach((g) => g.classList.toggle('is-on', on && +g.dataset.i === i));
      el.querySelectorAll('.poi').forEach((b) => b.classList.toggle('is-on', on && +b.dataset.i === i));
    };
    el.querySelectorAll('.poi').forEach((b) => {
      b.addEventListener('pointerenter', () => set(+b.dataset.i, true)); b.addEventListener('pointerleave', () => set(-1, false));
      b.addEventListener('focus', () => set(+b.dataset.i, true)); b.addEventListener('blur', () => set(-1, false));
      b.addEventListener('click', () => set(+b.dataset.i, true));
    });
    svg.querySelectorAll('.pin').forEach((g) => { g.addEventListener('pointerenter', () => set(+g.dataset.i, true)); g.addEventListener('pointerleave', () => set(-1, false)); });
  }

  return {
    el,
    title: `${v.name} — ${v.place} · Solenne`,
    mount() {
      mountViewingForm(q('#vf-host'), { slug: v.slug });
      offs.push(reveals(el), counters(el), magnetic(el), parallax(el), depthTiles(el));
      gallery(); dayNight(); plan(); location();
    },
    destroy() { offs.forEach((f) => f?.()); offs.length = 0; },
  };
}

import { VILLAS } from '../data/villas.js';
import { STAGES } from '../world/shots.js';
import { icon } from '../ui/icons.js';
import { Tour } from '../ui/tour.js';
import { mountCatalog } from '../ui/catalog.js';
import { mountViewingForm } from '../ui/form.js';
import { counters, depthTiles, magnetic, reveals } from '../ui/fx.js';
import { money, num } from '../ui/utils.js';

const hero = VILLAS[0];

const STAGE_COPY = [
  { t: 'Villa Aurelia', b: '' },
  { t: 'The approach', b: 'One road through the olive trees, and then the house arrives all at once: two long planes of travertine, and nothing between them but glass.' },
  { t: 'The entrance', b: 'A screen of oak slats filters the light and keeps the sea a secret for three more steps.' },
  { t: 'The salon', b: 'Six metres of glass, floor to ceiling. The Mediterranean is the only wall that matters.' },
  { t: 'The kitchen', b: 'Honed stone, smoked oak, and a table that seats twelve beneath a staircase that seems to hover.' },
  { t: 'The principal suite', b: 'At the top of the stair, a bed that faces the horizon and a ceiling lowered for sleep.' },
  { t: 'The bathroom', b: 'A freestanding tub set against the glass: timber on one side, open sea on the other.' },
  { t: 'The terrace', b: 'A covered balcony for the hours when the light is too good to leave.' },
  { t: 'The pool', b: 'Twenty-four metres of still water that ends exactly where the sea begins.' },
  { t: 'Villa Aurelia', b: 'Seven hundred and eighty square metres, five suites, one address. Marbella, Costa del Sol.', final: true },
];

export function homePage() {
  const el = document.createElement('main');
  el.id = 'main';
  el.className = 'page page--home';
  el.innerHTML = `
    <section class="tour" id="experience" aria-label="Walkthrough of ${hero.name}">
      <div class="tour__pin">
        <div class="tour__stills" aria-hidden="true">
          ${[0, 2, 4, 6, 7, 10, 12, 13, 15, 16].map((n) => `<img class="still" src="assets/villas/tour/s${String(n).padStart(2, '0')}.webp" alt="" decoding="async" ${n === 0 ? 'fetchpriority="high"' : 'loading="lazy"'}>`).join('')}
        </div>
        <canvas class="tour__canvas" aria-hidden="true"></canvas>
        <p class="sr">An animated walkthrough of Villa Aurelia, controlled by scrolling: exterior, approach, entrance, salon, kitchen, principal suite, bathroom, terrace, pool and the estate at night. Use the stage buttons or the skip link to move on.</p>
        <div class="tour__vignette" aria-hidden="true"></div>

        <div class="tour__hero">
          <div class="tour__hero-main">
            <h1 class="display tour__title">Villa <em>Aurelia</em></h1>
            <div class="tour__meta"><p class="tour__line">A house built around the horizon.</p><p class="tour__place">${icon.pin}<span>${hero.place}, ${hero.region}</span></p></div>
            <div class="tour__cta">
              <a class="btn" href="#/villa/${hero.slug}" data-magnetic>View the residence <span class="btn__dot">${icon.arrowUR}</span></a>
              <button class="btn btn--ghost" type="button" data-go="1" data-magnetic>Begin the walkthrough</button>
            </div>
          </div>
          <dl class="tour__facts tnum">
            <div><dt>Built area</dt><dd>${num(hero.area)} m²</dd></div>
            <div><dt>Bedrooms</dt><dd>${hero.beds}</dd></div>
            <div><dt>Price</dt><dd>${money(hero.price)}</dd></div>
          </dl>
        </div>

        <div class="tour__captions">
          ${STAGE_COPY.map((c, i) => i === 0 ? '<div class="cap cap--empty" aria-hidden="true"></div>' : `
            <div class="cap ${c.final ? 'cap--final' : ''}">
              <h2 class="display cap__title">${c.t}</h2>
              <p class="cap__body">${c.b}</p>
              ${c.final ? `<div class="cap__cta"><a class="btn" href="#/villa/${hero.slug}" data-magnetic>Explore Villa Aurelia <span class="btn__dot">${icon.arrowUR}</span></a><a class="btn btn--ghost" href="#collection" data-go-id="collection">Browse the collection</a></div>` : ''}
            </div>`).join('')}
        </div>

        <nav class="rail" aria-label="Walkthrough stages">
          <span class="rail__line"><i class="rail__fill"></i></span>
          <ol>${STAGES.map((s, i) => `<li><button class="rail__dot ${i === 0 ? 'is-on' : ''}" type="button" aria-label="Go to ${s.label}"><span class="rail__label">${s.label}</span></button></li>`).join('')}</ol>
        </nav>

        <div class="tour__hint" aria-hidden="true"><span>Scroll to walk through</span><i></i></div>
        <a class="tour__skip" href="#collection" data-go-id="collection">Skip walkthrough</a>
      </div>
    </section>

    <section class="manifesto" id="about" aria-labelledby="mf-h">
      <div class="wrap manifesto__grid">
        <h2 class="display manifesto__h" id="mf-h" data-reveal="words">We represent fewer than forty houses, and we have stood inside every one of them.</h2>
        <div class="manifesto__side">
          <p class="lede" data-reveal>Solenne is a private office for exceptional residences on the Mediterranean and the Atlantic coast. No listings portals, no open houses: each home is introduced to a short list of people, in person, by someone who knows it room by room.</p>
          <dl class="manifesto__stats tnum" data-reveal>
            <div><dt>Residences</dt><dd><span data-count="38">38</span></dd></div>
            <div><dt>Years on the coast</dt><dd><span data-count="19">19</span></dd></div>
            <div><dt>Offices</dt><dd><span data-count="5">5</span></dd></div>
          </dl>
        </div>
      </div>
    </section>

    <section class="collection" id="collection" aria-label="The collection"></section>

    <section class="viewing" id="private-viewing" aria-labelledby="pv-h">
      <div class="wrap viewing__grid">
        <div class="viewing__intro">
          <h2 class="display viewing__h" id="pv-h" data-reveal="words">Private <em>viewing</em></h2>
          <p class="viewing__sub display" data-reveal>Discover the property in person.</p>
          <p class="lede" data-reveal>Tell us which residence, and when. We open the house for you alone: no brokers, no other visitors, and a driver at the airport if you wish.</p>
        </div>
        <div class="viewing__form" data-reveal id="vf-host"></div>
      </div>
    </section>`;

  let tour, offs = [];

  return {
    el,
    async mount({ boot } = {}) {
      mountCatalog(el.querySelector('#collection'));
      mountViewingForm(el.querySelector('#vf-host'));
      offs.push(reveals(el), counters(el), magnetic(el), depthTiles(el));

      tour = new Tour(el.querySelector('.tour'), {
        onReady: () => boot?.(),
      });
      el.querySelectorAll('[data-go]').forEach((b) => b.addEventListener('click', () => tour.goTo(+b.dataset.go)));
      await tour.init();
    },
    destroy() {
      tour?.dispose();
      offs.forEach((f) => f?.());
      offs = [];
    },
  };
}

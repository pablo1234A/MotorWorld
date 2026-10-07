import { VILLAS } from '../data/villas.js';
import { icon } from './icons.js';

/**
 * Private viewing request. Real client-side validation and a believable submit flow.
 * There is no backend in this demo: nothing leaves the browser.
 */

const iso = (d) => d.toISOString().slice(0, 10);
const RULES = {
  name: (v) => (v.trim().length < 2 ? 'Please tell us your name.' : /\d{3,}/.test(v) ? 'That does not look like a name.' : ''),
  email: (v) => (!v.trim() ? 'We need an email to confirm your visit.' : /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim()) ? '' : 'That email address looks incomplete.'),
  phone: (v) => { const d = v.replace(/[^\d]/g, ''); return !v.trim() ? 'A phone number helps our concierge reach you.' : /^[\d\s+().-]+$/.test(v) && d.length >= 7 && d.length <= 15 ? '' : 'Enter a valid number, with country code if abroad.'; },
  property: (v) => (v ? '' : 'Choose the residence you would like to visit.'),
  date: (v) => {
    if (!v) return 'Pick a preferred date.';
    const d = new Date(v + 'T12:00:00'), t = new Date(); t.setHours(0, 0, 0, 0);
    if (Number.isNaN(d.getTime())) return 'That date is not valid.';
    return d <= t ? 'Visits are arranged from tomorrow onwards.' : '';
  },
  message: (v) => (v.length > 600 ? 'Please keep your note under 600 characters.' : ''),
};

export function mountViewingForm(host, { slug = '' } = {}) {
  const tomorrow = new Date(Date.now() + 864e5);
  const maxDate = new Date(Date.now() + 864e5 * 365);
  host.innerHTML = `
    <form class="vform" novalidate>
      <div class="field">
        <label for="vf-name">Full name</label>
        <input id="vf-name" name="name" type="text" autocomplete="name" required aria-describedby="vf-name-e">
        <p class="field__err" id="vf-name-e" role="alert"></p>
      </div>
      <div class="field">
        <label for="vf-email">Email</label>
        <input id="vf-email" name="email" type="email" inputmode="email" autocomplete="email" required aria-describedby="vf-email-e">
        <p class="field__err" id="vf-email-e" role="alert"></p>
      </div>
      <div class="field">
        <label for="vf-phone">Telephone</label>
        <input id="vf-phone" name="phone" type="tel" inputmode="tel" autocomplete="tel" required aria-describedby="vf-phone-e">
        <p class="field__err" id="vf-phone-e" role="alert"></p>
      </div>
      <div class="field">
        <label for="vf-property">Residence</label>
        <div class="select"><select id="vf-property" name="property" required aria-describedby="vf-property-e">
          <option value="">Select a residence</option>
          ${VILLAS.map((v) => `<option value="${v.slug}" ${v.slug === slug ? 'selected' : ''}>${v.name} — ${v.place}</option>`).join('')}
        </select></div>
        <p class="field__err" id="vf-property-e" role="alert"></p>
      </div>
      <div class="field">
        <label for="vf-date">Preferred date</label>
        <input id="vf-date" name="date" type="date" min="${iso(tomorrow)}" max="${iso(maxDate)}" required aria-describedby="vf-date-e">
        <p class="field__err" id="vf-date-e" role="alert"></p>
      </div>
      <div class="field field--wide">
        <label for="vf-message">Anything we should prepare? <span class="opt">Optional</span></label>
        <textarea id="vf-message" name="message" rows="3" maxlength="640" aria-describedby="vf-message-e"></textarea>
        <p class="field__err" id="vf-message-e" role="alert"></p>
      </div>
      <div class="vform__foot field--wide">
        <button class="btn btn--brass" type="submit" data-magnetic><span class="btn__label">Request private viewing</span><span class="btn__dot">${icon.arrowUR}</span></button>
        <p class="small vform__note">A concierge replies within two working hours. This is a fictional demonstration: nothing you type here is sent anywhere.</p>
      </div>
    </form>
    <div class="vdone" hidden tabindex="-1">
      <span class="vdone__tick">${icon.check}</span>
      <h3 class="display"></h3>
      <p class="lede"></p>
      <dl class="vdone__list"></dl>
      <button type="button" class="link vdone__again">Arrange another visit ${icon.arrow}</button>
    </div>`;

  const form = host.querySelector('form');
  const done = host.querySelector('.vdone');
  const touched = new Set();

  const check = (name) => {
    const f = form.elements[name];
    const msg = RULES[name](f.value);
    const err = host.querySelector(`#vf-${name}-e`);
    err.textContent = msg;
    f.setAttribute('aria-invalid', msg ? 'true' : 'false');
    f.closest('.field').classList.toggle('has-error', !!msg);
    return !msg;
  };

  Object.keys(RULES).forEach((name) => {
    const f = form.elements[name];
    f.addEventListener('blur', () => { touched.add(name); check(name); });
    f.addEventListener('input', () => { if (touched.has(name)) check(name); });
    f.addEventListener('change', () => { touched.add(name); check(name); });
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const bad = Object.keys(RULES).filter((n) => !check(n));
    Object.keys(RULES).forEach((n) => touched.add(n));
    if (bad.length) { form.elements[bad[0]].focus(); return; }

    const btn = form.querySelector('button[type="submit"]');
    btn.disabled = true; btn.querySelector('.btn__label').textContent = 'Sending request…';
    await new Promise((r) => setTimeout(r, 1100));

    const v = VILLAS.find((x) => x.slug === form.elements.property.value);
    const date = new Date(form.elements.date.value + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    const ref = `SOL-${Math.random().toString(36).slice(2, 6).toUpperCase()}${String(Date.now()).slice(-3)}`;
    done.querySelector('h3').textContent = `Thank you, ${form.elements.name.value.trim().split(/\s+/)[0]}.`;
    done.querySelector('.lede').textContent = `Your private viewing of ${v.name} is requested. A concierge will confirm timing and arrange your arrival.`;
    done.querySelector('dl').innerHTML = `<div><dt>Residence</dt><dd>${v.name}, ${v.place}</dd></div><div><dt>Preferred date</dt><dd>${date}</dd></div><div><dt>Reference</dt><dd class="tnum">${ref}</dd></div>`;
    form.hidden = true; done.hidden = false; done.classList.add('is-in'); done.focus();
    btn.disabled = false; btn.querySelector('.btn__label').textContent = 'Request private viewing';
  });

  done.querySelector('.vdone__again').addEventListener('click', () => {
    form.reset(); touched.clear();
    form.querySelectorAll('.field').forEach((f) => f.classList.remove('has-error'));
    form.querySelectorAll('.field__err').forEach((p) => (p.textContent = ''));
    if (slug) form.elements.property.value = slug;
    done.hidden = true; form.hidden = false; form.elements.name.focus();
  });

  return { setProperty(s) { form.elements.property.value = s; } };
}

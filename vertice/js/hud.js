// HUD minimalista: salud, munición, minimapa giratorio, marcador, tiempo, objetivos,
// killfeed, marcadores de impacto, indicadores de daño, medallas y marcador completo.
import * as THREE from 'three';
import { TEAMS, STREAKS, WEAPONS } from './data.js';
import { clamp, DEG } from './util.js';

const HTML = `
<div class="h-top">
  <div class="h-score">
    <div class="h-team a"><span class="h-tname" id="hTA">VANGUARDIA</span><b id="hSA">0</b><i class="h-bar"><i id="hBA"></i></i></div>
    <div class="h-timer hud-click" id="hTimer" data-act="score">8:00</div>
    <div class="h-team b"><b id="hSB">0</b><span class="h-tname" id="hTB">CUERVO</span><i class="h-bar"><i id="hBB"></i></i></div>
  </div>
  <div class="h-flags" id="hFlags"></div>
  <div class="h-objtext" id="hObj"></div>
</div>
<div class="h-mm"><canvas id="hMM"></canvas><div class="h-loc" id="hLoc"></div></div>
<div class="h-kf" id="hKF"></div>
<div class="h-radio" id="hRadio"></div>
<div class="h-markers" id="hMarkers"></div>
<div class="h-x" id="hX"><i class="t"></i><i class="b"></i><i class="l"></i><i class="r"></i><i class="d"></i></div>
<div class="h-hit" id="hHit"><i></i><i></i><i></i><i></i></div>
<div class="h-aimname" id="hAimName"></div>
<div class="h-dmg" id="hDmg"></div>
<div class="h-pop" id="hPop"></div>
<div class="h-medals" id="hMedals"></div>
<div class="h-notice" id="hNotice"><b></b><span></span></div>
<div class="h-interact" id="hInt"><span></span><i><i></i></i></div>
<div class="h-streaks" id="hStreaks"></div>
<div class="h-bl">
  <div class="h-hp"><i class="h-hpfill" id="hHP"></i><i class="h-arfill" id="hAR"></i><span id="hHPt">100</span></div>
  <div class="h-stam"><i id="hST"></i></div>
</div>
<div class="h-br">
  <div class="h-wslots hud-click" id="hSlots" data-act="switch"></div>
  <div class="h-ammo"><b id="hMag">30</b><span id="hRes">/ 150</span></div>
  <div class="h-wname" id="hWName"></div>
  <div class="h-nades"><span id="hLeth">◆ 1</span><span id="hTac">▣ 1</span></div>
</div>
<div class="h-reload" id="hReload">RECARGAR</div>
<div class="h-scope" id="hScope"><div class="h-scope-ret"></div></div>
<div class="h-smoke" id="hSmoke"></div>
<div class="h-flash" id="hFlash"></div>
<div class="h-vig" id="hVig"></div>
<div class="h-design" id="hDesign"><div class="h-design-ret"></div><b>LLUVIA DE ACERO</b><span>Apunta y dispara para designar el objetivo</span><button class="hud-click" data-act="cancelDesign">CANCELAR</button></div>
<div class="h-death" id="hDeath"><small>ELIMINADO POR</small><b id="hDK"></b><span id="hDW"></span><em id="hDT"></em></div>
<div class="h-board" id="hBoard"></div>
<button class="pause-btn hud-click" data-act="pause" aria-label="Pausa"><i></i><i></i></button>
<div class="h-fps" id="hFps"></div>
`;

const _v = new THREE.Vector3(), _w = new THREE.Vector3();

export class HUD {
  constructor(root, game) {
    this.root = root; this.g = game;
    root.innerHTML = HTML;
    root.classList.remove('hidden');
    this.$ = (id) => root.querySelector('#' + id);
    this.els = {};
    for (const id of ['hSA', 'hSB', 'hBA', 'hBB', 'hTimer', 'hFlags', 'hObj', 'hMM', 'hLoc', 'hKF', 'hRadio', 'hMarkers', 'hX', 'hHit', 'hAimName', 'hDmg', 'hPop', 'hMedals', 'hNotice', 'hInt', 'hStreaks', 'hHP', 'hAR', 'hHPt', 'hST', 'hSlots', 'hMag', 'hRes', 'hWName', 'hLeth', 'hTac', 'hReload', 'hScope', 'hSmoke', 'hFlash', 'hVig', 'hDesign', 'hDeath', 'hDK', 'hDW', 'hDT', 'hBoard', 'hFps', 'hTA', 'hTB']) this.els[id] = this.$(id);
    const E = this.els;
    // nombres de equipo
    if (game.mode.def.teams) {
      const my = TEAMS[0], en = TEAMS[1];
      E.hTA.textContent = my.name; E.hTB.textContent = en.name;
    } else { E.hTA.textContent = 'TÚ'; E.hTB.textContent = 'LÍDER'; }
    // minimapa
    this.mmCtx = E.hMM.getContext('2d');
    this.mmT = 0;
    // rachas
    E.hStreaks.innerHTML = STREAKS.map((s, i) => `<button class="h-sk" data-btn="streak${i}" id="hSK${i}" title="${s.name}"><b>${s.icon}</b><span>${s.kills}</span></button>`).join('');
    this.cache = {};
    this.dmgInd = [];
    this.markerEls = new Map();
    this.noticeT = 0; this.flashK = 0; this.flashT = 0; this.flashDur = 1;
    this.hitT = 0; this.kfItems = [];
    this.fpsAcc = 0; this.fpsN = 0;
    this._click = (e) => {
      const a = e.target.closest('[data-act]');
      if (!a) return;
      const act = a.dataset.act;
      if (act === 'pause') this.g.pause();
      else if (act === 'score') this.toggleBoard();
      else if (act === 'switch') this.g.input.press('switch');
      else if (act === 'cancelDesign') this.g.streaks.cancelDesignation();
    };
    root.addEventListener('click', this._click);
    this.buildSlots();
    this.applyScale(game.settings.hudScale);
  }
  applyScale(s) { document.documentElement.style.setProperty('--hud', s || 1); }
  destroy() { this.root.removeEventListener('click', this._click); this.root.innerHTML = ''; this.root.classList.add('hidden'); }
  set(id, prop, val) {
    const k = id + prop;
    if (this.cache[k] === val) return;
    this.cache[k] = val;
    const el = this.els[id];
    if (prop === 'text') el.textContent = val; else if (prop === 'html') el.innerHTML = val; else if (prop === 'w') el.style.width = val; else if (prop === 'cls') el.className = val; else if (prop === 'op') el.style.opacity = val; else if (prop === 'show') el.classList.toggle('show', !!val);
  }
  buildSlots() {
    const p = this.g.player;
    this.els.hSlots.innerHTML = p.weapons.map((w, i) => `<span class="h-slot" id="hSlot${i}">${i + 1}<em>${w.def.name}</em></span>`).join('');
  }

  // ------------------------------------------------------------ eventos
  hitmarker(head, kill) {
    const el = this.els.hHit;
    el.className = 'h-hit show' + (head ? ' head' : '') + (kill ? ' kill' : '');
    this.hitT = kill ? 0.45 : 0.2;
    if (!kill) this.g.audioUI(head ? 'ui_head' : 'ui_hit', head ? 0.6 : 0.45);
  }
  markHit() { }
  popup(pts, label) {
    const d = document.createElement('div'); d.className = 'pop'; d.innerHTML = `<b>${pts}</b><span>${label}</span>`;
    this.els.hPop.appendChild(d);
    setTimeout(() => d.remove(), 1600);
    while (this.els.hPop.children.length > 4) this.els.hPop.firstChild.remove();
  }
  medal(text) {
    const d = document.createElement('div'); d.className = 'medal'; d.textContent = text;
    this.els.hMedals.appendChild(d); setTimeout(() => d.remove(), 2200);
    while (this.els.hMedals.children.length > 3) this.els.hMedals.firstChild.remove();
  }
  notice(title, cls = 'ally', sub = '') {
    const el = this.els.hNotice;
    el.className = 'h-notice show ' + cls;
    el.querySelector('b').textContent = title; el.querySelector('span').textContent = sub || '';
    this.noticeT = 3;
  }
  killfeed(a, v, weapon, head, explosive) {
    const g = this.g, P = g.player;
    const cls = (c) => !c ? 'n' : c === P ? 'me' : g.isEnemy(c, P) ? 'e' : 'a';
    const d = document.createElement('div'); d.className = 'kf';
    const icon = explosive ? '✹' : head ? '⌖' : '›';
    d.innerHTML = a && a !== v ? `<span class="${cls(a)}">${a.name}</span><i>${icon} ${weapon}</i><span class="${cls(v)}">${v.name}</span>` : `<span class="${cls(v)}">${v.name}</span><i>✝</i>`;
    this.els.hKF.appendChild(d);
    setTimeout(() => d.classList.add('out'), 4500); setTimeout(() => d.remove(), 5000);
    while (this.els.hKF.children.length > 5) this.els.hKF.firstChild.remove();
  }
  radio(name, msg) {
    const d = document.createElement('div'); d.className = 'rd'; d.innerHTML = `<b>${name}:</b> ${msg}`;
    this.els.hRadio.appendChild(d); setTimeout(() => d.remove(), 3200);
    while (this.els.hRadio.children.length > 2) this.els.hRadio.firstChild.remove();
  }
  damage(attacker) {
    if (!attacker) return;
    let ind = this.dmgInd.find((i) => i.src === attacker);
    if (!ind) {
      const el = document.createElement('i'); this.els.hDmg.appendChild(el);
      ind = { src: attacker, el, t: 0, pos: attacker.pos.clone() };
      this.dmgInd.push(ind);
    }
    ind.t = 1.4; ind.pos.copy(attacker.pos);
  }
  flash(k, dur) { this.flashK = Math.max(this.flashK, k); this.flashT = dur; this.flashDur = dur; }
  streakReady(i, on) { const el = this.root.querySelector('#hSK' + i); if (el) el.classList.toggle('ready', on); }
  designate(on) { this.els.hDesign.classList.toggle('show', on); }
  interact(label, p) {
    const el = this.els.hInt;
    if (!label) { this.set('hInt', 'show', false); return; }
    this.set('hInt', 'show', true);
    if (this.cache.intLabel !== label) { this.cache.intLabel = label; el.querySelector('span').textContent = label; }
    el.querySelector('i i').style.width = Math.round(p * 100) + '%';
  }
  showDeath(killer, weapon) {
    const E = this.els;
    E.hDK.textContent = killer ? killer.name.toUpperCase() : 'TI MISMO';
    E.hDW.textContent = weapon || '';
    E.hDeath.classList.add('show');
  }
  hideDeath() { this.els.hDeath.classList.remove('show'); }
  setDeathTimer(text) { this.set('hDT', 'text', text); }
  toggleBoard(force) {
    const el = this.els.hBoard;
    const show = force !== undefined ? force : !el.classList.contains('show');
    el.classList.toggle('show', show);
    if (show) this.renderBoard();
  }
  renderBoard() {
    const g = this.g, P = g.player;
    const row = (c) => `<tr class="${c === P ? 'me' : ''}${c.alive ? '' : ' dead'}"><td>${c.name}</td><td>${c.stats.score}</td><td>${c.stats.kills}</td><td>${c.stats.deaths}</td><td>${c.stats.assists}</td></tr>`;
    const head = '<tr><th>OPERADOR</th><th>PUNTOS</th><th>B</th><th>M</th><th>A</th></tr>';
    const sort = (l) => l.sort((a, b) => b.stats.score - a.stats.score);
    if (g.mode.def.teams) {
      const mine = sort(g.combatants.filter((c) => c.team === P.team)), en = sort(g.combatants.filter((c) => c.team !== P.team));
      this.els.hBoard.innerHTML = `<div class="hb-col a"><h4>${TEAMS[0].name} · ${g.mode.teamScore(P.team)}</h4><table>${head}${mine.map(row).join('')}</table></div><div class="hb-col e"><h4>${TEAMS[1].name} · ${g.mode.teamScore(1 - P.team)}</h4><table>${head}${en.map(row).join('')}</table></div>`;
    } else {
      const all = g.combatants.slice().sort((a, b) => b.stats.kills - a.stats.kills || b.stats.score - a.stats.score);
      this.els.hBoard.innerHTML = `<div class="hb-col a wide"><h4>TODOS CONTRA TODOS</h4><table>${head}${all.map(row).join('')}</table></div>`;
    }
  }

  // ------------------------------------------------------------ por fotograma
  update(dt) {
    const g = this.g, P = g.player, E = this.els, cam = g.camera;
    const info = g.mode.hudInfo(P.team);
    this.set('hSA', 'text', String(info.a.v)); this.set('hSB', 'text', String(info.b.v));
    this.set('hBA', 'w', clamp(info.a.v / info.a.max, 0, 1) * 100 + '%'); this.set('hBB', 'w', clamp(info.b.v / info.b.max, 0, 1) * 100 + '%');
    if (info.ffa) { this.set('hTB', 'text', info.b.label || 'LÍDER'); }
    this.set('hTimer', 'text', info.timer); this.set('hTimer', 'cls', 'h-timer hud-click' + (info.urgent ? ' urgent' : ''));
    this.set('hObj', 'text', info.text);
    if (info.flags) {
      const html = info.flags.map((f) => `<span class="fl ${f.owner}${f.contested ? ' cont' : ''}${f.here ? ' here' : ''}"><b>${f.id}</b><i style="--p:${Math.round(f.prog * 100)}%" class="${f.cap}"></i></span>`).join('');
      this.set('hFlags', 'html', html);
    } else if (info.alive) {
      this.set('hFlags', 'html', `<span class="alive a">${'●'.repeat(info.alive[0])}<em>${'○'.repeat(Math.max(0, g.teamSize - info.alive[0]))}</em></span><span class="alive e">${'●'.repeat(info.alive[1])}<em>${'○'.repeat(Math.max(0, g.teamSize - info.alive[1]))}</em></span>`);
    }
    // salud / munición
    const hp = Math.max(0, P.health);
    this.set('hHP', 'w', hp + '%'); this.set('hHPt', 'text', String(Math.ceil(hp)));
    this.set('hAR', 'w', (P.armor / 50 * 100) + '%');
    this.set('hHP', 'cls', 'h-hpfill' + (hp < 35 ? ' low' : ''));
    this.set('hST', 'w', (P.stamina * 100) + '%');
    const ws = P.weapon;
    this.set('hMag', 'text', String(ws.mag)); this.set('hRes', 'text', '/ ' + ws.reserve);
    this.set('hMag', 'cls', ws.mag <= Math.ceil(ws.def.mag * 0.25) ? 'low' : '');
    this.set('hWName', 'text', ws.def.name);
    this.set('hLeth', 'text', '◆ ' + P.lethals); this.set('hTac', 'text', '▣ ' + P.tacticals);
    for (let i = 0; i < 2; i++) { const el = this.root.querySelector('#hSlot' + i); if (el) el.classList.toggle('on', P.slot === i); }
    const showReload = P.alive && !ws.reloading && ws.mag <= Math.ceil(ws.def.mag * 0.2) && ws.reserve > 0 && !P.inVehicle;
    this.set('hReload', 'show', showReload);
    this.set('hReload', 'text', ws.mag === 0 ? (ws.reserve > 0 ? 'RECARGAR' : 'SIN MUNICIÓN') : 'MUNICIÓN BAJA');
    if (ws.reloading) this.set('hReload', 'show', false);
    // mira
    const ads = P.adsT > 0.75;
    const scoped = ads && ws.def.scope && P.alive;
    this.set('hScope', 'show', scoped);
    g.vm.root.visible = !scoped && g.vm.visible;
    const hideX = !P.alive || P.sprint || ads || P.inVehicle || g.streaks.designating;
    this.set('hX', 'show', !hideX);
    if (!hideX) {
      const spread = ws.spread(false, P.moveSpeed > 1, P.crouch, !P.grounded);
      const focal = (window.innerHeight / 2) / Math.tan(cam.fov * DEG / 2);
      const gap = Math.round(Math.max(6, Math.tan(spread * DEG) * focal));
      if (this.cache.gap !== gap) { this.cache.gap = gap; E.hX.style.setProperty('--g', gap + 'px'); }
      E.hX.classList.toggle('enemy', !!P.aimTarget || !!this.aimedEnemy);
    }
    // marcador de impacto
    if (this.hitT > 0) { this.hitT -= dt; if (this.hitT <= 0) E.hHit.classList.remove('show'); }
    // aviso central
    if (this.noticeT > 0) { this.noticeT -= dt; if (this.noticeT <= 0) E.hNotice.classList.remove('show'); }
    // destello / humo / viñeta
    if (this.flashT > 0) { this.flashT -= dt; const k = this.flashK * clamp(this.flashT / (this.flashDur * 0.6), 0, 1); E.hFlash.style.opacity = k.toFixed(3); g.audioMuffle(k); if (this.flashT <= 0) { this.flashK = 0; E.hFlash.style.opacity = 0; g.audioMuffle(0); } }
    const sd = g.fx.smokeDensityAt(cam.position);
    this.set('hSmoke', 'op', sd > 0.02 ? Math.min(0.92, sd * 1.4).toFixed(2) : '0');
    const vig = P.alive ? clamp((60 - hp) / 60, 0, 1) : 0;
    this.set('hVig', 'op', vig.toFixed(2));
    // indicadores de daño
    for (let i = this.dmgInd.length - 1; i >= 0; i--) {
      const d = this.dmgInd[i]; d.t -= dt;
      if (d.t <= 0) { d.el.remove(); this.dmgInd.splice(i, 1); continue; }
      const ang = Math.atan2(d.pos.x - P.pos.x, d.pos.z - P.pos.z);
      const rel = -(ang - (P.yaw + Math.PI));
      d.el.style.transform = `rotate(${rel}rad)`; d.el.style.opacity = Math.min(1, d.t).toFixed(2);
    }
    // nombre del enemigo apuntado
    this.updateAimName();
    this.updateMarkers();
    // minimapa (~20 fps)
    this.mmT -= dt;
    if (this.mmT <= 0) { this.mmT = 0.05; this.drawMinimap(); this.set('hLoc', 'text', g.map.calloutAt(P.pos.x, P.pos.y, P.pos.z)); }
    // marcador completo con Tab
    if (g.input.isHeld('score') !== this._scoreHeld) { this._scoreHeld = g.input.isHeld('score'); this.toggleBoard(this._scoreHeld); }
    if (this.els.hBoard.classList.contains('show')) { this.boardT = (this.boardT || 0) - dt; if (this.boardT <= 0) { this.boardT = 0.5; this.renderBoard(); } }
    // fps
    if (g.settings.showFps) { this.fpsAcc += dt; this.fpsN++; if (this.fpsAcc > 0.5) { this.set('hFps', 'text', Math.round(this.fpsN / this.fpsAcc) + ' FPS · ' + g.renderScale.toFixed(2) + 'x'); this.fpsAcc = 0; this.fpsN = 0; } }
    else this.set('hFps', 'text', '');
  }
  updateAimName() {
    const g = this.g, P = g.player, cam = g.camera;
    this.aimedEnemy = null;
    if (!P.alive) { this.set('hAimName', 'text', ''); return; }
    cam.getWorldDirection(_v);
    let best = null, bt = 80;
    for (const c of g.combatants) {
      if (c === P || !c.alive) continue;
      const h = c.rayHit(cam.position.x, cam.position.y, cam.position.z, _v.x, _v.y, _v.z, bt);
      if (h && h.t < bt) { bt = h.t; best = c; }
    }
    if (best && !g.world.los(cam.position.x, cam.position.y, cam.position.z, cam.position.x + _v.x * bt, cam.position.y + _v.y * bt, cam.position.z + _v.z * bt, 'sight')) best = null;
    if (best) {
      const en = g.isEnemy(best, P);
      if (en) this.aimedEnemy = best;
      this.set('hAimName', 'text', best.name.toUpperCase());
      this.set('hAimName', 'cls', 'h-aimname ' + (en ? 'e' : 'a'));
    } else this.set('hAimName', 'text', '');
  }
  updateMarkers() {
    const g = this.g, P = g.player, cam = g.camera;
    const W = window.innerWidth, H = window.innerHeight;
    const list = [];
    if (g.mode.worldMarkers) for (const m of g.mode.worldMarkers(P.team)) list.push({ key: 'o' + m.label, x: m.x, y: m.y, z: m.z, label: m.label, cls: 'obj ' + m.cls, clamp: true });
    if (g.mode.def.teams) for (const c of g.combatants) {
      if (c === P || !c.alive || c.team !== P.team) continue;
      if (c.pos.distanceToSquared(cam.position) > 70 * 70) continue;
      list.push({ key: 'c' + c.id, x: c.pos.x, y: c.pos.y + c.height + 0.45, z: c.pos.z, label: c.name, cls: 'ally' });
    }
    for (const v of g.vehicles) if (v.driver === null && v.alive && v.halfW && v.pos.distanceToSquared(cam.position) < 50 * 50) list.push({ key: 'v' + v.spawn.x, x: v.pos.x, y: 2.6, z: v.pos.z, label: '⛟', cls: 'veh' });
    const seen = new Set();
    for (const m of list) {
      _w.set(m.x, m.y, m.z).project(cam);
      let behind = _w.z > 1;
      let sx = (_w.x * 0.5 + 0.5) * W, sy = (-_w.y * 0.5 + 0.5) * H;
      if (behind) { sx = W - sx; sy = H - 20; }
      const off = behind || sx < 0 || sx > W || sy < 0 || sy > H;
      if (off && !m.clamp) continue;
      if (m.clamp) { sx = clamp(sx, 30, W - 30); sy = clamp(sy, 70, H - 40); }
      let el = this.markerEls.get(m.key);
      if (!el) { el = document.createElement('div'); this.els.hMarkers.appendChild(el); this.markerEls.set(m.key, el); el._lbl = ''; }
      if (el._lbl !== m.label + m.cls) { el._lbl = m.label + m.cls; el.className = 'mk ' + m.cls; el.innerHTML = m.cls.startsWith('obj') ? `<b>${m.label}</b><em></em>` : `<span>${m.label}</span>`; }
      if (m.cls.startsWith('obj')) { const d = Math.round(Math.hypot(m.x - P.pos.x, m.z - P.pos.z)); const em = el.querySelector('em'); if (em && em._d !== d) { em._d = d; em.textContent = d + 'm'; } }
      el.style.transform = `translate(${sx.toFixed(0)}px,${sy.toFixed(0)}px)`;
      seen.add(m.key);
    }
    for (const [k, el] of this.markerEls) if (!seen.has(k)) { el.remove(); this.markerEls.delete(k); }
  }
  drawMinimap() {
    const g = this.g, P = g.player, cv = this.els.hMM, ctx = this.mmCtx;
    const css = cv.clientWidth || 150; const dpr = Math.min(2, window.devicePixelRatio || 1);
    const S = Math.round(css * dpr);
    if (cv.width !== S) { cv.width = S; cv.height = S; }
    const mm = g.map.minimap; const scale = mm.scale;
    const viewR = 48; // metros
    const k = (S / 2) / (viewR * scale);
    ctx.save();
    ctx.clearRect(0, 0, S, S);
    ctx.beginPath(); ctx.arc(S / 2, S / 2, S / 2 - 1, 0, Math.PI * 2); ctx.clip();
    ctx.fillStyle = '#1e2023'; ctx.fillRect(0, 0, S, S);
    ctx.translate(S / 2, S / 2);
    ctx.rotate(P.yaw);
    ctx.scale(k, k);
    const B = g.map.bounds;
    ctx.translate(-(P.pos.x - B.minX) * scale, -(P.pos.z - B.minZ) * scale);
    ctx.globalAlpha = 0.95;
    ctx.drawImage(mm.canvas, 0, 0);
    ctx.globalAlpha = 1;
    const toM = (x, z) => [(x - B.minX) * scale, (z - B.minZ) * scale];
    const r = 2.2 * scale;
    // objetivos
    if (g.mode.worldMarkers) for (const m of g.mode.worldMarkers(P.team)) {
      const [x, z] = toM(m.x, m.z);
      ctx.fillStyle = m.cls === 'a' ? '#3fa7ff' : m.cls === 'e' ? '#ff4d3a' : m.cls === 'bomb' ? '#ffb000' : '#e8e8e8';
      ctx.beginPath(); ctx.arc(x, z, r * 2.2, 0, Math.PI * 2); ctx.globalAlpha = 0.35; ctx.fill(); ctx.globalAlpha = 1;
      ctx.save(); ctx.translate(x, z); ctx.rotate(-P.yaw); ctx.font = `700 ${r * 2.6}px Rajdhani, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#fff'; ctx.fillText(m.label, 0, 0); ctx.restore();
    }
    // aliados / enemigos
    const recon = g.streaks.reconActive(P.team);
    for (const c of g.combatants) {
      if (c === P || !c.alive) continue;
      const enemy = g.isEnemy(c, P);
      if (enemy) {
        const firing = g.time - c.lastShotTime < 1.2 && c.pos.distanceTo(P.pos) < 60;
        const revealed = (recon && c.perk !== 'fantasma') || firing || c.revealedUntil > g.time;
        if (!revealed) continue;
        ctx.fillStyle = '#ff4d3a';
      } else ctx.fillStyle = '#3fa7ff';
      const [x, z] = toM(c.pos.x, c.pos.z);
      ctx.save(); ctx.translate(x, z); ctx.rotate(-c.yaw);
      ctx.beginPath(); ctx.moveTo(0, -r * 1.4); ctx.lineTo(r, r); ctx.lineTo(-r, r); ctx.closePath(); ctx.fill();
      ctx.restore();
    }
    for (const v of g.vehicles) {
      if (!v.halfW || !v.alive) continue;
      const [x, z] = toM(v.pos.x, v.pos.z); ctx.fillStyle = v.driver === P ? '#ffffff' : '#9aa0a6'; ctx.fillRect(x - r, z - r * 1.6, r * 2, r * 3.2);
    }
    for (const a of g.streaks.air) { const [x, z] = toM(a.pos.x, a.pos.z); ctx.fillStyle = a.friendly ? '#3fa7ff' : '#ff4d3a'; ctx.beginPath(); ctx.arc(x, z, r * 1.8, 0, 6.28); ctx.fill(); }
    ctx.restore();
    // jugador (centro)
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.moveTo(S / 2, S / 2 - 7 * dpr); ctx.lineTo(S / 2 + 5 * dpr, S / 2 + 5 * dpr); ctx.lineTo(S / 2, S / 2 + 2 * dpr); ctx.lineTo(S / 2 - 5 * dpr, S / 2 + 5 * dpr); ctx.closePath(); ctx.fill();
    // cono de visión
    ctx.fillStyle = 'rgba(255,255,255,0.07)';
    ctx.beginPath(); ctx.moveTo(S / 2, S / 2); ctx.arc(S / 2, S / 2, S / 2, -Math.PI / 2 - 0.6, -Math.PI / 2 + 0.6); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.25)'; ctx.lineWidth = 1.5 * dpr; ctx.beginPath(); ctx.arc(S / 2, S / 2, S / 2 - 1, 0, 6.28); ctx.stroke();
    // norte
    ctx.save(); ctx.translate(S / 2, S / 2); ctx.rotate(P.yaw); ctx.fillStyle = '#ffb000'; ctx.font = `700 ${11 * dpr}px Rajdhani, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('N', 0, -S / 2 + 10 * dpr); ctx.restore();
  }
}

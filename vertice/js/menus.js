import { view } from './util.js';
// Menús: título, principal (PLAY · LOADOUT · CUSTOMIZE · GAME MODES · SETTINGS · STATS),
// selección de modo, equipamiento, personalización, ajustes, estadísticas, carga,
// resultados y pausa. Todo conectado al perfil persistente.
import { Profile } from './profile.js';
import { Audio } from './audio.js';
import {
  GAME_NAME, GAME_SUB, WEAPONS, PRIMARIES, SECONDARIES, OPTICS, CAMOS, LETHALS, TACTICALS, PERKS, OPERATORS, SKINS,
  HEADGEAR, FACEGEAR, ACCENTS, MODES, DIFFICULTIES, ATMOS, MAP_INFO, STREAKS, CHALLENGES, QUALITY, xpForLevel,
} from './data.js';

export const LOGO = `<svg class="logo-mark" viewBox="0 0 64 64" aria-hidden="true"><path d="M4 12h15l13 31 13-31h15L37 58h-10z" fill="currentColor"/><path d="M32 2v12M26 8h12" stroke="var(--amber)" stroke-width="3.2" stroke-linecap="square"/></svg>`;

const TIPS = [
  'Agacharse reduce la dispersión y tu silueta: la IA tarda más en detectarte.',
  'En DIFÍCIL y ÉLITE los enemigos flanquean: vigila los callejones laterales.',
  'Disparar revela tu posición en el minimapa enemigo durante un instante.',
  'El humo bloquea la visión de la IA. Úsalo para plantar o cruzar calles abiertas.',
  'Hay un alijo secreto con blindaje en el mercado. Busca una grieta en la pared.',
  'La IA ÉLITE presiona cuando te ve recargando. Recarga a cubierto.',
  'Sprint + agacharse = deslizamiento. Ideal para entrar en coberturas.',
  'Los barriles rojos explotan. Úsalos contra grupos enemigos.',
  'Las rachas no se pierden al morir hasta que las uses.',
  'El Jabalí 4x4 atropella, pero su conductor queda expuesto.',
];

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const pct = (v) => Math.round(Math.max(0, Math.min(1, v)) * 100);

function weaponBars(d) {
  const dmg = (d.dmg * d.pellets) / 140, rof = d.rpm / 1000, rng = d.range[1] / 140, acc = 1 - Math.min(1, d.spreadAds / 4.5) * 0.8 - d.spreadHip / 20;
  const mob = (d.move - 0.8) / 0.3, ctl = 1 - Math.min(1, d.recoil.v / 4.8);
  return [['DAÑO', dmg], ['CADENCIA', rof], ['ALCANCE', rng], ['PRECISIÓN', acc], ['MOVILIDAD', mob], ['CONTROL', ctl]]
    .map(([k, v]) => `<div class="bar"><span>${k}</span><i><i style="width:${pct(v)}%"></i></i></div>`).join('');
}

export class Menus {
  constructor(app) {
    this.app = app;
    this.root = document.getElementById('menu');
    this.screen = null; this.flow = false; this.tab = {};
    this.root.addEventListener('click', (e) => this.onClick(e));
    this.root.addEventListener('input', (e) => this.onInput(e));
    this.root.addEventListener('pointerover', (e) => { const b = e.target.closest('button'); if (b && b !== this._hover && e.pointerType === 'mouse') { this._hover = b; Audio.ui2d('ui_hover', 0.25); } });
    // arrastrar para girar el modelo del menú
    let drag = null;
    this.root.addEventListener('pointerdown', (e) => { if (e.target.closest('.m-stage')) drag = view.toLocal(e.clientX, e.clientY)[0]; });
    window.addEventListener('pointermove', (e) => { if (drag !== null) { const x = view.toLocal(e.clientX, e.clientY)[0]; this.app.menuScene.drag(x - drag); drag = x; } });
    window.addEventListener('pointerup', () => { drag = null; });
  }
  get P() { return Profile.data; }
  hide() { this.root.classList.add('hidden'); this.root.innerHTML = ''; this.screen = null; }
  show(name, opts = {}) {
    this.screen = name;
    this.root.classList.remove('hidden');
    this.root.className = 'menu-layer scr-' + name;
    this.root.innerHTML = this['s_' + name](opts);
    const ms = this.app.menuScene;
    if (['main', 'customize', 'modes', 'stats', 'settings'].includes(name)) { ms.view('operator'); this.refreshOperator(); }
    else if (name === 'loadout') { ms.view('weapon'); this.refreshWeapon(); }
    else ms.view('none');
    this.app.menuActive = !['loading', 'pause'].includes(name);
    const first = this.root.querySelector('[data-focus]'); if (first && !this.app.input.touchMode) first.focus({ preventScroll: true });
  }
  refreshOperator() {
    const L = this.P.look, lo = this.P.loadout;
    this.app.menuScene.setOperator(L, lo.primary, lo.camo);
  }
  refreshWeapon(id) {
    const lo = this.P.loadout;
    const tab = this.tab.loadout || 'primary';
    const wid = id || (tab === 'secondary' ? lo.secondary : lo.primary);
    this.app.menuScene.setWeapon(wid, tab === 'secondary' || WEAPONS[wid].slot === 'secondary' ? 'iron' : lo.optic, lo.camo);
  }
  header(title, sub) {
    return `<header class="m-head"><button class="m-back" data-a="back" aria-label="Volver">‹</button><div class="m-brand">${LOGO}<span>${GAME_NAME}</span></div><div class="m-title"><small>${esc(sub || '')}</small><h2>${esc(title)}</h2></div>${this.levelChip()}</header>`;
  }
  levelChip() {
    const P = this.P; const need = xpForLevel(P.level);
    return `<div class="m-lvl"><b>${P.level}</b><div><span>NIVEL</span><i><i style="width:${pct(P.xp / need)}%"></i></i></div></div>`;
  }

  // ------------------------------------------------------------ pantallas
  s_title(o) {
    return `<div class="t-wrap">
      <div class="t-logo">${LOGO}<h1>${GAME_NAME}</h1><p>${GAME_SUB}</p></div>
      <div class="t-load ${o.ready ? 'ready' : ''}" id="tLoad"><i><i id="tBar" style="width:${pct(o.progress || 0)}%"></i></i><span id="tTxt">${o.ready ? '' : 'PREPARANDO EL ARSENAL…'}</span></div>
      <button class="t-start" data-a="start" data-focus ${o.ready ? '' : 'disabled'}>${o.ready ? 'TOCA PARA COMENZAR' : 'CARGANDO…'}</button>
      <small class="t-foot">Prototipo original · Todo el contenido, nombres, mapas y sonidos son propios · Mejor en horizontal</small>
    </div>`;
  }
  setTitleProgress(p, ready) {
    if (this.screen !== 'title') return;
    const b = this.root.querySelector('#tBar'); if (b) b.style.width = pct(p) + '%';
    if (ready) { const s = this.root.querySelector('.t-start'); s.disabled = false; s.textContent = 'TOCA PARA COMENZAR'; this.root.querySelector('#tLoad').classList.add('ready'); this.root.querySelector('#tTxt').textContent = ''; }
  }
  s_main() {
    const P = this.P, lo = P.loadout, op = OPERATORS.find((o) => o.id === P.look.operator) || OPERATORS[0];
    const m = MODES[P.match.mode], d = DIFFICULTIES[P.match.difficulty];
    const items = [
      ['play', 'PLAY', 'Jugar partida'], ['loadout', 'LOADOUT', 'Equipamiento'], ['customize', 'CUSTOMIZE', 'Personalizar'],
      ['modes', 'GAME MODES', 'Modos de juego'], ['settings', 'SETTINGS', 'Ajustes'], ['stats', 'STATS', 'Estadísticas'],
    ];
    return `<div class="m-main">
      <div class="m-side">
        <div class="m-logo">${LOGO}<div><h1>${GAME_NAME}</h1><span>${GAME_SUB}</span></div></div>
        <nav class="m-nav">${items.map(([k, a, b], i) => `<button class="${i === 0 ? 'primary' : ''}" data-a="${k === 'play' ? 'play' : 'go'}" data-v="${k}" ${i === 0 ? 'data-focus' : ''}><b>${a}</b><span>${b}</span></button>`).join('')}</nav>
        <div class="m-quick"><span class="chip">${m.name}</span><span class="chip">${d.name}</span><span class="chip">${MAP_INFO.name}</span></div>
      </div>
      <div class="m-stage" aria-hidden="true"></div>
      <aside class="m-card">
        <div class="pc-name"><small>OPERADOR</small><button data-a="rename" class="pc-n">${esc(P.name)}</button></div>
        ${this.levelChip()}
        <div class="pc-op"><b>${op.name}</b><span>${op.role}</span></div>
        <div class="pc-lo"><div><small>PRINCIPAL</small><b>${WEAPONS[lo.primary].name}</b></div><div><small>SECUNDARIA</small><b>${WEAPONS[lo.secondary].name}</b></div><div><small>VENTAJA</small><b>${PERKS[lo.perk].name}</b></div></div>
        <div class="pc-stats"><div><b>${P.stats.wins}</b><small>VICTORIAS</small></div><div><b>${P.stats.deaths ? (P.stats.kills / P.stats.deaths).toFixed(2) : P.stats.kills}</b><small>B/M</small></div><div><b>${P.stats.bestStreak}</b><small>MEJOR RACHA</small></div></div>
      </aside>
    </div>`;
  }
  s_modes(o) {
    const M = this.P.match; this.flow = !!o.flow;
    const card = (m) => `<button class="mode-card ${M.mode === m.id ? 'on' : ''}" data-a="mode" data-v="${m.id}"><small>${m.tag}</small><b>${m.name}</b><span>${m.desc}</span><em>${m.respawn ? 'Con reaparición' : 'Rondas · sin reaparición'}</em></button>`;
    const seg = (key, list, cur) => `<div class="seg">${list.map(([v, l]) => `<button class="${String(cur) === String(v) ? 'on' : ''}" data-a="match" data-k="${key}" data-v="${v}">${l}</button>`).join('')}</div>`;
    const D = DIFFICULTIES[M.difficulty];
    return `${this.header(this.flow ? 'SELECCIONA EL MODO' : 'MODOS DE JUEGO', this.flow ? 'PASO 1 DE 2' : 'GAME MODES')}
    <div class="m-body m-modes">
      <div class="mode-grid">${Object.values(MODES).map(card).join('')}</div>
      <div class="opts">
        <div class="opt"><label>DIFICULTAD DE LA IA</label>${seg('difficulty', Object.values(DIFFICULTIES).map((d) => [d.id, d.name]), M.difficulty)}<p class="hint">${D.desc}</p></div>
        <div class="opt"><label>ATMÓSFERA · ${MAP_INFO.name}</label>${seg('atmos', Object.values(ATMOS).map((a) => [a.id, a.name]), M.atmos)}<p class="hint">${ATMOS[M.atmos].desc} ${MAP_INFO.desc}</p></div>
        <div class="opt half"><label>DURACIÓN</label>${seg('duration', [[5, '5 MIN'], [8, '8 MIN'], [10, '10 MIN']], M.duration)}</div>
        <div class="opt half ${M.mode === 'ffa' ? 'disabled' : ''}"><label>TAMAÑO DE EQUIPO</label>${seg('teamSize', [[4, '4 vs 4'], [5, '5 vs 5'], [6, '6 vs 6']], M.teamSize)}</div>
      </div>
    </div>
    <footer class="m-foot"><button class="ghost" data-a="back">ATRÁS</button><button class="cta" data-a="toLoadout" data-focus>${this.flow ? 'SIGUIENTE: EQUIPAMIENTO ›' : 'JUGAR ESTE MODO ›'}</button></footer>`;
  }
  s_loadout(o) {
    if (o.flow !== undefined) this.flow = !!o.flow;
    const lo = this.P.loadout; const tab = this.tab.loadout || 'primary';
    const tabs = [['primary', 'PRINCIPAL'], ['secondary', 'SECUNDARIA'], ['optic', 'ÓPTICA'], ['camo', 'CAMUFLAJE'], ['lethal', 'LETAL'], ['tactical', 'TÁCTICA'], ['perk', 'VENTAJA']];
    let list = '', detail = '';
    const item = (kind, id, name, sub, sel, extra = '') => {
      const un = Profile.isUnlocked(kind, id);
      return `<button class="it ${sel ? 'on' : ''} ${un ? '' : 'locked'}" data-a="pick" data-k="${tab}" data-kind="${kind}" data-v="${id}" ${un ? '' : 'aria-disabled="true"'}><b>${name}</b><span>${un ? sub : '🔒 ' + Profile.unlockText(kind, id)}</span>${extra}</button>`;
    };
    if (tab === 'primary' || tab === 'secondary') {
      const ids = tab === 'primary' ? PRIMARIES : SECONDARIES; const cur = lo[tab];
      list = ids.map((id) => item('weapon', id, WEAPONS[id].name, WEAPONS[id].cls, cur === id)).join('');
      const d = WEAPONS[this.preview || cur] || WEAPONS[cur];
      detail = `<div class="det"><small>${d.cls}</small><h3>${d.name}</h3>${weaponBars(d)}<div class="kv"><span>Cargador <b>${d.mag}</b></span><span>Reserva <b>${d.reserve}</b></span><span>Cadencia <b>${d.rpm}</b> dpm</span><span>Recarga <b>${d.reload}s</b></span><span>Modo <b>${d.auto ? 'Automático' : d.pellets > 1 ? 'Corredera' : d.scope ? 'Cerrojo' : 'Semiautomático'}</b></span></div></div>`;
    } else if (tab === 'optic') {
      list = Object.values(OPTICS).map((x) => item('optic', x.id, x.name, `Zoom ${(WEAPONS[lo.primary].zoom * x.zoomMul).toFixed(1)}x`, lo.optic === x.id)).join('');
      detail = `<div class="det"><small>ACCESORIO VISUAL</small><h3>${OPTICS[lo.optic].name}</h3><p>Se monta en el arma principal. ${WEAPONS[lo.primary].scope ? 'El rifle de precisión usa siempre su visor telescópico.' : 'Más aumento = más precisión a distancia, menos campo de visión.'}</p></div>`;
    } else if (tab === 'camo') {
      list = Object.values(CAMOS).map((x) => item('camo', x.id, x.name, 'Camuflaje de arma', lo.camo === x.id, `<i class="sw" style="background:linear-gradient(135deg,${x.colors.join(',')})"></i>`)).join('');
      detail = `<div class="det"><small>CAMUFLAJE</small><h3>${CAMOS[lo.camo].name}</h3><p>Se aplica a todas tus armas.</p></div>`;
    } else if (tab === 'lethal') {
      list = Object.values(LETHALS).map((x) => item('lethal', x.id, x.name, x.desc, lo.lethal === x.id)).join('');
      detail = `<div class="det"><small>EXPLOSIVO LETAL</small><h3>${LETHALS[lo.lethal].name}</h3><p>${LETHALS[lo.lethal].desc} Mantén pulsado para ver la trayectoria y suelta para lanzar.</p></div>`;
    } else if (tab === 'tactical') {
      list = Object.values(TACTICALS).map((x) => item('tactical', x.id, x.name, x.desc, lo.tactical === x.id)).join('');
      detail = `<div class="det"><small>EQUIPO TÁCTICO</small><h3>${TACTICALS[lo.tactical].name}</h3><p>${TACTICALS[lo.tactical].desc}</p></div>`;
    } else if (tab === 'perk') {
      list = Object.values(PERKS).map((x) => item('perk', x.id, x.name, x.desc, lo.perk === x.id)).join('');
      detail = `<div class="det"><small>VENTAJA</small><h3>${PERKS[lo.perk].name}</h3><p>${PERKS[lo.perk].desc}</p></div>`;
    }
    return `${this.header('EQUIPAMIENTO', this.flow ? 'PASO 2 DE 2' : 'LOADOUT')}
    <div class="tabs">${tabs.map(([k, l]) => `<button class="${tab === k ? 'on' : ''}" data-a="tab" data-k="loadout" data-v="${k}">${l}</button>`).join('')}</div>
    <div class="m-body m-split"><div class="list">${list}</div><div class="m-stage"></div><div class="side">${detail}
      <div class="sum"><div><small>PRINCIPAL</small><b>${WEAPONS[lo.primary].name}</b></div><div><small>SECUNDARIA</small><b>${WEAPONS[lo.secondary].name}</b></div><div><small>ÓPTICA</small><b>${OPTICS[lo.optic].name}</b></div><div><small>LETAL / TÁCTICA</small><b>${LETHALS[lo.lethal].name.split(' ')[0]} · ${TACTICALS[lo.tactical].name.split(' ')[0]}</b></div></div>
    </div></div>
    <footer class="m-foot"><button class="ghost" data-a="back">ATRÁS</button>${this.flow ? '<button class="cta" data-a="deploy" data-focus>DESPLEGAR ›</button>' : '<button class="cta" data-a="play">JUGAR ›</button>'}</footer>`;
  }
  s_customize() {
    const L = this.P.look; const tab = this.tab.customize || 'operator';
    const tabs = [['operator', 'OPERADOR'], ['skin', 'ASPECTO'], ['head', 'CABEZA'], ['face', 'ROSTRO'], ['extra', 'EXTRAS']];
    let list = '';
    if (tab === 'operator') list = OPERATORS.map((o) => `<button class="it ${L.operator === o.id ? 'on' : ''}" data-a="look" data-k="operator" data-v="${o.id}"><b>${o.name}</b><span>${o.role} · ${o.full}</span></button>`).join('');
    else if (tab === 'skin') list = Object.values(SKINS).map((s) => { const un = Profile.isUnlocked('skin', s.id); return `<button class="it ${L.skin === s.id ? 'on' : ''} ${un ? '' : 'locked'}" data-a="look" data-k="skin" data-v="${s.id}"><b>${s.name}</b><span>${un ? 'Uniforme y equipo' : '🔒 ' + Profile.unlockText('skin', s.id)}</span><i class="sw" style="background:linear-gradient(135deg,${s.colors.join(',')})"></i></button>`; }).join('');
    else if (tab === 'head') list = Object.values(HEADGEAR).map((h) => `<button class="it ${L.headgear === h.id ? 'on' : ''}" data-a="look" data-k="headgear" data-v="${h.id}"><b>${h.name}</b></button>`).join('');
    else if (tab === 'face') list = Object.values(FACEGEAR).map((h) => `<button class="it ${L.facegear === h.id ? 'on' : ''}" data-a="look" data-k="facegear" data-v="${h.id}"><b>${h.name}</b></button>`).join('');
    else list = `<button class="it ${L.backpack ? 'on' : ''}" data-a="look" data-k="backpack" data-v="${!L.backpack}"><b>Mochila de asalto</b><span>${L.backpack ? 'Equipada' : 'Sin mochila'}</span></button>
      <div class="accents"><small>COLOR DE ACENTO (brazalete)</small><div>${ACCENTS.map((c) => `<button class="acc ${L.accent === c ? 'on' : ''}" style="--c:${c}" data-a="look" data-k="accent" data-v="${c}" aria-label="${c}"></button>`).join('')}</div></div>`;
    const op = OPERATORS.find((o) => o.id === L.operator) || OPERATORS[0];
    return `${this.header('PERSONALIZACIÓN', 'CUSTOMIZE')}
    <div class="tabs">${tabs.map(([k, l]) => `<button class="${tab === k ? 'on' : ''}" data-a="tab" data-k="customize" data-v="${k}">${l}</button>`).join('')}</div>
    <div class="m-body m-split"><div class="list">${list}</div><div class="m-stage"></div><div class="side"><div class="det"><small>${op.role.toUpperCase()}</small><h3>${op.full}</h3><p>${op.bio}</p><p class="hint">Arrastra para girar al operador. En partida, tus aliados llevan acento azul y los enemigos rojo.</p></div></div></div>
    <footer class="m-foot"><button class="ghost" data-a="back">ATRÁS</button><button class="cta" data-a="play">JUGAR ›</button></footer>`;
  }
  s_settings() {
    const S = this.P.settings; const tab = this.tab.settings || 'controls';
    const tabs = [['controls', 'CONTROLES'], ['graphics', 'GRÁFICOS'], ['audio', 'AUDIO'], ['keys', 'TECLADO'], ['data', 'DATOS']];
    const slider = (k, l, min, max, step, fmt = (v) => v) => `<div class="set"><label>${l}<b id="v_${k}">${fmt(S[k])}</b></label><input type="range" data-s="${k}" min="${min}" max="${max}" step="${step}" value="${S[k]}"></div>`;
    const tog = (k, l, d = '') => `<div class="set row"><label>${l}${d ? `<small>${d}</small>` : ''}</label><button class="tog ${S[k] ? 'on' : ''}" data-a="toggle" data-s="${k}" aria-pressed="${!!S[k]}"><i></i></button></div>`;
    const ch = (k, l, opts) => `<div class="set"><label>${l}</label><div class="seg">${opts.map(([v, t]) => `<button class="${String(S[k]) === String(v) ? 'on' : ''}" data-a="choice" data-s="${k}" data-v="${v}">${t}</button>`).join('')}</div></div>`;
    const x2 = (v) => Number(v).toFixed(2);
    let body = '';
    if (tab === 'controls') body = slider('sensX', 'Sensibilidad horizontal', 0.2, 3, 0.05, x2) + slider('sensY', 'Sensibilidad vertical', 0.2, 3, 0.05, x2) + slider('sensAds', 'Sensibilidad al apuntar', 0.2, 1.5, 0.05, x2)
      + slider('aimAssist', 'Asistencia de apuntado', 0, 1, 0.05, (v) => Math.round(v * 100) + '%') + ch('adsMode', 'Apuntar', [['toggle', 'ALTERNAR'], ['hold', 'MANTENER']])
      + tog('invertY', 'Invertir eje vertical') + tog('autoSprint', 'Sprint automático', 'Empuja el joystick al máximo hacia delante') + tog('leftFire', 'Botón de disparo izquierdo')
      + ch('touchControls', 'Controles táctiles', [['auto', 'AUTO'], ['on', 'SIEMPRE'], ['off', 'NUNCA']]) + slider('hudScale', 'Tamaño del HUD y botones', 0.8, 1.3, 0.05, x2) + tog('haptics', 'Vibración');
    else if (tab === 'graphics') body = ch('quality', 'Calidad gráfica (preset)', Object.values(QUALITY).map((q) => [q.id, q.name]))
      + `<p class="hint">${{ low: 'BAJA: sin sombras, texturas 256, menos partículas y distancia corta. Máximo rendimiento.', medium: 'MEDIA: sombras dinámicas 1024, texturas 512, reflejos de entorno.', high: 'ALTA: sombras 2048, texturas 1024, resolución completa y más efectos.' }[S.quality]} Las texturas se aplican en la siguiente partida.</p>`
      + ch('fpsTarget', 'FPS objetivo', [[30, '30'], [60, '60'], [120, '120']]) + tog('dynRes', 'Resolución dinámica', 'Ajusta la resolución para mantener los FPS objetivo')
      + slider('fov', 'Campo de visión', 60, 90, 1, (v) => v + '°') + tog('showFps', 'Mostrar FPS');
    else if (tab === 'audio') body = slider('master', 'Volumen general', 0, 1, 0.05, (v) => Math.round(v * 100)) + slider('music', 'Música', 0, 1, 0.05, (v) => Math.round(v * 100)) + slider('sfx', 'Efectos', 0, 1, 0.05, (v) => Math.round(v * 100));
    else if (tab === 'keys') body = `<div class="keys">${[['WASD', 'Moverse'], ['Ratón', 'Mirar'], ['Clic izq.', 'Disparar'], ['Clic der.', 'Apuntar'], ['R', 'Recargar'], ['Espacio', 'Saltar'], ['C / Ctrl', 'Agacharse · deslizar'], ['Shift', 'Esprintar'], ['Q / 1 / 2 / Rueda', 'Cambiar arma'], ['G', 'Granada (mantener)'], ['T', 'Táctica (mantener)'], ['E / F', 'Interactuar · vehículo'], ['3 / 4 / 5', 'Rachas'], ['Tab', 'Marcador'], ['Esc / P', 'Pausa']].map(([k, a]) => `<div><kbd>${k}</kbd><span>${a}</span></div>`).join('')}</div>
      <p class="hint">En móvil: joystick flotante a la izquierda, arrastra a la derecha para mirar (también mientras disparas). Mantén granada para ver la trayectoria.</p>`;
    else body = `<div class="set"><label>Perfil</label><p class="hint">Tu progreso se guarda en este dispositivo.</p><button class="danger" data-a="resetProgress">RESTABLECER PROGRESO</button></div>`;
    return `${this.header('AJUSTES', 'SETTINGS')}
    <div class="tabs">${tabs.map(([k, l]) => `<button class="${tab === k ? 'on' : ''}" data-a="tab" data-k="settings" data-v="${k}">${l}</button>`).join('')}</div>
    <div class="m-body m-settings"><div class="sets">${body}</div></div>
    <footer class="m-foot"><button class="cta" data-a="back" data-focus>GUARDAR</button></footer>`;
  }
  s_stats() {
    const P = this.P, S = P.stats;
    const kd = S.deaths ? (S.kills / S.deaths).toFixed(2) : S.kills;
    const acc = S.shots ? Math.round((S.hits / S.shots) * 100) + '%' : '—';
    const mins = Math.round(S.playTime / 60);
    const cell = (v, l) => `<div class="st"><b>${v}</b><small>${l}</small></div>`;
    const wk = Object.entries(S.weaponKills).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([w, k]) => `<div class="wk"><span>${WEAPONS[w] ? WEAPONS[w].name : w}</span><b>${k}</b></div>`).join('') || '<p class="hint">Sin datos todavía.</p>';
    const ch = CHALLENGES.map((c) => { const v = Profile.challengeProgress(c); const done = P.claimed[c.id]; return `<div class="ch ${done ? 'done' : ''}"><div><b>${c.name}</b><span>${c.desc}</span></div><i><i style="width:${pct(v / c.goal)}%"></i></i><em>${done ? 'COMPLETADO' : `${v}/${c.goal}`} · ${c.xp} XP</em></div>`; }).join('');
    return `${this.header('ESTADÍSTICAS', 'STATS')}
    <div class="m-body m-stats">
      <div class="grid">${cell(S.matches, 'PARTIDAS')}${cell(S.wins, 'VICTORIAS')}${cell(S.losses, 'DERROTAS')}${cell(S.kills, 'BAJAS')}${cell(S.deaths, 'MUERTES')}${cell(kd, 'B/M')}${cell(S.assists, 'ASISTENCIAS')}${cell(S.headshots, 'A LA CABEZA')}${cell(acc, 'PRECISIÓN')}${cell(S.bestStreak, 'MEJOR RACHA')}${cell(S.captures, 'CAPTURAS')}${cell(S.objectives, 'OBJETIVOS')}${cell(S.bestScore, 'MEJOR PUNTUACIÓN')}${cell(mins + ' min', 'TIEMPO DE JUEGO')}</div>
      <div class="cols"><div><h4>RETOS</h4>${ch}</div><div><h4>ARMAS FAVORITAS</h4>${wk}<h4>RACHAS</h4>${STREAKS.map((s) => `<div class="wk"><span>${s.icon} ${s.name}</span><b>${s.kills}</b></div>`).join('')}</div></div>
    </div>
    <footer class="m-foot"><button class="cta" data-a="back" data-focus>VOLVER</button></footer>`;
  }
  s_loading(o) {
    const M = o.cfg; const m = MODES[M.mode];
    return `<div class="ld"><div class="ld-map"><small>DESPLEGANDO EN</small><h1>${MAP_INFO.name}</h1><p>${MAP_INFO.desc}</p>
      <div class="chips"><span class="chip">${m.name}</span><span class="chip">IA ${DIFFICULTIES[M.difficulty].name}</span><span class="chip">${ATMOS[M.atmos].name}</span><span class="chip">${M.mode === 'ffa' ? '8 OPERADORES' : M.teamSize + ' vs ' + M.teamSize}</span></div></div>
      <div class="ld-bar"><i><i id="ldBar"></i></i><span id="ldTxt">Preparando…</span></div>
      <p class="ld-tip"><b>CONSEJO</b> ${TIPS[Math.floor(Math.random() * TIPS.length)]}</p></div>`;
  }
  setLoading(p, txt) {
    const b = this.root.querySelector('#ldBar'); if (b) b.style.width = pct(p) + '%';
    const t = this.root.querySelector('#ldTxt'); if (t && txt) t.textContent = txt;
  }
  s_results(o) {
    const R = o.summary; const me = R.me;
    const title = R.outcome === 'win' ? 'VICTORIA' : R.outcome === 'loss' ? 'DERROTA' : 'EMPATE';
    const teams = !!R.teamScores;
    const row = (p) => `<tr class="${p.me ? 'me' : ''} ${teams ? (p.team === 0 ? 'ta' : 'te') : ''}"><td>${esc(p.name)}</td><td>${p.score}</td><td>${p.kills}</td><td>${p.deaths}</td><td>${p.assists}</td></tr>`;
    const xp = R.xp; const lvlUp = R.lvlAfter > R.lvlBefore;
    return `<div class="rs ${R.outcome}">
      <div class="rs-banner"><small>${R.mode.name} · ${R.diff.name} · ${MAP_INFO.name}</small><h1>${title}</h1><p>${esc(R.reason)}</p>
        ${teams ? `<div class="rs-score"><b class="a">${R.teamScores[0]}</b><span>—</span><b class="e">${R.teamScores[1]}</b></div>` : `<div class="rs-score"><b class="a">#${R.ffaPlace}</b><span>de ${R.players.length}</span></div>`}</div>
      <div class="rs-body">
        <div class="rs-me">
          <div class="grid">${[[me.score, 'PUNTOS'], [me.kills, 'BAJAS'], [me.deaths, 'MUERTES'], [me.assists, 'ASISTENCIAS'], [me.deaths ? (me.kills / me.deaths).toFixed(2) : me.kills, 'B/M'], [me.accuracy + '%', 'PRECISIÓN'], [me.headshots, 'A LA CABEZA'], [me.bestStreak, 'MEJOR RACHA'], ...(R.cfg.mode === 'dom' ? [[me.captures, 'CAPTURAS'], [me.defends, 'DEFENSAS']] : []), ...(R.cfg.mode === 'sab' ? [[me.plants, 'PLANTADAS'], [me.defuses, 'DESACTIVADAS']] : [])].map(([v, l]) => `<div class="st"><b>${v}</b><small>${l}</small></div>`).join('')}</div>
          <div class="xp"><h4>EXPERIENCIA +${R.xpTotal}</h4><div class="xpl"><span>Puntuación</span><b>${xp.score}</b></div><div class="xpl"><span>${title === 'VICTORIA' ? 'Victoria' : title === 'EMPATE' ? 'Empate' : 'Participación'}</span><b>${xp.result}</b></div><div class="xpl"><span>Tiempo en combate</span><b>${xp.time}</b></div>
            <div class="xpbar"><b>NV ${R.lvlAfter}</b><i><i id="rsXp" style="width:${lvlUp ? 0 : pct(R.xpBefore / xpForLevel(R.lvlBefore))}%" data-to="${pct(R.xpAfter / R.xpNeed)}"></i></i></div>
            ${lvlUp ? `<div class="lvlup">¡SUBES AL NIVEL ${R.lvlAfter}!</div>` : ''}
            ${R.unlocks.length ? `<div class="unl"><h4>DESBLOQUEADO</h4>${R.unlocks.map((u) => `<span>${esc(u)}</span>`).join('')}</div>` : ''}
            ${R.challenges.length ? `<div class="unl"><h4>RETOS COMPLETADOS</h4>${R.challenges.map((c) => `<span>${esc(c.name)} (+${c.xp} XP)</span>`).join('')}</div>` : ''}
          </div>
        </div>
        <div class="rs-board"><table><tr><th>OPERADOR</th><th>PUNTOS</th><th>B</th><th>M</th><th>A</th></tr>${R.players.map(row).join('')}</table></div>
      </div>
      <footer class="m-foot"><button class="ghost" data-a="go" data-v="main">MENÚ</button><button class="ghost" data-a="go" data-v="loadout">EQUIPAMIENTO</button><button class="cta" data-a="again" data-focus>JUGAR DE NUEVO ›</button></footer>
    </div>`;
  }
  s_pause() {
    const S = this.P.settings; const g = this.app.game;
    const m = g ? g.mode.def : MODES.tdm;
    const sl = (k, l, min, max, step) => `<div class="set"><label>${l}<b id="v_${k}">${Number(S[k]).toFixed(2)}</b></label><input type="range" data-s="${k}" min="${min}" max="${max}" step="${step}" value="${S[k]}"></div>`;
    return `<div class="pz"><div class="pz-box"><small>${m.name} · PAUSA</small><h2>${GAME_NAME}</h2>
      <button class="cta" data-a="resume" data-focus>CONTINUAR</button>
      <div class="pz-sets">${sl('sensX', 'Sensibilidad H', 0.2, 3, 0.05)}${sl('sensY', 'Sensibilidad V', 0.2, 3, 0.05)}${sl('sensAds', 'Sens. al apuntar', 0.2, 1.5, 0.05)}${sl('aimAssist', 'Asistencia de apuntado', 0, 1, 0.05)}${sl('sfx', 'Efectos', 0, 1, 0.05)}${sl('music', 'Música', 0, 1, 0.05)}</div>
      <button class="danger" data-a="quit">ABANDONAR PARTIDA</button></div></div>`;
  }

  // ------------------------------------------------------------ interacción
  onClick(e) {
    const b = e.target.closest('[data-a]');
    if (!b || b.disabled) return;
    const a = b.dataset.a, v = b.dataset.v, k = b.dataset.k;
    const P = this.P;
    Audio.init(); Audio.resume();
    if (a !== 'start') Audio.ui2d(a === 'back' ? 'ui_back' : 'ui_click', 0.5);
    switch (a) {
      case 'start': this.app.onStartTap(); break;
      case 'go': this.show(v, {}); break;
      case 'play': this.show('modes', { flow: true }); break;
      case 'back': this.goBack(); break;
      case 'mode': P.match.mode = v; Profile.save(); this.show('modes', { flow: this.flow }); break;
      case 'match': P.match[k] = isNaN(Number(v)) ? v : Number(v); Profile.save(); this.show('modes', { flow: this.flow }); break;
      case 'toLoadout': this.show('loadout', { flow: true }); break;
      case 'deploy': Audio.ui2d('ui_confirm', 0.7); this.app.startMatch(); break;
      case 'again': this.app.startMatch(); break;
      case 'tab': this.tab[k] = v; this.preview = null; this.show(this.screen, {}); break;
      case 'pick': {
        const kind = b.dataset.kind;
        if (!Profile.isUnlocked(kind, v)) { Audio.ui2d('ui_alert', 0.4); this.toast('Bloqueado · ' + Profile.unlockText(kind, v)); if (kind === 'weapon') { this.preview = v; this.app.menuScene.setWeapon(v, 'iron', P.loadout.camo); } return; }
        P.loadout[k] = v; Profile.save(); this.preview = null;
        this.show('loadout', {});
        break;
      }
      case 'look': {
        if (k === 'skin' && !Profile.isUnlocked('skin', v)) { Audio.ui2d('ui_alert', 0.4); this.toast('Bloqueado · ' + Profile.unlockText('skin', v)); return; }
        P.look[k] = k === 'backpack' ? v === 'true' : v; Profile.save(); this.show('customize', {}); break;
      }
      case 'toggle': P.settings[b.dataset.s] = !P.settings[b.dataset.s]; Profile.save(); this.app.applySettings(); this.show('settings', {}); break;
      case 'choice': { const s = b.dataset.s; P.settings[s] = isNaN(Number(v)) ? v : Number(v); Profile.save(); this.app.applySettings(); this.show('settings', {}); break; }
      case 'rename': {
        const inp = document.createElement('input');
        inp.id = 'pcName'; inp.className = 'pc-in'; inp.maxLength = 14; inp.value = P.name; inp.setAttribute('aria-label', 'Nombre de operador');
        b.replaceWith(inp); inp.focus(); inp.select();
        let done = false;
        const commit = (save) => { if (done) return; done = true; const n = inp.value.trim(); if (save && n) { P.name = n.slice(0, 14).toUpperCase(); Profile.save(); } setTimeout(() => this.show('main'), 0); };
        inp.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') commit(true); if (ev.key === 'Escape') commit(false); });
        inp.addEventListener('blur', () => commit(true));
        break;
      }
      case 'resetProgress':
        if (b.dataset.armed) { Profile.reset(); this.app.applySettings(); this.show('main'); }
        else { b.dataset.armed = '1'; b.textContent = 'PULSA OTRA VEZ PARA BORRAR TODO'; setTimeout(() => { if (b.isConnected) { delete b.dataset.armed; b.textContent = 'RESTABLECER PROGRESO'; } }, 4000); }
        break;
      case 'resume': this.hide(); this.app.resumeGame(); break;
      case 'quit': this.app.quitMatch(); break;
      default: break;
    }
  }
  onInput(e) {
    const el = e.target; const k = el.dataset && el.dataset.s;
    if (!k) return;
    const v = Number(el.value);
    this.P.settings[k] = v;
    const lbl = this.root.querySelector('#v_' + k);
    if (lbl) lbl.textContent = ['master', 'music', 'sfx'].includes(k) && this.screen === 'settings' ? Math.round(v * 100) : k === 'aimAssist' && this.screen === 'settings' ? Math.round(v * 100) + '%' : k === 'fov' ? v + '°' : v.toFixed(2);
    Profile.save();
    this.app.applySettings();
  }
  goBack() {
    const s = this.screen;
    if (s === 'loadout' && this.flow) this.show('modes', { flow: true });
    else if (s === 'pause') { this.hide(); this.app.resumeGame(); }
    else this.show('main');
  }
  toast(msg) {
    let t = this.root.querySelector('.toast');
    if (!t) { t = document.createElement('div'); t.className = 'toast'; this.root.appendChild(t); }
    t.textContent = msg; t.classList.add('show');
    clearTimeout(this._tt); this._tt = setTimeout(() => t.classList.remove('show'), 1800);
  }
  animateResults() {
    const x = this.root.querySelector('#rsXp');
    if (x) setTimeout(() => { x.style.width = x.dataset.to + '%'; }, 400);
  }
}

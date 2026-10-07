// Perfil persistente: ajustes, equipamiento, personalización, estadísticas y progresión
import { WEAPONS, OPTICS, CAMOS, SKINS, LETHALS, TACTICALS, PERKS, CHALLENGES, MAX_LEVEL, xpForLevel } from './data.js';

const KEY = 'vertice_profile_v1';

function defaults() {
  const touch = typeof window !== 'undefined' && ('ontouchstart' in window || navigator.maxTouchPoints > 0);
  return {
    version: 1,
    name: 'OPERADOR',
    settings: {
      sensX: 1.0, sensY: 1.0, sensAds: 0.75, invertY: false,
      aimAssist: touch ? 0.6 : 0.0, adsMode: touch ? 'toggle' : 'hold',
      quality: touch ? 'medium' : 'high', fpsTarget: 60, dynRes: true, fov: 72,
      master: 0.85, music: 0.55, sfx: 0.9,
      showFps: false, hudScale: 1.0, autoSprint: true, leftFire: true, haptics: true,
      touchControls: touch ? 'on' : 'auto',
    },
    match: { mode: 'tdm', difficulty: 'normal', atmos: 'dusk', duration: 8, teamSize: 5 },
    loadout: { primary: 'vx9', secondary: 'ronin', optic: 'dot', camo: 'pavonado', lethal: 'frag', tactical: 'smoke', perk: 'kevlar' },
    look: { operator: 'raya', skin: 'urbano', headgear: 'default', facegear: 'default', backpack: true, accent: '#3fa7ff' },
    stats: {
      matches: 0, wins: 0, losses: 0, draws: 0, kills: 0, deaths: 0, assists: 0, headshots: 0,
      shots: 0, hits: 0, score: 0, bestStreak: 0, explosiveKills: 0, captures: 0, objectives: 0,
      playTime: 0, eliteWins: 0, weaponKills: {}, bestScore: 0,
    },
    xp: 0, level: 1,
    claimed: {}, // retos completados
  };
}

function merge(base, saved) {
  if (!saved || typeof saved !== 'object') return base;
  for (const k of Object.keys(base)) {
    if (!(k in saved)) continue;
    const b = base[k], s = saved[k];
    if (b && typeof b === 'object' && !Array.isArray(b)) base[k] = merge(b, s);
    else if (typeof s === typeof b) base[k] = s;
  }
  // claves libres (weaponKills, claimed)
  if (saved.weaponKills && base.weaponKills) Object.assign(base.weaponKills, saved.weaponKills);
  if (saved.claimed && base.claimed) Object.assign(base.claimed, saved.claimed);
  return base;
}

export const Profile = {
  data: defaults(),
  load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) this.data = merge(defaults(), JSON.parse(raw));
    } catch (e) { /* almacenamiento no disponible: usar valores por defecto */ }
    this.validate();
    return this.data;
  },
  save() {
    try { localStorage.setItem(KEY, JSON.stringify(this.data)); } catch (e) { /* ignorar */ }
  },
  reset() { this.data = defaults(); this.save(); },
  get s() { return this.data.settings; },

  // ---- desbloqueos
  isUnlocked(kind, id) {
    const lvl = this.data.level;
    let def;
    if (kind === 'weapon') def = WEAPONS[id];
    else if (kind === 'optic') def = OPTICS[id];
    else if (kind === 'camo') def = CAMOS[id];
    else if (kind === 'skin') def = SKINS[id];
    else if (kind === 'lethal') def = LETHALS[id];
    else if (kind === 'tactical') def = TACTICALS[id];
    else if (kind === 'perk') def = PERKS[id];
    if (!def) return false;
    if (def.challenge) return !!this.data.claimed[def.challenge];
    return lvl >= (def.unlock || 1);
  },
  unlockText(kind, id) {
    const map = { weapon: WEAPONS, optic: OPTICS, camo: CAMOS, skin: SKINS, lethal: LETHALS, tactical: TACTICALS, perk: PERKS }[kind];
    const def = map && map[id];
    if (!def) return '';
    if (def.challenge) { const c = CHALLENGES.find((x) => x.id === def.challenge); return `Reto: ${c ? c.name : def.challenge}`; }
    return `Nivel ${def.unlock || 1}`;
  },
  validate() {
    const L = this.data.loadout;
    if (!WEAPONS[L.primary] || !this.isUnlocked('weapon', L.primary)) L.primary = 'vx9';
    if (!WEAPONS[L.secondary] || !this.isUnlocked('weapon', L.secondary)) L.secondary = 'ronin';
    if (!OPTICS[L.optic] || !this.isUnlocked('optic', L.optic)) L.optic = 'dot';
    if (!CAMOS[L.camo] || !this.isUnlocked('camo', L.camo)) L.camo = 'pavonado';
    if (!LETHALS[L.lethal] || !this.isUnlocked('lethal', L.lethal)) L.lethal = 'frag';
    if (!TACTICALS[L.tactical] || !this.isUnlocked('tactical', L.tactical)) L.tactical = 'smoke';
    if (!PERKS[L.perk] || !this.isUnlocked('perk', L.perk)) L.perk = 'kevlar';
    const K = this.data.look;
    if (!SKINS[K.skin] || !this.isUnlocked('skin', K.skin)) K.skin = 'urbano';
  },

  // ---- progresión
  addXp(amount) {
    const d = this.data;
    const before = d.level;
    d.xp += Math.max(0, Math.round(amount));
    while (d.level < MAX_LEVEL && d.xp >= xpForLevel(d.level)) {
      d.xp -= xpForLevel(d.level);
      d.level++;
    }
    if (d.level >= MAX_LEVEL) d.xp = Math.min(d.xp, xpForLevel(MAX_LEVEL));
    return d.level - before;
  },
  challengeProgress(c) {
    const v = this.data.stats[c.stat] || 0;
    return Math.min(v, c.goal);
  },
  // Comprueba retos y aplica recompensas. Devuelve los recién completados.
  checkChallenges() {
    const done = [];
    for (const c of CHALLENGES) {
      if (this.data.claimed[c.id]) continue;
      if ((this.data.stats[c.stat] || 0) >= c.goal) {
        this.data.claimed[c.id] = true;
        this.addXp(c.xp);
        done.push(c);
      }
    }
    return done;
  },
};

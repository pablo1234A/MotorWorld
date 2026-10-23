/* =====================================================================
 * RÉTAME — aplicación del navegador
 * El HTML de cada página ya llega completo desde el servidor. Este
 * script añade el juego, el progreso local, los duelos y la publicidad
 * (si está configurada) encima de ese contenido.
 * =================================================================== */
var PAGE = document.body.getAttribute("data-page") || "";
function siteOrigin() { return CONFIG.siteUrl || location.origin; }
/* Enlace absoluto para compartir. Acepta rutas de href() en cualquiera
 * de los dos modos. En el archivo único sin dominio, el enlace apunta al
 * propio archivo (solo sirve en este dispositivo). */
function absUrl(u) {
  var base = CONFIG.basePath || "";
  var p = u.charAt(0) === "#" ? u.slice(1) : u.slice(base.length);
  if (isStandalone()) return CONFIG.siteUrl ? CONFIG.siteUrl + base + p : location.href.split("#")[0] + "#" + p;
  return siteOrigin() + base + p;
}

/* --- Utilidades de DOM ------------------------------------------------ */
function $(s, r) { return (r || document).querySelector(s); }
function $$(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
function reducedMotion() { return !!(window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches); }
function restartAnim(el, cls) { el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls); }
function randomSeed() { return Math.floor(Math.random() * 4294967296); }
var toastTimer = null;
function toast(msg) {
  var t = $("[data-toast]"); if (!t) return;
  t.textContent = msg; t.hidden = false; restartAnim(t, "anim-rise");
  clearTimeout(toastTimer); toastTimer = setTimeout(function () { t.hidden = true; }, 3800);
}
function count(node, target, from) {
  if (!node) return;
  from = from || 0;
  var start = Date.now(), dur = 650;
  if (reducedMotion() || typeof requestAnimationFrame !== "function") { node.textContent = fmt(target); return; }
  (function step() {
    var p = Math.min(1, (Date.now() - start) / dur), e = 1 - Math.pow(1 - p, 3);
    node.textContent = fmt(Math.round(from + (target - from) * e));
    if (p < 1) requestAnimationFrame(step);
  })();
}
function copyText(textValue, button, okLabel) {
  var original = button ? button.innerHTML : "";
  function done() { if (button) { button.textContent = okLabel || "¡Copiado!"; setTimeout(function () { button.innerHTML = original; }, 2000); } }
  function fallback() {
    try {
      var el = document.createElement("textarea");
      el.value = textValue; el.setAttribute("readonly", ""); el.style.position = "fixed"; el.style.opacity = "0";
      document.body.appendChild(el); el.select(); el.setSelectionRange(0, 99999);
      var okc = document.execCommand("copy"); document.body.removeChild(el);
      if (okc) done(); else toast("No se pudo copiar. Mantén pulsado el enlace para copiarlo.");
    } catch (e) { toast("No se pudo copiar. Mantén pulsado el enlace para copiarlo."); }
  }
  if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(textValue).then(done).catch(fallback);
  else fallback();
}
function getParams() {
  var q = {};
  var src = location.search;
  if (isStandalone()) { var h = location.hash, i = h.indexOf("?"); src = i >= 0 ? h.slice(i) : ""; }
  try { new URLSearchParams(src).forEach(function (v, k) { q[k] = v; }); } catch (e) { /* navegador antiguo */ }
  return q;
}
/* Evento de producto. No sale del navegador salvo que conectes una
 * herramienta de analítica (ver CONFIG.analytics y README). */
function queryWithout(key) {
  var q = getParams(), parts = [];
  Object.keys(q).forEach(function (k) { if (k !== key) parts.push(encodeURIComponent(k) + "=" + encodeURIComponent(q[k])); });
  return parts.length ? "?" + parts.join("&") : "";
}
function track(name, props) {
  try {
    window.dispatchEvent(new CustomEvent("retame:event", { detail: { name: name, props: props || {} } }));
    if (CONFIG.analytics && CONFIG.analytics.enabled && typeof window.retameTrack === "function") window.retameTrack(name, props || {});
  } catch (e) { /* nunca rompe el juego */ }
}

/* =====================================================================
 * Almacenamiento local v2 (migra desde v1 sin borrar nada)
 * =================================================================== */
var KEY = "retame:v2", OLD_KEY = "retame:v1", mem = null, storageOk = true;
function blank() {
  return {
    v: 2, history: [], best: {}, streak: { current: 0, best: 0, total_days: 0, last_day: null }, ach: {}, daily: {}, dailyRun: null,
    nick: "", duels: 0, duelWins: 0, points: 0, games: 0, seenByCat: {}, recent: [], recentSigs: [], famCount: {}, days: {}, catStats: {},
    accSum: 0, accN: 0, logicWins: 0, sessions: 0, bestSession: 0,
    records: { bestDaily: 0, bestDailyDay: "", bestDailyAcc: 0, fastestDaily: 0, perfects: 0, bestPoints: 0 }
  };
}
function asObj(v) { return v && typeof v === "object" && !Array.isArray(v) ? v : {}; }
function asArr(v) { return Array.isArray(v) ? v : []; }
function asNum(v) { v = Number(v); return isFinite(v) && v >= 0 ? v : 0; }
function asStr(v, max) { return typeof v === "string" ? v.slice(0, max || 200) : ""; }
/* Acepta datos de cualquier versión y devuelve un estado con tipos
 * correctos: un localStorage corrupto o editado a mano no rompe la web. */
function sanitize(o) {
  var b = blank();
  o = asObj(o);
  b.history = asArr(o.history).filter(function (h) { return h && typeof h.slug === "string"; }).slice(0, 80).map(function (h) {
    return { slug: asStr(h.slug, 120), title: asStr(h.title, 120), cat: asStr(h.cat || h.category, 30), points: asNum(h.points), accuracy: Math.min(100, asNum(h.accuracy)), seconds: asNum(h.seconds), at: asNum(h.at), daily: !!h.daily, grid: asStr(h.grid, 10) };
  });
  Object.keys(asObj(o.best)).forEach(function (k) { var x = asObj(o.best[k]); b.best[k.slice(0, 120)] = { points: asNum(x.points), seconds: asNum(x.seconds), accuracy: Math.min(100, asNum(x.accuracy)) }; });
  var s = asObj(o.streak);
  b.streak = { current: asNum(s.current), best: asNum(s.best), total_days: asNum(s.total_days), last_day: validDay(s.last_day) ? s.last_day : null };
  Object.keys(asObj(o.ach)).forEach(function (k) { b.ach[k] = asNum(o.ach[k]) || 1; });
  Object.keys(asObj(o.daily)).forEach(function (k) {
    if (!validDay(k)) return;
    var d = asObj(o.daily[k]);
    b.daily[k] = { points: asNum(d.points), v: d.v === 2 ? 2 : 1, acc: Math.min(100, asNum(d.acc)), secs: asNum(d.secs), grid: asStr(d.grid, 10) };
  });
  var run = asObj(o.dailyRun);
  if (validDay(run.day) && Array.isArray(run.results)) b.dailyRun = { day: run.day, sig: asStr(run.sig, 20), secs: asNum(run.secs), results: run.results.slice(0, 5).map(function (r) { r = asObj(r); return { points: asNum(r.points), accuracy: Math.min(100, asNum(r.accuracy)), seconds: asNum(r.seconds) }; }) };
  b.nick = asStr(o.nick, 24);
  ["duels", "duelWins", "points", "games", "accSum", "accN", "logicWins", "sessions", "bestSession"].forEach(function (k) { b[k] = asNum(o[k]); });
  Object.keys(asObj(o.seenByCat)).forEach(function (k) { b.seenByCat[k] = asArr(o.seenByCat[k]).filter(function (x) { return typeof x === "string"; }).slice(-400); });
  b.recent = asArr(o.recent).filter(function (h) { return h && typeof h === "object"; }).slice(-12);
  b.recentSigs = asArr(o.recentSigs).filter(function (x) { return typeof x === "string"; }).slice(-500);
  Object.keys(asObj(o.famCount)).forEach(function (k) { b.famCount[k] = asNum(o.famCount[k]); });
  Object.keys(asObj(o.days)).forEach(function (k) { if (validDay(k)) { var d = asObj(o.days[k]); b.days[k] = { points: asNum(d.points), games: asNum(d.games) }; } });
  Object.keys(asObj(o.catStats)).forEach(function (k) { var c = asObj(o.catStats[k]); b.catStats[k] = { g: asNum(c.g), acc: asNum(c.acc), n: asNum(c.n) }; });
  var r = asObj(o.records);
  Object.keys(b.records).forEach(function (k) { b.records[k] = k === "bestDailyDay" ? asStr(r[k], 10) : asNum(r[k]); });
  return b;
}
/* v1 → v2: 14 categorías → 8, sin perder rachas, logros ni marcas. */
function migrateV1(o) {
  o = asObj(o);
  var mapCat = function (c) { return LEGACY_CATS[c] || c; };
  asArr(o.history).forEach(function (h) { if (h && h.cat) h.cat = mapCat(h.cat); });
  asArr(o.recent).forEach(function (h) { if (h && h.cat) h.cat = mapCat(h.cat); });
  var seen = {}, stats = {};
  Object.keys(asObj(o.seenByCat)).forEach(function (k) { var n = mapCat(k); seen[n] = (seen[n] || []).concat(asArr(o.seenByCat[k])); });
  Object.keys(asObj(o.catStats)).forEach(function (k) {
    var n = mapCat(k), c = asObj(o.catStats[k]), t = stats[n] || { g: 0, acc: 0, n: 0 };
    t.g += asNum(c.g); t.acc += asNum(c.acc); t.n += asNum(c.n); stats[n] = t;
  });
  o.seenByCat = seen; o.catStats = stats;
  var out = sanitize(o);
  Object.keys(out.best).forEach(function (k) { out.records.bestPoints = Math.max(out.records.bestPoints, out.best[k].points); });
  out.migratedFrom = 1;
  return out;
}
function state() {
  if (mem) return mem;
  var raw = null;
  try { raw = localStorage.getItem(KEY); } catch (e) { storageOk = false; }
  if (raw) {
    try { mem = sanitize(JSON.parse(raw)); }
    catch (e) {
      /* Datos ilegibles: se guarda una copia antes de empezar de nuevo. */
      try { localStorage.setItem(KEY + ":corrupto", raw); } catch (e2) { /* sin espacio */ }
      mem = blank();
    }
    return mem;
  }
  mem = blank();
  try {
    var old = localStorage.getItem(OLD_KEY);
    if (old) { mem = migrateV1(JSON.parse(old)); save(); }
  } catch (e) { mem = blank(); }
  return mem;
}
function save() { try { localStorage.setItem(KEY, JSON.stringify(mem)); } catch (e) { storageOk = false; } }
function resetAll() {
  mem = blank();
  try { localStorage.removeItem(KEY); localStorage.removeItem(OLD_KEY); localStorage.removeItem(KEY + ":corrupto"); } catch (e) { /* ignorar */ }
}
function streakNow() {
  var s = state().streak, today = dayInTz();
  if (!s.last_day) return 0;
  return (s.last_day === today || s.last_day === addDay(today, -1)) ? s.current : 0;
}
function updateStreakChip() {
  var n = streakNow();
  $$("[data-streak]").forEach(function (el) { el.textContent = n; });
  var chip = $(".streak-chip");
  if (chip) {
    chip.classList.toggle("is-on", n > 0); chip.classList.toggle("is-hot", n >= 3);
    chip.setAttribute("aria-label", "Racha: " + n + (n === 1 ? " día" : " días") + ". Ver mi progreso");
  }
}
function dailyDone(day) { var d = state().daily[day || dayInTz()]; return d && d.v === 2 ? d : null; }

/* =====================================================================
 * Logros y registro de partidas
 * =================================================================== */
var ACH = [
  { code: "primer_reto", name: "Primer reto", desc: "Completa tu primer reto.", test: function () { return true; } },
  { code: "reto_diario", name: "Cita diaria", desc: "Completa un reto del día.", test: function (x) { return !!x.daily; } },
  { code: "sin_fallos", name: "Sin fallos", desc: "100 % de precisión en un reto.", test: function (x) { return x.res.accuracy === 100 && !x.opinion; } },
  { code: "relampago", name: "Relámpago", desc: "Sin fallos y en menos de la mitad del tiempo orientativo.", test: function (x) { return x.res.accuracy === 100 && !x.opinion && x.ch && x.seconds <= x.ch.duration / 2; } },
  { code: "diario_perfecto", name: "Día redondo", desc: "Todas las pruebas del reto del día sin un fallo.", test: function (x) { return x.daily && x.res.accuracy === 100; } },
  { code: "record", name: "Nuevo récord", desc: "Supera tu propia marca.", test: function (x) { return x.record; } },
  { code: "racha_3", name: "Tres seguidos", desc: "Racha de 3 días.", test: function (x) { return x.st.streak.current >= 3; } },
  { code: "racha_7", name: "Semana redonda", desc: "Racha de 7 días.", test: function (x) { return x.st.streak.current >= 7; } },
  { code: "racha_30", name: "Nivel leyenda", desc: "Racha de 30 días.", test: function (x) { return x.st.streak.current >= 30; } },
  { code: "diez_partidas", name: "Diez partidas", desc: "Juega diez retos.", test: function (x) { return x.st.games >= 10; } },
  { code: "explorador", name: "Explorador", desc: "Juega en seis categorías distintas.", test: function (x) { return Object.keys(x.st.catStats).filter(function (c) { return catBySlug[c] && !catBySlug[c].hidden; }).length >= 6; } },
  { code: "maestro_logica", name: "Maestro de la lógica", desc: "Supera 10 retos de lógica con un 80 % o más.", test: function (x) { return x.st.logicWins >= 10; } },
  { code: "sesion", name: "Sesión completa", desc: "Termina una sesión de 10 retos.", test: function () { return false; } },
  { code: "retador", name: "Retador", desc: "Envía tu primer duelo.", test: function () { return false; } },
  { code: "duelo_ganado", name: "Ganas el duelo", desc: "Supera la marca de quien te retó.", test: function () { return false; } }
];
function unlock(code) {
  var st = state();
  if (st.ach[code]) return null;
  st.ach[code] = Date.now(); save();
  for (var i = 0; i < ACH.length; i++) if (ACH[i].code === code) return ACH[i];
  return null;
}
function checkAch(x) {
  var st = state(), fresh = [];
  ACH.forEach(function (a) { if (!st.ach[a.code] && a.test(x)) { st.ach[a.code] = Date.now(); fresh.push(a); } });
  return fresh;
}
function bumpStreak() {
  var st = state(), today = dayInTz(), s = st.streak, extended = false;
  if (s.last_day !== today) {
    s.current = (s.last_day === addDay(today, -1)) ? s.current + 1 : 1;
    s.last_day = today; s.total_days += 1; s.best = Math.max(s.best, s.current); extended = true;
  }
  if (extended) track("streak_extended", { streak: s.current });
  return s.current;
}
function histEntry(ch) { return { kind: ch.kind, family: famOf(ch), cat: ch.cat, tier: tierOf(ch.difficulty) }; }
/* Estadísticas que alimentan el motor (variedad) y el progreso. */
function noteRound(ch, res) {
  var st = state(), opinion = isOpinion(ch);
  var cs = st.catStats[ch.cat] || { g: 0, acc: 0, n: 0 };
  cs.g += 1; if (!opinion) { cs.acc += res.accuracy; cs.n += 1; }
  st.catStats[ch.cat] = cs;
  if (!opinion) { st.accSum += res.accuracy; st.accN += 1; if (res.accuracy === 100) st.records.perfects += 1; }
  if (!opinion && res.accuracy >= 80 && ch.cat === "logica") st.logicWins += 1;
  st.recent.push(histEntry(ch)); if (st.recent.length > 12) st.recent.splice(0, st.recent.length - 12);
  var f = famOf(ch); st.famCount[f] = (st.famCount[f] || 0) + 1;
  sigsOf(ch).forEach(function (s) { if (st.recentSigs.indexOf(s) === -1) st.recentSigs.push(s); });
  if (st.recentSigs.length > 500) st.recentSigs.splice(0, st.recentSigs.length - 500);
  markSeen(ch.cat, keyOf(ch));
}
function addDayPoints(points) {
  var st = state(), today = dayInTz(), day = st.days[today] || { points: 0, games: 0 };
  day.points += points; day.games += 1; st.days[today] = day;
  var keys = Object.keys(st.days).sort();
  while (keys.length > 60) delete st.days[keys.shift()];
}
function registerPlay(ch, res, seconds, answers) {
  var st = state(), opinion = isOpinion(ch), bestKey = ch.generated ? ch.key : ch.slug;
  var prev = st.best[bestKey], record = !opinion && !!prev && res.points > prev.points;
  if (!opinion && (!prev || res.points > prev.points)) st.best[bestKey] = { points: res.points, seconds: seconds, accuracy: res.accuracy };
  st.history.unshift({ slug: ch.slug, title: ch.title, cat: ch.cat, points: res.points, accuracy: res.accuracy, seconds: seconds, at: Date.now(), grid: gridOf(answers) });
  st.history = st.history.slice(0, 80);
  st.points += res.points; st.games += 1;
  st.records.bestPoints = Math.max(st.records.bestPoints, res.points);
  addDayPoints(res.points);
  noteRound(ch, res);
  var streak = bumpStreak();
  var fresh = checkAch({ res: res, seconds: seconds, ch: ch, st: st, opinion: opinion, record: record });
  save(); updateStreakChip();
  track("challenge_completed", { slug: ch.slug, cat: ch.cat, points: res.points, accuracy: res.accuracy });
  return { record: record, streak: streak, fresh: fresh };
}
function gridOf(answers) { return (answers || []).slice(0, 10).map(function (ok) { return ok ? "v" : "x"; }).join(""); }

/* =====================================================================
 * Selección de retos para sesiones: anti-repetición + variedad
 * (motor de la v1 conservado, con las nuevas categorías)
 * =================================================================== */
var STATIC_FAMILY = { opcion_multiple: "trivia", secuencia: "sec", respuesta_texto: "texto", verdadero_falso: "vf", ordenar: "ordenar", emparejar: "parejas", estimar: "estimar", memoria: "memoria" };
function famOf(ch) { return ch.family || STATIC_FAMILY[ch.kind] || ch.kind; }
function keyOf(ch) { return ch.key || ch.slug; }
function tierMatches(difficulty, tierFilter) {
  if (!tierFilter || tierFilter === "todas") return true;
  if (tierFilter === "facil") return difficulty <= 2;
  if (tierFilter === "normal") return difficulty === 3;
  if (tierFilter === "dificil") return difficulty === 4;
  if (tierFilter === "experto") return difficulty >= 5;
  return true;
}
function seenSetFor(cat) {
  var st = state();
  if (!st.seenByCat[cat]) st.seenByCat[cat] = [];
  return st.seenByCat[cat];
}
function markSeen(cat, key) {
  var arr = seenSetFor(cat);
  if (arr.indexOf(key) === -1) arr.push(key);
  if (arr.length > 400) arr.splice(0, arr.length - 400);
}
function sigClash(ch, ctx) { return sigsOf(ch).some(function (s) { return ctx.sigs[s]; }); }
function staleness(ch) {
  var glob = state().recentSigs, sigs = sigsOf(ch), n = 0;
  sigs.forEach(function (s) { if (glob.indexOf(s) !== -1) n++; });
  return sigs.length ? n / sigs.length : 0;
}
/* relax 0: nada visto · relax 1: nuevo ciclo, sin repetir en la sesión ·
 * relax 2: último recurso, solo evita el anterior. */
function collectCandidates(cat, kindFilter, tierFilter, ctx, relax) {
  var seen = seenSetFor(cat), out = [], last = ctx.lastSlug;
  CHALLENGES.forEach(function (c) {
    if (c.cat !== cat) return;
    if (kindFilter !== "todas" && c.kind !== kindFilter) return;
    if (!tierMatches(c.difficulty, tierFilter)) return;
    if (relax < 2 && ctx.played[c.slug]) return;
    if (c.slug === last) return;
    if (!relax && seen.indexOf(c.slug) !== -1) return;
    if (relax < 2 && sigClash(c, ctx)) return;
    if (!validateChallenge(c)) return;
    out.push(c);
  });
  (GENERATORS[cat] || []).forEach(function (g) {
    if (kindFilter !== "todas" && g.kind !== kindFilter) return;
    for (var a = 0; a < 4; a++) {
      var t = (tierFilter && tierFilter !== "todas") ? tierFilter : TIERS[Math.floor(Math.random() * TIERS.length)];
      var made = makeGenerated(cat, g.id, t, randomSeed());
      if (!made || !validateChallenge(made)) continue;
      if (!tierMatches(made.difficulty, tierFilter)) continue;
      if (relax < 2 && ctx.played[made.key]) continue;
      if (!relax && seen.indexOf(made.key) !== -1) continue;
      if (relax < 2 && sigClash(made, ctx)) continue;
      out.push(made); break;
    }
  });
  return out;
}
function varietyScore(ch, hist) {
  var s = 0, k = ch.kind, f = famOf(ch), c = ch.cat, t = tierOf(ch.difficulty), last = hist.slice(-4);
  last.forEach(function (h, i) {
    var w = (i + 1) / last.length;
    if (h.kind === k) s -= 2.2 * w;
    if (h.family === f) s -= 3 * w;
    if (h.cat === c) s -= 1.2 * w;
  });
  var l2 = hist.slice(-2);
  if (l2.length === 2 && l2[0].tier === t && l2[1].tier === t) s -= 2;
  if (!ch.generated) s += 1.2;
  s -= 3 * staleness(ch);
  s -= Math.min(1.5, (state().famCount[f] || 0) / 40);
  return s + Math.random() * 1.4;
}
function chooseBest(cands, hist) {
  var best = null, bs = -1e9;
  cands.forEach(function (c) { var s = varietyScore(c, hist); if (s > bs) { bs = s; best = c; } });
  return best;
}
function nextChallengeFor(cat, kindFilter, tierFilter, ctx, allowRepeat) {
  var cands = collectCandidates(cat, kindFilter, tierFilter, ctx, 0);
  if (cands.length) return { ch: chooseBest(cands, ctx.hist), cycle: false };
  cands = collectCandidates(cat, kindFilter, tierFilter, ctx, 1);
  if (cands.length) { seenSetFor(cat).length = 0; save(); return { ch: chooseBest(cands, ctx.hist), cycle: true }; }
  if (allowRepeat) {
    cands = collectCandidates(cat, kindFilter, tierFilter, ctx, 2);
    if (cands.length) return { ch: chooseBest(cands, ctx.hist), cycle: true };
  }
  return null;
}
/* Nunca deja al jugador sin reto: relaja tipo, dificultad o ambos. */
function safeNext(cat, kindFilter, tierFilter, ctx) {
  var steps = [[kindFilter, tierFilter], [kindFilter, "todas"], ["todas", tierFilter], ["todas", "todas"]];
  for (var pass = 0; pass < 2; pass++) {
    for (var i = 0; i < steps.length; i++) {
      var r = nextChallengeFor(cat, steps[i][0], steps[i][1], ctx, pass === 1);
      if (r) { if (steps[i][0] !== kindFilter) r.relaxedKind = true; return r; }
    }
  }
  var any = CHALLENGES.filter(function (c) { return c.cat === cat && validateChallenge(c); });
  return any.length ? { ch: any[Math.floor(Math.random() * any.length)], cycle: true } : null;
}

/* --- Sesiones de 10 retos ---------------------------------------------- */
var SESSION_LEN = 10;
var MODES = [
  { id: "sorpresa", name: "Sorpréndeme", desc: "Mecánicas y dificultad variadas, de menos a más. La forma más divertida.", featured: true },
  { id: "adaptativo", name: "Adaptativo", desc: "Sube si aciertas, baja si fallas." },
  { id: "facil", name: "Fácil", desc: "Para calentar." },
  { id: "normal", name: "Normal", desc: "El punto justo." },
  { id: "dificil", name: "Difícil", desc: "Hay que pensar." },
  { id: "experto", name: "Experto", desc: "Solo para valientes." }
];
function groupFor(slug) {
  if (slug === "sorpresa") return { slug: "sorpresa", name: "Sorpréndeme", icon: "sorpresa", color: "#5B21E8", short: "Todas las categorías mezcladas.", cats: PUBLIC_CATS.map(function (c) { return c.slug; }) };
  slug = LEGACY_CATS[slug] || slug;
  var c = catBySlug[slug];
  return c ? { slug: c.slug, name: c.name, icon: c.icon, color: c.color, short: c.short, cats: [c.slug], hidden: c.hidden } : null;
}
function createSession(group, mode, kind) {
  return {
    group: group, cats: group.cats.slice(), mode: mode || "sorpresa", kind: kind || "todas",
    i: 0, total: SESSION_LEN, level: 1, points: 0, correct: 0, answers: 0, seconds: 0, passed: 0,
    rounds: [], tiers: [], records: 0, ctx: { played: {}, sigs: {}, hist: state().recent.slice(-3), lastSlug: null }, notices: {}
  };
}
function sessionTier(s) {
  if (TIERS.indexOf(s.mode) !== -1) return s.mode;
  if (s.mode === "adaptativo") return TIERS[Math.max(0, Math.min(3, Math.round(s.level)))];
  var p = s.i / s.total, b = Math.min(3, Math.floor(p * 3.6));
  var opts = [Math.max(0, b - 1), b, b, Math.min(3, b + 1)], last = s.tiers.slice(-2);
  var choices = opts.filter(function (t) { return !(last.length === 2 && last[0] === t && last[1] === t); });
  if (!choices.length) choices = opts;
  var t = choices[Math.floor(Math.random() * choices.length)];
  if (last.length && t === last[last.length - 1] && Math.random() < 0.6) {
    var alt = choices.filter(function (x) { return x !== last[last.length - 1]; });
    if (alt.length) t = alt[Math.floor(Math.random() * alt.length)];
  }
  return TIERS[t];
}
function sessionPick(s) {
  var tier = sessionTier(s), ctx = s.ctx, cats = s.cats.slice(), pool = [];
  if (cats.length > 2) {
    var recentCats = ctx.hist.slice(-2).map(function (h) { return h.cat; });
    cats = shuffleWith(cats, Math.random).sort(function (a, b) { return (recentCats.indexOf(a) !== -1 ? 1 : 0) - (recentCats.indexOf(b) !== -1 ? 1 : 0); }).slice(0, 4);
  }
  cats.forEach(function (c) { pool = pool.concat(collectCandidates(c, s.kind, tier, ctx, 0)); });
  if (pool.length) return { ch: chooseBest(pool, ctx.hist), tier: tier };
  for (var i = 0; i < cats.length; i++) { var r = safeNext(cats[i], s.kind, tier, ctx); if (r) return r; }
  return null;
}
function sessionRemember(s, ch) {
  var ctx = s.ctx;
  ctx.played[ch.slug] = true; ctx.played[keyOf(ch)] = true; ctx.lastSlug = ch.slug;
  sigsOf(ch).forEach(function (x) { ctx.sigs[x] = true; });
  ctx.hist.push(histEntry(ch));
  s.tiers.push(TIERS.indexOf(tierOf(ch.difficulty)));
}
function adaptLevel(s, res, ch, seconds) {
  if (s.mode !== "adaptativo" || isOpinion(ch)) return;
  var delta = 0, fast = seconds <= ch.duration;
  if (res.accuracy >= 90) delta = fast ? 0.6 : 0.4;
  else if (res.accuracy >= 70) delta = 0.25;
  else if (res.accuracy < 50) delta = -0.5;
  s.level = Math.max(0, Math.min(3, s.level + delta));
}

/* =====================================================================
 * Mecánicas de juego
 * control.answer(ok) · control.progress(hecho, total, texto) ·
 * control.finish() · control.keys(fn) · control.timers
 * =================================================================== */
var TAP_GUARD = 220;
function tooSoon(t0) { return Date.now() - t0 < TAP_GUARD; }
function nextLabel(last) { return last ? "Ver resultado" : "Siguiente"; }
function nextBtn(last) { return '<button type="button" class="btn btn-primary btn-block" data-next hidden>' + nextLabel(last) + (last ? "" : icon("arrow")) + "</button>"; }
function setFeedback(fb, ok, badMsg, explica, okMsg) {
  fb.className = "feedback " + (ok ? "is-ok" : "is-bad");
  fb.innerHTML = "<strong>" + (ok ? esc(okMsg || "¡Correcto!") : "No.") + "</strong>" + (!ok && badMsg ? " " + esc(badMsg) : "") +
    (explica ? '<span class="explain">' + esc(explica) + "</span>" : "");
  restartAnim(fb, "anim");
}
function qHead(q) {
  return '<h2 class="q-text" tabindex="-1">' + esc(q.pregunta) + "</h2>" + (q.visual ? '<div class="q-visual">' + esc(q.visual) + "</div>" : "");
}
function focusQ(host) { var qt = $(".q-text", host); if (qt) qt.focus({ preventScroll: true }); }
function typingTarget(e) { var t = e.target; return t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable); }
var LETTERS = "ABCDEFGH";

function mcq(data, host, control) {
  var qs = data.preguntas || [], i = 0;
  function paint() {
    var q = qs[i], last = i === qs.length - 1, done = false, t0 = Date.now();
    control.progress(i, qs.length);
    host.innerHTML = qHead(q) +
      '<div class="options' + (q.emoji ? " options-2" : "") + '" role="group" aria-label="Respuestas">' +
      q.opciones.map(function (t, k) { return '<button type="button" class="option' + (q.emoji ? " option-emoji" : "") + '" data-i="' + k + '">' + (q.emoji ? "" : '<span class="key" aria-hidden="true">' + LETTERS.charAt(k) + "</span>") + "<span>" + esc(t) + '</span><span class="mark" aria-hidden="true"></span></button>'; }).join("") +
      '</div><p class="feedback" aria-live="polite"></p><div class="actions">' + nextBtn(last) + "</div>";
    var next = $("[data-next]", host), fb = $(".feedback", host), opts = $$(".option", host);
    function choose(btn) {
      if (done || tooSoon(t0)) return;
      done = true;
      var chosen = +btn.dataset.i;
      if (q.libre) {
        control.answer(true);
        opts.forEach(function (b) { b.disabled = true; b.classList.add(b === btn ? "is-selected" : "is-dim"); });
        fb.className = "feedback is-ok"; fb.innerHTML = "<strong>Anotado.</strong> Compáralo con lo que elegirían tus amigos.";
        restartAnim(fb, "anim");
      } else {
        var correct = +q.correcta, ok = chosen === correct;
        control.answer(ok);
        opts.forEach(function (b) {
          var k = +b.dataset.i; b.disabled = true;
          if (k === correct) { b.classList.add("is-ok"); $(".mark", b).innerHTML = icon("check"); }
          else if (k === chosen) { b.classList.add("is-bad"); $(".mark", b).innerHTML = icon("x"); }
          else b.classList.add("is-dim");
        });
        setFeedback(fb, ok, "Era: " + q.opciones[correct] + ".", q.explica);
      }
      next.hidden = false; next.focus();
    }
    opts.forEach(function (btn) { btn.addEventListener("click", function () { choose(btn); }); });
    control.keys(function (e) {
      if (done || typingTarget(e)) return;
      var k = e.key.toUpperCase(), idx = /^[1-8]$/.test(k) ? +k - 1 : LETTERS.indexOf(k);
      if (idx >= 0 && idx < opts.length) { e.preventDefault(); choose(opts[idx]); }
    });
    next.addEventListener("click", function () { i++; if (i >= qs.length) { control.progress(qs.length, qs.length); control.finish(); } else paint(); });
    focusQ(host);
  }
  paint();
}

function matchAnswer(q, value) {
  if (typeof q.respuesta === "number") return numCandidates(value).some(function (n) { return Math.abs(n - q.respuesta) < 1e-9; });
  var given = norm(value);
  if (!given) return false;
  if (norm(q.respuesta) === given) return true;
  return (q.acepta || []).some(function (a) { return norm(a) === given; });
}
function inputRound(host, control, opts) {
  var qs = opts.qs, i = 0;
  function paint() {
    var q = qs[i], last = i === qs.length - 1, revealed = false, numeric = opts.numeric(q);
    control.progress(i, qs.length);
    host.innerHTML = qHead(q) + (opts.note ? '<p class="muted small">' + opts.note(q) + "</p>" : "") +
      '<label class="sr-only" for="answer-input">' + esc(opts.label) + "</label>" +
      '<input class="text-input" id="answer-input" type="text" inputmode="' + (numeric ? "decimal" : "text") + '" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" placeholder="' + esc(opts.placeholder(q)) + '" enterkeyhint="done" maxlength="40">' +
      '<p class="feedback" aria-live="polite"></p>' +
      '<div class="actions"><button type="button" class="btn btn-primary btn-block" data-check>Comprobar</button></div>';
    var input = $(".text-input", host), btn = $("[data-check]", host), fb = $(".feedback", host);
    function go() {
      if (!revealed) {
        var r = opts.judge(q, input.value);
        if (r === null) { input.focus(); restartAnim(input, "is-bad"); setTimeout(function () { input.classList.remove("is-bad"); }, 450); return; }
        revealed = true;
        control.answer(r.ok);
        input.disabled = true; input.classList.add(r.ok ? "is-ok" : "is-bad");
        setFeedback(fb, r.ok, r.bad, r.explain);
        btn.innerHTML = nextLabel(last) + (last ? "" : icon("arrow"));
        btn.focus();
        return;
      }
      i++;
      if (i >= qs.length) { control.progress(qs.length, qs.length); control.finish(); } else paint();
    }
    btn.addEventListener("click", go);
    input.addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); if (!e.repeat) go(); } });
    input.focus({ preventScroll: true });
  }
  paint();
}
function text(data, host, control) {
  inputRound(host, control, {
    qs: data.preguntas || [], label: "Tu respuesta",
    numeric: function (q) { return typeof q.respuesta === "number"; },
    placeholder: function (q) { return typeof q.respuesta === "number" ? "Escribe el número" : "Escribe la palabra"; },
    judge: function (q, v) {
      if (!v.trim()) return null;
      var shown = typeof q.respuesta === "number" ? fmtNum(q.respuesta) : String(q.respuesta).toUpperCase();
      return { ok: matchAnswer(q, v), bad: "Era " + shown + ".", explain: q.explica };
    }
  });
}
function estimate(data, host, control) {
  inputRound(host, control, {
    qs: data.preguntas || [], label: "Tu estimación",
    numeric: function () { return true; },
    note: function (q) { var t = Number(q.tolerancia || 0); return "Cuenta si caes dentro del margen" + (t ? " (±" + esc(fmtNum(t)) + ")" : "") + "."; },
    placeholder: function () { return "Tu estimación"; },
    judge: function (q, v) {
      var vals = numCandidates(v);
      if (!vals.length) return null;
      var tol = Number(q.tolerancia || 0);
      var ok = vals.some(function (x) { return Math.abs(x - Number(q.respuesta)) <= tol + 1e-9; });
      return { ok: ok, bad: "El valor es " + fmtNum(q.respuesta) + ".", explain: ok ? "Valor exacto: " + fmtNum(q.respuesta) + "." : q.explica };
    }
  });
}

function trueFalse(data, host, control) {
  var qs = data.preguntas || [], i = 0;
  function paint() {
    var q = qs[i], last = i === qs.length - 1, done = false, t0 = Date.now();
    control.progress(i, qs.length);
    host.innerHTML = qHead(q) +
      '<div class="options options-2" role="group" aria-label="Respuestas"><button type="button" class="option" data-v="1"><span>Verdadero</span><span class="mark" aria-hidden="true"></span></button><button type="button" class="option" data-v="0"><span>Falso</span><span class="mark" aria-hidden="true"></span></button></div>' +
      '<p class="feedback" aria-live="polite"></p><div class="actions">' + nextBtn(last) + "</div>";
    var next = $("[data-next]", host), fb = $(".feedback", host), opts = $$(".option", host);
    function choose(btn) {
      if (done || tooSoon(t0)) return; done = true;
      var ok = (btn.dataset.v === "1") === !!q.respuesta;
      control.answer(ok);
      opts.forEach(function (b) {
        b.disabled = true;
        if ((b.dataset.v === "1") === !!q.respuesta) { b.classList.add("is-ok"); $(".mark", b).innerHTML = icon("check"); }
        else if (b === btn) { b.classList.add("is-bad"); $(".mark", b).innerHTML = icon("x"); }
      });
      setFeedback(fb, ok, "Era " + (q.respuesta ? "verdadero." : "falso."), q.explica);
      next.hidden = false; next.focus();
    }
    opts.forEach(function (btn) { btn.addEventListener("click", function () { choose(btn); }); });
    control.keys(function (e) {
      if (done || typingTarget(e)) return;
      var k = e.key.toLowerCase();
      if (k === "v" || k === "1") { e.preventDefault(); choose(opts[0]); } else if (k === "f" || k === "2") { e.preventDefault(); choose(opts[1]); }
    });
    next.addEventListener("click", function () { i++; if (i >= qs.length) { control.progress(qs.length, qs.length); control.finish(); } else paint(); });
    focusQ(host);
  }
  paint();
}

function order(data, host, control) {
  var qs = data.preguntas || [], i = 0;
  function paint() {
    var q = qs[i], last = i === qs.length - 1, revealed = false, expected = q.elementos.slice();
    var items = shuffleWith(expected, Math.random), selected = -1;
    if (items.length > 1 && items.join("|") === expected.join("|")) items.reverse();
    control.progress(i, qs.length);
    host.innerHTML = qHead(q) + '<p class="muted small">Toca dos elementos para intercambiarlos.</p>' +
      '<div class="sortable" data-sortable></div><p class="feedback" aria-live="polite"></p>' +
      '<div class="actions"><button type="button" class="btn btn-primary btn-block" data-check>Comprobar</button></div>';
    var box = $("[data-sortable]", host), btn = $("[data-check]", host), fb = $(".feedback", host);
    function draw(focusIdx, cls) {
      box.innerHTML = items.map(function (t, k) {
        return '<button type="button" class="sort-item' + (k === selected ? " is-selected" : "") + (cls ? " " + cls : "") + '" data-k="' + k + '"' + (revealed ? " disabled" : "") +
          ' aria-label="Posición ' + (k + 1) + ": " + esc(t) + (k === selected ? ", seleccionado" : "") + '"><span class="num" aria-hidden="true">' + (k + 1) + "</span>" + esc(t) + "</button>";
      }).join("");
      $$(".sort-item", box).forEach(function (it) {
        it.addEventListener("click", function () {
          if (revealed) return;
          var k = +it.dataset.k;
          if (selected === -1) { selected = k; draw(k); return; }
          if (selected === k) { selected = -1; draw(k); return; }
          var tmp = items[selected]; items[selected] = items[k]; items[k] = tmp;
          selected = -1; draw(k);
        });
      });
      if (focusIdx !== undefined) { var f = $('[data-k="' + focusIdx + '"]', box); if (f) f.focus({ preventScroll: true }); }
    }
    draw();
    btn.addEventListener("click", function () {
      if (!revealed) {
        revealed = true; selected = -1;
        var ok = items.every(function (v, k) { return norm(v) === norm(expected[k]); });
        control.answer(ok);
        draw(undefined, ok ? "is-ok" : "is-bad");
        setFeedback(fb, ok, "El orden correcto: " + expected.join(" → ") + ".", q.explica);
        btn.innerHTML = nextLabel(last) + (last ? "" : icon("arrow"));
        btn.focus();
        return;
      }
      i++;
      if (i >= qs.length) { control.progress(qs.length, qs.length); control.finish(); } else paint();
    });
    focusQ(host);
  }
  paint();
}

function pairs(data, host, control) {
  var ps = data.parejas || [], done = 0, selected = null, finished = false, t0 = Date.now();
  var left = shuffleWith(ps.map(function (p, i) { return { id: i, t: p.a }; }), Math.random);
  var right = shuffleWith(ps.map(function (p, i) { return { id: i, t: p.b }; }), Math.random);
  host.innerHTML = '<h2 class="q-text" tabindex="-1">' + esc(data.titulo || "Une cada pareja") + "</h2>" +
    '<p class="muted small">Toca un elemento de la izquierda y después su pareja de la derecha.</p>' +
    '<div class="match"><div class="match-col">' +
    left.map(function (p) { return '<button type="button" class="match-item" data-side="l" data-id="' + p.id + '">' + esc(p.t) + "</button>"; }).join("") +
    '</div><div class="match-col">' +
    right.map(function (p) { return '<button type="button" class="match-item" data-side="r" data-id="' + p.id + '">' + esc(p.t) + "</button>"; }).join("") +
    '</div></div><p class="feedback" aria-live="polite"></p>';
  var fb = $(".feedback", host);
  control.progress(0, ps.length, "0 de " + ps.length + " parejas");
  $$(".match-item", host).forEach(function (it) {
    it.addEventListener("click", function () {
      if (finished || tooSoon(t0) || it.classList.contains("is-done")) return;
      if (!selected) { selected = it; it.classList.add("is-selected"); it.setAttribute("aria-pressed", "true"); return; }
      if (selected === it) { it.classList.remove("is-selected"); it.removeAttribute("aria-pressed"); selected = null; return; }
      if (selected.dataset.side === it.dataset.side) { selected.classList.remove("is-selected"); selected.removeAttribute("aria-pressed"); selected = it; it.classList.add("is-selected"); it.setAttribute("aria-pressed", "true"); return; }
      var a = selected, ok = a.dataset.id === it.dataset.id;
      selected = null; a.classList.remove("is-selected"); a.removeAttribute("aria-pressed");
      control.answer(ok);
      if (ok) {
        a.classList.add("is-done"); it.classList.add("is-done"); a.disabled = true; it.disabled = true; done++;
        fb.className = "feedback is-ok"; fb.innerHTML = "<strong>Pareja correcta.</strong>"; restartAnim(fb, "anim");
        control.progress(done, ps.length, done + " de " + ps.length + " parejas");
        if (done === ps.length) { finished = true; setTimeout(control.finish, 500); }
      } else {
        a.classList.add("is-bad"); it.classList.add("is-bad");
        fb.className = "feedback is-bad"; fb.innerHTML = "<strong>No.</strong> Esas no van juntas."; restartAnim(fb, "anim");
        setTimeout(function () { a.classList.remove("is-bad"); it.classList.remove("is-bad"); }, 600);
      }
    });
  });
  focusQ(host);
}

function memoryOrder(data, host, control) {
  var qs = data.preguntas || [], i = 0;
  function paint() {
    var q = qs[i], last = i === qs.length - 1, expected = q.elementos.slice(), ms = q.mostrar_ms || (1800 + 550 * expected.length);
    control.progress(i, qs.length, "Memoriza");
    host.innerHTML = qHead(q) +
      '<div class="memo-row" aria-label="Secuencia: ' + esc(expected.join(" ")) + '">' + expected.map(function (t, k) { return '<span class="memo-item" style="animation-delay:' + (k * 60) + 'ms">' + esc(t) + "</span>"; }).join("") + "</div>" +
      '<div class="memo-bar" aria-hidden="true"><span></span></div>' +
      '<p class="feedback center" aria-live="polite">Desaparece en <b data-count>' + Math.ceil(ms / 1000) + "</b> s</p>";
    var countEl = $("[data-count]", host), remaining = Math.ceil(ms / 1000), bar = $(".memo-bar span", host);
    if (bar && !reducedMotion()) { bar.style.transition = "transform " + ms + "ms linear"; requestAnimationFrame(function () { requestAnimationFrame(function () { bar.style.transform = "scaleX(0)"; }); }); }
    var tick = setInterval(function () { remaining--; if (countEl) countEl.textContent = Math.max(0, remaining); }, 1000);
    var to = setTimeout(function () { clearInterval(tick); reveal(); }, ms);
    control.timers.push(function () { clearInterval(tick); clearTimeout(to); });
    focusQ(host);
    function reveal() {
      var picked = [], pool = shuffleWith(expected, Math.random);
      if (pool.length > 1 && pool.join("|") === expected.join("|")) pool.reverse();
      control.progress(i, qs.length, "Repite el orden");
      host.innerHTML = '<h2 class="q-text" tabindex="-1">Ahora, en el mismo orden</h2>' +
        '<div class="your-order" data-your aria-live="polite"></div>' +
        '<div class="options options-2">' + pool.map(function (t) { return '<button type="button" class="option option-emoji" data-v="' + esc(t) + '">' + esc(t) + "</button>"; }).join("") + "</div>" +
        '<p class="feedback" aria-live="polite"></p>' +
        '<div class="actions"><button type="button" class="btn btn-ghost btn-sm" data-undo>Deshacer</button>' + nextBtn(last) + "</div>";
      var yourBox = $("[data-your]", host), fb2 = $(".feedback", host), next = $("[data-next]", host), undo = $("[data-undo]", host), finished = false, t0 = Date.now();
      function renderYour() { yourBox.innerHTML = expected.map(function (_, k) { return '<span class="your-slot">' + (picked[k] !== undefined ? esc(picked[k]) : (k + 1)) + "</span>"; }).join(""); }
      renderYour();
      $$(".option", host).forEach(function (btn) {
        btn.addEventListener("click", function () {
          if (btn.disabled || finished || tooSoon(t0)) return;
          btn.disabled = true; btn.classList.add("is-selected");
          picked.push(btn.dataset.v); renderYour();
          if (picked.length === expected.length) {
            finished = true; undo.hidden = true;
            var ok = picked.every(function (v, k) { return v === expected[k]; });
            control.answer(ok);
            setFeedback(fb2, ok, "El orden era: " + expected.join(" "), null, "Memoria perfecta.");
            next.hidden = false; next.focus();
          }
        });
      });
      undo.addEventListener("click", function () {
        if (finished || !picked.length) return;
        var v = picked.pop();
        var b = $$(".option", host).filter(function (x) { return x.dataset.v === v; })[0];
        if (b) { b.disabled = false; b.classList.remove("is-selected"); }
        renderYour();
      });
      next.addEventListener("click", function () { i++; if (i >= qs.length) { control.progress(qs.length, qs.length); control.finish(); } else paint(); });
      focusQ(host);
    }
  }
  paint();
}

var MECH = { opcion_multiple: mcq, secuencia: mcq, respuesta_texto: text, verdadero_falso: trueFalse, ordenar: order, emparejar: pairs, estimar: estimate, memoria: memoryOrder };

/* =====================================================================
 * Motor de una partida. El resultado lo pinta quien la lanza (reto
 * suelto, sesión o reto del día) a través de opts.onDone.
 * =================================================================== */
function Game(stage, ch, opts) {
  this.stage = stage; this.ch = ch; this.opts = opts || {};
  this.intro = $("[data-intro]", stage); this.bar = $("[data-bar]", stage);
  this.body = $("[data-body]", stage); this.result = $("[data-result]", stage);
  this.correct = 0; this.answered = 0; this.total = 1; this.answers = []; this.timer = null; this.timers = []; this.done = false;
}
Game.prototype.start = function () {
  var self = this;
  this.intro.hidden = true; this.bar.hidden = false; this.body.hidden = false; this.result.hidden = true;
  var live = $("[data-live]", this.bar), pill = $("[data-timer-pill]", this.bar);
  var control = {
    timers: this.timers,
    answer: function (ok) {
      self.answered++; self.answers.push(!!ok); if (ok) self.correct++;
      if (live && !isOpinion(self.ch)) live.textContent = self.correct + (self.correct === 1 ? " acierto" : " aciertos");
    },
    progress: function (done, total, label) {
      self.total = total;
      $("[data-progress-text]", self.bar).textContent = label || ("Pregunta " + Math.min(done + 1, total) + " de " + total);
      $("[data-progress-bar]", self.bar).style.width = Math.min(100, (done / total) * 100) + "%";
    },
    keys: function (fn) {
      document.addEventListener("keydown", fn);
      self.timers.push(function () { document.removeEventListener("keydown", fn); });
      var prev = self.keyFn; if (prev) document.removeEventListener("keydown", prev);
      self.keyFn = fn;
    },
    finish: function () { self.finish(); }
  };
  (MECH[this.ch.kind] || mcq)(this.ch.data, this.body, control);
  this.startedAt = Date.now();
  this.timer = setInterval(function () {
    if (!document.body.contains(self.stage)) { self.stop(); return; }
    var s = Math.floor((Date.now() - self.startedAt) / 1000);
    $("[data-timer]", self.bar).textContent = s;
    if (pill) pill.classList.toggle("is-over", s > self.ch.duration);
  }, 250);
  track("challenge_started", { slug: this.ch.slug, cat: this.ch.cat });
};
Game.prototype.stop = function () {
  clearInterval(this.timer);
  this.timers.forEach(function (fn) { try { fn(); } catch (e) { /* ignorar */ } });
  this.timers.length = 0;
};
Game.prototype.finish = function () {
  if (this.done) return;
  this.done = true; this.stop();
  var seconds = Math.max(1, Math.round((Date.now() - this.startedAt) / 1000));
  var total = Math.max(this.total, this.answered);
  var res = score(this.ch, { correct: this.correct, total: total, seconds: seconds });
  if (isOpinion(this.ch)) res.points = 0;
  this.bar.hidden = true; this.body.hidden = true;
  this.result.hidden = false;
  if (this.opts.onDone) this.opts.onDone({ res: res, seconds: seconds, correct: this.correct, total: total, answers: this.answers.slice() }, this);
};
var ACTIVE_GAMES = [];
function stopGames() { ACTIVE_GAMES.forEach(function (g) { g.stop(); }); ACTIVE_GAMES = []; }
function mountGame(stage, ch, opts, autoStart) {
  var g = new Game(stage, ch, opts);
  ACTIVE_GAMES.push(g);
  if (autoStart) g.start();
  else { var b = $("[data-start]", stage); if (b) b.addEventListener("click", function () { g.start(); }); }
  return g;
}

/* =====================================================================
 * Resultados, compartir y duelos
 * =================================================================== */
function resultMessage(acc, fast) {
  if (acc === 100 && fast) return "Impecable.";
  if (acc === 100) return "Perfecto.";
  if (acc >= 80) return "Casi perfecto.";
  if (acc >= 50) return "Bien jugado.";
  if (acc > 0) return "Hecho. Ahora, a por más.";
  return "Esta vez no salió.";
}
function squaresHtml(grid, small) {
  return '<ul class="squares' + (small ? " small" : "") + '" role="img" aria-label="' + esc(gridLabel(grid)) + '">' + grid.split("").map(function (g, i) {
    return '<li class="is-' + (g === "v" ? "v" : g === "~" ? "m" : "x") + '" style="animation-delay:' + (i * 70) + 'ms">' + icon(g === "v" ? "check" : g === "~" ? "target" : "x") + "</li>";
  }).join("") + "</ul>";
}
function gridLabel(grid) {
  var v = (grid.match(/v/g) || []).length, m = (grid.match(/~/g) || []).length, x = (grid.match(/x/g) || []).length;
  return v + " perfectas" + (m ? ", " + m + " a medias" : "") + ", " + x + " falladas";
}
function gridEmoji(grid) { return grid.split("").map(function (g) { return GRADE_EMOJI[g] || "⬜"; }).join(""); }
function statsHtml(items) { return '<ul class="stats">' + items.map(function (x) { return "<li>" + icon(x[0]) + esc(x[1]) + "</li>"; }).join("") + "</ul>"; }
function achHtml(list) { return (list || []).map(function (a, k) { return '<p class="unlocked" style="animation-delay:' + (250 + k * 120) + 'ms">' + icon("trophy") + "Logro desbloqueado: <b>" + esc(a.name) + "</b></p>"; }).join(""); }
function versusHtml(duel, mine, mySecs) {
  var theirs = duel.p, win = mine > theirs, tie = mine === theirs;
  return '<div class="versus"><div class="side' + (!win && !tie ? " is-winner" : "") + '"><span>' + esc(duel.n) + "</span><b>" + fmt(theirs) + "</b><small>" + duel.s + ' s</small></div><div class="vs">VS</div>' +
    '<div class="side' + (win ? " is-winner" : "") + '"><span>' + esc(state().nick || "Tú") + "</span><b>" + fmt(mine) + "</b><small>" + mySecs + " s</small></div></div>" +
    '<p class="verdict">' + (tie ? "Empate. Toca desempate." : win ? "Ganas tú." : esc(duel.n) + " gana esta vez.") + "</p>";
}
function nativeShare(data) {
  if (!navigator.share) return false;
  navigator.share(data).catch(function () { /* cancelado */ });
  return true;
}
/* Panel «Retar a un amigo». spec: { title, points, seconds, url(nombre),
 * text(nombre, url), grid } */
function mountDuelPanel(panel, spec) {
  if (!panel) return;
  if (!panel.hidden) { var f0 = $("#duel-nick", panel); if (f0) f0.focus(); return; }
  var st = state();
  panel.hidden = false;
  panel.innerHTML = "<h3>¿Quién se atreve?</h3>" +
    '<div class="duel-card"><small>RÉTAME · ' + esc(spec.title) + "</small><b>" + fmt(spec.points) + " puntos</b><p>en " + spec.seconds + " s. ¿Puedes superarlo?</p></div>" +
    '<label for="duel-nick">Tu nombre en el duelo <span class="muted">(opcional)</span></label>' +
    '<input class="field" id="duel-nick" maxlength="24" autocomplete="nickname" placeholder="Por ejemplo, Ana" value="' + esc(st.nick) + '">' +
    '<div class="share-row" data-share-row></div>' +
    '<p class="muted small">Quien abra el enlace juega lo mismo que tú y ve quién gana. Tu nombre y tu puntuación viajan dentro del enlace: compártelo solo con quien quieras.</p>';
  var nick = $("#duel-nick", panel), row = $("[data-share-row]", panel);
  function name() { return (nick.value || "").replace(/[\u0000-\u001f<>]/g, "").trim().slice(0, 24) || "Alguien"; }
  function link() { return spec.url(name()); }
  function created(channel) {
    st.duels += 1; save();
    var a = unlock("retador"); if (a) toast("Logro desbloqueado: " + a.name);
    track("duel_created", { channel: channel });
    track("share_clicked", { channel: channel, what: "duelo" });
  }
  row.innerHTML =
    '<a class="btn btn-wa btn-sm" target="_blank" rel="noopener" data-ch="whatsapp" href="#">' + icon("whatsapp") + "WhatsApp</a>" +
    '<a class="btn btn-tg btn-sm" target="_blank" rel="noopener" data-ch="telegram" href="#">' + icon("telegram") + "Telegram</a>" +
    '<button type="button" class="btn btn-ghost btn-sm" data-copy>' + icon("copy") + "Copiar</button>" +
    (navigator.share ? '<button type="button" class="btn btn-ghost btn-sm" data-native>' + icon("share") + "Más…</button>" : '<a class="btn btn-ghost btn-sm" data-ch="email" href="#">Correo</a>');
  function refreshLinks() {
    var l = link(), msg = spec.text(name(), l);
    var wa = $('[data-ch="whatsapp"]', row), tg = $('[data-ch="telegram"]', row), em = $('[data-ch="email"]', row);
    wa.href = "https://wa.me/?text=" + encodeURIComponent(msg);
    tg.href = "https://t.me/share/url?url=" + encodeURIComponent(l) + "&text=" + encodeURIComponent(msg.replace(l, "").trim());
    if (em) em.href = "mailto:?subject=" + encodeURIComponent("¿Me superas en RÉTAME?") + "&body=" + encodeURIComponent(msg);
  }
  $$('[data-ch]', row).forEach(function (a) { a.addEventListener("click", function () { refreshLinks(); created(a.dataset.ch); }); });
  $("[data-copy]", row).addEventListener("click", function () { var l = link(); copyText(spec.text(name(), l), this, "¡Copiado!"); created("copy"); });
  var nat = $("[data-native]", row);
  if (nat) nat.addEventListener("click", function () { var l = link(); nativeShare({ title: "RÉTAME", text: spec.text(name(), l).replace(l, "").trim(), url: l }); created("native"); });
  nick.addEventListener("input", function () { st.nick = nick.value.trim().slice(0, 24); save(); refreshLinks(); });
  refreshLinks();
  /* En móvil no se enfoca el nombre: abriría el teclado encima de los botones. */
  if (!(window.matchMedia && matchMedia("(pointer: coarse)").matches)) nick.focus({ preventScroll: true });
  panel.scrollIntoView({ block: "nearest", behavior: reducedMotion() ? "auto" : "smooth" });
}
function duelQuery(n, p, s, extra) {
  var q = "n=" + encodeURIComponent(n) + "&p=" + p + "&s=" + s;
  Object.keys(extra || {}).forEach(function (k) { if (extra[k] !== undefined && extra[k] !== "") q += "&" + k + "=" + encodeURIComponent(extra[k]); });
  return q;
}
/* Enlace de duelo de un reto: su página pública si la tiene (con título,
 * descripción e imagen propios); si no, la página de duelos. */
function duelUrl(ch, n, p, s) {
  var extra = ch.seed !== undefined ? { k: ch.seed.toString(36) } : {};
  if (!ch.generated && catBySlug[ch.cat] && !catBySlug[ch.cat].hidden) return absUrl(challengeUrl(ch)) + "?" + duelQuery(n, p, s, extra);
  return absUrl(href("/duelos/")) + "?r=" + encodeURIComponent(ch.slug) + "&" + duelQuery(n, p, s, extra);
}
/* Lee y valida los parámetros de un duelo. Un enlace manipulado nunca
 * rompe la página: si algo no cuadra, se ignora el duelo. */
function parseDuel(q, maxP) {
  if (q.n === undefined && q.p === undefined) return null;
  var p = parseInt(q.p, 10), s = parseInt(q.s, 10);
  var n = String(q.n || "").replace(/[\u0000-\u001f<>]/g, "").trim().slice(0, 24) || "Alguien";
  if (!(p >= 0 && p <= maxP) || !(s >= 1 && s <= 7200) || String(p) !== String(q.p).trim()) return { invalid: true };
  var duel = { n: n, p: p, s: s };
  if (q.g && /^[vx~]{1,10}$/.test(q.g)) duel.g = q.g;
  if (q.k && /^[0-9a-z]{1,7}$/.test(q.k)) duel.k = parseInt(q.k, 36);
  return duel;
}
function duelBanner(duel, what) {
  return '<div class="banner" role="note"><h2>' + esc(duel.n) + " te reta</h2><p>" + esc(duel.n) + " ha sacado <b>" + fmt(duel.p) + " puntos</b> en " + duel.s + " s en " + esc(what) + ". ¿Puedes superarlo?</p>" +
    (duel.g ? squaresHtml(duel.g, true) : "") + "</div>";
}

/* Sugerencia para «Jugar otro reto»: algo de la misma categoría que aún
 * no has jugado; si no queda, una sesión de esa categoría. */
function nextSuggestion(ch) {
  var st = state(), played = {};
  st.history.forEach(function (h) { played[h.slug] = 1; });
  var pool = PUBLIC_CHALLENGES.filter(function (c) { return c.cat === ch.cat && c.slug !== ch.slug && !played[c.slug]; });
  if (pool.length) return challengeUrl(pool[Math.floor(Math.random() * pool.length)]);
  return href("/juegos/?tema=" + (catBySlug[ch.cat] ? ch.cat : "sorpresa"));
}

/* Resultado de un reto suelto (página de reto, /juegos/?reto=, duelos). */
function showSingleResult(game, out, ctx) {
  var ch = game.ch, res = out.res, opinion = isOpinion(ch), reg = registerPlay(ch, res, out.seconds, out.answers);
  var grid = gridOf(out.answers), fast = out.seconds <= ch.duration / 2;
  var duel = ctx.duel, html = '<div class="result">';
  if (opinion) {
    html += '<p class="eyebrow">' + icon("grupo") + "En grupo</p><h2 class=\"result-title\" tabindex=\"-1\">Anotado.</h2>" +
      '<p class="result-sub">No hay respuestas correctas: compara lo que has elegido con tus amigos.</p>';
  } else {
    html += '<p class="eyebrow">' + icon(catBySlug[ch.cat].icon) + esc(catBySlug[ch.cat].name) + '</p><h2 class="result-title" tabindex="-1">' + resultMessage(res.accuracy, fast) + "</h2>" +
      '<p class="result-sub">' + esc(ch.title) + "</p>" +
      '<div class="score"><b data-count>0</b><span>puntos de ' + fmt(ch.max_points) + "</span></div>" +
      (reg.record ? '<p><span class="badge">' + icon("trophy") + "Nuevo récord personal</span></p>" : "") +
      squaresHtml(grid, true) +
      statsHtml([["target", res.accuracy + " % de precisión"], ["clock", out.seconds + " s"], ["flame", reg.streak + (reg.streak === 1 ? " día" : " días") + " de racha"]]);
  }
  if (duel && !duel.invalid && !opinion) {
    html += versusHtml(duel, res.points, out.seconds);
    if (res.points > duel.p) { var w = unlock("duelo_ganado"); if (w) reg.fresh.push(w); state().duelWins += 1; save(); }
    track("duel_completed", { won: res.points > duel.p });
  }
  html += achHtml(reg.fresh);
  html += '<div class="actions"><a class="btn btn-primary btn-lg" href="' + (ctx.nextUrl || nextSuggestion(ch)) + '">Jugar otro reto' + icon("arrow") + "</a>" +
    (opinion ? "" : '<button type="button" class="btn btn-outline btn-lg" data-duel>' + icon("duel") + (duel && !duel.invalid ? "Retar de vuelta" : "Retar a un amigo") + "</button>") + "</div>" +
    '<div class="link-row">' + (opinion ? "" : '<button type="button" class="text-link" data-share>' + icon("share") + "Compartir</button>") +
    '<a href="' + href("/progreso/") + '">Ver progreso</a><a href="' + href("/reto-del-dia/") + '">Reto del día</a><a href="' + href("/retos/") + '">Otra categoría</a></div>' +
    '<div class="panel" data-panel hidden></div>' +
    (ctx.inlineSolution ? '<details class="fold solution"><summary>Ver la solución</summary><div><p>' + esc(ch.solution) + "</p></div></details>" : '<p class="link-row"><a href="#solucion">Ver la solución</a></p>') + "</div>";
  game.result.innerHTML = html;
  var title = $(".result-title", game.result); if (title) title.focus();
  count($("[data-count]", game.result), res.points);
  var shareBtn = $("[data-share]", game.result);
  if (shareBtn) shareBtn.addEventListener("click", function () {
    var url = absUrl(challengeUrl(ch)), txt = "RÉTAME · " + ch.title + "\n" + gridEmoji(grid) + "\n⚡ " + fmt(res.points) + " puntos · 🎯 " + res.accuracy + " %\n¿Puedes superarlo?";
    track("share_clicked", { channel: navigator.share ? "native" : "copy", what: "resultado" });
    if (!nativeShare({ title: "RÉTAME", text: txt, url: url })) copyText(txt + "\n" + url, shareBtn, "¡Resultado copiado!");
  });
  var d = $("[data-duel]", game.result);
  if (d) d.addEventListener("click", function () {
    mountDuelPanel($("[data-panel]", game.result), {
      title: ch.title, points: res.points, seconds: out.seconds,
      url: function (n) { return duelUrl(ch, n, res.points, out.seconds); },
      text: function (n, l) { return (n !== "Alguien" ? n + " te reta en RÉTAME: " : "Te reto en RÉTAME: ") + "«" + ch.title + "».\n" + gridEmoji(grid) + " · " + fmt(res.points) + " puntos en " + out.seconds + " s.\n¿Puedes superarlo?\n" + l; }
    });
  });
}

/* =====================================================================
 * Sesión de 10 retos en pantalla
 * =================================================================== */
function runSession(box, s, hooks) {
  var game = null, alive = true;
  function modeLabel() {
    if (s.mode === "sorpresa") return "Dificultad sorpresa";
    if (s.mode === "adaptativo") return "Nivel: " + TIER_LABELS[TIERS[Math.round(s.level)]];
    return TIER_LABELS[s.mode];
  }
  function hud() {
    var g = s.group;
    return '<div class="session-hud"><div class="hud-row"><span class="hud-title">' + catTile(g) + esc(g.slug === "sorpresa" ? "Sesión sorpresa" : "Sesión de " + g.name) + "</span>" +
      (g.hidden ? "" : '<span class="hud-pts"><b data-hud-pts>' + fmt(s.points) + "</b> pts</span>") + "</div>" +
      '<div class="track" style="margin-top:10px" role="progressbar" aria-label="Progreso de la sesión" aria-valuemin="0" aria-valuemax="' + s.total + '" aria-valuenow="' + s.i + '"><span style="width:' + Math.round(s.i / s.total * 100) + '%"></span></div>' +
      '<div class="hud-row sub"><span>Reto ' + (s.i + 1) + " de " + s.total + " · " + esc(modeLabel()) + '</span><button type="button" class="hud-exit" data-hud-exit>Terminar</button></div></div>';
  }
  function scrollToBox() {
    var y = box.getBoundingClientRect().top + (window.pageYOffset || 0) - 80;
    if ((window.pageYOffset || 0) > y) window.scrollTo(0, Math.max(0, y));
  }
  function round() {
    if (!alive) return;
    var found = sessionPick(s);
    if (!found) { toast("No hemos podido preparar otro reto. Prueba con otra categoría."); end(); return; }
    var ch = needsSeed(found.ch) ? instantiate(found.ch, randomSeed()) : found.ch;
    if (found.cycle && !s.notices.cycle) { s.notices.cycle = 1; toast("Has visto todo lo de aquí. Empezamos un ciclo nuevo, mezclado de otra forma."); }
    else if (found.relaxedKind && !s.notices.kind) { s.notices.kind = 1; toast("Se acabaron los retos de ese tipo: seguimos con otros del mismo tema."); }
    sessionRemember(s, ch);
    if (game) { game.stop(); game = null; }
    box.innerHTML = hud() + stageHtml(ch);
    $("[data-hud-exit]", box).addEventListener("click", function () { if (s.rounds.length) end(); else exit(); });
    game = mountGame($("[data-stage]", box), ch, { onDone: function (out, g) {
      var before = s.points, res = out.res, opinion = isOpinion(ch);
      var reg = registerPlay(ch, res, out.seconds, out.answers);
      s.points += res.points; s.seconds += out.seconds;
      if (!opinion) { s.correct += out.correct; s.answers += out.total; }
      if (res.accuracy >= 50) s.passed++;
      if (reg.record) s.records++;
      s.rounds.push({ ch: ch, points: res.points, seconds: out.seconds, accuracy: res.accuracy, answers: out.answers });
      adaptLevel(s, res, ch, out.seconds);
      count($("[data-hud-pts]", box), s.points, before);
      var fill = $(".session-hud .track span", box); if (fill) fill.style.width = Math.round((s.i + 1) / s.total * 100) + "%";
      var isLast = s.i === s.total - 1;
      g.result.innerHTML = '<div class="result">' +
        (opinion ? '<h2 class="result-title" tabindex="-1">Anotado.</h2>' :
          '<h2 class="result-title" tabindex="-1">' + resultMessage(res.accuracy, out.seconds <= ch.duration / 2) + '</h2><div class="score"><b data-count>0</b><span>puntos</span></div>' + squaresHtml(gridOf(out.answers), true) +
          statsHtml([["target", res.accuracy + " %"], ["clock", out.seconds + " s"]]) + (reg.record ? '<p><span class="badge">' + icon("trophy") + "Nuevo récord</span></p>" : "")) +
        achHtml(reg.fresh) +
        '<div class="actions"><button type="button" class="btn btn-primary btn-lg" data-next-reto>' + (isLast ? "Ver resumen" : "Siguiente reto" + icon("arrow")) + "</button></div>" +
        '<div class="link-row"><button type="button" class="text-link" data-exit-session>Terminar sesión</button></div>' +
        '<details class="fold solution"><summary>Ver la solución</summary><div><p>' + esc(ch.solution) + "</p></div></details></div>";
      var t = $(".result-title", g.result); if (t) t.focus();
      count($("[data-count]", g.result), res.points);
      var used = false;
      $("[data-next-reto]", g.result).addEventListener("click", function () { if (used) return; used = true; s.i++; if (s.i >= s.total) end(); else { round(); scrollToBox(); } });
      $("[data-exit-session]", g.result).addEventListener("click", end);
    } }, true);
  }
  function end() {
    if (game) { game.stop(); game = null; }
    if (!alive) return;
    var st = state(), n = s.rounds.length;
    if (!n) { exit(); return; }
    var prec = s.answers ? Math.round(s.correct / s.answers * 100) : null;
    var best = s.rounds.filter(function (r) { return !isOpinion(r.ch); }).sort(function (a, b) { return b.points - a.points; })[0];
    var full = n >= s.total;
    st.sessions += 1;
    var bestSession = full && s.points > st.bestSession && st.sessions > 1;
    if (full && s.points > st.bestSession) st.bestSession = s.points;
    save();
    var ach = full ? unlock("sesion") : null;
    var title = prec === null ? "Sesión completada." : prec >= 90 ? "Sesión brutal." : prec >= 70 ? "Muy buena sesión." : prec >= 40 ? "Bien jugado." : "A por la próxima.";
    box.innerHTML = '<section class="stage"><div class="result">' +
      '<p class="eyebrow">' + icon("trophy") + (full ? "Sesión completada" : "Sesión terminada") + "</p>" +
      '<h2 class="result-title" tabindex="-1">' + title + "</h2>" +
      '<p class="result-sub">' + esc(s.group.slug === "sorpresa" ? "Sesión sorpresa" : s.group.name) + " · " + n + " " + (n === 1 ? "reto" : "retos") + "</p>" +
      (s.group.hidden ? "" : '<div class="score"><b data-count>0</b><span>puntos</span></div>') +
      (bestSession ? '<p><span class="badge">' + icon("trophy") + "Tu mejor sesión</span></p>" : "") +
      squaresHtml(s.rounds.map(function (r) { return isOpinion(r.ch) ? "v" : gradeOf(r.accuracy); }).join("").slice(0, 10), true) +
      '<div class="tiles four end-tiles">' +
      '<div class="tile"><b>' + s.passed + "/" + n + "</b><span>retos superados</span></div>" +
      '<div class="tile"><b>' + (prec === null ? "—" : prec + " %") + "</b><span>precisión</span></div>" +
      '<div class="tile"><b>' + mmss(s.seconds) + "</b><span>tiempo jugado</span></div>" +
      '<div class="tile"><b class="is-amber">' + icon("flame") + streakNow() + "</b><span>días de racha</span></div></div>" +
      (best ? '<p class="muted">Tu mejor reto: «' + esc(best.ch.title) + "» · " + fmt(best.points) + " pts</p>" : "") +
      (ach ? achHtml([ach]) : "") +
      '<div class="actions"><button type="button" class="btn btn-primary btn-lg" data-again-session>Jugar otra sesión' + icon("repeat") + "</button>" +
      (best ? '<button type="button" class="btn btn-outline btn-lg" data-duel>' + icon("duel") + "Retar a un amigo</button>" : "") + "</div>" +
      '<div class="link-row"><a href="' + href("/reto-del-dia/") + '">Reto del día</a><a href="' + href("/juegos/") + '">Otra categoría</a><a href="' + href("/progreso/") + '">Ver progreso</a></div>' +
      '<div class="panel" data-panel hidden></div></div></section>';
    var t = $(".result-title", box); if (t) t.focus();
    count($("[data-count]", box), s.points);
    $("[data-again-session]", box).addEventListener("click", function () { if (!alive) return; alive = false; hooks.restart(); });
    var dbtn = $("[data-duel]", box);
    if (dbtn) dbtn.addEventListener("click", function () {
      var bc = best.ch;
      mountDuelPanel($("[data-panel]", box), {
        title: bc.title, points: best.points, seconds: best.seconds,
        url: function (nm) { return duelUrl(bc, nm, best.points, best.seconds); },
        text: function (nm, l) { return (nm !== "Alguien" ? nm + " te reta en RÉTAME: " : "Te reto en RÉTAME: ") + "«" + bc.title + "», " + fmt(best.points) + " puntos en " + best.seconds + " s. ¿Puedes superarlo?\n" + l; }
      });
    });
    scrollToBox();
    track("session_completed", { group: s.group.slug, rounds: n, points: s.points });
  }
  function exit() { alive = false; if (game) { game.stop(); game = null; } hooks.onExit(); }
  track("category_started", { group: s.group.slug, mode: s.mode });
  round();
  return function () { alive = false; if (game) { game.stop(); game = null; } };
}

/* =====================================================================
 * Reto del día: sesión de 4–5 pruebas
 * =================================================================== */
function roundTile(r, grade) {
  var c = catBySlug[r.ch.cat];
  return '<li class="round' + (grade ? " is-" + (grade === "v" ? "v" : grade === "~" ? "m" : "x") : "") + '">' + icon(c.icon) + "<span>" + esc(c.label || c.name) + "</span></li>";
}
function roundsHtml(set, grid, now) {
  return '<ul class="rounds' + (set.rounds.length === 4 ? " n4" : "") + '" aria-label="Pruebas de hoy: ' + esc(set.rounds.map(function (r) { return catBySlug[r.ch.cat].name; }).join(", ")) + '">' +
    set.rounds.map(function (r, i) { var t = roundTile(r, grid ? grid.charAt(i) : ""); return i === now ? t.replace('class="round', 'class="round is-now') : t; }).join("") + "</ul>";
}
function dailyShareText(set, rec, withStreak) {
  var s = streakNow();
  return "RÉTAME #" + set.number + " · " + shortDate(set.day) + "\n" + gridEmoji(rec.grid) + "\n⚡ " + fmt(rec.points) + "/1000 · 🎯 " + rec.acc + " %" +
    (withStreak && s > 1 ? "\n🔥 Racha: " + s + " días" : "");
}
function dailyDuelUrl(set, n, rec) {
  return absUrl(href("/reto-del-dia/")) + "?d=" + set.day + "&" + duelQuery(n, rec.points, rec.secs, { g: rec.grid });
}
function runDaily(box, set, opts) {
  opts = opts || {};
  var st = state(), today = dayInTz(), official = !opts.practice && !opts.duel && set.day === today;
  var results = [], i = 0, totalSecs = 0, game = null, alive = true;
  if (official && st.dailyRun && st.dailyRun.day === set.day && st.dailyRun.sig === set.sig) {
    results = st.dailyRun.results.slice(0, set.rounds.length); i = results.length; totalSecs = st.dailyRun.secs;
  }
  function persistRun() {
    if (!official) return;
    st.dailyRun = { day: set.day, sig: set.sig, secs: totalSecs, results: results.map(function (r) { return { points: r.points, accuracy: r.accuracy, seconds: r.seconds }; }) };
    save();
  }
  function grid() { return results.map(function (r) { return gradeOf(r.accuracy); }).join(""); }
  function hud() {
    return '<div class="session-hud"><div class="hud-row"><span class="hud-title">' + icon("calendar") + "Reto del día #" + set.number + (opts.practice ? " · práctica" : "") + "</span>" +
      '<span class="hud-pts">Prueba <b>' + (i + 1) + "</b> de " + set.rounds.length + "</span></div>" + roundsHtml(set, grid(), i).replace('class="rounds', 'class="rounds rounds-hud') + "</div>";
  }
  function play() {
    if (!alive) return;
    if (i >= set.rounds.length) { finish(); return; }
    var r = set.rounds[i], ch = r.ch;
    if (game) { game.stop(); game = null; }
    box.innerHTML = hud() + stageHtml(ch);
    game = mountGame($("[data-stage]", box), ch, { onDone: function (out, g) {
      var res = out.res;
      results.push({ points: res.points, accuracy: res.accuracy, seconds: out.seconds, ch: ch });
      totalSecs += out.seconds;
      persistRun();
      var last = i === set.rounds.length - 1;
      var gr = gradeOf(res.accuracy);
      g.result.innerHTML = '<div class="result">' + squaresHtml(gr, false) +
        '<h2 class="result-title" tabindex="-1">' + (gr === "v" ? "Perfecta." : gr === "~" ? "A medias." : "Fallada.") + "</h2>" +
        '<p class="result-sub">Prueba ' + (i + 1) + " de " + set.rounds.length + " · " + res.accuracy + " % · " + out.seconds + " s</p>" +
        '<div class="actions"><button type="button" class="btn btn-primary btn-lg" data-next-round>' + (last ? "Ver mi resultado" : "Siguiente prueba" + icon("arrow")) + "</button></div>" +
        '<details class="fold solution"><summary>Ver la solución</summary><div><p>' + esc(ch.solution) + "</p></div></details></div>";
      var t = $(".result-title", g.result); if (t) t.focus();
      var used = false;
      $("[data-next-round]", g.result).addEventListener("click", function () { if (used) return; used = true; i++; play(); window.scrollTo(0, Math.max(0, box.getBoundingClientRect().top + window.pageYOffset - 80)); });
    } }, true);
  }
  function finish() {
    var acc = Math.round(results.reduce(function (a, r) { return a + r.accuracy; }, 0) / Math.max(1, results.length));
    var rec = { points: dailyScore(set, results), acc: acc, secs: Math.max(1, Math.round(totalSecs)), grid: grid(), v: 2 };
    var fresh = [], record = false, streak = streakNow();
    if (official) {
      st.dailyRun = null;
      var had = st.daily[set.day];
      st.daily[set.day] = rec;
      record = st.records.bestDaily > 0 && rec.points > st.records.bestDaily;
      if (rec.points > st.records.bestDaily) { st.records.bestDaily = rec.points; st.records.bestDailyDay = set.day; }
      st.records.bestDailyAcc = Math.max(st.records.bestDailyAcc, acc);
      if (acc === 100 && (!st.records.fastestDaily || rec.secs < st.records.fastestDaily)) st.records.fastestDaily = rec.secs;
      if (!had || had.v !== 2) {
        results.forEach(function (r, k) { noteRound(set.rounds[k].ch, r); });
        st.history.unshift({ slug: "reto-del-dia-" + set.day, title: "Reto del día #" + set.number, cat: "diario", points: rec.points, accuracy: acc, seconds: rec.secs, at: Date.now(), daily: true, grid: rec.grid });
        st.history = st.history.slice(0, 80);
        st.points += rec.points; st.games += 1; addDayPoints(rec.points);
        streak = bumpStreak();
      }
      fresh = checkAch({ res: { accuracy: acc, points: rec.points }, seconds: rec.secs, st: st, daily: true, record: record });
      save(); updateStreakChip();
      track("daily_completed", { day: set.day, points: rec.points, accuracy: acc });
    }
    if (opts.duel && !opts.duel.invalid) {
      if (rec.points > opts.duel.p) { var w = unlock("duelo_ganado"); if (w) fresh.push(w); st.duelWins += 1; save(); }
      track("duel_completed", { won: rec.points > opts.duel.p, daily: true });
    }
    renderDailyResult(box, set, rec, { fresh: fresh, record: record, streak: streak, duel: opts.duel, practice: opts.practice, onReplay: opts.onReplay });
  }
  if (official) track("daily_started", { day: set.day, resumed: i > 0 });
  play();
  return function () { alive = false; if (game) { game.stop(); game = null; } };
}
function renderDailyResult(box, set, rec, ctx) {
  ctx = ctx || {};
  var today = dayInTz(), isToday = set.day === today;
  var html = '<section class="stage"><div class="result">' +
    '<p class="eyebrow">' + icon("calendar") + "Reto del día #" + set.number + " · " + esc(longDate(set.day)) + (ctx.practice ? " · práctica" : "") + "</p>" +
    '<h2 class="result-title" tabindex="-1">' + resultMessage(rec.acc, false) + "</h2>" +
    '<div class="score"><b data-count>0</b><span>de 1000</span></div>' +
    (ctx.record ? '<p><span class="badge">' + icon("trophy") + "Tu mejor reto del día</span></p>" : "") +
    squaresHtml(rec.grid, false) +
    statsHtml([["target", rec.acc + " % de precisión"], ["clock", mmss(rec.secs)], ["flame", streakNow() + (streakNow() === 1 ? " día" : " días") + " de racha"]]);
  if (ctx.duel && !ctx.duel.invalid) html += versusHtml(ctx.duel, rec.points, rec.secs);
  html += achHtml(ctx.fresh) +
    '<div class="actions"><a class="btn btn-primary btn-lg" href="' + href("/juegos/?tema=sorpresa") + '">Jugar otro reto' + icon("arrow") + "</a>" +
    (ctx.practice ? "" : '<button type="button" class="btn btn-outline btn-lg" data-duel>' + icon("duel") + (ctx.duel && !ctx.duel.invalid ? "Retar de vuelta" : "Retar a un amigo") + "</button>") + "</div>" +
    '<div class="link-row">' + (ctx.practice ? "" : '<button type="button" class="text-link" data-share>' + icon("share") + "Compartir resultado</button>") +
    '<a href="' + href("/progreso/") + '">Ver progreso</a><a href="' + href("/retos/") + '">Explorar categorías</a>' +
    (ctx.onReplay ? '<button type="button" class="text-link" data-replay>Repetir para practicar</button>' : "") + "</div>" +
    (isToday ? '<p class="done-note">Nuevo reto en <b data-next-daily>' + clock(secsToMidnight()) + "</b><span>Mismo reto para todo el mundo. Mañana, otro.</span></p>" : "") +
    '<div class="panel" data-panel hidden></div></div></section>';
  box.innerHTML = html;
  var t = $(".result-title", box); if (t) t.focus();
  count($("[data-count]", box), rec.points);
  var nd = $("[data-next-daily]", box);
  if (nd) { var iv = setInterval(function () { if (!document.body.contains(nd)) { clearInterval(iv); return; } nd.textContent = clock(secsToMidnight()); }, 1000); }
  var sh = $("[data-share]", box);
  if (sh) sh.addEventListener("click", function () {
    var url = absUrl(href("/reto-del-dia/")), txt = dailyShareText(set, rec, true) + "\n¿Me superas?";
    track("share_clicked", { channel: navigator.share ? "native" : "copy", what: "diario" });
    if (!nativeShare({ title: "RÉTAME #" + set.number, text: txt, url: url })) copyText(txt + "\n" + url, sh, "¡Resultado copiado!");
  });
  var d = $("[data-duel]", box);
  if (d) d.addEventListener("click", function () {
    mountDuelPanel($("[data-panel]", box), {
      title: "Reto del día #" + set.number, points: rec.points, seconds: rec.secs,
      url: function (n) { return dailyDuelUrl(set, n, rec); },
      text: function (n, l) { return dailyShareText(set, rec, true) + "\n" + (n !== "Alguien" ? n + " te reta. " : "") + "¿Puedes superarme?\n" + l; }
    });
  });
  var rp = $("[data-replay]", box);
  if (rp) rp.addEventListener("click", ctx.onReplay);
}

/* =====================================================================
 * Páginas
 * =================================================================== */
function fillBestBadges() {
  var st = state();
  $$("[data-best]").forEach(function (el) {
    var b = st.best[el.getAttribute("data-best")];
    if (b) el.textContent = "Tu marca: " + fmt(b.points);
  });
}

function mountHome() {
  var today = dayInTz(), set = dailySet(today), done = dailyDone(today), st = state();
  var ticket = $("[data-ticket]");
  if (ticket && set) {
    $("[data-ticket-num]", ticket).textContent = "#" + set.number;
    $("[data-ticket-date]", ticket).textContent = longDate(today);
    var roundsBox = $("[data-ticket-rounds]", ticket);
    roundsBox.outerHTML = roundsHtml(set, done ? done.grid : "");
    var title = $("[data-ticket-title]", ticket), sub = $("[data-ticket-sub]", ticket), extra = $("[data-ticket-extra]", ticket);
    if (done) {
      title.textContent = "Hecho por hoy.";
      sub.textContent = "Tu resultado está listo para compartir. Mañana, " + (set.rounds.length === 5 ? "más" : "otras") + " pruebas.";
      extra.innerHTML = '<div class="ticket-score"><b>' + fmt(done.points) + "</b><span>/ 1000</span></div>";
    } else {
      var run = st.dailyRun && st.dailyRun.day === today && st.dailyRun.sig === set.sig ? st.dailyRun.results.length : 0;
      title.textContent = set.rounds.length + " pruebas. Una puntuación.";
      sub.textContent = run ? "Vas por la prueba " + (run + 1) + " de " + set.rounds.length + ". Tu marca te espera." : "Dificultad creciente. Mismo reto para todo el mundo.";
    }
    var cd = $("[data-countdown]", ticket);
    if (cd) {
      cd.textContent = clock(secsToMidnight());
      var iv = setInterval(function () { if (!document.body.contains(cd)) { clearInterval(iv); return; } var s = secsToMidnight(); cd.textContent = clock(s); if (s >= 86399) location.reload(); }, 1000);
    }
  }
  var cta = $("[data-hero-cta]");
  if (cta && done) { cta.innerHTML = "Ver mi resultado" + icon("arrow"); }
  var box = $("[data-home-stats]");
  if (box) {
    var flame = streakNow(), achGot = ACH.filter(function (a) { return st.ach[a.code]; }).length;
    box.innerHTML = '<div class="tiles four">' +
      '<div class="tile"><b class="is-amber">' + icon("flame") + flame + "</b><span>" + (flame === 1 ? "día" : "días") + " de racha</span></div>" +
      '<div class="tile"><b>' + icon("trophy") + (st.records.bestDaily ? fmt(st.records.bestDaily) : "—") + "</b><span>mejor reto del día</span></div>" +
      '<div class="tile"><b>' + icon("check") + fmt(st.games) + "</b><span>retos completados</span></div>" +
      '<div class="tile"><b>' + icon("star") + achGot + "/" + ACH.length + "</b><span>logros</span></div></div>";
  }
}

function mountDailyPage() {
  var box = $("[data-daily]"); if (!box) return;
  var q = getParams(), today = dayInTz(), stop = null;
  var day = q.d && validDay(q.d) && dayNum(q.d) <= dayNum(today) && dayNum(q.d) >= dayNum(CONFIG.launchDay) ? q.d : today;
  var set = dailySet(day);
  if (!set || !set.rounds.length) { box.innerHTML = '<div class="empty"><p><b>No hemos podido preparar el reto.</b> Recarga la página.</p></div>'; return; }
  var duel = parseDuel(q, 1000);
  if (duel && duel.invalid) { toast("El enlace del duelo no es válido. Juega el reto igualmente."); duel = null; }
  var intro = $("[data-daily-intro]");
  function startScreen() {
    var done = day === today ? dailyDone(today) : null;
    if (stop) { stop(); stop = null; }
    if (done && !duel) {
      renderDailyResult(box, set, done, { onReplay: function () { stop = runDaily(box, set, { practice: true, onReplay: startScreen }); } });
      if (intro) intro.hidden = true;
      return;
    }
    var st = state(), resumed = day === today && !duel && st.dailyRun && st.dailyRun.day === day && st.dailyRun.sig === set.sig ? st.dailyRun.results.length : 0;
    var label = duel ? "Aceptar el reto" : resumed ? "Continuar: prueba " + (resumed + 1) + " de " + set.rounds.length : "Empezar el reto de hoy";
    box.innerHTML = (duel ? duelBanner(duel, "el reto del día #" + set.number) : "") +
      '<div class="ticket"><div class="ticket-top"><span class="ticket-badge">' + icon("calendar") + "Reto del día #" + set.number + '</span><span class="ticket-date">' + esc(longDate(day)) + "</span></div>" +
      "<h2>" + (day === today ? set.rounds.length + " pruebas. Una puntuación." : "El reto del " + esc(longDate(day)) + ".") + "</h2>" +
      "<p>" + (day === today ? "Lógica, memoria, números… de menos a más. Responde con calma: la precisión pesa mucho más que la velocidad." : "Juegas el mismo reto que " + esc(duel ? duel.n : "esa persona") + ". No cuenta como reto de hoy.") + "</p>" +
      roundsHtml(set, "") +
      '<div class="ticket-foot"><button type="button" class="btn btn-amber btn-lg" data-go>' + icon("play") + esc(label) + "</button>" +
      (day === today ? '<div class="countdown"><span>Nuevo reto en</span><b data-countdown>' + clock(secsToMidnight()) + "</b></div>" : "") + "</div></div>";
    var cd = $("[data-countdown]", box);
    if (cd) { var iv = setInterval(function () { if (!document.body.contains(cd)) { clearInterval(iv); return; } cd.textContent = clock(secsToMidnight()); }, 1000); }
    $("[data-go]", box).addEventListener("click", function () {
      if (intro) intro.hidden = true;
      stop = runDaily(box, set, { duel: duel, onReplay: startScreen });
      box.scrollIntoView({ block: "start" });
    });
  }
  startScreen();
}

function mountChallengePage() {
  var stageWrap = $("[data-challenge]"); if (!stageWrap) return;
  var base0 = resolveChallenge(stageWrap.getAttribute("data-challenge"));
  if (!base0 || !validateChallenge(base0)) return;
  var q = getParams(), duel = parseDuel(q, base0.max_points);
  if (duel && duel.invalid) { toast("El enlace del duelo no es válido. Juega el reto igualmente."); duel = null; }
  var ch = needsSeed(base0) ? instantiate(base0, duel && duel.k !== undefined ? duel.k : randomSeed()) : base0;
  if (duel) {
    var slot = $("[data-duel-banner]");
    if (slot) slot.innerHTML = duelBanner(duel, "«" + ch.title + "»");
    var startBtn = $("[data-start]", stageWrap); if (startBtn) startBtn.innerHTML = icon("play") + "Aceptar el reto";
    track("duel_opened", { slug: ch.slug });
  }
  mountGame($("[data-stage]", stageWrap), ch, { onDone: function (out, g) { showSingleResult(g, out, { duel: duel }); } });
}

function mountGamesPage() {
  var q = getParams(), selector = $("[data-selector]"), box = $("[data-play]");
  if (!box) return;
  var current = null;
  function hideSelector() { if (selector) selector.hidden = true; box.hidden = false; }
  if (q.reto) {
    var base1 = resolveChallenge(q.reto);
    if (!base1 || !validateChallenge(base1)) { toast("Ese reto no existe. Te proponemos otros."); return; }
    if (!base1.generated && !catBySlug[base1.cat].hidden) { location.replace(challengeUrl(base1) + queryWithout("reto")); return; }
    hideSelector();
    var ch = needsSeed(base1) ? instantiate(base1, randomSeed()) : base1;
    box.innerHTML = '<header class="page-head"><p class="eyebrow">' + icon(catBySlug[ch.cat].icon) + esc(catBySlug[ch.cat].name) + "</p><h1>" + esc(ch.title) + '</h1><p class="lead">' + esc(ch.excerpt) + "</p></header>" + stageHtml(ch);
    document.title = ch.title + " — RÉTAME";
    mountGame($("[data-stage]", box), ch, { onDone: function (out, g) { showSingleResult(g, out, { inlineSolution: true }); } });
    return;
  }
  var g = q.tema ? groupFor(q.tema) : null;
  if (!g) { if (q.tema) toast("Esa categoría no existe. Elige otra."); return; }
  hideSelector();
  function start(mode, kind) {
    if (current) current();
    current = runSession(box, createSession(g, mode, kind), {
      onExit: function () { current = null; location.href = href("/juegos/"); },
      restart: function () { start(mode, kind); }
    });
    box.scrollIntoView({ block: "start" });
  }
  if (g.slug === "sorpresa" || g.hidden) { document.title = (g.slug === "sorpresa" ? "Sorpréndeme" : g.name) + " — RÉTAME"; start("sorpresa", "todas"); return; }
  document.title = "Jugar: " + g.name + " — RÉTAME";
  var kinds = {};
  CHALLENGES.forEach(function (c) { if (c.cat === g.slug) kinds[c.kind] = 1; });
  (GENERATORS[g.slug] || []).forEach(function (x) { kinds[x.kind] = 1; });
  var kindList = Object.keys(kinds), sel = { mode: "sorpresa", kind: "todas" };
  box.innerHTML = '<a class="text-link" href="' + href("/juegos/") + '">' + icon("back") + "Cambiar de categoría</a>" +
    '<header class="page-head cat-head">' + catTile(g, "xl") + "<div><h1>" + esc(g.name) + '</h1><p class="lead" style="margin:0">' + esc(g.short) + "</p></div></header>" +
    '<h2 id="mode-title" style="font-size:1.2rem">¿Cómo lo quieres?</h2>' +
    '<div class="mode-grid" role="radiogroup" aria-labelledby="mode-title">' +
    MODES.map(function (m) {
      var on = m.id === "sorpresa";
      return '<button type="button" class="mode-card' + (m.featured ? " is-featured" : "") + '" role="radio" aria-checked="' + on + '" tabindex="' + (on ? 0 : -1) + '" data-mode="' + m.id + '"><b>' + esc(m.name) + (m.featured ? '<span class="pill">Recomendado</span>' : "") + "</b><small>" + esc(m.desc) + "</small></button>";
    }).join("") + "</div>" +
    (kindList.length > 1 ? '<button type="button" class="text-link" data-adv-toggle aria-expanded="false" aria-controls="adv-panel">Elegir el tipo de reto</button>' +
      '<div class="card" id="adv-panel" data-adv hidden><div class="chips" role="group" aria-label="Tipo de reto"><button type="button" class="chip" aria-pressed="true" data-kind="todas">Variado</button>' +
      kindList.map(function (k) { return '<button type="button" class="chip" aria-pressed="false" data-kind="' + k + '">' + esc(KIND_LABELS[k] || k) + "</button>"; }).join("") +
      '</div><p class="muted small" style="margin:10px 0 0">Si se agotan los de un tipo, seguimos con otros del mismo tema y te avisamos.</p></div>' : "") +
    '<div class="actions"><button type="button" class="btn btn-primary btn-lg" data-start-session>' + icon("play") + "Empezar sesión</button></div>" +
    '<p class="muted small">' + SESSION_LEN + " retos seguidos, sin repetir. Puedes terminar cuando quieras.</p>";
  var cards = $$(".mode-card", box);
  function pick(card, focus) {
    cards.forEach(function (c) { var on = c === card; c.setAttribute("aria-checked", on ? "true" : "false"); c.tabIndex = on ? 0 : -1; });
    sel.mode = card.dataset.mode; if (focus) card.focus();
  }
  cards.forEach(function (c, i) {
    c.addEventListener("click", function () { pick(c); });
    c.addEventListener("keydown", function (e) {
      var d = (e.key === "ArrowRight" || e.key === "ArrowDown") ? 1 : (e.key === "ArrowLeft" || e.key === "ArrowUp") ? -1 : 0;
      if (!d) return; e.preventDefault(); pick(cards[(i + d + cards.length) % cards.length], true);
    });
  });
  var tog = $("[data-adv-toggle]", box), adv = $("[data-adv]", box);
  if (tog) tog.addEventListener("click", function () {
    var open = adv.hidden; adv.hidden = !open; tog.setAttribute("aria-expanded", open ? "true" : "false");
    if (!open) { sel.kind = "todas"; $$("[data-kind]", box).forEach(function (b) { b.setAttribute("aria-pressed", b.dataset.kind === "todas" ? "true" : "false"); }); }
  });
  $$("[data-kind]", box).forEach(function (b) {
    b.addEventListener("click", function () { $$("[data-kind]", box).forEach(function (x) { x.setAttribute("aria-pressed", x === b ? "true" : "false"); }); sel.kind = b.dataset.kind; });
  });
  $("[data-start-session]", box).addEventListener("click", function () { start(sel.mode, sel.kind); });
}

function mountDuelsPage() {
  var q = getParams(), box = $("[data-duel-play]");
  if (!box || !q.r) return;
  var base2 = resolveChallenge(q.r);
  if (!base2 || !validateChallenge(base2)) { toast("Ese duelo ya no existe. Elige otro reto."); return; }
  if (!base2.generated && !catBySlug[base2.cat].hidden) { location.replace(challengeUrl(base2) + queryWithout("r")); return; }
  var duel = parseDuel(q, base2.max_points);
  if (duel && duel.invalid) { toast("El enlace del duelo no es válido. Juega el reto igualmente."); duel = null; }
  var ch = needsSeed(base2) ? instantiate(base2, duel && duel.k !== undefined ? duel.k : randomSeed()) : base2;
  var intro = $("[data-duels-intro]"); if (intro) intro.hidden = true;
  box.hidden = false;
  box.innerHTML = (duel ? duelBanner(duel, "«" + ch.title + "»") : "") + '<h2>' + esc(ch.title) + '</h2><p class="lead">' + esc(ch.excerpt) + "</p>" + stageHtml(ch, duel ? "Aceptar el reto" : "Empezar");
  document.title = (duel ? duel.n + " te reta en RÉTAME" : ch.title + " — RÉTAME");
  if (duel) track("duel_opened", { slug: ch.slug });
  mountGame($("[data-stage]", box), ch, { onDone: function (out, g) { showSingleResult(g, out, { duel: duel, inlineSolution: true }); } });
}

function mountProgressPage() {
  var root = $("[data-progress]"); if (!root) return;
  function render() {
    var st = state(), s = streakNow(), today = dayInTz();
    var achGot = ACH.filter(function (a) { return st.ach[a.code]; }).length;
    var prec = st.accN ? Math.round(st.accSum / st.accN) : null;
    var favCat = Object.keys(st.catStats).filter(function (c) { return catBySlug[c] && !catBySlug[c].hidden; }).sort(function (a, b) { return st.catStats[b].g - st.catStats[a].g; })[0];
    var tiles = '<div class="tiles">' +
      '<div class="tile"><b class="is-amber">' + icon("flame") + s + "</b><span>racha actual</span></div>" +
      '<div class="tile"><b>' + icon("trophy") + st.streak.best + "</b><span>mejor racha</span></div>" +
      '<div class="tile"><b>' + icon("check") + fmt(st.games) + "</b><span>retos completados</span></div>" +
      '<div class="tile"><b>' + icon("target") + (prec === null ? "—" : prec + " %") + "</b><span>precisión media</span></div>" +
      '<div class="tile"><b>' + icon("bolt") + fmt(st.points) + "</b><span>puntos totales</span></div>" +
      '<div class="tile"><b>' + icon("star") + achGot + "/" + ACH.length + "</b><span>logros</span></div></div>";
    var records = '<section class="section"><h2>Tus récords</h2><div class="tiles four">' +
      '<div class="tile"><b>' + (st.records.bestDaily ? fmt(st.records.bestDaily) : "—") + "</b><span>mejor reto del día" + (st.records.bestDailyDay ? " (" + esc(shortDate(st.records.bestDailyDay)) + ")" : "") + "</span></div>" +
      '<div class="tile"><b>' + (st.records.bestDailyAcc ? st.records.bestDailyAcc + " %" : "—") + "</b><span>mejor precisión diaria</span></div>" +
      '<div class="tile"><b>' + (st.records.fastestDaily ? mmss(st.records.fastestDaily) : "—") + "</b><span>reto del día perfecto más rápido</span></div>" +
      '<div class="tile"><b>' + (st.records.bestPoints ? fmt(st.records.bestPoints) : "—") + "</b><span>mejor puntuación en un reto</span></div>" +
      '<div class="tile"><b>' + fmt(st.records.perfects) + "</b><span>retos sin fallos</span></div>" +
      '<div class="tile"><b>' + (st.bestSession ? fmt(st.bestSession) : "—") + "</b><span>mejor sesión de 10</span></div>" +
      '<div class="tile"><b>' + (favCat ? esc(catBySlug[favCat].name) : "—") + "</b><span>categoría favorita</span></div>" +
      '<div class="tile"><b>' + fmt(st.duelWins) + "</b><span>duelos ganados</span></div></div></section>";
    var body;
    if (!st.games) {
      body = tiles + '<div class="empty" style="margin-top:16px"><p><b>Todavía no has jugado.</b> Empieza por el reto de hoy: aquí verás tu racha, tus récords y tus logros.</p><div class="actions" style="margin-top:0"><a class="btn btn-primary" href="' + href("/reto-del-dia/") + '">Jugar el reto de hoy</a></div></div>';
    } else {
      var days = [], k, LET = ["D", "L", "M", "X", "J", "V", "S"];
      for (k = 13; k >= 0; k--) { var dk = addDay(today, -k); days.push({ d: dk, v: (st.days[dk] || {}).points || 0 }); }
      var max = Math.max.apply(null, days.map(function (x) { return x.v; }).concat([1]));
      var chart = '<div class="chart" role="img" aria-label="Puntos de los últimos 14 días: ' + days.map(function (x) { return fmt(x.v); }).join(", ") + '">' +
        days.map(function (x) {
          var h = x.v ? Math.max(8, Math.round(x.v / max * 100)) : 4;
          return '<div class="chart-col" title="' + x.d + ": " + fmt(x.v) + ' pts"><div class="chart-bar' + (x.v ? "" : " is-zero") + (x.d === today ? " is-today" : "") + '" style="height:' + h + '%"></div><small>' + LET[new Date(x.d + "T12:00:00Z").getUTCDay()] + "</small></div>";
        }).join("") + "</div>";
      var cats = Object.keys(st.catStats).filter(function (c) { return catBySlug[c] && !catBySlug[c].hidden && st.catStats[c].n > 0; }).sort(function (a, b) { return st.catStats[b].g - st.catStats[a].g; });
      var catbars = cats.length ? '<section class="section"><h2>Precisión por categoría</h2><div class="catbars">' + cats.map(function (c) {
        var cs = st.catStats[c], p = Math.round(cs.acc / cs.n), cc = catBySlug[c];
        return '<div class="cb" style="--cat:' + cc.color + '"><span>' + esc(cc.name) + '</span><div class="cb-track"><div class="cb-fill" style="width:' + p + '%"></div></div><b>' + p + " %</b></div>";
      }).join("") + "</div></section>" : "";
      var bestList = Object.keys(st.best).map(function (k2) { return { ch: chBySlug[k2] || null, b: st.best[k2] }; }).filter(function (x) { return x.ch && !x.ch.generated; }).sort(function (a, b) { return b.b.points - a.b.points; }).slice(0, 8);
      body = tiles + records +
        '<section class="section"><h2>Tus últimos 14 días</h2>' + chart + "</section>" + catbars +
        (bestList.length ? '<section class="section"><h2>Tus mejores marcas</h2>' + bestList.map(function (x) { return '<div class="table-row"><a href="' + challengeUrl(x.ch) + '">' + esc(x.ch.title) + "</a><b>" + fmt(x.b.points) + " pts</b></div>"; }).join("") + "</section>" : "") +
        '<section class="section"><h2>Últimas partidas</h2>' + st.history.slice(0, 10).map(function (h) {
          var known = h.daily ? null : resolveChallenge(h.slug);
          var link = h.daily ? href("/reto-del-dia/") : known ? challengeUrl(known) : "";
          return '<div class="table-row"><div>' + (link ? '<a href="' + link + '">' + esc(h.title) + "</a>" : '<span class="t">' + esc(h.title) + "</span>") +
            "<small>" + new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "short" }).format(new Date(h.at || Date.now())) + " · " + h.seconds + " s · " + h.accuracy + " %" + "</small></div><b>" + fmt(h.points) + (h.daily ? "/1000" : " pts") + "</b></div>";
        }).join("") + "</section>";
    }
    var ach = '<section class="section"><h2>Logros</h2><div class="ach-grid">' + ACH.map(function (a) {
      var got = !!st.ach[a.code];
      return '<div class="ach' + (got ? "" : " is-locked") + '"><span class="cat-tile">' + icon(got ? "trophy" : "lock") + "</span><div><b>" + esc(a.name) + "</b><span>" + esc(a.desc) + (got ? "" : " (por conseguir)") + "</span></div></div>";
    }).join("") + "</div></section>";
    var reset = '<section class="section"><h2>Tus datos</h2><p class="muted">Tu progreso vive solo en este navegador. Si borras los datos del sitio o cambias de dispositivo, empiezas de cero.' + (st.migratedFrom ? " Hemos traído tu progreso de la versión anterior de RÉTAME." : "") + (storageOk ? "" : " <b>Tu navegador no permite guardar datos: el progreso no se conservará al cerrar.</b>") + "</p>" +
      '<div data-reset-box><button type="button" class="btn btn-ghost btn-sm" data-reset>Borrar mi progreso</button></div></section>';
    root.innerHTML = body + ach + reset;
    var rb = $("[data-reset-box]", root);
    $("[data-reset]", root).addEventListener("click", function () {
      rb.innerHTML = '<p><b>¿Seguro?</b> Se borrarán tu racha, tus puntos, tus récords y tus logros. No se puede deshacer.</p><div class="actions" style="margin-top:0"><button type="button" class="btn btn-primary btn-sm" data-yes>Sí, borrar</button><button type="button" class="btn btn-ghost btn-sm" data-no>Cancelar</button></div>';
      $("[data-yes]", rb).addEventListener("click", function () { resetAll(); updateStreakChip(); render(); toast("Progreso borrado."); });
      $("[data-no]", rb).addEventListener("click", render);
      $("[data-yes]", rb).focus();
    });
  }
  render();
}

/* =====================================================================
 * Enlaces antiguos (#/ruta) → URLs reales
 * =================================================================== */
function legacyTarget(hash) {
  if (!/^#\//.test(hash || "")) return null;
  var h = hash.slice(1), qs = "", i = h.indexOf("?");
  if (i >= 0) { qs = h.slice(i + 1); h = h.slice(0, i); }
  h = h.replace(/\/+$/, "") || "/";
  var m, q = qs ? "?" + qs : "";
  if (h === "/") return href("/");
  if (h === "/reto-del-dia") return href("/reto-del-dia/");
  if (h === "/juegos") return href("/juegos/");
  if (h === "/sorprendeme") return href("/juegos/?tema=sorpresa");
  if ((m = /^\/(?:juegos|categoria)\/([a-z-]+)$/.exec(h))) return href("/juegos/?tema=" + (LEGACY_CATS[m[1]] || m[1]));
  if (h === "/catalogo") return href("/retos/");
  if ((m = /^\/catalogo\/([a-z-]+)$/.exec(h))) { var nc = LEGACY_CATS[m[1]] || m[1]; return catBySlug[nc] && !catBySlug[nc].hidden ? catUrl(nc) : href("/retos/"); }
  if (h === "/acertijos") return catUrl("logica");
  if ((m = /^\/(juego|duelo)\/([a-z0-9-]+)$/.exec(h))) {
    var ch = resolveChallenge(m[2]);
    if (!ch) return href("/retos/");
    if (!ch.generated && !catBySlug[ch.cat].hidden) return challengeUrl(ch) + q;
    return m[1] === "duelo" ? href("/duelos/?r=" + encodeURIComponent(ch.slug) + (qs ? "&" + qs : "")) : challengeUrl(ch);
  }
  if (h === "/reta-a-tus-amigos") return href("/duelos/");
  if (/^\/(progreso|perfil|ranking|rachas)$/.test(h)) return href("/progreso/");
  if (h === "/como-funciona") return href("/como-funciona/");
  if (h === "/contacto") return href("/contacto/");
  if ((m = /^\/legal\/(privacidad|cookies)$/.exec(h))) return href("/" + m[1] + "/");
  return href("/");
}

/* =====================================================================
 * Publicidad (solo si hay IDs reales en CONFIG.adsense)
 * =================================================================== */
function adsReady() { return /^ca-pub-\d{10,20}$/.test(CONFIG.adsense.client || ""); }
function loadScript(src, attrs) {
  var s = document.createElement("script"); s.async = true; s.src = src;
  Object.keys(attrs || {}).forEach(function (k) { s.setAttribute(k, attrs[k]); });
  document.head.appendChild(s); return s;
}
function initAds() {
  var slots = $$("[data-ad]");
  if (!adsReady() || !slots.length) return;
  function fill() {
    loadScript("https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=" + encodeURIComponent(CONFIG.adsense.client), { crossorigin: "anonymous" });
    slots.forEach(function (el) {
      var id = (CONFIG.adsense.slots || {})[el.getAttribute("data-ad")];
      if (!/^\d{6,}$/.test(id || "")) { el.remove(); return; }
      el.innerHTML = '<ins class="adsbygoogle" style="display:block" data-ad-client="' + esc(CONFIG.adsense.client) + '" data-ad-slot="' + esc(id) + '" data-ad-format="auto" data-full-width-responsive="true"></ins>';
      try { (window.adsbygoogle = window.adsbygoogle || []).push({}); } catch (e) { /* ignorar */ }
    });
  }
  /* Con una CMP externa, los anuncios esperan a que el TCF esté listo.
   * Con el mensaje de Google (modo "google"), lo gestiona el propio
   * código de AdSense. */
  if (CONFIG.consent.mode === "tcf") {
    if (CONFIG.consent.cmpScript) loadScript(CONFIG.consent.cmpScript);
    var tries = 0, wait = setInterval(function () {
      tries++;
      if (typeof window.__tcfapi === "function") {
        clearInterval(wait);
        window.__tcfapi("addEventListener", 2, function (tc, ok) {
          if (ok && tc && (tc.eventStatus === "tcloaded" || tc.eventStatus === "useractioncomplete")) { fill(); fill = function () {}; }
        });
      } else if (tries > 100) clearInterval(wait);
    }, 100);
  } else fill();
}

/* =====================================================================
 * Arranque
 * =================================================================== */
function mountPage() {
  try {
    if (PAGE === "home") mountHome();
    else if (PAGE === "daily") mountDailyPage();
    else if (PAGE === "challenge") mountChallengePage();
    else if (PAGE === "games") mountGamesPage();
    else if (PAGE === "duels") mountDuelsPage();
    else if (PAGE === "progress") mountProgressPage();
  } catch (e) {
    toast("Algo ha fallado al preparar el juego. Recarga la página.");
    if (window.console) console.error(e);
  }
  fillBestBadges();
  initAds();
}

/* --- Router del archivo único: cada página viaja en ROUTES y se pinta
 * según el hash (#/retos/logica/). Los enlaces antiguos (#/juego/…) se
 * traducen igual que en la web publicada. ------------------------------ */
var firstRoute = true;
function findRoute(path) {
  if (typeof ROUTES === "undefined") return null;
  return ROUTES[path] || ROUTES[path.replace(/\/?$/, "/")] || null;
}
function renderRoute() {
  var h = location.hash || "#/";
  if (h.charAt(1) !== "/") return;
  var qi = h.indexOf("?"), path = (qi >= 0 ? h.slice(1, qi) : h.slice(1)) || "/";
  var page = findRoute(path);
  if (!page) {
    var legacy = legacyTarget(h);
    var lp = legacy ? legacy.slice(1).split("?")[0] : "";
    if (legacy && legacy !== h && lp !== "/" && findRoute(lp)) { location.replace(legacy); return; }
    page = ROUTES["/404.html"];
  }
  stopGames();
  var main = $("#main");
  main.innerHTML = page.body;
  document.title = page.title;
  var md = $('meta[name="description"]'); if (md) md.setAttribute("content", page.desc);
  PAGE = page.page;
  document.body.setAttribute("data-page", PAGE);
  var key = page.path;
  $$("#main-nav a").forEach(function (a) {
    var target = (a.getAttribute("href") || "").slice(1);
    if (target !== "/" && key.indexOf(target) === 0) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current");
  });
  var nav = $("#main-nav"), toggle = $(".nav-toggle");
  if (nav) nav.classList.remove("is-open");
  if (toggle) toggle.setAttribute("aria-expanded", "false");
  if (!firstRoute) { window.scrollTo(0, 0); main.focus({ preventScroll: true }); }
  firstRoute = false;
  updateStreakChip();
  mountPage();
}

function init() {
  if (isStandalone()) {
    window.addEventListener("hashchange", renderRoute);
    document.addEventListener("click", function (e) {
      var a = e.target.closest ? e.target.closest("a[href^='#']") : null;
      if (!a || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey) return;
      var hrefv = a.getAttribute("href");
      if (hrefv.charAt(1) !== "/") {
        /* Anclas internas (#solucion, #main): desplazar sin cambiar de página. */
        var target = document.getElementById(hrefv.slice(1));
        e.preventDefault();
        if (target) { if (target.tagName === "DETAILS") target.open = true; target.scrollIntoView({ block: "start" }); if (target.focus) target.focus({ preventScroll: true }); }
        return;
      }
      if (hrefv === location.hash) { e.preventDefault(); renderRoute(); }
    });
  } else {
    var legacy = legacyTarget(location.hash);
    if (legacy) { location.replace(legacy); return; }
  }
  var toggle = $(".nav-toggle"), nav = $("#main-nav");
  if (toggle && nav) {
    toggle.addEventListener("click", function () { var open = nav.classList.toggle("is-open"); toggle.setAttribute("aria-expanded", open ? "true" : "false"); });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape" && nav.classList.contains("is-open")) { nav.classList.remove("is-open"); toggle.setAttribute("aria-expanded", "false"); toggle.focus(); } });
  }
  var y = $("[data-year]"); if (y) y.textContent = new Date().getFullYear();
  state();
  updateStreakChip();
  if (isStandalone()) renderRoute(); else mountPage();
}
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();

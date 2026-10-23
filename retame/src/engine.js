/* =====================================================================
 * RÉTAME — motor de retos (puro: sin DOM ni almacenamiento)
 *
 * Lo usan el navegador y el generador del sitio (build.mjs / tests).
 * Categoría → generador → dificultad → semilla → reto. Todo reto
 * generado se reconstruye desde su slug, así los duelos funcionan en
 * cualquier dispositivo. Nada aquí usa Math.random: la aleatoriedad
 * siempre llega como `rng` para que el resultado sea reproducible.
 * =================================================================== */
var ENGINE_VERSION = 2;
var KIND_LABELS = { opcion_multiple: "Opción múltiple", secuencia: "Serie", respuesta_texto: "Escribe la respuesta", verdadero_falso: "Verdadero o falso", ordenar: "Ordenar", emparejar: "Emparejar", estimar: "Estimación", memoria: "Memoria" };
var TIERS = ["facil", "normal", "dificil", "experto"];
var TIER_LABELS = { todas: "Cualquiera", facil: "Fácil", normal: "Normal", dificil: "Difícil", experto: "Experto" };

var ALL_CATS = CATEGORIES.concat(HIDDEN_CATEGORIES);
var PUBLIC_CATS = CATEGORIES.slice().sort(function (a, b) { return a.order - b.order; });
var catBySlug = {}, chBySlug = {};
ALL_CATS.forEach(function (c) { catBySlug[c.slug] = c; });

/* --- Utilidades ------------------------------------------------------ */
function esc(v) {
  return String(v === null || v === undefined ? "" : v).replace(/[&<>"']/g, function (c) {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
  });
}
function norm(v) {
  return String(v).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9ñ ]/g, "").replace(/\s+/g, " ").trim();
}
function fmt(n) { return Number(n || 0).toLocaleString("es-ES"); }
function fmtNum(n) { return Number(n).toLocaleString("es-ES", { maximumFractionDigits: 3 }); }
function durLabel(s) {
  if (s < 60) return s + " s";
  var m = Math.floor(s / 60), r = s % 60;
  return m + " min" + (r ? " " + r + " s" : "");
}
function mmss(s) { var m = Math.floor(s / 60), r = s % 60; return m + ":" + (r < 10 ? "0" : "") + r; }
function mulberry(seed) {
  var a = seed | 0;
  return function () {
    a = (a + 0x6D2B79F5) | 0;
    var t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
/* FNV-1a de 32 bits: convierte texto (una fecha, una firma) en semilla. */
function hashStr(s) {
  var h = 0x811c9dc5;
  for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}
function randPick(arr, rng) { return arr[Math.floor(rng() * arr.length)]; }
function randInt(min, max, rng) { return min + Math.floor(rng() * (max - min + 1)); }
function shuffleWith(a, rng) {
  var arr = a.slice();
  for (var i = arr.length - 1; i > 0; i--) { var j = Math.floor(rng() * (i + 1)); var t = arr[i]; arr[i] = arr[j]; arr[j] = t; }
  return arr;
}
function seedFrom(rng) { return Math.floor(rng() * 4294967296); }
function gcd(a, b) { return b ? gcd(b, a % b) : a; }
function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
function plainLetters(w) { return norm(w).replace(/ /g, ""); }
function yearLabel(y) { return y < 0 ? (-y) + " a. C." : String(y); }
function decimalEs(n) { return String(Math.round(n * 1000) / 1000).replace(".", ","); }

/* Números como los escribe la gente: "384.400", "6,25", "-5", "1 000". */
function parseNum(raw) {
  var s = String(raw).trim().replace(/\s/g, "");
  if (!s) return NaN;
  if (/^-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(s)) s = s.replace(/\./g, "").replace(",", ".");
  else if (/^-?\d{1,3}(,\d{3})+$/.test(s) && !/^-?\d,\d{3}$/.test(s)) s = s.replace(/,/g, "");
  else s = s.replace(",", ".");
  return /^-?\d+(\.\d+)?$/.test(s) ? Number(s) : NaN;
}
/* Todas las lecturas razonables: "42.195" puede ser 42195 (miles a la
 * española) o 42,195 (decimal a la inglesa). */
function numCandidates(raw) {
  var s = String(raw).trim().replace(/\s/g, ""), out = [];
  function add(v) { if (isFinite(v) && out.indexOf(v) === -1) out.push(v); }
  if (/^-?\d+([.,]\d+)?$/.test(s)) add(Number(s.replace(",", ".")));
  if (/^-?\d{1,3}([.,]\d{3})+$/.test(s)) add(Number(s.replace(/[.,]/g, "")));
  if (/^-?\d{1,3}(\.\d{3})+,\d+$/.test(s)) add(Number(s.replace(/\./g, "").replace(",", ".")));
  if (/^-?\d{1,3}(,\d{3})+\.\d+$/.test(s)) add(Number(s.replace(/,/g, "")));
  return out;
}
/* Primer número que aparece en una opción ("1,5 horas" → 1.5). */
function leadingNum(txt) {
  var m = /-?\d+(?:[.,]\d+)?/.exec(String(txt).replace(/(\d)\.(\d{3})(?!\d)/g, "$1$2"));
  return m ? Number(m[0].replace(",", ".")) : NaN;
}

/* Evaluador aritmético mínimo (+ − × ÷ ^ y paréntesis) para comprobar
 * soluciones sin usar eval. Devuelve NaN si la expresión no es válida. */
function evalExpr(src) {
  var s = String(src).replace(/\s+/g, ""), i = 0;
  function peek() { return s.charAt(i); }
  function num() {
    var m = /^\d+(\.\d+)?/.exec(s.slice(i));
    if (!m) throw new Error("num");
    i += m[0].length; return Number(m[0]);
  }
  function atom() {
    if (peek() === "(") { i++; var v = expr(); if (peek() !== ")") throw new Error(")"); i++; return v; }
    if (peek() === "-") { i++; return -atom(); }
    return num();
  }
  function power() { var b = atom(); if (peek() === "^") { i++; return Math.pow(b, power()); } return b; }
  function term() {
    var v = power();
    while (peek() === "*" || peek() === "/") { var op = s.charAt(i++), r = power(); v = op === "*" ? v * r : v / r; }
    return v;
  }
  function expr() {
    var v = term();
    while (peek() === "+" || peek() === "-") { var op = s.charAt(i++), r = term(); v = op === "+" ? v + r : v - r; }
    return v;
  }
  try { var out = expr(); return i === s.length ? out : NaN; } catch (e) { return NaN; }
}
function near(a, b) { return Math.abs(a - b) < 1e-9 * Math.max(1, Math.abs(a), Math.abs(b)); }

/* Siguientes términos que justifican las reglas habituales de una serie:
 * diferencia constante, razón constante, segunda diferencia constante,
 * suma de los dos anteriores y diferencias alternas. */
function seqPredict(t) {
  var out = [], n = t.length, i, d = [], ok;
  function add(v) { if (isFinite(v) && !out.some(function (x) { return near(x, v); })) out.push(v); }
  if (n < 3) return out;
  for (i = 1; i < n; i++) d.push(t[i] - t[i - 1]);
  ok = d.every(function (x) { return near(x, d[0]); }); if (ok) add(t[n - 1] + d[0]);
  if (t.every(function (x) { return x !== 0; })) {
    var r = t[1] / t[0];
    if (t.every(function (x, k) { return k === 0 || near(x / t[k - 1], r); })) add(t[n - 1] * r);
  }
  if (n >= 4) {
    var dd = []; for (i = 1; i < d.length; i++) dd.push(d[i] - d[i - 1]);
    if (dd.every(function (x) { return near(x, dd[0]); })) add(t[n - 1] + d[d.length - 1] + dd[0]);
    ok = true; for (i = 2; i < n; i++) if (!near(t[i], t[i - 1] + t[i - 2])) ok = false;
    if (ok) add(t[n - 1] + t[n - 2]);
  }
  if (n >= 5 && !near(d[0], d[1])) {
    ok = true; for (i = 2; i < d.length; i++) if (!near(d[i], d[i - 2])) ok = false;
    if (ok) add(t[n - 1] + d[d.length - 2]);
  }
  return out;
}
var ABC = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

/* --- Puntos ------------------------------------------------------------
 * Máximo por reto = base por dificultad + 30 por cada pregunta extra
 * (hasta +150). Un reto fácil nunca puede dar más que uno de dos niveles
 * por encima, y uno de nivel inferior con muchas preguntas, como mucho,
 * empata con uno de nivel superior de una sola pregunta.
 * --------------------------------------------------------------------- */
var BASE_POINTS = [0, 400, 550, 700, 850, 1000];
function unitsOf(ch) {
  var d = ch.data || {};
  if (ch.kind === "emparejar") return Math.max(1, Math.ceil((d.parejas || []).length / 2));
  var qs = d.preguntas || [], u = qs.length;
  if (ch.kind === "ordenar" || ch.kind === "memoria") qs.forEach(function (q) { u += Math.floor(Math.max(0, (q.n || (q.elementos || []).length) - 4) / 2); });
  return Math.max(1, u);
}
function maxPoints(d, units) { return BASE_POINTS[Math.max(1, Math.min(5, d))] + Math.min(Math.max(0, units - 1), 5) * 30; }
/* Precisión × (80 % fijo + hasta 20 % por rapidez). Rapidez completa si
 * terminas en la mitad del tiempo orientativo; a partir del doble no hay
 * extra, pero nunca se pierde más de ese 20 %. */
function score(ch, r) {
  var acc = r.total ? Math.min(1, r.correct / r.total) : 0;
  var t = r.seconds / ch.duration;
  var speed = Math.max(0, Math.min(1, 1 - (t - 0.5) / 1.5));
  return { points: Math.round(ch.max_points * acc * (0.8 + 0.2 * speed)), accuracy: Math.round(acc * 100), speed: speed };
}
function tierDifficulty(tier) { return tier === "facil" ? 2 : tier === "normal" ? 3 : tier === "dificil" ? 4 : tier === "experto" ? 5 : 3; }
function tierOf(d) { return d <= 2 ? "facil" : d === 3 ? "normal" : d === 4 ? "dificil" : "experto"; }
function isOpinion(ch) {
  var q = ch && ch.data && ch.data.preguntas;
  return !!q && q.length > 0 && q.every(function (x) { return x.libre; });
}

/* --- Generadores ------------------------------------------------------ */
function base(cat, kind, difficulty, duration) {
  return { cat: cat, kind: kind, difficulty: difficulty, duration: duration, generated: true, v: ENGINE_VERSION };
}
function uniqueOptions(correct, candidates, n, rng, fill) {
  var seen = {}, out = [String(correct)]; seen[String(correct)] = 1;
  candidates.forEach(function (c) { var s = String(c); if (out.length < n && s !== "" && !seen[s]) { seen[s] = 1; out.push(s); } });
  for (var k = 1; out.length < n && fill && k < 60; k++) { var s = String(fill(k)); if (!seen[s]) { seen[s] = 1; out.push(s); } }
  return shuffleWith(out, rng);
}
function numDistractors(ans, spread) {
  return [ans + 1, ans - 1, ans + spread, ans - spread, ans + 2, ans + 10, ans - 10, ans * 2].filter(function (x) { return x > 0 && x !== ans; });
}

function arithQuestion(tier, rng, avoidOp) {
  var a, b, c, ans, q, e, pct, op, t;
  if (tier === "facil") {
    a = randInt(3, 30, rng); b = randInt(2, 20, rng); op = randInt(0, 1, rng) ? "+" : "−";
    if (op === avoidOp) op = op === "+" ? "−" : "+";
    if (op === "+") { ans = a + b; q = a + " + " + b + " = ?"; e = a + "+" + b; }
    else { if (b > a) { t = a; a = b; b = t; } ans = a - b; q = a + " − " + b + " = ?"; e = a + "-" + b; }
  } else if (tier === "normal") {
    op = randPick(["+", "−", "×"].filter(function (o) { return o !== avoidOp; }), rng);
    if (op === "×") { a = randInt(6, 25, rng); b = randInt(3, 12, rng); ans = a * b; e = a + "*" + b; }
    else { a = randInt(12, 99, rng); b = randInt(11, 99, rng); if (op === "−" && b > a) { t = a; a = b; b = t; } ans = op === "+" ? a + b : a - b; e = a + (op === "+" ? "+" : "-") + b; }
    q = a + " " + op + " " + b + " = ?";
  } else if (tier === "dificil") {
    op = randPick(["div", "pct", "mul"].filter(function (o) { return o !== avoidOp; }), rng);
    if (op === "div") { b = randInt(3, 15, rng); ans = randInt(4, 25, rng); a = b * ans; q = a + " ÷ " + b + " = ?"; e = a + "/" + b; }
    else if (op === "pct") { pct = randPick([10, 20, 25, 30, 40, 50, 75], rng); a = randInt(2, 30, rng) * (100 / gcd(pct, 100)); ans = a * pct / 100; q = "¿Cuál es el " + pct + " % de " + a + "?"; e = a + "*" + pct + "/100"; }
    else { a = randInt(12, 40, rng); b = randInt(11, 25, rng); ans = a * b; q = a + " × " + b + " = ?"; e = a + "*" + b; }
  } else {
    op = randPick(["dos", "cuad", "pct"].filter(function (o) { return o !== avoidOp; }), rng);
    if (op === "dos") { a = randInt(6, 19, rng); b = randInt(6, 19, rng); c = randInt(5, Math.min(99, a * b - 1), rng); ans = a * b - c; q = a + " × " + b + " − " + c + " = ?"; e = a + "*" + b + "-" + c; }
    else if (op === "cuad") { a = randInt(13, 30, rng); ans = a * a; q = a + "² = ?"; e = a + "^2"; }
    else { pct = randPick([12, 15, 35, 45, 65], rng); a = randInt(2, 20, rng) * (100 / gcd(pct, 100)); ans = a * pct / 100; q = "¿Cuál es el " + pct + " % de " + a + "?"; e = a + "*" + pct + "/100"; }
  }
  return { pregunta: q, respuesta: ans, check: { expr: e }, op: op };
}
function genArithmetic(tier, rng) {
  var q = arithQuestion(tier, rng), d = tierDifficulty(tier);
  delete q.op;
  var ch = base("matematicas", "respuesta_texto", d, 30 + d * 10);
  ch.key = "arit:" + q.pregunta;
  ch.title = "Cálculo rápido"; ch.excerpt = "Una operación de cálculo mental.";
  ch.description = "Resuelve la operación. Escribe solo el número."; ch.solution = q.pregunta.replace("?", fmtNum(q.respuesta)) + ".";
  ch.data = { preguntas: [q] };
  return ch;
}
function genCalc3(tier, rng) {
  var qs = [], last = null, seen = {};
  for (var k = 0; qs.length < 3 && k < 20; k++) {
    var q = arithQuestion(tier, rng, last);
    if (seen[q.pregunta]) continue;
    seen[q.pregunta] = 1; last = q.op; delete q.op; qs.push(q);
  }
  var d = tierDifficulty(tier);
  var ch = base("matematicas", "respuesta_texto", d, 25 + d * 14);
  ch.key = "calc3:" + qs.map(function (q) { return q.pregunta; }).join("|");
  ch.title = "Tres cálculos seguidos"; ch.excerpt = "Tres operaciones de cálculo mental, sin calculadora.";
  ch.description = "Resuelve las tres operaciones. Escribe solo el número.";
  ch.solution = qs.map(function (q) { return q.pregunta.replace("?", fmtNum(q.respuesta)); }).join(" · ");
  ch.data = { preguntas: qs };
  return ch;
}

var SEQ_BY_TIER = { facil: ["suma", "resta"], normal: ["suma", "geo", "crec"], dificil: ["crec", "alt", "cuad", "geo"], experto: ["fib", "tri", "alt", "cuad2"] };
function genSequence(cat, tier, rng) {
  var pat = randPick(SEQ_BY_TIER[tier] || SEQ_BY_TIER.normal, rng), t = [], next, explain, i, a, b, s, dd, up, dn, k, off;
  if (pat === "suma") { a = randInt(1, 20, rng); b = randInt(2, tier === "facil" ? 6 : 12, rng); for (i = 0; i < 5; i++) t.push(a + i * b); next = a + 5 * b; explain = "Se suma " + b + " cada vez."; }
  else if (pat === "resta") { b = randInt(2, 9, rng); a = 6 * b + randInt(1, 20, rng); for (i = 0; i < 5; i++) t.push(a - i * b); next = a - 5 * b; explain = "Se resta " + b + " cada vez."; }
  else if (pat === "geo") { b = randInt(2, 3, rng); a = randInt(1, 5, rng); for (i = 0; i < 5; i++) t.push(a * Math.pow(b, i)); next = a * Math.pow(b, 5); explain = "Cada número se multiplica por " + b + "."; }
  else if (pat === "crec") { a = randInt(1, 15, rng); s = randInt(1, 4, rng); t = [a]; dd = s; for (i = 1; i < 5; i++) { t.push(t[i - 1] + dd); dd++; } next = t[4] + dd; explain = "La diferencia crece de uno en uno: +" + s + ", +" + (s + 1) + ", +" + (s + 2) + "…"; }
  else if (pat === "alt") { a = randInt(10, 40, rng); up = randInt(4, 12, rng); dn = randInt(1, up - 1, rng); t = [a]; for (i = 1; i < 6; i++) t.push(i % 2 ? t[i - 1] + up : t[i - 1] - dn); next = t[5] - dn; explain = "Se alterna: +" + up + ", −" + dn + "."; }
  else if (pat === "cuad") { a = randInt(1, 6, rng); for (i = 0; i < 5; i++) t.push((a + i) * (a + i)); next = (a + 5) * (a + 5); explain = "Son cuadrados perfectos: " + a + "², " + (a + 1) + "², " + (a + 2) + "²…"; }
  else if (pat === "cuad2") { a = randInt(1, 5, rng); off = randInt(1, 6, rng); for (i = 0; i < 5; i++) t.push((a + i) * (a + i) + off); next = (a + 5) * (a + 5) + off; explain = "Cuadrados perfectos más " + off + ": " + a + "² + " + off + ", " + (a + 1) + "² + " + off + "…"; }
  else if (pat === "fib") { a = randInt(1, 6, rng); b = randInt(a, 9, rng); t = [a, b]; for (i = 2; i < 6; i++) t.push(t[i - 1] + t[i - 2]); next = t[4] + t[5]; explain = "Cada número es la suma de los dos anteriores."; }
  else { k = randInt(1, 4, rng); for (i = 0; i < 5; i++) t.push((k + i) * (k + i + 1)); next = (k + 5) * (k + 6); explain = "Cada término es n × (n + 1): " + k + "×" + (k + 1) + ", " + (k + 1) + "×" + (k + 2) + "…"; }
  var diff = t[t.length - 1] - t[t.length - 2];
  var cands = shuffleWith([next + 1, next - 1, next + 2, t[t.length - 1] + diff, next + Math.abs(diff), next - 2, next * 2], rng).filter(function (x) { return x > 0 && x !== next; });
  var opts = uniqueOptions(next, cands, 4, rng, function (j) { return next + j + 2; });
  var d = tierDifficulty(tier);
  var ch = base(cat, "secuencia", d, 30 + d * 12);
  ch.key = "sec:" + t.join(",");
  ch.title = "Sigue la serie"; ch.excerpt = "Encuentra el patrón y continúa la serie.";
  ch.description = "Encuentra el patrón y elige el número que sigue."; ch.solution = explain + " El siguiente término es " + next + ".";
  ch.data = { preguntas: [{ pregunta: "¿Qué número sigue?", visual: t.join(", ") + ", ?", opciones: opts, correcta: opts.indexOf(String(next)), explica: explain, check: { seq: t } }] };
  return ch;
}

function genCapital(tier, rng) {
  var d = tierDifficulty(tier), n = tier === "facil" ? 3 : tier === "experto" ? 5 : 4;
  var pair = randPick(COUNTRY_CAPITALS, rng), country = pair[0], capital = pair[1];
  var reverse = tier !== "facil" && randInt(0, 2, rng) === 0;
  var others = shuffleWith(COUNTRY_CAPITALS.filter(function (c) { return c[0] !== country; }), rng);
  var correct = reverse ? country : capital;
  var opts = uniqueOptions(correct, others.map(function (c) { return reverse ? c[0] : c[1]; }), n, rng);
  var ch = base("trivia", "opcion_multiple", d, 25 + d * 8); ch.topic = "geografia";
  ch.key = "capital:" + country + (reverse ? ":r" : "");
  ch.title = "Capitales del mundo"; ch.excerpt = reverse ? "¿De qué país es capital " + capital + "?" : "¿Sabes la capital de " + country + "?";
  ch.description = "Trivia de capitales.";
  ch.solution = "La capital de " + country + " es " + capital + ".";
  ch.data = { preguntas: [{ pregunta: reverse ? "¿De qué país es capital " + capital + "?" : "¿Cuál es la capital de " + country + "?", opciones: opts, correcta: opts.indexOf(correct), explica: ch.solution }] };
  return ch;
}

function genAnagram(tier, rng) {
  var bankKey = tier === "experto" ? "dificil" : tier;
  var entry = randPick(WORD_BANK[bankKey] || WORD_BANK.normal, rng), word = entry[0];
  var letters = plainLetters(word).split(""), shuffled, tries = 0;
  do { shuffled = shuffleWith(letters, rng); tries++; } while (shuffled.join("") === letters.join("") && tries < 12);
  var d = tierDifficulty(tier);
  var ch = base("palabras", "respuesta_texto", d, 30 + word.length * 4);
  ch.key = "ana:" + word;
  ch.title = "Palabra desordenada"; ch.excerpt = "Reordena las letras y descubre la palabra.";
  ch.description = "Anagrama. Los acentos no cuentan.";
  ch.solution = "La palabra era " + word.toUpperCase() + ".";
  ch.data = { preguntas: [{ pregunta: "Reordena estas letras para formar una palabra:", visual: shuffled.join(" ").toUpperCase(), respuesta: word, acepta: entry[1].slice(), explica: "Era «" + word.toUpperCase() + "»." + (entry[1].length ? " También valía: " + entry[1].join(", ") + "." : "") }] };
  return ch;
}

function genFact(topic, tier, rng) {
  var bank = FACT_BANKS[topic]; if (!bank) return null;
  var n = tier === "facil" ? 2 : tier === "experto" ? 5 : tier === "dificil" ? 4 : 3;
  var chosen = shuffleWith(bank.map(function (_, i) { return i; }), rng).slice(0, Math.min(n, bank.length));
  var d = tierDifficulty(tier);
  var ch = base("trivia", "verdadero_falso", d, 15 + chosen.length * 12); ch.topic = topic;
  ch.key = "vf:" + topic + ":" + chosen.slice().sort(function (a, b) { return a - b; }).join("-");
  ch.title = "¿Verdad o mentira? " + TOPICS[topic]; ch.excerpt = "Afirmaciones de " + TOPICS[topic].toLowerCase() + ": ¿verdaderas o falsas?";
  ch.description = "Marca si cada afirmación es verdadera o falsa.";
  ch.solution = chosen.map(function (i) { return bank[i][0] + " → " + (bank[i][1] ? "verdadero" : "falso"); }).join(" · ");
  ch.data = { preguntas: chosen.map(function (i) { return { pregunta: bank[i][0], respuesta: bank[i][1] }; }) };
  return ch;
}

function genEstimate(bankKey, tier, rng) {
  var bank = EST_BANKS[bankKey]; if (!bank) return null;
  var n = tier === "facil" ? 1 : 2;
  var idxs = shuffleWith(bank.map(function (_, i) { return i; }), rng).slice(0, Math.min(n, bank.length));
  var d = tierDifficulty(tier);
  var ch = base("estimacion", "estimar", d, 25 + idxs.length * 20);
  ch.key = "est:" + bankKey + ":" + idxs.slice().sort(function (a, b) { return a - b; }).join("-");
  ch.title = bankKey === "calculo" ? "Calcula a ojo" : "A ojo: estima el dato"; ch.excerpt = "No hace falta acertar exacto, basta con acercarse.";
  ch.description = "Escribe tu estimación: cuenta como acierto si caes dentro del margen.";
  ch.solution = idxs.map(function (i) { return bank[i][0] + " → " + fmtNum(bank[i][1]); }).join(" · ");
  ch.data = { preguntas: idxs.map(function (i) { var q = { pregunta: bank[i][0], respuesta: bank[i][1], tolerancia: bank[i][2] }; if (bank[i][3]) q.check = { expr: bank[i][3] }; return q; }) };
  return ch;
}

function genOpinion(tier, rng) {
  var i = Math.floor(rng() * OPINION_BANK.length), item = OPINION_BANK[i];
  var ch = base("grupo", "opcion_multiple", 1, 30);
  ch.key = "op:" + i;
  ch.title = "¿Qué prefieres?"; ch.excerpt = "Sin respuestas correctas: para comparar con tus amigos.";
  ch.description = "Juego de opinión. No hay acierto ni error, así que no da puntos.";
  ch.solution = "No hay solución: es un juego de opinión.";
  ch.data = { preguntas: [{ pregunta: item[0], opciones: item[1].slice(), correcta: 0, libre: true }] };
  return ch;
}

function genMemory(variant, tier, rng) {
  var pool = variant === "colores" ? COLOR_POOL : variant === "cifras" ? ["1", "2", "3", "4", "5", "6", "7", "8", "9"] : EMOJI_POOL;
  var n = { facil: 4, normal: 5, dificil: 6, experto: 7 }[tier] || 5;
  if (variant === "colores") n = Math.min(n + 1, 7);
  var items = shuffleWith(pool, rng).slice(0, n), d = tierDifficulty(tier);
  var ch = base("memoria", "memoria", d, 40 + n * 6);
  ch.key = "mem:" + items.join("");
  ch.title = variant === "colores" ? "Secuencia de colores" : variant === "cifras" ? "Memoriza las cifras" : "Memoria de símbolos";
  ch.excerpt = "Memoriza el orden antes de que desaparezca.";
  ch.description = "Memoriza la secuencia y repítela en el mismo orden.";
  ch.solution = "El orden era: " + items.join(" ") + ".";
  ch.data = { preguntas: [{ pregunta: "Memoriza el orden.", elementos: items, mostrar_ms: 1600 + n * 520 }] };
  return ch;
}

function genPairs(family, bank, tier, rng, title, excerpt, desc, verb, topic) {
  var n = tier === "facil" ? 3 : tier === "normal" ? 4 : tier === "dificil" ? 5 : 6;
  var picked = [], usedA = {}, usedB = {};
  shuffleWith(bank, rng).forEach(function (p) {
    if (picked.length < n && !usedA[p[0]] && !usedB[p[1]]) { usedA[p[0]] = 1; usedB[p[1]] = 1; picked.push(p); }
  });
  var d = tierDifficulty(tier);
  var cat = family === "sinonimos" || family === "antonimos" ? "palabras" : "trivia";
  var ch = base(cat, "emparejar", d, 18 + picked.length * 9);
  if (topic) ch.topic = topic;
  ch.key = family + ":" + picked.map(function (p) { return p[0]; }).sort().join("|");
  ch.title = title; ch.excerpt = excerpt; ch.description = desc;
  ch.solution = picked.map(function (p) { return p[0] + " → " + p[1]; }).join(" · ");
  ch.data = { parejas: picked.map(function (p) { return { a: p[0], b: p[1] }; }), titulo: verb };
  return ch;
}

function genCount(tier, rng) {
  var len = { facil: 10, normal: 14, dificil: 18, experto: 22 }[tier] || 14;
  var kinds = { facil: 2, normal: 3, dificil: 3, experto: 4 }[tier] || 3;
  var syms = shuffleWith(COUNT_POOL, rng).slice(0, kinds), target = syms[0], seq = [], i, c = 0;
  for (i = 0; i < len; i++) seq.push(randPick(syms, rng));
  for (i = 0; i < len; i++) if (seq[i] === target) c++;
  for (i = 0; c < 2 && i < len; i++) if (seq[i] !== target) { seq[i] = target; c++; }
  var opts = uniqueOptions(c, shuffleWith(numDistractors(c, 3), rng), 4, rng, function (k) { return c + k + 2; });
  var d = tierDifficulty(tier);
  var ch = base("observacion", "opcion_multiple", d, 15 + len * 2);
  ch.key = "contar:" + seq.join("");
  ch.title = "Cuenta rápido"; ch.excerpt = "¿Cuántas veces aparece el símbolo?";
  ch.description = "Observación pura: cuenta con calma.";
  ch.solution = target + " aparece " + c + " veces.";
  ch.data = { preguntas: [{ pregunta: "¿Cuántas veces aparece " + target + "?", visual: seq.join(" "), opciones: opts, correcta: opts.indexOf(String(c)), explica: ch.solution, check: { count: target } }] };
  return ch;
}

function genIntruder(tier, rng) {
  var groups = shuffleWith(EMOJI_GROUPS, rng), A = groups[0], B = groups[1];
  var n = tier === "facil" ? 4 : tier === "normal" ? 5 : 6;
  var items = shuffleWith(A.e, rng).slice(0, n - 1), intruder = randPick(B.e, rng);
  var opts = shuffleWith(items.concat([intruder]), rng);
  var d = tierDifficulty(tier);
  var ch = base("observacion", "opcion_multiple", d, 20 + n * 3);
  ch.key = "intruso:" + opts.slice().sort().join("");
  ch.title = "Encuentra el intruso"; ch.excerpt = "Todos tienen algo en común… menos uno.";
  ch.description = "Busca el elemento que no pertenece al grupo.";
  ch.solution = "Todos son " + A.n + " menos " + intruder + " (" + B.n + ").";
  ch.data = { preguntas: [{ pregunta: "¿Cuál no pertenece al grupo?", opciones: opts, correcta: opts.indexOf(intruder), emoji: true, explica: ch.solution }] };
  return ch;
}

function genPattern(tier, rng) {
  var L = { facil: 2, normal: 3, dificil: 3, experto: 4 }[tier] || 3;
  var pool = shuffleWith(rng() < 0.5 ? COLOR_POOL : EMOJI_POOL.slice(0, 12), rng);
  var block = pool.slice(0, L), extra = pool.slice(L, L + 2);
  var shown = L * 2 + randInt(1, L, rng), seq = [];
  for (var i = 0; i < shown; i++) seq.push(block[i % L]);
  var next = block[shown % L];
  var opts = shuffleWith(block.concat(extra).slice(0, 4), rng);
  if (opts.indexOf(next) === -1) opts[0] = next;
  var d = tierDifficulty(tier);
  var ch = base("observacion", "secuencia", d, 25 + L * 8);
  ch.key = "patron:" + seq.join("");
  ch.title = "¿Qué sigue?"; ch.excerpt = "Encuentra el bloque que se repite.";
  ch.description = "La serie repite un bloque de símbolos. Elige el siguiente.";
  ch.solution = "Se repite " + block.join("") + ": sigue " + next + ".";
  ch.data = { preguntas: [{ pregunta: "¿Qué símbolo sigue?", visual: seq.join(" ") + " ?", opciones: opts, correcta: opts.indexOf(next), emoji: true, explica: ch.solution, check: { pattern: true } }] };
  return ch;
}

function genDays(cat, tier, rng) {
  var range = { facil: [2, 9], normal: [10, 30], dificil: [31, 120], experto: [121, 400] }[tier] || [10, 30];
  var start = randInt(0, 6, rng), n = randInt(range[0], range[1], rng), past = tier === "experto" && randInt(0, 1, rng) === 1;
  var idx = past ? (((start - n) % 7) + 7) % 7 : (start + n) % 7;
  var correct = cap(WEEKDAYS[idx]);
  var opts = uniqueOptions(correct, shuffleWith([WEEKDAYS[(idx + 1) % 7], WEEKDAYS[(idx + 6) % 7], WEEKDAYS[start], WEEKDAYS[(idx + 2) % 7], WEEKDAYS[(idx + 5) % 7]], rng).map(cap), 4, rng);
  var d = tierDifficulty(tier);
  var ch = base(cat, "opcion_multiple", d, 25 + d * 10);
  ch.key = "dias:" + start + ":" + n + (past ? ":p" : "");
  ch.title = "El calendario mental"; ch.excerpt = "Calcula el día de la semana sin mirar el calendario.";
  ch.description = "Truco: cada 7 días se repite el mismo día de la semana.";
  var expl = n + " días son " + Math.floor(n / 7) + " semanas y " + (n % 7) + " días: " + (past ? "retrocedes " : "avanzas ") + (n % 7) + " desde el " + WEEKDAYS[start] + " → " + WEEKDAYS[idx] + ".";
  ch.solution = expl;
  ch.data = { preguntas: [{ pregunta: "Si hoy es " + WEEKDAYS[start] + ", ¿qué día de la semana " + (past ? "fue hace " : "será dentro de ") + n + " días?", opciones: opts, correcta: opts.indexOf(correct), explica: expl, check: { dias: { start: start, n: n, past: past } } }] };
  return ch;
}

function genAges(cat, tier, rng) {
  var names = shuffleWith(NAMES, rng), A = names[0], B = names[1], k, x, S, m = 0, q, ans, expl, askOlder = false;
  var mult = { 2: "el doble", 3: "el triple", 4: "el cuádruple" };
  if (tier === "facil") { k = 2; x = randInt(4, 15, rng); }
  else if (tier === "normal") { k = randInt(2, 3, rng); x = randInt(5, 20, rng); }
  else { k = randInt(3, 4, rng); x = randInt(6, 18, rng); }
  if (tier === "experto") {
    m = randInt(2, 10, rng); S = x + m + k * x + m; ans = x;
    q = A + " tiene " + mult[k] + " de años que " + B + ". Dentro de " + m + " años, entre los dos sumarán " + S + ". ¿Cuántos años tiene " + B + " ahora?";
    expl = "(x + " + m + ") + (" + k + "x + " + m + ") = " + S + " → " + (k + 1) + "x = " + (S - 2 * m) + " → x = " + x + ".";
  } else {
    S = x * (k + 1);
    askOlder = tier !== "dificil" && randInt(0, 1, rng) === 1;
    ans = askOlder ? k * x : x;
    q = A + " tiene " + mult[k] + " de años que " + B + ". Entre los dos suman " + S + ". ¿Cuántos años tiene " + (askOlder ? A : B) + "?";
    expl = "x + " + k + "x = " + S + " → x = " + x + ": " + B + " tiene " + x + " y " + A + " tiene " + (k * x) + ".";
  }
  var opts = uniqueOptions(ans, shuffleWith([ans + k, ans - k, x === ans ? k * x : x, ans + 1, ans - 1, S - ans].filter(function (v) { return v > 0 && v !== ans; }), rng), 4, rng, function (j) { return ans + j + 3; });
  var d = tierDifficulty(tier);
  var ch = base(cat, "opcion_multiple", d, 40 + d * 12);
  ch.key = "edades:" + q;
  ch.title = "Problema de edades"; ch.excerpt = "Deduce antes de calcular.";
  ch.description = "Plantea la ecuación: se resuelve razonando, no adivinando.";
  ch.solution = expl;
  ch.data = { preguntas: [{ pregunta: q, opciones: opts, correcta: opts.indexOf(String(ans)), explica: expl, check: { edades: { k: k, S: S, m: m, ask: askOlder ? "mayor" : "menor" } } }] };
  return ch;
}

function genChronology(tier, rng) {
  var n = tier === "facil" ? 3 : tier === "normal" ? 4 : 5, picked = [];
  shuffleWith(EVENTS, rng).forEach(function (e) {
    if (picked.length < n && picked.every(function (p) { return Math.abs(p[1] - e[1]) >= 8; })) picked.push(e);
  });
  picked.sort(function (a, b) { return a[1] - b[1]; });
  var d = tierDifficulty(tier);
  var ch = base("ordenar", "ordenar", d, 25 + n * 12);
  ch.key = "crono:" + picked.map(function (p) { return p[1]; }).join(",");
  ch.title = "Línea del tiempo"; ch.excerpt = "Ordena los acontecimientos del más antiguo al más reciente.";
  ch.description = "Toca dos acontecimientos para intercambiarlos hasta dejarlos en orden.";
  ch.solution = picked.map(function (p) { return p[0] + " (" + yearLabel(p[1]) + ")"; }).join(" → ");
  ch.data = { preguntas: [{ pregunta: "Ordénalos del más antiguo al más reciente.", elementos: picked.map(function (p) { return p[0]; }), explica: ch.solution, check: { valores: picked.map(function (p) { return p[1]; }) } }] };
  return ch;
}

function genPlanets(tier, rng) {
  var n = tier === "facil" ? 3 : tier === "normal" ? 4 : tier === "dificil" ? 5 : 6;
  var idx = shuffleWith(PLANETS.map(function (_, i) { return i; }), rng).slice(0, n).sort(function (a, b) { return a - b; });
  var items = idx.map(function (i) { return PLANETS[i]; }), d = tierDifficulty(tier);
  var ch = base("ordenar", "ordenar", d, 20 + n * 10);
  ch.key = "planetas:" + items.join(",");
  ch.title = "Ordena el sistema solar"; ch.excerpt = "Del más cercano al más lejano del Sol.";
  ch.description = "Toca dos planetas para intercambiarlos hasta dejarlos en orden.";
  ch.solution = items.join(" → ") + ".";
  ch.data = { preguntas: [{ pregunta: "Ordena estos planetas del más cercano al más lejano del Sol.", elementos: items, explica: "Orden completo: " + PLANETS.join(", ") + ".", check: { valores: idx } }] };
  return ch;
}

var POWERS = [["2²", 4], ["√49", 7], ["2³", 8], ["3²", 9], ["√100", 10], ["√121", 11], ["2⁴", 16], ["5²", 25], ["3³", 27], ["2⁵", 32], ["6²", 36], ["7²", 49], ["2⁶", 64], ["10²", 100]];
var FRACTIONS = [["1/2", 0.5], ["1/3", 1 / 3], ["2/3", 2 / 3], ["1/4", 0.25], ["3/4", 0.75], ["1/5", 0.2], ["2/5", 0.4], ["3/5", 0.6], ["4/5", 0.8], ["1/8", 0.125], ["3/8", 0.375], ["5/8", 0.625], ["7/8", 0.875], ["3/10", 0.3], ["7/10", 0.7], ["9/10", 0.9]];
function genOrderNumbers(tier, rng) {
  var n = tier === "facil" ? 4 : 5, pool = [], picked = [], i, v;
  if (tier === "facil") { for (i = 0; i < 40; i++) { v = randInt(2, 99, rng); pool.push([String(v), v]); } }
  else if (tier === "normal") { for (i = 0; i < 40; i++) { v = randInt(5, 250, rng) / 100; pool.push([decimalEs(v), v]); } }
  else if (tier === "dificil") { pool = shuffleWith(FRACTIONS, rng).slice(0, 8); for (i = 0; i < 4; i++) { v = randInt(5, 95, rng) / 100; pool.push([decimalEs(v), v]); } }
  else { pool = shuffleWith(POWERS, rng).slice(0, 8); for (i = 0; i < 4; i++) { v = randInt(3, 60, rng); pool.push([String(v), v]); } }
  shuffleWith(pool, rng).forEach(function (p) {
    if (picked.length < n && picked.every(function (q) { return Math.abs(q[1] - p[1]) >= 0.02 && q[0] !== p[0]; })) picked.push(p);
  });
  picked.sort(function (a, b) { return a[1] - b[1]; });
  var d = tierDifficulty(tier);
  var ch = base("ordenar", "ordenar", d, 25 + n * 10);
  ch.key = "numeros:" + picked.map(function (p) { return p[0]; }).join(",");
  ch.title = "De menor a mayor"; ch.excerpt = "Ordena los números de menor a mayor.";
  ch.description = "Toca dos números para intercambiarlos hasta dejarlos de menor a mayor.";
  ch.solution = picked.map(function (p) { return p[0]; }).join(" < ") + ".";
  ch.data = { preguntas: [{ pregunta: "Ordena de menor a mayor.", elementos: picked.map(function (p) { return p[0]; }), explica: picked.map(function (p) { return p[0] + (String(p[1]) === p[0] ? "" : " = " + decimalEs(p[1])); }).join(" · "), check: { valores: picked.map(function (p) { return p[1]; }) } }] };
  return ch;
}

function genTeamSize(tier, rng) {
  var p = randPick(TEAM_SIZES, rng), ans = p[1];
  var opts = uniqueOptions(ans, shuffleWith([5, 6, 7, 9, 11, 15], rng), tier === "facil" ? 3 : 4, rng);
  var d = tierDifficulty(tier);
  var ch = base("trivia", "opcion_multiple", d, 25 + d * 6); ch.topic = "deporte";
  ch.key = "equipos:" + p[0];
  ch.title = "¿Cuántos en juego?"; ch.excerpt = "Jugadores por equipo en el campo o la pista.";
  ch.description = "Reglamento básico de deportes de equipo.";
  ch.solution = "En " + p[0] + " juegan " + ans + " por equipo.";
  ch.data = { preguntas: [{ pregunta: "¿Cuántos jugadores tiene cada equipo en juego en " + p[0] + "?", opciones: opts, correcta: opts.indexOf(String(ans)), explica: ch.solution }] };
  return ch;
}

/* Registro de generadores por categoría. El id forma parte del slug
 * reproducible: no lo cambies una vez publicado. `daily` marca los que
 * pueden entrar en el reto del día. */
function hardTier(t) { return t === "experto" ? "experto" : t === "facil" ? "normal" : "dificil"; }
var GENERATORS = {
  logica: [
    { id: "dias", kind: "opcion_multiple", daily: true, make: function (t, r) { return genDays("logica", t, r); } },
    { id: "edades", kind: "opcion_multiple", daily: true, make: function (t, r) { return genAges("logica", t, r); } },
    { id: "serie", kind: "secuencia", daily: true, make: function (t, r) { return genSequence("logica", hardTier(t), r); } }
  ],
  matematicas: [
    { id: "arit", kind: "respuesta_texto", make: genArithmetic },
    { id: "calculo", kind: "respuesta_texto", daily: true, make: genCalc3 },
    { id: "serie-num", kind: "secuencia", daily: true, make: function (t, r) { return genSequence("matematicas", t, r); } }
  ],
  palabras: [
    { id: "anagrama", kind: "respuesta_texto", daily: true, make: genAnagram },
    { id: "sinonimos", kind: "emparejar", daily: true, make: function (t, r) { return genPairs("sinonimos", SYNONYMS, t, r, "Sinónimos", "Cada palabra tiene su pareja de significado.", "Vocabulario: une cada palabra con su sinónimo.", "Une cada palabra con su sinónimo"); } },
    { id: "antonimos", kind: "emparejar", daily: true, make: function (t, r) { return genPairs("antonimos", ANTONYMS, t, r, "Contrarios", "Une cada palabra con su opuesto.", "Vocabulario: une cada palabra con su contrario.", "Une cada palabra con su contrario"); } }
  ],
  memoria: [
    { id: "simbolos", kind: "memoria", daily: true, make: function (t, r) { return genMemory("simbolos", t, r); } },
    { id: "colores", kind: "memoria", daily: true, make: function (t, r) { return genMemory("colores", t, r); } },
    { id: "cifras", kind: "memoria", daily: true, make: function (t, r) { return genMemory("cifras", t, r); } }
  ],
  trivia: [
    { id: "capital", kind: "opcion_multiple", daily: true, make: genCapital },
    { id: "continentes", kind: "emparejar", daily: true, make: function (t, r) { return genPairs("continentes", CONTINENTS, t, r, "¿En qué continente está?", "Une cada país con su continente.", "Geografía: cada país con su continente.", "Une cada país con su continente", "geografia"); } },
    { id: "autores", kind: "emparejar", daily: true, make: function (t, r) { return genPairs("autores", AUTHORS, t, r, "Obras y autores", "Une cada obra con quien la creó.", "Literatura y arte: cada obra con su autor.", "Une cada obra con su autor", "arte"); } },
    { id: "directores", kind: "emparejar", daily: true, make: function (t, r) { return genPairs("directores", DIRECTORS, t, r, "¿Quién la dirigió?", "Une cada película con su director.", "Cine: cada película con quien la dirigió.", "Une cada película con su director", "cine"); } },
    { id: "compositores", kind: "emparejar", make: function (t, r) { return genPairs("compositores", COMPOSERS, t, r, "Compositores del mundo", "Une cada compositor con su país.", "Música clásica: cada compositor con su país de origen.", "Une cada compositor con su país", "musica"); } },
    { id: "material", kind: "emparejar", make: function (t, r) { return genPairs("material", SPORT_GEAR, t, r, "Cada deporte, lo suyo", "Une cada deporte con algo típico de él.", "Deporte: cada disciplina con su elemento característico.", "Une cada deporte con su elemento", "deporte"); } },
    { id: "equipos", kind: "opcion_multiple", make: genTeamSize },
    { id: "vf-ciencia", kind: "verdadero_falso", daily: true, make: function (t, r) { return genFact("ciencia", t, r); } },
    { id: "vf-arte", kind: "verdadero_falso", daily: true, make: function (t, r) { return genFact("arte", t, r); } },
    { id: "vf-historia", kind: "verdadero_falso", daily: true, make: function (t, r) { return genFact("historia", t, r); } },
    { id: "vf-cine", kind: "verdadero_falso", daily: true, make: function (t, r) { return genFact("cine", t, r); } },
    { id: "vf-musica", kind: "verdadero_falso", make: function (t, r) { return genFact("musica", t, r); } },
    { id: "vf-deporte", kind: "verdadero_falso", make: function (t, r) { return genFact("deporte", t, r); } },
    { id: "vf-geografia", kind: "verdadero_falso", daily: true, make: function (t, r) { return genFact("geografia", t, r); } }
  ],
  estimacion: [
    { id: "est-ciencia", kind: "estimar", daily: true, make: function (t, r) { return genEstimate("ciencia", t, r); } },
    { id: "est-geografia", kind: "estimar", daily: true, make: function (t, r) { return genEstimate("geografia", t, r); } },
    { id: "est-deporte", kind: "estimar", make: function (t, r) { return genEstimate("deporte", t, r); } },
    { id: "est-calculo", kind: "estimar", daily: true, make: function (t, r) { return genEstimate("calculo", t, r); } }
  ],
  observacion: [
    { id: "contar", kind: "opcion_multiple", daily: true, make: genCount },
    { id: "intruso", kind: "opcion_multiple", daily: true, make: genIntruder },
    { id: "patron", kind: "secuencia", daily: true, make: genPattern }
  ],
  ordenar: [
    { id: "cronologia", kind: "ordenar", daily: true, make: genChronology },
    { id: "planetas", kind: "ordenar", daily: true, make: genPlanets },
    { id: "numeros", kind: "ordenar", daily: true, make: genOrderNumbers }
  ],
  grupo: [
    { id: "opinion", kind: "opcion_multiple", make: genOpinion }
  ]
};
function genById(cat, id) {
  var list = GENERATORS[cat] || [];
  for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
  return null;
}

/* Ejecuta un generador con una semilla. El slug resultante
 * (g2-<cat>-<generador>-<nivel>-<semilla>) permite reconstruirlo. */
function makeGenerated(cat, genId, tier, seed) {
  var g = genById(cat, genId);
  if (!g || TIERS.indexOf(tier) === -1) return null;
  var made = null;
  try { made = g.make(tier, mulberry(seed)); } catch (e) { made = null; }
  if (!made) return null;
  made.cat = cat;
  made.family = genId;
  made.tier = tier;
  made.slug = "g2-" + cat + "-" + genId + "-" + tier + "-" + (seed >>> 0).toString(36);
  made.key = made.key || made.slug;
  made.max_points = maxPoints(made.difficulty, unitsOf(made));
  return made;
}

/* Generadores de la versión 1 (índice por categoría antigua). */
var LEGACY_GEN = {
  numbers: [["matematicas", "arit"], ["matematicas", "serie-num"], ["logica", "edades"]],
  geo: [["trivia", "capital"], ["memoria", "simbolos"], ["estimacion", "est-geografia"], ["trivia", "vf-geografia"], ["trivia", "continentes"]],
  words: [["palabras", "anagrama"], ["palabras", "sinonimos"], ["palabras", "antonimos"]],
  observation: [["memoria", "simbolos"], ["logica", "serie"], ["observacion", "contar"], ["observacion", "intruso"]],
  mind: [["memoria", "simbolos"], ["logica", "serie"], ["logica", "dias"], ["logica", "edades"], ["observacion", "intruso"]],
  science: [["trivia", "vf-ciencia"], ["estimacion", "est-ciencia"], ["ordenar", "planetas"]],
  culture: [["trivia", "vf-arte"], ["trivia", "autores"]],
  history: [["trivia", "vf-historia"], ["ordenar", "cronologia"]],
  movies: [["trivia", "vf-cine"], ["trivia", "directores"]],
  music: [["trivia", "vf-musica"], ["trivia", "compositores"]],
  sports: [["trivia", "vf-deporte"], ["estimacion", "est-deporte"], ["trivia", "material"], ["trivia", "equipos"]],
  fun: [["grupo", "opinion"]], social: [["grupo", "opinion"]],
  hard: [["logica", "serie"], ["logica", "dias"], ["logica", "edades"]]
};

var resolveCache = {};
/* slug → reto válido o null. Acepta retos escritos a mano, generados v2 y
 * generados v1 (enlaces antiguos de duelo). Nunca lanza. */
function resolveChallenge(slug) {
  slug = String(slug || "").slice(0, 120);
  if (resolveCache[slug] !== undefined) return resolveCache[slug];
  var out = null, m;
  if (chBySlug[slug]) out = chBySlug[slug];
  else if ((m = /^g2-([a-z]+)-([a-z0-9-]+?)-(facil|normal|dificil|experto)-([0-9a-z]{1,7})$/.exec(slug))) {
    var ch = makeGenerated(m[1], m[2], m[3], parseInt(m[4], 36));
    if (ch && ch.slug === slug && validateChallenge(ch)) out = ch;
  } else if ((m = /^g-([a-z]+)-(\d+)-(facil|normal|dificil|experto)-([0-9a-z]{1,7})$/.exec(slug))) {
    var map = (LEGACY_GEN[m[1]] || [])[+m[2]];
    if (map) {
      var ch2 = makeGenerated(map[0], map[1], m[3], parseInt(m[4], 36));
      if (ch2 && validateChallenge(ch2)) out = ch2;
    }
  }
  resolveCache[slug] = out;
  return out;
}

/* Retos de memoria con `pool`: cada partida sale una secuencia distinta.
 * Con la misma semilla (duelos) sale exactamente la misma. */
function needsSeed(ch) { return !!(ch && ch.data && (ch.data.preguntas || []).some(function (q) { return q.pool; })); }
function instantiate(ch, seed) {
  if (!needsSeed(ch)) return ch;
  var rng = mulberry(seed >>> 0), copy = {};
  Object.keys(ch).forEach(function (k) { copy[k] = ch[k]; });
  copy.data = { preguntas: ch.data.preguntas.map(function (q) {
    var o = {}; Object.keys(q).forEach(function (k) { o[k] = q[k]; });
    o.elementos = shuffleWith(q.pool, rng).slice(0, q.n);
    return o;
  }) };
  copy.seed = seed >>> 0;
  return copy;
}

/* --- Validación --------------------------------------------------------
 * Ningún reto llega al jugador sin pasar por aquí. `problems` devuelve la
 * lista de fallos (para los tests); validateChallenge, si es válido.
 * --------------------------------------------------------------------- */
function nonEmpty(v) { return v !== null && v !== undefined && String(v).trim() !== ""; }
function allUnique(list) {
  var seen = {};
  for (var i = 0; i < list.length; i++) { var k = String(list[i]).trim().toLowerCase(); if (seen[k]) return false; seen[k] = 1; }
  return true;
}
function weekdayAfter(start, n, past) {
  /* Comprobación independiente con el calendario real: el 1 de enero de
   * 2024 fue lunes. */
  var t = Date.UTC(2024, 0, 1) + (start + (past ? -n : n)) * 86400000;
  return (new Date(t).getUTCDay() + 6) % 7;
}
function optionValue(q, k) { return leadingNum(q.opciones[k]); }
function checkProblems(q, ch) {
  var c = q.check, p = [], i, hasOpts = Array.isArray(q.opciones);
  if (!c) return p;
  function expectNumber(val, label) {
    if (!isFinite(val)) { p.push(label + ": no se puede calcular"); return; }
    if (typeof q.respuesta === "number") { if (!near(q.respuesta, val)) p.push(label + ": la respuesta " + q.respuesta + " no coincide con " + val); return; }
    if (hasOpts) {
      if (!near(optionValue(q, q.correcta), val)) p.push(label + ": la opción correcta no vale " + val);
      q.opciones.forEach(function (_, k) { if (k !== q.correcta && near(optionValue(q, k), val)) p.push(label + ": otra opción también vale " + val); });
    }
  }
  if (c.expr) expectNumber(evalExpr(c.expr), "expr");
  if (c.seq) {
    var preds = seqPredict(c.seq);
    if (!preds.length) p.push("seq: patrón no reconocido");
    else {
      if (!preds.some(function (v) { return near(v, optionValue(q, q.correcta)); })) p.push("seq: la opción correcta no sigue la serie");
      q.opciones.forEach(function (_, k) { if (k !== q.correcta && preds.some(function (v) { return near(v, optionValue(q, k)); })) p.push("seq: otra opción también sigue la serie"); });
    }
  }
  if (c.letters) {
    var idx = c.letters.map(function (l) { return ABC.indexOf(l) + 1; });
    if (!(idx.every(function (x) { return x >= 1 && x <= 14; }) || idx.every(function (x) { return x >= 15; }))) p.push("letters: la serie cruza la Ñ");
    var lp = seqPredict(idx).map(function (v) { return ABC.charAt(v - 1); });
    if (lp.indexOf(q.opciones[q.correcta]) === -1) p.push("letters: la opción correcta no sigue la serie");
    q.opciones.forEach(function (o, k) { if (k !== q.correcta && lp.indexOf(o) !== -1) p.push("letters: otra opción también sigue la serie"); });
  }
  if (c.count) {
    var n = String(q.visual || "").split(/\s+/).filter(function (t) { return t === c.count; }).length;
    expectNumber(n, "count");
  }
  if (c.pattern) {
    var toks = String(q.visual || "").split(/\s+/).filter(Boolean);
    if (toks[toks.length - 1] !== "?") p.push("pattern: falta el «?» final");
    toks = toks.filter(function (t) { return t !== "?"; });
    var period = 0;
    for (var L = 1; L <= toks.length / 2 && !period; L++) {
      var okL = true;
      for (i = L; i < toks.length; i++) if (toks[i] !== toks[i - L]) { okL = false; break; }
      if (okL) period = L;
    }
    if (!period) p.push("pattern: no hay bloque que se repita dos veces");
    else if (q.opciones[q.correcta] !== toks[toks.length - period]) p.push("pattern: la opción correcta no continúa el bloque");
  }
  if (c.dias) {
    var wd = weekdayAfter(c.dias.start, c.dias.n, c.dias.past);
    if (norm(q.opciones[q.correcta]) !== norm(WEEKDAYS[wd])) p.push("dias: debería ser " + WEEKDAYS[wd]);
  }
  if (c.edades) {
    var e = c.edades, sols = [];
    for (var y = 1; y <= 400; y++) if ((y + e.m) + (e.k * y + e.m) === e.S) sols.push(y);
    if (sols.length !== 1) p.push("edades: el problema no tiene solución única");
    else expectNumber(e.ask === "mayor" ? e.k * sols[0] : sols[0], "edades");
  }
  if (c.valores) {
    if (!Array.isArray(q.elementos) || c.valores.length !== q.elementos.length) p.push("valores: no coinciden con los elementos");
    for (i = 1; i < c.valores.length; i++) if (!(c.valores[i] > c.valores[i - 1])) p.push("valores: el orden no es estrictamente creciente");
  }
  if (c.alfabetico) {
    var sorted = q.elementos.slice().sort(function (a, b) { return a.localeCompare(b, "es", { sensitivity: "base" }); });
    if (sorted.join("|") !== q.elementos.join("|")) p.push("alfabetico: el orden no es alfabético");
  }
  if (c.fill) {
    if (c.fill.replace("_", q.opciones[q.correcta]) !== c.word) p.push("fill: la letra no completa la palabra");
    q.opciones.forEach(function (o, k) { if (k !== q.correcta && c.fill.replace("_", o) === c.word) p.push("fill: otra opción también completa la palabra"); });
  }
  return p;
}
function anagramProblems(q) {
  if (typeof q.respuesta !== "string" || !q.visual || !/^([A-ZÑ] )+[A-ZÑ]$/.test(q.visual)) return [];
  var letters = q.visual.replace(/ /g, "").toLowerCase().split("").sort().join("");
  return [q.respuesta].concat(q.acepta || []).filter(function (w) { return plainLetters(w).split("").sort().join("") !== letters; })
    .map(function (w) { return "anagrama: «" + w + "» no usa las mismas letras"; });
}
function problems(ch) {
  var p = [];
  try {
    if (!ch) return ["reto inexistente"];
    if (!nonEmpty(ch.slug)) p.push("sin slug");
    if (!/^[a-z0-9-]+$/.test(String(ch.slug || ""))) p.push("slug no válido");
    if (!nonEmpty(ch.title)) p.push("sin título");
    if (!catBySlug[ch.cat]) p.push("categoría desconocida: " + ch.cat);
    if (!KIND_LABELS[ch.kind]) p.push("tipo desconocido: " + ch.kind);
    if (!(ch.difficulty >= 1 && ch.difficulty <= 5 && Math.round(ch.difficulty) === ch.difficulty)) p.push("dificultad fuera de rango");
    if (!(ch.duration > 0) || !(ch.max_points > 0)) p.push("duración o puntos no válidos");
    if (ch.cat === "trivia" && !TOPICS[ch.topic]) p.push("trivia sin tema");
    var d = ch.data;
    if (!d) return p.concat(["sin datos"]);
    if (ch.kind === "emparejar") {
      if (!(Array.isArray(d.parejas) && d.parejas.length >= 2)) p.push("menos de 2 parejas");
      else {
        if (!d.parejas.every(function (x) { return x && nonEmpty(x.a) && nonEmpty(x.b); })) p.push("pareja vacía");
        if (!allUnique(d.parejas.map(function (x) { return x.a; })) || !allUnique(d.parejas.map(function (x) { return x.b; }))) p.push("parejas repetidas");
      }
      return p;
    }
    if (!Array.isArray(d.preguntas) || !d.preguntas.length) return p.concat(["sin preguntas"]);
    d.preguntas.forEach(function (q, qi) {
      var tag = "P" + (qi + 1) + ": ";
      if (!q || !nonEmpty(q.pregunta)) { p.push(tag + "sin enunciado"); return; }
      if (ch.kind === "opcion_multiple" || ch.kind === "secuencia") {
        if (!(Array.isArray(q.opciones) && q.opciones.length >= 2 && q.opciones.every(nonEmpty))) p.push(tag + "opciones no válidas");
        else if (!allUnique(q.opciones)) p.push(tag + "opciones repetidas");
        if (!(typeof q.correcta === "number" && Math.round(q.correcta) === q.correcta && q.correcta >= 0 && q.correcta < (q.opciones || []).length)) p.push(tag + "índice de respuesta no válido");
      } else if (ch.kind === "verdadero_falso") {
        if (typeof q.respuesta !== "boolean") p.push(tag + "respuesta no booleana");
      } else if (ch.kind === "respuesta_texto") {
        if (!((typeof q.respuesta === "number" && isFinite(q.respuesta)) || (typeof q.respuesta === "string" && nonEmpty(q.respuesta)))) p.push(tag + "respuesta vacía");
        if (q.claves) p.push(tag + "respuesta por palabras clave (ambigua)");
        if (typeof q.respuesta === "string" && !(q.visual && /^([A-ZÑ] )+[A-ZÑ]$/.test(q.visual))) p.push(tag + "respuesta libre de texto sin comprobación");
        anagramProblems(q).forEach(function (x) { p.push(tag + x); });
      } else if (ch.kind === "ordenar") {
        if (!(Array.isArray(q.elementos) && q.elementos.length >= 2 && q.elementos.every(nonEmpty) && allUnique(q.elementos))) p.push(tag + "elementos no válidos");
      } else if (ch.kind === "memoria") {
        if (q.pool) {
          if (!(Array.isArray(q.pool) && allUnique(q.pool) && q.n >= 3 && q.n <= q.pool.length)) p.push(tag + "pool de memoria no válido");
        } else if (!(Array.isArray(q.elementos) && q.elementos.length >= 2 && q.elementos.every(nonEmpty) && allUnique(q.elementos))) p.push(tag + "elementos no válidos");
      } else if (ch.kind === "estimar") {
        if (!(typeof q.respuesta === "number" && isFinite(q.respuesta))) p.push(tag + "respuesta no numérica");
        if (!(q.tolerancia === undefined || (typeof q.tolerancia === "number" && q.tolerancia >= 0))) p.push(tag + "tolerancia no válida");
        if (q.tolerancia && q.tolerancia > Math.abs(q.respuesta) * 0.5) p.push(tag + "margen demasiado amplio");
      }
      checkProblems(q, ch).forEach(function (x) { p.push(tag + x); });
    });
  } catch (e) { p.push("error al validar: " + e.message); }
  return p;
}
var validCache = {};
function validateChallenge(ch) {
  if (!ch) return false;
  if (!ch.generated && validCache[ch.slug] !== undefined) return validCache[ch.slug];
  var ok = problems(ch).length === 0;
  if (!ch.generated) validCache[ch.slug] = ok;
  return ok;
}

/* Firma de cada pregunta: detecta la misma pregunta aunque llegue por
 * otro reto o generador. La firma del reto agrupa las de sus preguntas. */
function sigsOf(ch) {
  if (ch.kind === "emparejar") return ["pairs|" + ch.data.parejas.map(function (p) { return norm(p.a) + ">" + norm(p.b); }).sort().join(",")];
  return ch.data.preguntas.map(function (q) {
    return norm(q.pregunta) + "|" + (q.visual || "") + "|" + (q.opciones || []).map(function (o) { return String(o).toLowerCase(); }).sort().join(",") + "|" + (q.elementos || q.pool || []).slice().sort().join(",");
  });
}
function signature(ch) { return hashStr(sigsOf(ch).slice().sort().join("§")).toString(36); }

/* --- Fechas (todo en la zona horaria del sitio) ------------------------ */
function dayInTz(d) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: CONFIG.tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(d || new Date());
}
function validDay(day) { return /^\d{4}-\d{2}-\d{2}$/.test(String(day)) && !isNaN(Date.parse(day + "T00:00:00Z")) && new Date(day + "T00:00:00Z").toISOString().slice(0, 10) === day; }
function dayNum(day) { var p = day.split("-"); return Math.round(Date.UTC(+p[0], +p[1] - 1, +p[2]) / 86400000); }
function addDay(day, delta) { return new Date((dayNum(day) + delta) * 86400000).toISOString().slice(0, 10); }
function secsToMidnight() {
  var parts = new Intl.DateTimeFormat("en-GB", { timeZone: CONFIG.tz, hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }).formatToParts(new Date());
  var v = {}; parts.forEach(function (p) { v[p.type] = parseInt(p.value, 10); });
  return 86400 - ((v.hour % 24) * 3600 + v.minute * 60 + v.second);
}
function pad(n) { return (n < 10 ? "0" : "") + n; }
function clock(s) { return pad(Math.floor(s / 3600)) + ":" + pad(Math.floor((s % 3600) / 60)) + ":" + pad(s % 60); }
function longDate(day) { return new Intl.DateTimeFormat("es-ES", { timeZone: "UTC", day: "numeric", month: "long" }).format(new Date(day + "T12:00:00Z")); }
function shortDate(day) { return new Intl.DateTimeFormat("es-ES", { timeZone: "UTC", day: "numeric", month: "short" }).format(new Date(day + "T12:00:00Z")).replace(".", ""); }
function dailyNumber(day) { return Math.max(1, dayNum(day) - dayNum(CONFIG.launchDay) + 1); }

/* --- Reto del día ----------------------------------------------------
 * Una sesión de 4 o 5 pruebas de categorías distintas, con dificultad
 * creciente. La semilla sale de la fecha: mismo reto para todo el mundo,
 * no cambia al recargar y se puede reproducir cualquier día pasado.
 * --------------------------------------------------------------------- */
var DAILY_WEIGHT = { normal: 1, dificil: 1.25, experto: 1.5 };
function dailyOk(ch) {
  if (!ch || isOpinion(ch) || !validateChallenge(ch)) return false;
  if (ch.kind === "respuesta_texto") return ch.data.preguntas.every(function (q) { return typeof q.respuesta === "number" || anagramProblems(q).length === 0 && /^([A-ZÑ] )+[A-ZÑ]$/.test(q.visual || ""); });
  if (ch.kind === "verdadero_falso") return ch.data.preguntas.length >= 3;
  return true;
}
var dailyCache = {};
function dailySet(day) {
  if (!validDay(day)) return null;
  if (dailyCache[day]) return dailyCache[day];
  var rng = mulberry(hashStr("retame|reto-del-dia|v2|" + day));
  var n = rng() < 0.6 ? 5 : 4;
  var tiers = n === 5 ? ["normal", "normal", "dificil", "dificil", "experto"] : ["normal", "dificil", "dificil", "experto"];
  var cats = shuffleWith(PUBLIC_CATS.map(function (c) { return c.slug; }), rng).slice(0, n);
  /* Siempre al menos una prueba de pensar (lógica o matemáticas). */
  if (cats.indexOf("logica") === -1 && cats.indexOf("matematicas") === -1) cats[n - 1] = rng() < 0.5 ? "logica" : "matematicas";
  var used = {}, rounds = [];
  cats.forEach(function (cat, i) {
    var fams = shuffleWith((GENERATORS[cat] || []).filter(function (g) { return g.daily; }), rng), got = null;
    for (var f = 0; f < fams.length && !got; f++) {
      for (var a = 0; a < 6 && !got; a++) {
        var ch = makeGenerated(cat, fams[f].id, tiers[i], seedFrom(rng));
        if (!dailyOk(ch)) continue;
        if (sigsOf(ch).some(function (s) { return used[s]; })) continue;
        got = ch;
      }
    }
    if (!got) {
      var statics = CHALLENGES.filter(function (c) { return c.cat === cat && dailyOk(c) && !needsSeed(c); });
      if (statics.length) got = statics[Math.floor(rng() * statics.length)];
    }
    if (got) { sigsOf(got).forEach(function (s) { used[s] = 1; }); rounds.push({ ch: got, tier: tiers[i], weight: DAILY_WEIGHT[tiers[i]] || 1 }); }
  });
  var set = { day: day, number: dailyNumber(day), rounds: rounds, sig: hashStr(rounds.map(function (r) { return r.ch.slug; }).join("|")).toString(36) };
  dailyCache[day] = set;
  return set;
}
/* Puntuación del reto del día sobre 1000: cada prueba pesa según su
 * dificultad. */
function dailyScore(set, results) {
  var totalW = 0, got = 0;
  set.rounds.forEach(function (r, i) {
    totalW += r.weight;
    var res = results[i];
    if (res) got += r.weight * (res.points / r.ch.max_points);
  });
  return totalW ? Math.round(got / totalW * 1000) : 0;
}
/* Cuadrado por prueba: perfecta, a medias o fallada. */
function gradeOf(accuracy) { return accuracy >= 100 ? "v" : accuracy >= 50 ? "~" : "x"; }
var GRADE_EMOJI = { v: "🟩", "~": "🟨", x: "🟥" };

/* Retos escritos a mano: puntos máximos con la misma fórmula que los
 * generados, para que todos sean comparables. */
CHALLENGES.forEach(function (c) { c.max_points = maxPoints(c.difficulty, unitsOf(c)); chBySlug[c.slug] = c; });
var PUBLIC_CHALLENGES = CHALLENGES.filter(function (c) { return !catBySlug[c.cat].hidden; });

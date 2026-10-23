/* Tests del motor: contenido, generadores, reto del día y puntuación.
 *   node tests/engine.test.mjs */
import assert from "node:assert/strict";
import { loadEngine } from "../scripts/load.mjs";

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log("  ✓ " + name); }
  catch (e) { console.error("  ✗ " + name + "\n    " + e.message); process.exitCode = 1; }
}
const E = loadEngine();
console.log("Motor");

test("todos los retos escritos a mano pasan la validación", () => {
  const bad = E.CHALLENGES.map((c) => [c.slug, E.problems(c)]).filter(([, p]) => p.length);
  assert.equal(bad.length, 0, JSON.stringify(bad));
});
test("slugs únicos y en formato URL", () => {
  const s = E.CHALLENGES.map((c) => c.slug);
  assert.equal(new Set(s).size, s.length);
  s.forEach((x) => assert.match(x, /^[a-z0-9]+(-[a-z0-9]+)*$/));
});
test("ninguna pregunta se repite entre retos escritos a mano", () => {
  const seen = new Map();
  for (const c of E.CHALLENGES) for (const s of E.sigsOf(c)) { assert.ok(!seen.has(s), `${c.slug} repite una pregunta de ${seen.get(s)}`); seen.set(s, c.slug); }
});
test("8 categorías públicas, cada una con al menos 4 retos", () => {
  assert.equal(E.PUBLIC_CATS.length, 8);
  for (const c of E.PUBLIC_CATS) assert.ok(E.PUBLIC_CHALLENGES.filter((x) => x.cat === c.slug).length >= 4, c.slug);
});
test("no hay respuestas libres por palabras clave", () => {
  for (const c of E.CHALLENGES) for (const q of c.data.preguntas || []) {
    assert.ok(!q.claves, c.slug);
    if (c.kind === "respuesta_texto" && typeof q.respuesta === "string") assert.match(q.visual || "", /^([A-ZÑ] )+[A-ZÑ]$/, `${c.slug}: texto libre sin anagrama`);
  }
});
test("la trivia evita datos que caducan", () => {
  for (const c of E.CHALLENGES) for (const q of c.data.preguntas || []) assert.doesNotMatch(q.pregunta, /actualmente|hoy en día|este año/i, c.slug);
  for (const k of Object.keys(E.FACT_BANKS)) for (const [t] of E.FACT_BANKS[k]) assert.doesNotMatch(t, /actualmente|hoy en día/i, t);
});
test("la validación detecta respuestas incorrectas", () => {
  const wrongSeq = { slug: "x", title: "x", cat: "logica", kind: "secuencia", difficulty: 3, duration: 30, max_points: 700, data: { preguntas: [{ pregunta: "?", opciones: ["10", "12"], correcta: 1, check: { seq: [2, 4, 6, 8] } }] } };
  assert.ok(E.problems(wrongSeq).some((p) => /serie/.test(p)));
  const wrongExpr = { slug: "y", title: "y", cat: "matematicas", kind: "respuesta_texto", difficulty: 2, duration: 30, max_points: 550, data: { preguntas: [{ pregunta: "7 × 8", respuesta: 54, check: { expr: "7*8" } }] } };
  assert.ok(E.problems(wrongExpr).length > 0);
  const twoAnswers = { slug: "z", title: "z", cat: "observacion", kind: "opcion_multiple", difficulty: 2, duration: 30, max_points: 550, data: { preguntas: [{ pregunta: "¿Cuántos?", visual: "🔺 🔺", opciones: ["2", "2,0"], correcta: 0, check: { count: "🔺" } }] } };
  assert.ok(E.problems(twoAnswers).some((p) => /otra opción/.test(p)));
});
test("cada generador produce retos válidos y reproducibles", () => {
  for (const cat of Object.keys(E.GENERATORS)) for (const g of E.GENERATORS[cat]) for (const t of E.TIERS) {
    let ok = 0;
    for (let s = 1; s <= 120; s++) {
      const seed = (s * 2654435761) >>> 0, a = E.makeGenerated(cat, g.id, t, seed);
      if (!E.validateChallenge(a)) continue;
      ok++;
      const b = E.makeGenerated(cat, g.id, t, seed);
      assert.equal(JSON.stringify(a), JSON.stringify(b), `${cat}/${g.id} no es determinista`);
      const r = E.resolveChallenge(a.slug);
      assert.ok(r && r.key === a.key, `${a.slug} no se reconstruye desde su slug`);
    }
    assert.ok(ok >= 114, `${cat}/${g.id}/${t}: solo ${ok}/120 válidos`);
  }
});
test("enlaces de la versión 1 (g-…) siguen resolviendo", () => {
  for (const s of ["g-numbers-0-normal-1a2b3c", "g-geo-0-facil-zz9", "g-mind-2-experto-abc", "g-history-1-dificil-7", "g-fun-0-facil-1"]) assert.ok(E.resolveChallenge(s), s);
  assert.equal(E.resolveChallenge("g-nope-9-normal-1"), null);
  assert.equal(E.resolveChallenge("<script>"), null);
  assert.equal(E.resolveChallenge(""), null);
});
test("reto del día: 4–5 pruebas válidas, categorías distintas, dificultad creciente", () => {
  for (let i = 0; i < 400; i++) {
    const day = E.addDay(E.CONFIG.launchDay, i), set = E.dailySet(day);
    assert.ok(set.rounds.length >= 4 && set.rounds.length <= 5, day);
    const cats = set.rounds.map((r) => r.ch.cat);
    assert.equal(new Set(cats).size, cats.length, day + " repite categoría");
    assert.ok(cats.includes("logica") || cats.includes("matematicas"), day + " sin prueba de pensar");
    set.rounds.forEach((r) => { assert.ok(E.dailyOk(r.ch), day + " " + r.ch.slug); assert.ok(!E.isOpinion(r.ch)); });
    const tiers = set.rounds.map((r) => E.TIERS.indexOf(r.tier));
    for (let k = 1; k < tiers.length; k++) assert.ok(tiers[k] >= tiers[k - 1], day + " dificultad no creciente");
    assert.equal(set.number, i + 1);
  }
});
test("reto del día determinista: mismo día → mismo reto; otro día → otro reto", () => {
  const E2 = loadEngine();
  const sigs = new Set();
  for (let i = 0; i < 120; i++) {
    const day = E.addDay("2026-10-01", i);
    const a = E.dailySet(day), b = E2.dailySet(day);
    assert.equal(JSON.stringify(a.rounds.map((r) => r.ch.data)), JSON.stringify(b.rounds.map((r) => r.ch.data)), day);
    assert.ok(!sigs.has(a.sig), day + " repite el reto de otro día");
    sigs.add(a.sig);
  }
  assert.equal(E.dailySet("2026-02-30"), null);
  assert.equal(E.dailySet("hola"), null);
});
test("puntos: un reto fácil no supera a uno dos niveles más difícil", () => {
  for (let d = 1; d <= 3; d++) for (let u = 1; u <= 10; u++) assert.ok(E.maxPoints(d, u) < E.maxPoints(d + 2, 1));
  for (let d = 1; d <= 4; d++) for (let u = 1; u <= 10; u++) assert.ok(E.maxPoints(d, u) <= E.maxPoints(d + 1, 1));
});
test("puntos: pensar con calma cuesta como mucho un 20 %", () => {
  const ch = { duration: 60, max_points: 1000 };
  assert.equal(E.score(ch, { correct: 3, total: 3, seconds: 20 }).points, 1000);
  assert.equal(E.score(ch, { correct: 3, total: 3, seconds: 600 }).points, 800);
  assert.equal(E.score(ch, { correct: 0, total: 3, seconds: 5 }).points, 0);
  assert.ok(E.score(ch, { correct: 3, total: 3, seconds: 600 }).points > E.score(ch, { correct: 2, total: 3, seconds: 5 }).points, "acertar todo despacio gana a fallar rápido");
});
test("reto del día: 1000 como máximo y pesos por dificultad", () => {
  const set = E.dailySet("2026-10-23");
  const perfect = set.rounds.map((r) => ({ points: r.ch.max_points }));
  assert.equal(E.dailyScore(set, perfect), 1000);
  const half = set.rounds.map((r, i) => ({ points: i === 0 ? 0 : r.ch.max_points }));
  const lastMiss = set.rounds.map((r, i) => ({ points: i === set.rounds.length - 1 ? 0 : r.ch.max_points }));
  assert.ok(E.dailyScore(set, half) > E.dailyScore(set, lastMiss), "fallar la última (más difícil) cuesta más");
});
test("lectura de números como los escribe la gente", () => {
  assert.ok(E.numCandidates("384.400").includes(384400));
  assert.ok(E.numCandidates("6,25").includes(6.25));
  assert.ok(E.numCandidates("42.195").includes(42.195) && E.numCandidates("42.195").includes(42195));
  assert.equal(E.numCandidates("abc").length, 0);
  assert.equal(E.evalExpr("2^5-(3*4)/2"), 26);
  assert.ok(Number.isNaN(E.evalExpr("alert(1)")));
});
test("resultado compartible: cuadros sin respuestas", () => {
  assert.equal(E.gradeOf(100), "v"); assert.equal(E.gradeOf(60), "~"); assert.equal(E.gradeOf(20), "x");
});
console.log(`${passed} tests del motor OK`);

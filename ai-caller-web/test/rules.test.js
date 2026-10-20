import { test } from "node:test";
import assert from "node:assert/strict";
import { blockReasons, classifyWithoutConversation, estimateCostUsd, isWithinCallHours, normalizePhone, parseWindows } from "../src/rules.js";

const rules = {
  timezone: "Europe/Madrid",
  callWindows: "10:00-13:00,16:30-20:00",
  blockSunday: true,
  dedupDays: 30,
  noAnswerRetryHours: 4,
  maxNoAnswerAttempts: 3,
};
// Martes 20/10/2026 11:00 en Madrid (UTC+2)
const TUE_11 = Date.parse("2026-10-20T09:00:00Z");

const input = (over = {}) => ({
  phone: "+34612345678",
  numberKey: "34612345678",
  callerPhone: "+34911234567",
  restaurantName: "Casa Lola",
  websiteOffer: "Web con reservas",
  email: "yo@ejemplo.com",
  ...over,
});
const ctx = (over = {}) => ({
  now: TUE_11,
  rules,
  numberState: undefined,
  control: { stopped: false, spentUsd: 0 },
  maxCallCost: 1.2,
  spend: { maxSpendUsd: 9 },
  ...over,
});

test("normaliza teléfonos españoles e internacionales", () => {
  assert.deepEqual(normalizePhone("612 34 56 78"), { e164: "+34612345678", key: "34612345678" });
  assert.equal(normalizePhone("0034 612-345-678").e164, "+34612345678");
  assert.equal(normalizePhone("+34 (91) 123 45 67").e164, "+34911234567");
  assert.equal(normalizePhone("+1 415 555 2671").e164, "+14155552671");
});

test("franjas horarias en hora de Madrid", () => {
  assert.deepEqual(parseWindows("10:00-13:00, 16:30-20:00"), [[600, 780], [990, 1200]]);
  assert.equal(isWithinCallHours(new Date(TUE_11), rules), true);
  assert.equal(isWithinCallHours(new Date(Date.parse("2026-10-20T12:00:00Z")), rules), false); // 14:00
  assert.equal(isWithinCallHours(new Date(Date.parse("2026-10-25T09:00:00Z")), rules), false); // domingo
});

test("una campaña válida no tiene bloqueos", () => {
  assert.deepEqual(blockReasons(input(), ctx()), []);
});

test("valida datos obligatorios", () => {
  const r = blockReasons(input({ phone: "+12", email: "x", restaurantName: " ", websiteOffer: "" }), ctx());
  assert.deepEqual(r.sort(), ["EMAIL_INVALIDO", "FALTA_OFERTA", "FALTA_RESTAURANTE", "TELEFONO_INVALIDO"].sort());
  assert.ok(blockReasons(input({ callerPhone: "+34612345678" }), ctx()).includes("MISMO_NUMERO"));
});

test("interruptor de parada y tope de gasto", () => {
  assert.ok(blockReasons(input(), ctx({ control: { stopped: true, spentUsd: 0 } })).includes("CAMPANAS_DETENIDAS"));
  assert.ok(blockReasons(input(), ctx({ control: { stopped: false, spentUsd: 8 } })).includes("TOPE_DE_GASTO"));
  assert.ok(!blockReasons(input(), ctx({ control: { stopped: false, spentUsd: 7.8 } })).includes("TOPE_DE_GASTO"));
});

test("el opt-out no se salta ni con allowRecall", () => {
  const r = blockReasons(input({ allowRecall: true }), ctx({ numberState: { doNotCall: true } }));
  assert.ok(r.includes("NO_LLAMAR"));
});

test("antiduplicados: 30 días, 4 h si no contestó, y allowRecall", () => {
  const oneDayAgo = new Date(TUE_11 - 24 * 3600e3).toISOString();
  const fiveHoursAgo = new Date(TUE_11 - 5 * 3600e3).toISOString();
  const state = (o) => ({ numberState: { lastCallAt: oneDayAgo, lastStatus: "completed", lastResult: "WARM_LEAD", ...o } });
  assert.ok(blockReasons(input(), ctx(state())).includes("LLAMADO_RECIENTEMENTE"));
  assert.ok(!blockReasons(input({ allowRecall: true }), ctx(state())).includes("LLAMADO_RECIENTEMENTE"));
  assert.ok(!blockReasons(input(), ctx(state({ lastResult: "NO_ANSWER", lastCallAt: fiveHoursAgo }))).includes("LLAMADO_RECIENTEMENTE"));
  assert.ok(!blockReasons(input(), ctx(state({ lastStatus: "provider_error" }))).includes("LLAMADO_RECIENTEMENTE"));
});

test("llamada en curso y máximo de intentos sin respuesta", () => {
  const recent = new Date(TUE_11 - 60e3).toISOString();
  assert.ok(blockReasons(input({ allowRecall: true }), ctx({ numberState: { lastCallAt: recent, lastStatus: "in_progress" } })).includes("LLAMADA_EN_CURSO"));
  const old = new Date(TUE_11 - 10 * 3600e3).toISOString();
  const r = blockReasons(input(), ctx({ numberState: { lastCallAt: old, lastStatus: "completed", lastResult: "NO_ANSWER", noAnswerStreak: 3 } }));
  assert.deepEqual(r, ["MAX_INTENTOS"]);
});

test("fuera de horario salvo modo pruebas", () => {
  const late = ctx({ now: Date.parse("2026-10-20T20:30:00Z") });
  assert.deepEqual(blockReasons(input(), late), ["FUERA_DE_HORARIO"]);
  assert.deepEqual(blockReasons(input({ ignoreCallHours: true }), late), []);
});

test("clasificación sin conversación", () => {
  assert.deepEqual(classifyWithoutConversation({ twilioStatus: "busy" }), { result: "NO_ANSWER", callStatus: "OCUPADO" });
  assert.deepEqual(classifyWithoutConversation({ twilioStatus: "completed", answeredBy: "machine_end_beep" }).callStatus, "BUZON_DE_VOZ");
  assert.equal(classifyWithoutConversation({ twilioStatus: "completed", userTurns: 0 }).result, "NO_ANSWER");
  assert.equal(classifyWithoutConversation({ twilioStatus: "completed", userTurns: 3 }), null);
});

test("coste estimado por minuto empezado", () => {
  assert.equal(estimateCostUsd(0, 0.15), 0);
  assert.equal(estimateCostUsd(61, 0.15), 0.3);
});

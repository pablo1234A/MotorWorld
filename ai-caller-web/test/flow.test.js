// Llamada completa de punta a punta con Twilio y Claude simulados:
// panel -> Twilio -> TwiML -> WebSocket ConversationRelay -> agente -> cuelgue -> análisis -> email.

import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";
import { EventEmitter } from "node:events";
import WebSocket from "ws";
import { Store } from "../src/store.js";
import { CallService } from "../src/calls.js";
import { createApp, attachRelay } from "../src/server.js";
import { config as baseConfig } from "../src/config.js";

function fakeAnthropic() {
  const requests = [];
  const reply = (params) => {
    const lastUser = params.messages.filter((m) => m.role === "user").at(-1).content;
    if (/adiós|no me interesa/i.test(lastUser)) {
      return { text: "Entendido, muchas gracias por tu tiempo. ¡Que vaya muy bien!", endCall: { reason: "despedida", do_not_call: false } };
    }
    return { text: "¡Genial! ¿Ahora mismo tenéis página web?" };
  };
  const stream = (params) => {
    requests.push(params);
    const emitter = new EventEmitter();
    const { text, endCall } = reply(params);
    const done = (async () => {
      await new Promise((r) => setTimeout(r, 5));
      for (const word of text.split(/(?<= )/)) emitter.emit("text", word);
      const content = [{ type: "text", text }];
      if (endCall) content.push({ type: "tool_use", id: "tu_1", name: "end_call", input: endCall });
      return { stop_reason: endCall ? "tool_use" : "end_turn", content };
    })();
    return { on: (ev, fn) => emitter.on(ev, fn), finalMessage: () => done, abort() {} };
  };
  const parse = async (params) => {
    requests.push(params);
    return {
      stop_reason: "end_turn",
      parsed_output: {
        classification: "WARM_LEAD", interest_level: 55.4, conversion_probability: 120, summary: "Interés moderado.",
        main_need: "Reservas online", main_objection: "Ninguna", objections: [], customer_key_points: ["No tienen web"],
        recommended_offer: "Web con reservas", next_step: "Llamar la semana que viene", meeting_datetime: "", callback_datetime: "",
        contact_name_role: "Lola, dueña", contact_details: "", decision_maker: "Sí", website_status: "No tienen web",
        do_not_call: false, agent_feedback: "Bien",
      },
    };
  };
  return { requests, beta: { messages: { stream, parse } }, messages: { parse } };
}

function fakeTwilio() {
  const created = [];
  const calls = (sid) => ({ update: async () => ({ sid }), fetch: async () => ({ status: "completed", duration: "42" }) });
  calls.create = async (params) => {
    created.push(params);
    return { sid: "CA0001" };
  };
  return { created, calls };
}

test("llamada completa: panel -> conversación -> análisis -> email", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "nexo-"));
  const cfg = structuredClone(baseConfig);
  Object.assign(cfg, { publicBaseUrl: "https://example.test", panelPassword: "secreta", appSecret: "s3cret" });
  cfg.twilio = { ...cfg.twilio, accountSid: "AC1", authToken: "tok", validateSignature: false };
  process.env.ANTHROPIC_API_KEY ||= "test-key";

  const store = await new Store(path.join(dir, "db.json")).load();
  const anthropic = fakeAnthropic();
  const twilioClient = fakeTwilio();
  const sent = [];
  const mailer = { sendResult: async (call) => sent.push(call) };
  const log = { info() {}, warn() {}, error: console.error };
  const calls = new CallService({ cfg, store, anthropic, twilioClient, mailer, log });
  const server = http.createServer(createApp({ cfg, store, calls, anthropic, log }));
  attachRelay(server, { cfg, store, calls, anthropic, log });
  await new Promise((r) => server.listen(0, r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const auth = { Authorization: `Basic ${Buffer.from("x:secreta").toString("base64")}`, "Content-Type": "application/json" };

  try {
    // Sin contraseña no se puede usar la API
    assert.equal((await fetch(`${base}/api/calls`)).status, 401);

    const form = {
      phoneToCall: "612 345 678", callerPhone: "+34 911 234 567", restaurantName: "Casa Lola",
      websiteOffer: "Web con reservas online", myEmail: "yo@ejemplo.com", ignoreCallHours: true,
    };
    const res = await fetch(`${base}/api/calls`, { method: "POST", headers: auth, body: JSON.stringify(form) });
    assert.equal(res.status, 201, await res.clone().text());
    const { id } = await res.json();
    assert.equal(twilioClient.created[0].to, "+34612345678");
    assert.equal(twilioClient.created[0].machineDetection, "Enable");

    // Doble clic: la segunda petición se bloquea
    const again = await fetch(`${base}/api/calls`, { method: "POST", headers: auth, body: JSON.stringify(form) });
    assert.equal(again.status, 422);
    assert.ok((await again.json()).blocked.some((b) => b.code === "LLAMADA_EN_CURSO"));

    // Twilio pide el TwiML
    const twiml = await (await fetch(`${base}/twilio/voice?callId=${id}`, { method: "POST" })).text();
    assert.match(twiml, /<ConversationRelay [^>]*welcomeGreeting="[^"]*asistente virtual de NEXO/);
    assert.match(twiml, /welcomeGreetingInterruptible="none"/);
    const wsUrl = twiml.match(/url="([^"]+)"/)[1].replaceAll("&amp;", "&").replace("wss://example.test", `ws://127.0.0.1:${server.address().port}`);

    // Un token falso no abre el WebSocket
    await assert.rejects(new Promise((resolve, reject) => {
      const bad = new WebSocket(wsUrl.replace(/token=[^&]+/, "token=nope"));
      bad.on("open", resolve); bad.on("error", reject);
    }));

    const ws = new WebSocket(wsUrl);
    const received = [];
    await new Promise((r) => ws.on("open", r));
    ws.on("message", (d) => received.push(JSON.parse(d.toString())));
    const waitFor = (pred, ms = 6000) => new Promise((resolve, reject) => {
      const t0 = Date.now();
      const tick = () => (pred() ? resolve() : Date.now() - t0 > ms ? reject(new Error("timeout: " + JSON.stringify(received) + " " + JSON.stringify(store.getCall(id)?.transcript))) : setTimeout(tick, 20));
      tick();
    });

    ws.send(JSON.stringify({ type: "setup", callSid: "CA0001" }));
    ws.send(JSON.stringify({ type: "prompt", voicePrompt: "Sí, dígame", last: true }));
    await waitFor(() => received.some((m) => m.type === "text" && m.last === true));
    assert.ok(received.filter((m) => m.type === "text" && !m.last).map((m) => m.token).join("").includes("página web"));

    // El sistema del agente lleva la campaña
    assert.match(anthropic.requests[0].system, /Casa Lola/);
    assert.match(anthropic.requests[0].system, /Web con reservas online/);

    ws.send(JSON.stringify({ type: "prompt", voicePrompt: "Ahora no me interesa, adiós", last: true }));
    await waitFor(() => received.some((m) => m.type === "end"), 12000);
    ws.close();

    await fetch(`${base}/twilio/status?callId=${id}`, {
      method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: "CallSid=CA0001&CallStatus=completed&CallDuration=95",
    });
    await waitFor(() => store.getCall(id)?.emailSent === true);

    const call = store.getCall(id);
    assert.equal(call.result, "WARM_LEAD");
    assert.equal(call.analysis.conversion_probability, 100); // acotado a 0-100
    assert.equal(call.analysis.interest_level, 55);
    assert.equal(call.transcript.filter((t) => t.role === "user").length, 2);
    assert.deepEqual(call.transcript.map((t) => t.role), ["agent", "user", "agent", "user", "agent"]); // saludo primero
    assert.equal(sent.length, 1);
    assert.equal(store.control.spentUsd, 0.3); // 95 s -> 2 min x 0,15 $
    assert.equal(store.getNumber("34612345678").lastResult, "WARM_LEAD");

    // El detalle de la llamada se ve en el panel
    const detail = await (await fetch(`${base}/api/calls/${id}`, { headers: auth })).json();
    assert.equal(detail.callStatusLabel, "CONVERSACION");
  } finally {
    server.close();
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test("sin respuesta: se clasifica sin IA y suma al contador de intentos", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "nexo-"));
  const cfg = structuredClone(baseConfig);
  Object.assign(cfg, { publicBaseUrl: "https://example.test", appSecret: "s" });
  const store = await new Store(path.join(dir, "db.json")).load();
  const anthropic = fakeAnthropic();
  const calls = new CallService({ cfg, store, anthropic, twilioClient: fakeTwilio(), mailer: null, log: { info() {}, warn() {}, error() {} } });
  try {
    const { call } = await calls.startCall({
      phoneToCall: "+34612345678", callerPhone: "+34911234567", restaurantName: "Bar Pepe",
      websiteOffer: "Web", myEmail: "yo@ejemplo.com", ignoreCallHours: true,
    });
    await calls.onStatus(call.id, { CallStatus: "no-answer" });
    const done = store.getCall(call.id);
    assert.equal(done.result, "NO_ANSWER");
    assert.equal(done.callStatusLabel, "NO_CONTESTA");
    assert.equal(anthropic.requests.length, 0);
    assert.equal(store.getNumber("34612345678").noAnswerStreak, 1);
    assert.match(done.emailError, /SMTP/);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

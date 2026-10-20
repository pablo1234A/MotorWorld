// Servidor web: panel, API, webhooks de Twilio y WebSocket de ConversationRelay.

import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import { WebSocketServer } from "ws";
import Anthropic from "@anthropic-ai/sdk";
import twilio from "twilio";
import { config, configProblems, maxCallCostEstimate } from "./config.js";
import { Store } from "./store.js";
import { LiveConversation } from "./agent.js";
import { CallService, buildTwiml, verifyRelayToken } from "./calls.js";
import { createMailer } from "./email.js";

const here = path.dirname(fileURLToPath(import.meta.url));

export function createApp({ cfg = config, store, calls, anthropic, log = console }) {
  const app = express();
  app.disable("x-powered-by");
  app.use(express.urlencoded({ extended: false }));
  app.use(express.json({ limit: "200kb" }));

  // --- Webhooks de Twilio (firmados) -------------------------------------------------------
  const twilioOnly = (req, res, next) => {
    if (!cfg.twilio.validateSignature) return next();
    const valid = twilio.validateRequest(
      cfg.twilio.authToken,
      req.get("X-Twilio-Signature") || "",
      `${cfg.publicBaseUrl}${req.originalUrl}`,
      req.body || {},
    );
    if (!valid) return res.status(403).send("Firma de Twilio no válida");
    next();
  };

  app.post("/twilio/voice", twilioOnly, (req, res) => {
    const call = store.getCall(String(req.query.callId || ""));
    const twiml = new twilio.twiml.VoiceResponse();
    if (!call) {
      twiml.hangup();
      return res.type("text/xml").send(twiml.toString());
    }
    res.type("text/xml").send(buildTwiml(cfg, call));
  });

  app.post("/twilio/status", twilioOnly, async (req, res) => {
    res.sendStatus(204);
    await calls.onStatus(String(req.query.callId || ""), req.body).catch((e) => log.error("status:", e));
  });

  app.post("/twilio/amd", twilioOnly, async (req, res) => {
    res.sendStatus(204);
    await calls.onAmd(String(req.query.callId || ""), req.body).catch((e) => log.error("amd:", e));
  });

  // --- Panel y API (con contraseña) ---------------------------------------------------------
  const panelAuth = (req, res, next) => {
    if (!cfg.panelPassword) {
      if (cfg.allowOpenPanel) return next();
      return res.status(503).send("Configura PANEL_PASSWORD para usar el panel.");
    }
    const [scheme, encoded] = (req.get("Authorization") || "").split(" ");
    const pass = scheme === "Basic" ? Buffer.from(encoded || "", "base64").toString().split(":").slice(1).join(":") : "";
    if (pass && pass === cfg.panelPassword) return next();
    res.set("WWW-Authenticate", 'Basic realm="NEXO llamadas IA", charset="UTF-8"').status(401).send("Contraseña necesaria");
  };

  app.use("/api", panelAuth);

  app.get("/api/status", (req, res) => {
    res.json({
      agent: cfg.agent,
      rules: cfg.rules,
      spend: { ...cfg.spend, spentUsd: store.control.spentUsd, maxCallCostEstimate: maxCallCostEstimate(cfg) },
      stopped: store.control.stopped,
      model: cfg.claude.model,
      problems: configProblems(cfg),
      defaultEmail: cfg.email.defaultTo,
    });
  });

  app.post("/api/control", async (req, res) => {
    const patch = {};
    if (typeof req.body.stopped === "boolean") patch.stopped = req.body.stopped;
    if (req.body.resetSpend === true) patch.spentUsd = 0;
    res.json(await store.updateControl(patch));
  });

  const summary = (c) => ({
    id: c.id,
    createdAt: c.createdAt,
    restaurantName: c.campaign.restaurantName,
    phone: c.phone,
    status: c.status,
    result: c.result || "",
    callStatusLabel: c.callStatusLabel || "",
    interest: c.analysis?.interest_level ?? null,
    durationSeconds: c.durationSeconds || 0,
    emailSent: c.emailSent ?? null,
  });

  app.get("/api/calls", (req, res) => res.json(store.listCalls().slice(0, 200).map(summary)));

  app.get("/api/calls/:id", (req, res) => {
    const call = store.getCall(req.params.id);
    if (!call) return res.status(404).json({ error: "No existe" });
    res.json(call);
  });

  app.post("/api/calls", async (req, res) => {
    const problems = configProblems(cfg).filter((p) => !p.startsWith("Email"));
    if (problems.length) return res.status(503).json({ error: "Configuración incompleta", problems });
    try {
      const result = await calls.startCall(req.body || {});
      if (result.blocked) return res.status(422).json({ blocked: result.blocked });
      res.status(201).json(summary(result.call));
    } catch (err) {
      res.status(502).json({ error: err.message, callId: err.callId });
    }
  });

  app.post("/api/calls/:id/hangup", async (req, res) => {
    const call = store.getCall(req.params.id);
    if (!call?.twilioCallSid) return res.status(404).json({ error: "No existe" });
    await calls.hangup(call.twilioCallSid);
    res.json({ ok: true });
  });

  app.post("/api/calls/:id/resend-email", async (req, res) => {
    const ok = await calls.sendEmail(req.params.id);
    res.status(ok ? 200 : 502).json({ ok, error: store.getCall(req.params.id)?.emailError || "" });
  });

  app.post("/api/numbers/:key/allow-calls", async (req, res) => {
    // Quitar un número de la lista de exclusión solo si el propio restaurante lo pide.
    res.json(await store.updateNumber(req.params.key, { doNotCall: false }));
  });

  app.get("/healthz", (req, res) => res.json({ ok: true }));
  app.use("/", panelAuth, express.static(path.join(here, "..", "public")));
  return app;
}

export function attachRelay(server, { cfg = config, store, calls, anthropic, log = console }) {
  const wss = new WebSocketServer({ noServer: true });
  server.on("upgrade", (req, socket, head) => {
    const url = new URL(req.url, "http://localhost");
    const callId = url.searchParams.get("callId") || "";
    if (url.pathname !== "/relay" || !verifyRelayToken(cfg.appSecret, callId, url.searchParams.get("token"))) {
      socket.write("HTTP/1.1 403 Forbidden\r\n\r\n");
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
      calls.relayOpened(callId);
      const conversation = new LiveConversation({ ws, store, anthropic, cfg, callId, log });
      ws.on("message", (data) => conversation.handle(data.toString()).catch((e) => log.error("relay:", e)));
      ws.on("close", () => {
        conversation.close();
        calls.relayClosed(callId);
      });
    });
  });
  return wss;
}

async function main() {
  const store = await new Store(config.dataFile).load();
  const anthropic = new Anthropic();
  const twilioClient = twilio(config.twilio.accountSid || "AC_missing", config.twilio.authToken || "missing");
  const calls = new CallService({ cfg: config, store, anthropic, twilioClient, mailer: createMailer(config) });
  const app = createApp({ store, calls, anthropic });
  const server = http.createServer(app);
  attachRelay(server, { store, calls, anthropic });
  setInterval(() => calls.sweep().catch((e) => console.error("sweep:", e)), 5 * 60_000).unref();
  calls.sweep().catch((e) => console.error("sweep:", e));
  server.listen(config.port, () => {
    console.log(`NEXO llamadas IA escuchando en :${config.port}`);
    for (const p of configProblems(config)) console.warn(`  ⚠ ${p}`);
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}

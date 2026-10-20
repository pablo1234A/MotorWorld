// Ciclo de vida de una llamada: validar -> registrar -> llamar (Twilio) -> conversar -> analizar -> email.

import crypto from "node:crypto";
import twilio from "twilio";
import { analyzeCall, fallbackAnalysis } from "./analysis.js";
import { buildGreeting } from "./prompt.js";
import { BLOCK_REASONS, blockReasons, classifyWithoutConversation, estimateCostUsd, normalizePhone } from "./rules.js";
import { maxCallCostEstimate } from "./config.js";

const TERMINAL = ["completed", "busy", "no-answer", "failed", "canceled"];

export function relayToken(secret, callId) {
  return crypto.createHmac("sha256", secret).update(callId).digest("hex");
}

export function verifyRelayToken(secret, callId, token) {
  const expected = relayToken(secret, callId);
  return typeof token === "string" && token.length === expected.length &&
    crypto.timingSafeEqual(Buffer.from(token), Buffer.from(expected));
}

export function buildTwiml(cfg, call) {
  const wsBase = cfg.publicBaseUrl.replace(/^http/, "ws");
  const url = `${wsBase}/relay?callId=${encodeURIComponent(call.id)}&token=${relayToken(cfg.appSecret, call.id)}`;
  const response = new twilio.twiml.VoiceResponse();
  const connect = response.connect();
  const attrs = {
    url,
    welcomeGreeting: call.greeting,
    // El saludo incluye el aviso de IA y de grabación: no se puede interrumpir.
    welcomeGreetingInterruptible: "none",
    interruptible: "any",
    language: cfg.agent.language,
    ttsProvider: call.campaign.ttsProvider || cfg.agent.defaultTtsProvider,
  };
  const voice = call.campaign.voice || cfg.agent.defaultVoice;
  if (voice) attrs.voice = voice;
  const relay = connect.conversationRelay(attrs);
  relay.parameter({ name: "callId", value: call.id });
  response.hangup();
  return response.toString();
}

export class CallService {
  constructor({ cfg, store, anthropic, twilioClient, mailer, log = console }) {
    this.cfg = cfg;
    this.store = store;
    this.anthropic = anthropic;
    this.twilio = twilioClient;
    this.mailer = mailer;
    this.log = log;
    this.liveRelays = new Set();
    this.finalizing = new Set();
    this.closeTimers = new Map();
  }

  normalizeInput(body) {
    const phone = normalizePhone(body.phoneToCall);
    const caller = normalizePhone(body.callerPhone);
    return {
      phone: phone.e164,
      numberKey: phone.key,
      callerPhone: caller.e164,
      restaurantName: String(body.restaurantName || "").trim(),
      ttsProvider: ["ElevenLabs", "Google", "Amazon"].includes(body.ttsProvider) ? body.ttsProvider : this.cfg.agent.defaultTtsProvider,
      voice: String(body.voice || "").trim().slice(0, 120),
      callObjective: String(body.callObjective || "").trim(),
      restaurantContext: String(body.restaurantContext || "").trim(),
      websiteOffer: String(body.websiteOffer || "").trim(),
      price: String(body.price || "").trim(),
      specialInstructions: String(body.specialInstructions || "").trim(),
      email: String(body.myEmail || this.cfg.email.defaultTo || "").trim(),
      allowRecall: body.allowRecall === true || body.allowRecall === "true",
      ignoreCallHours: body.ignoreCallHours === true || body.ignoreCallHours === "true",
    };
  }

  check(input, now = Date.now()) {
    const codes = blockReasons(input, {
      now,
      rules: this.cfg.rules,
      numberState: this.store.getNumber(input.numberKey),
      control: this.store.control,
      maxCallCost: maxCallCostEstimate(this.cfg),
      spend: this.cfg.spend,
    });
    return codes.map((code) => ({ code, message: BLOCK_REASONS[code] }));
  }

  // Devuelve { call } o { blocked: [...] } o lanza si Twilio falla (la llamada queda registrada).
  async startCall(body) {
    const input = this.normalizeInput(body);
    const blocked = this.check(input);
    if (blocked.length) return { blocked };

    const now = new Date();
    const id = this.store.newId();
    const campaign = {
      restaurantName: input.restaurantName,
      ttsProvider: input.ttsProvider,
      voice: input.voice,
      callObjective: input.callObjective,
      restaurantContext: input.restaurantContext,
      websiteOffer: input.websiteOffer,
      price: input.price,
      specialInstructions: input.specialInstructions,
      myEmail: input.email,
    };
    const call = {
      id,
      createdAt: now.toISOString(),
      status: "queued",
      phone: input.phone,
      numberKey: input.numberKey,
      callerPhone: input.callerPhone,
      campaign,
      greeting: buildGreeting(campaign, this.cfg.agent, now, this.cfg.rules.timezone),
      transcript: [],
    };
    // Se marca el número ANTES de cualquier await: un doble clic no puede lanzar dos llamadas.
    const previous = this.store.getNumber(input.numberKey) || {};
    const numberUpdate = this.store.updateNumber(input.numberKey, {
      phone: input.phone,
      lastCallId: id,
      lastCallAt: now.toISOString(),
      lastStatus: "queued",
      restaurantName: input.restaurantName,
    });
    await Promise.all([numberUpdate, this.store.putCall(call)]);

    const base = this.cfg.publicBaseUrl;
    const q = `callId=${encodeURIComponent(id)}`;
    try {
      const created = await this.twilio.calls.create({
        to: input.phone,
        from: input.callerPhone,
        url: `${base}/twilio/voice?${q}`,
        method: "POST",
        statusCallback: `${base}/twilio/status?${q}`,
        statusCallbackEvent: ["initiated", "ringing", "answered", "completed"],
        statusCallbackMethod: "POST",
        timeout: this.cfg.twilio.ringTimeoutSeconds,
        timeLimit: this.cfg.agent.maxCallSeconds,
        record: this.cfg.twilio.recordCalls,
        ...(this.cfg.twilio.machineDetection
          ? { machineDetection: "Enable", asyncAmd: "true", asyncAmdStatusCallback: `${base}/twilio/amd?${q}`, asyncAmdStatusCallbackMethod: "POST" }
          : {}),
      });
      await this.store.updateCall(id, { status: "calling", twilioCallSid: created.sid });
      await this.store.updateNumber(input.numberKey, { lastStatus: "calling" });
      return { call: this.store.getCall(id) };
    } catch (err) {
      const message = err?.code ? `Twilio ${err.code}: ${err.message}` : String(err?.message || err);
      await this.store.updateCall(id, { status: "provider_error", lastError: message, finalized: true, result: "", callStatusLabel: "ERROR_PROVEEDOR" });
      await this.store.updateNumber(input.numberKey, { lastStatus: "provider_error", lastCallAt: previous.lastCallAt || null });
      const error = new Error(message);
      error.callId = id;
      throw error;
    }
  }

  async onStatus(callId, params) {
    const call = this.store.getCall(callId);
    if (!call) return;
    const status = params.CallStatus;
    const patch = { twilioStatus: status };
    if (params.CallDuration) patch.durationSeconds = Number(params.CallDuration);
    if (status === "in-progress" && call.status === "calling") patch.status = "ringing_answered";
    await this.store.updateCall(callId, patch);
    if (!TERMINAL.includes(status)) return;
    if (this.liveRelays.has(callId)) return; // se finaliza cuando se cierre la conversación
    await this.finalize(callId);
  }

  async onAmd(callId, params) {
    const call = this.store.getCall(callId);
    if (!call) return;
    const answeredBy = params.AnsweredBy || "";
    await this.store.updateCall(callId, { answeredBy });
    if (/^(machine|fax)/.test(answeredBy) && call.twilioCallSid) {
      this.log.info(`[${callId}] contestador detectado (${answeredBy}): colgando`);
      await this.hangup(call.twilioCallSid);
    }
  }

  async hangup(callSid) {
    try {
      await this.twilio.calls(callSid).update({ status: "completed" });
    } catch (err) {
      this.log.warn(`No se pudo colgar ${callSid}: ${err.message}`);
    }
  }

  relayOpened(callId) {
    this.liveRelays.add(callId);
  }

  relayClosed(callId) {
    this.liveRelays.delete(callId);
    const call = this.store.getCall(callId);
    if (!call) return;
    if (TERMINAL.includes(call.twilioStatus)) {
      this.finalize(callId);
      return;
    }
    // Si el aviso de Twilio no llega (webhook perdido), lo consultamos nosotros.
    clearTimeout(this.closeTimers.get(callId));
    const timer = setTimeout(() => this.reconcile(callId), 60_000);
    timer.unref?.();
    this.closeTimers.set(callId, timer);
  }

  // Consulta a Twilio el estado real de una llamada y la finaliza si ya terminó.
  async reconcile(callId) {
    const call = this.store.getCall(callId);
    if (!call || call.finalized) return;
    if (!call.twilioCallSid) {
      await this.store.updateCall(callId, { status: "aborted", finalized: true, lastError: "Twilio nunca confirmó la llamada" });
      await this.store.updateNumber(call.numberKey, { lastStatus: "aborted" });
      return;
    }
    try {
      const remote = await this.twilio.calls(call.twilioCallSid).fetch();
      await this.store.updateCall(callId, { twilioStatus: remote.status, durationSeconds: Number(remote.duration || 0) });
      if (TERMINAL.includes(remote.status)) await this.finalize(callId);
    } catch (err) {
      this.log.warn(`[${callId}] no se pudo consultar Twilio: ${err.message}`);
    }
  }

  // Vigilante: rescata llamadas atascadas (reinicios del servidor, webhooks perdidos, emails fallidos).
  async sweep() {
    const staleMs = (this.cfg.agent.maxCallSeconds + 600) * 1000;
    for (const call of this.store.listCalls()) {
      const age = Date.now() - new Date(call.createdAt).getTime();
      if (!call.finalized && age > staleMs && !this.liveRelays.has(call.id)) await this.reconcile(call.id);
      else if (this.mailer && call.finalized && call.result && call.emailSent === false && call.emailAttempts < 3 && age < 24 * 3600e3) {
        await this.sendEmail(call.id);
      }
    }
  }

  async finalize(callId) {
    const call = this.store.getCall(callId);
    if (!call || call.finalized || this.finalizing.has(callId)) return;
    this.finalizing.add(callId);
    clearTimeout(this.closeTimers.get(callId));
    this.closeTimers.delete(callId);
    try {
      const userTurns = (call.transcript || []).filter((t) => t.role === "user").length;
      const det =
        call.agentEndReason === "contestador" && userTurns <= 1
          ? { result: "NO_ANSWER", callStatus: "BUZON_DE_VOZ" }
          : classifyWithoutConversation({ twilioStatus: call.twilioStatus, answeredBy: call.answeredBy, userTurns });

      let analysis;
      let lastError = call.lastError || "";
      if (det) {
        analysis = fallbackAnalysis({
          classification: det.result,
          summary: "No hubo conversación con una persona.",
          nextStep: "Reintentar en otra franja horaria (máximo según las reglas de intentos).",
        });
      } else {
        try {
          analysis = await analyzeCall(this.anthropic, this.cfg, call);
        } catch (err) {
          this.log.error(`[${callId}] fallo del análisis IA: ${err.message}`);
          lastError = `AI_ERROR (análisis): ${err.message}`;
          analysis = fallbackAnalysis({
            classification: "FOLLOW_UP",
            summary: "El análisis automático falló; la transcripción está completa abajo. Revísala a mano.",
            nextStep: "Revisión manual de la transcripción.",
          });
        }
      }
      const doNotCall = Boolean(call.doNotCallRequested || analysis.do_not_call);
      analysis.do_not_call = doNotCall;

      const costUsd = estimateCostUsd(call.durationSeconds, this.cfg.spend.estCostPerMinuteUsd);
      if (!call.costCounted) await this.store.updateControl({ spentUsd: +(this.store.control.spentUsd + costUsd).toFixed(4) });

      const prev = this.store.getNumber(call.numberKey) || {};
      await this.store.updateNumber(call.numberKey, {
        lastStatus: "completed",
        lastResult: analysis.classification,
        noAnswerStreak: analysis.classification === "NO_ANSWER" ? (prev.noAnswerStreak || 0) + 1 : 0,
        doNotCall: Boolean(prev.doNotCall || doNotCall),
        nextAction: analysis.next_step,
      });
      await this.store.updateCall(callId, {
        status: "completed",
        finalized: true,
        completedAt: new Date().toISOString(),
        result: analysis.classification,
        callStatusLabel: det?.callStatus || "CONVERSACION",
        analysis,
        costUsd,
        costCounted: true,
        lastError,
        emailSent: false,
        emailAttempts: 0,
      });
      await this.sendEmail(callId);
    } finally {
      this.finalizing.delete(callId);
    }
  }

  async sendEmail(callId) {
    const call = this.store.getCall(callId);
    if (!call?.analysis) return false;
    if (!this.mailer) {
      await this.store.updateCall(callId, { emailSent: false, emailError: "SMTP sin configurar: resultado solo en el panel" });
      return false;
    }
    try {
      await this.mailer.sendResult(call);
      await this.store.updateCall(callId, { emailSent: true, emailError: "" });
      return true;
    } catch (err) {
      this.log.error(`[${callId}] email no enviado: ${err.message}`);
      await this.store.updateCall(callId, { emailSent: false, emailError: err.message, emailAttempts: (call.emailAttempts || 0) + 1 });
      return false;
    }
  }
}

// Conversación en tiempo real con Twilio ConversationRelay.
// Twilio convierte la voz del restaurante en texto (mensajes "prompt") y lee en voz alta
// el texto que le enviamos (mensajes "text"). El cerebro es Claude, en streaming.

import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { buildSystemPrompt } from "./prompt.js";

export const FALLBACK_BETA = "server-side-fallback-2026-07-01";

const END_REASONS = ["despedida", "no_interesado", "no_llamar", "numero_equivocado", "contestador", "otro"];

export const END_CALL_TOOL = {
  name: "end_call",
  description:
    "Cuelga la llamada. Úsala solo cuando ya te hayas despedido en este mismo turno, " +
    "o de inmediato (sin decir nada) si salta un contestador, un buzón de voz o un menú automático.",
  strict: true,
  eager_input_streaming: true,
  input_schema: {
    type: "object",
    properties: {
      reason: { type: "string", enum: END_REASONS },
      do_not_call: {
        type: "boolean",
        description: "true solo si la persona pidió explícitamente que no la vuelvan a llamar",
      },
    },
    required: ["reason", "do_not_call"],
    additionalProperties: false,
  },
};

const EndCallInput = z.object({ reason: z.enum(END_REASONS), do_not_call: z.boolean() });

// Tiempo aproximado que tarda la voz en leer un texto, para no colgar a mitad de la despedida.
export function speechDelayMs(text) {
  return Math.min(15000, 1200 + Math.ceil((text || "").length / 14) * 1000);
}

export class LiveConversation {
  constructor({ ws, store, anthropic, cfg, callId, log = console, onEnded = () => {} }) {
    this.ws = ws;
    this.store = store;
    this.anthropic = anthropic;
    this.cfg = cfg;
    this.callId = callId;
    this.log = log;
    this.onEnded = onEnded;
    this.messages = [];
    this.system = "";
    this.turn = 0;
    this.current = null; // stream en curso
    this.streamingText = "";
    this.useFallbacks = true;
    this.ended = false;
    this.closed = false;
    // Todo espera a que termine "setup", pero los mensajes no se encolan entre sí:
    // una interrupción tiene que poder cortar una respuesta en curso.
    this.ready = new Promise((resolve) => (this.markReady = resolve));
  }

  send(payload) {
    if (this.ws.readyState === this.ws.OPEN) this.ws.send(JSON.stringify(payload));
  }

  async handle(raw) {
    let message;
    try {
      message = JSON.parse(raw);
    } catch {
      this.log.warn("Mensaje no JSON de ConversationRelay");
      return;
    }
    switch (message.type) {
      case "setup":
        try {
          return await this.onSetup(message);
        } finally {
          this.markReady();
        }
      case "prompt":
        await this.ready;
        return this.onPrompt(message);
      case "interrupt":
        await this.ready;
        return this.onInterrupt(message);
      case "error":
        this.log.error(`[${this.callId}] ConversationRelay error: ${message.description || JSON.stringify(message)}`);
        return this.store.updateCall(this.callId, { lastError: `ConversationRelay: ${message.description || "error"}` });
      default:
        return; // dtmf, info...: no se usan
    }
  }

  async onSetup(message) {
    const call = this.store.getCall(this.callId);
    if (!call) {
      this.log.error(`[${this.callId}] setup de una llamada desconocida`);
      this.send({ type: "end" });
      return;
    }
    this.system = buildSystemPrompt(call.campaign, this.cfg.agent, {
      now: new Date(),
      timezone: this.cfg.rules.timezone,
      greeting: call.greeting,
    });
    await this.store.updateCall(this.callId, {
      status: "in_progress",
      answeredAt: new Date().toISOString(),
      twilioCallSid: message.callSid || call.twilioCallSid,
    });
    await this.store.updateNumber(call.numberKey, { lastStatus: "in_progress" });
    await this.store.appendTurn(this.callId, "agent", call.greeting);
  }

  async onPrompt(message) {
    if (this.ended || message.last === false) return;
    const text = String(message.voicePrompt || "").trim();
    if (!text) return;
    await this.store.appendTurn(this.callId, "user", text);
    this.messages.push({ role: "user", content: text });
    await this.respond();
  }

  async onInterrupt(message) {
    const said = String(message.utteranceUntilInterrupt || "").trim();
    if (this.current) {
      // Se cortó mientras Claude aún escribía: guardamos solo lo que llegó a decirse.
      this.turn++;
      this.current.abort();
      this.current = null;
      if (said) {
        this.messages.push({ role: "assistant", content: said });
        await this.store.appendTurn(this.callId, "agent", `${said} [interrumpido]`);
      }
      return;
    }
    // La respuesta ya estaba completa: recortamos el último turno a lo que se oyó.
    const last = this.messages[this.messages.length - 1];
    if (said && last?.role === "assistant" && typeof last.content === "string") {
      const at = last.content.indexOf(said);
      if (at !== -1) last.content = last.content.slice(0, at + said.length);
    }
  }

  buildParams() {
    const params = {
      model: this.cfg.claude.model,
      max_tokens: 4096,
      system: this.system,
      cache_control: { type: "ephemeral" },
      messages: this.messages,
      tools: [END_CALL_TOOL],
      output_config: { effort: this.cfg.claude.liveEffort },
    };
    if (this.useFallbacks) Object.assign(params, { betas: [FALLBACK_BETA], fallbacks: "default" });
    return params;
  }

  async respond() {
    if (this.current) {
      this.turn++;
      this.current.abort();
    }
    const turn = ++this.turn;
    this.streamingText = "";

    let final;
    try {
      final = await this.streamOnce(turn);
    } catch (err) {
      if (err instanceof Anthropic.APIUserAbortError) return; // interrumpido o superado por otro turno
      if (err instanceof Anthropic.BadRequestError && this.useFallbacks) {
        // Algunos modelos/cuentas no aceptan fallbacks: reintentamos sin ellos.
        this.log.warn(`[${this.callId}] reintentando sin fallbacks: ${err.message}`);
        this.useFallbacks = false;
        return this.respond();
      }
      return this.failGracefully(err);
    }
    if (turn !== this.turn || this.closed) return;
    this.current = null;
    this.send({ type: "text", token: "", last: true });

    const spoken = this.streamingText.trim();
    if (final.stop_reason === "refusal" && !spoken) {
      const line = "Perdona, ¿me lo puedes repetir?";
      this.send({ type: "text", token: line, last: true });
      this.messages.push({ role: "assistant", content: line });
      await this.store.appendTurn(this.callId, "agent", line);
      return;
    }
    if (spoken) {
      this.messages.push({ role: "assistant", content: spoken });
      await this.store.appendTurn(this.callId, "agent", spoken);
    }

    const toolUse = final.content.find((b) => b.type === "tool_use" && b.name === "end_call");
    if (toolUse && final.stop_reason !== "max_tokens") {
      const parsed = EndCallInput.safeParse(toolUse.input);
      const input = parsed.success ? parsed.data : { reason: "otro", do_not_call: false };
      await this.endCall(input, spoken);
    }
  }

  async streamOnce(turn) {
    const stream = this.anthropic.beta.messages.stream(this.buildParams());
    this.current = stream;
    stream.on("text", (delta) => {
      if (turn !== this.turn || !delta) return;
      this.streamingText += delta;
      this.send({ type: "text", token: delta, last: false });
    });
    return stream.finalMessage();
  }

  async failGracefully(err) {
    this.current = null;
    this.log.error(`[${this.callId}] error de IA: ${err?.message || err}`);
    const line = `Perdona, tengo un problema con la línea. ${this.cfg.agent.ownerName} te llamará en otro momento. ¡Gracias y disculpa!`;
    this.send({ type: "text", token: line, last: true });
    await this.store.appendTurn(this.callId, "agent", line);
    await this.store.updateCall(this.callId, { lastError: `AI_ERROR: ${err?.message || err}` });
    await this.endCall({ reason: "otro", do_not_call: false }, line);
  }

  async endCall({ reason, do_not_call }, spokenText) {
    if (this.ended) return;
    this.ended = true;
    const call = this.store.getCall(this.callId);
    await this.store.updateCall(this.callId, { agentEndReason: reason, doNotCallRequested: do_not_call });
    if (do_not_call && call) await this.store.updateNumber(call.numberKey, { doNotCall: true });
    // Dejamos que la voz termine la despedida antes de colgar.
    setTimeout(() => {
      this.send({ type: "end", handoffData: JSON.stringify({ reason }) });
      this.onEnded(this.callId);
    }, spokenText ? speechDelayMs(spokenText) : 300);
  }

  close() {
    this.closed = true;
    if (this.current) {
      this.turn++;
      this.current.abort();
      this.current = null;
    }
  }
}

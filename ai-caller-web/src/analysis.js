// Análisis del lead al terminar la llamada: clasificación + resumen con salida estructurada.

import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { RESULT_CODES } from "./rules.js";
import { FALLBACK_BETA } from "./agent.js";

export const AnalysisSchema = z.object({
  classification: z.enum(RESULT_CODES),
  interest_level: z.number().describe("0 a 100"),
  conversion_probability: z.number().describe("0 a 100, conservador"),
  summary: z.string(),
  main_need: z.string(),
  main_objection: z.string(),
  objections: z.array(z.string()),
  customer_key_points: z.array(z.string()),
  recommended_offer: z.string(),
  next_step: z.string(),
  meeting_datetime: z.string(),
  callback_datetime: z.string(),
  contact_name_role: z.string(),
  contact_details: z.string(),
  decision_maker: z.enum(["Sí", "No", "Desconocido"]),
  website_status: z.string(),
  do_not_call: z.boolean(),
  agent_feedback: z.string(),
});

const ANALYST_SYSTEM = `Eres un director comercial experto en venta consultiva de páginas web para restaurantes. Analizas llamadas hechas por un agente de voz con IA y devuelves un informe en español.

Básate SOLO en la transcripción: no inventes nada. Si un dato no aparece, usa una cadena vacía (o "No detectado" en necesidad y "Ninguna" en objeción principal).

Clasificación (elige la primera que encaje, en este orden):
- MEETING_BOOKED: aceptó un día y hora concretos para una demo o reunión.
- CALLBACK_REQUESTED: pidió que le llamen en otro momento sin llegar a hablar del producto.
- HOT_LEAD: interés alto y explícito (pregunta precio, plazos o quiere avanzar) pero sin cita cerrada.
- WARM_LEAD: reconoce un problema o muestra interés moderado.
- FOLLOW_UP: pidió información por email o WhatsApp, tiene que consultarlo, no era quien decide o la conversación quedó a medias.
- NOT_INTERESTED: rechazo claro.
- WRONG_NUMBER: no era el restaurante.
- NO_ANSWER: no hubo conversación humana real (contestador, buzón, menú automático o cuelgan al instante).

interest_level y conversion_probability van de 0 a 100; sé conservador con la probabilidad.
do_not_call es true SOLO si la persona pidió explícitamente que no la vuelvan a llamar.
next_step: una acción concreta y accionable para el comercial, con fecha si se acordó.
agent_feedback: una o dos frases sobre qué hizo bien o mal el agente de voz.`;

export function transcriptText(call) {
  return (call.transcript || [])
    .map((t) => `${t.role === "agent" ? "Agente" : "Restaurante"}: ${t.text}`)
    .join("\n");
}

function buildInput(call) {
  const c = call.campaign;
  return `CONTEXTO DE LA CAMPAÑA
Restaurante: ${c.restaurantName}
Objetivo: ${c.callObjective || "Conseguir una demo"}
Oferta: ${c.websiteOffer}
Precio configurado: ${c.price || "no configurado"}

DATOS TÉCNICOS
Estado Twilio: ${call.twilioStatus || "desconocido"} · Duración: ${call.durationSeconds || 0} s · Motivo de cuelgue del agente: ${call.agentEndReason || "ninguno"}

TRANSCRIPCIÓN
${transcriptText(call) || "(sin transcripción)"}`;
}

function clamp(n) {
  return Math.max(0, Math.min(100, Math.round(Number(n) || 0)));
}

export async function analyzeCall(anthropic, cfg, call) {
  const base = {
    model: cfg.claude.model,
    max_tokens: 16000,
    system: ANALYST_SYSTEM,
    messages: [{ role: "user", content: buildInput(call) }],
  };
  let response;
  try {
    response = await anthropic.beta.messages.parse({
      ...base,
      betas: [FALLBACK_BETA],
      fallbacks: "default",
      output_config: { effort: cfg.claude.analysisEffort, format: betaZodOutputFormat(AnalysisSchema) },
    });
  } catch (err) {
    if (!(err instanceof Anthropic.BadRequestError)) throw err;
    // Sin soporte de fallbacks en esta cuenta/modelo: misma petición en el endpoint estándar.
    response = await anthropic.messages.parse({
      ...base,
      output_config: { effort: cfg.claude.analysisEffort, format: zodOutputFormat(AnalysisSchema) },
    });
  }
  if (response.stop_reason === "refusal" || !response.parsed_output) {
    throw new Error(`El análisis no devolvió datos (stop_reason: ${response.stop_reason})`);
  }
  const a = response.parsed_output;
  return { ...a, interest_level: clamp(a.interest_level), conversion_probability: clamp(a.conversion_probability) };
}

// Informe mínimo cuando no hubo conversación o cuando la IA falla: nunca se pierde la llamada.
export function fallbackAnalysis({ classification, summary, nextStep }) {
  return {
    classification,
    interest_level: 0,
    conversion_probability: 0,
    summary,
    main_need: "No detectada",
    main_objection: "Ninguna",
    objections: [],
    customer_key_points: [],
    recommended_offer: "",
    next_step: nextStep,
    meeting_datetime: "",
    callback_datetime: "",
    contact_name_role: "",
    contact_details: "",
    decision_maker: "Desconocido",
    website_status: "Desconocido",
    do_not_call: false,
    agent_feedback: "",
  };
}

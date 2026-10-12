// Generación de la automatización a partir de un único prompt en lenguaje natural.
// Claude convierte la descripción del negocio en una configuración estructurada y validada.
import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import { isValidTimeZone, isDateStr, parseHHMM, WEEKDAYS } from './time.js';

export const MODEL = process.env.ANTHROPIC_MODEL || 'claude-opus-5-5';

let client = null;
export function anthropic() {
  if (!client) client = new Anthropic();
  return client;
}

// Si Claude rechaza una petición por sus filtros de seguridad, la API la reintenta con el modelo
// de respaldo recomendado en lugar de devolver un rechazo.
export const FALLBACK_PARAMS = { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' };

const Range = z.object({ start: z.string().describe('HH:MM 24h'), end: z.string().describe('HH:MM 24h') });

export const ConfigSchema = z.object({
  businessName: z.string(),
  businessType: z.string().describe('Tipo de negocio en pocas palabras, p. ej. "peluquería", "clínica dental"'),
  assistantName: z.string().describe('Nombre corto y simpático para el asistente'),
  language: z.string().describe('Código de idioma principal del chatbot, p. ej. "es", "en", "ca"'),
  timezone: z.string().describe('Zona horaria IANA, p. ej. "Europe/Madrid"'),
  tone: z.string().describe('Tono de voz del asistente en una frase'),
  welcomeMessage: z.string().describe('Primer mensaje del chatbot, breve y cálido'),
  services: z.array(
    z.object({
      name: z.string(),
      durationMinutes: z.number().int(),
      price: z.string().describe('Precio tal cual se mostraría ("25 €", "desde 40 €") o cadena vacía si no se conoce'),
      description: z.string(),
    })
  ),
  weeklyHours: z.array(
    z.object({
      day: z.enum(WEEKDAYS),
      open: z.boolean(),
      ranges: z.array(Range),
    })
  ),
  slotIntervalMinutes: z.number().int().describe('Cada cuántos minutos empieza un hueco (15, 30, 60...)'),
  bufferMinutes: z.number().int().describe('Margen entre citas en minutos'),
  minNoticeHours: z.number().describe('Antelación mínima para reservar, en horas'),
  maxDaysAhead: z.number().int().describe('Hasta cuántos días en el futuro se puede reservar'),
  closedDates: z.array(z.string()).describe('Días concretos cerrados YYYY-MM-DD (festivos, vacaciones)'),
  collectPhone: z.boolean().describe('Si hay que pedir teléfono además de nombre y email'),
  policies: z.string().describe('Políticas: cancelación, retrasos, pagos, etc.'),
  faqs: z.array(z.object({ question: z.string(), answer: z.string() })),
  extraInstructions: z.string().describe('Reglas especiales para el asistente que salgan de la descripción'),
  quickReplies: z.array(z.string()).describe('3-4 botones de respuesta rápida para el inicio del chat'),
  brandColor: z.string().describe('Color de marca en hexadecimal #RRGGBB acorde al negocio'),
  assumptions: z.array(z.string()).describe('Supuestos que hiciste porque la descripción no lo decía'),
});

const SYSTEM = `Eres el motor de configuración de Agendia, una herramienta que convierte la descripción de un negocio en un chatbot de reservas conectado a Google Calendar.

A partir de la descripción, devuelve la configuración completa del asistente. Pautas:
- Extrae con precisión servicios, duraciones, precios, horarios, días de cierre y reglas. Respeta literalmente lo que diga el usuario.
- Si falta un dato, elige un valor sensato para ese tipo de negocio y anótalo en "assumptions" (en el idioma del usuario). Ejemplos: duración típica de un servicio, horario habitual del sector, antelación mínima.
- weeklyHours debe tener exactamente 7 entradas, una por día (monday…sunday). Los días cerrados llevan open=false y ranges vacío. Para jornada partida usa dos rangos.
- Horas en formato HH:MM de 24 h. Fechas en YYYY-MM-DD. Si dicen "cerrado en agosto" o festivos concretos, expándelo en closedDates dentro del próximo año.
- slotIntervalMinutes suele ser 15 o 30; usa la duración del servicio más corto si encaja mejor.
- welcomeMessage, quickReplies, faqs y policies van en el idioma del chatbot. Las FAQs solo con información que dé el usuario o que sea obvia; nada inventado sobre precios o direcciones.
- extraInstructions recoge reglas de comportamiento que el usuario pida (p. ej. "no aceptar reservas de grupos de más de 6", "pedir alergias").
- Elige un brandColor elegante y coherente con el tipo de negocio, con buen contraste sobre blanco.`;

export async function generateConfig({ description, businessEmail, timezoneHint, today, current, instruction }) {
  const userContent = current
    ? `Configuración actual (JSON):\n${JSON.stringify(stripMeta(current))}\n\nCambio que pide el dueño del negocio:\n${instruction}\n\nDevuelve la configuración completa actualizada, cambiando solo lo necesario.`
    : `Descripción del negocio:\n"""\n${description}\n"""\n\nEmail del negocio: ${businessEmail || 'no indicado'}\nZona horaria del calendario: ${timezoneHint || 'desconocida (deduce por el idioma/ciudad; por defecto Europe/Madrid)'}\nFecha de hoy: ${today}`;

  const response = await anthropic().beta.messages.parse({
    model: MODEL,
    max_tokens: 16000,
    ...FALLBACK_PARAMS,
    output_config: { effort: 'medium', format: betaZodOutputFormat(ConfigSchema) },
    system: SYSTEM,
    messages: [{ role: 'user', content: userContent }],
  });

  if (response.stop_reason === 'refusal') throw new Error('El modelo no ha podido procesar esta descripción. Prueba a reformularla.');
  if (response.stop_reason === 'max_tokens' || !response.parsed_output) {
    throw new Error('La respuesta del modelo llegó incompleta. Inténtalo de nuevo.');
  }
  return sanitizeConfig(response.parsed_output, timezoneHint);
}

function stripMeta(c) {
  const { assumptions, ...rest } = c;
  return rest;
}

const clampInt = (v, min, max, def) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : def;
};

// Valida y normaliza cualquier configuración (venga de la IA o del editor del panel).
export function sanitizeConfig(raw, timezoneHint) {
  const c = { ...raw };
  c.businessName = String(c.businessName || 'Mi negocio').slice(0, 80);
  c.assistantName = String(c.assistantName || 'Asistente').slice(0, 40);
  c.language = String(c.language || 'es').slice(0, 8);
  c.timezone = isValidTimeZone(c.timezone) ? c.timezone : isValidTimeZone(timezoneHint) ? timezoneHint : 'Europe/Madrid';
  c.services = (Array.isArray(c.services) ? c.services : [])
    .filter((s) => s && s.name)
    .slice(0, 40)
    .map((s) => ({
      name: String(s.name).slice(0, 80),
      durationMinutes: clampInt(s.durationMinutes, 5, 720, 30),
      price: String(s.price || '').slice(0, 40),
      description: String(s.description || '').slice(0, 300),
    }));
  if (!c.services.length) c.services = [{ name: 'Cita', durationMinutes: 30, price: '', description: '' }];

  const byDay = new Map((Array.isArray(c.weeklyHours) ? c.weeklyHours : []).map((d) => [d.day, d]));
  c.weeklyHours = WEEKDAYS.slice(1)
    .concat('sunday')
    .map((day) => {
      const d = byDay.get(day) || { open: false, ranges: [] };
      const ranges = (d.ranges || [])
        .filter((r) => parseHHMM(r.start) != null && parseHHMM(r.end) != null && parseHHMM(r.end) > parseHHMM(r.start))
        .map((r) => ({ start: fmt(parseHHMM(r.start)), end: fmt(parseHHMM(r.end)) }))
        .sort((a, b) => a.start.localeCompare(b.start));
      return { day, open: Boolean(d.open) && ranges.length > 0, ranges: d.open ? ranges : [] };
    });

  c.slotIntervalMinutes = clampInt(c.slotIntervalMinutes, 5, 240, 30);
  c.bufferMinutes = clampInt(c.bufferMinutes, 0, 240, 0);
  c.minNoticeHours = Math.min(720, Math.max(0, Number(c.minNoticeHours) || 0));
  c.maxDaysAhead = clampInt(c.maxDaysAhead, 1, 365, 60);
  c.closedDates = [...new Set((c.closedDates || []).filter(isDateStr))].sort();
  c.collectPhone = Boolean(c.collectPhone);
  c.faqs = (c.faqs || []).filter((f) => f && f.question && f.answer).slice(0, 40);
  c.quickReplies = (c.quickReplies || []).map(String).filter(Boolean).slice(0, 4);
  c.brandColor = /^#[0-9a-f]{6}$/i.test(c.brandColor || '') ? c.brandColor : '#3b5bfd';
  for (const k of ['businessType', 'tone', 'welcomeMessage', 'policies', 'extraInstructions']) c[k] = String(c[k] || '').slice(0, 4000);
  c.assumptions = (c.assumptions || []).map(String).slice(0, 20);
  return c;
}

function fmt(m) {
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

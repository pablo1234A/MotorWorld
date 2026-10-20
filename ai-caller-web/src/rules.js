// Reglas de negocio puras (sin E/S): normalización, validación y permisos de llamada.

export const RESULT_CODES = [
  "HOT_LEAD",
  "WARM_LEAD",
  "FOLLOW_UP",
  "NOT_INTERESTED",
  "WRONG_NUMBER",
  "NO_ANSWER",
  "CALLBACK_REQUESTED",
  "MEETING_BOOKED",
];

export const BLOCK_REASONS = {
  TELEFONO_INVALIDO: "El número a llamar no tiene un formato internacional válido.",
  EMISOR_INVALIDO: "El número emisor no es válido (debe ser tu número de Twilio o un Caller ID verificado en Twilio).",
  MISMO_NUMERO: "El número a llamar y el emisor son el mismo.",
  EMAIL_INVALIDO: "El email para el resultado no es válido.",
  FALTA_RESTAURANTE: "Falta el nombre del restaurante.",
  FALTA_OFERTA: "Falta la descripción de la web que vendes.",
  CAMPANAS_DETENIDAS: "Las campañas están detenidas (interruptor de parada activado).",
  TOPE_DE_GASTO: "Se alcanzaría el tope de gasto configurado.",
  NO_LLAMAR: "Este número pidió no volver a ser llamado.",
  LLAMADA_EN_CURSO: "Ya hay una llamada en curso a este número.",
  LLAMADO_RECIENTEMENTE: "Este número ya se contactó dentro de la ventana antiduplicados.",
  MAX_INTENTOS: "Demasiados intentos seguidos sin respuesta a este número.",
  FUERA_DE_HORARIO: "Fuera de las franjas horarias permitidas.",
};

// Convierte lo que escriba el usuario a E.164. Un número español de 9 cifras se completa con +34.
export function normalizePhone(raw) {
  let digits = String(raw ?? "").replace(/[^0-9]/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.length === 9 && /^[6789]/.test(digits)) digits = `34${digits}`;
  return { e164: `+${digits}`, key: digits };
}

export function isValidE164(e164) {
  return /^\+[1-9][0-9]{7,14}$/.test(e164);
}

export function isValidEmail(email) {
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(email ?? "").trim());
}

// "10:00-13:00,16:30-20:00" -> [[600, 780], [990, 1200]] (minutos desde medianoche)
export function parseWindows(spec) {
  return String(spec || "")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const m = part.match(/^(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})$/);
      if (!m) throw new Error(`Franja horaria no válida: "${part}"`);
      return [Number(m[1]) * 60 + Number(m[2]), Number(m[3]) * 60 + Number(m[4])];
    });
}

// Día de la semana (1 = lunes ... 7 = domingo) y minutos del día en la zona horaria indicada.
export function localTime(date, timezone) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const get = (type) => parts.find((p) => p.type === type)?.value;
  const weekday = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(get("weekday")) + 1;
  return { weekday, minutes: Number(get("hour")) * 60 + Number(get("minute")) };
}

export function isWithinCallHours(date, rules) {
  const { weekday, minutes } = localTime(date, rules.timezone);
  if (rules.blockSunday && weekday === 7) return false;
  return parseWindows(rules.callWindows).some(([start, end]) => minutes >= start && minutes <= end);
}

const HOUR = 3600 * 1000;

/**
 * Decide si se puede llamar. Devuelve la lista de códigos de bloqueo (vacía = se puede llamar).
 * @param {object} input   datos del formulario ya normalizados
 * @param {object} ctx     { now, rules, numberState, control, maxCallCost, spend }
 */
export function blockReasons(input, ctx) {
  const reasons = [];
  const { now, rules, numberState: state, control } = ctx;

  if (!isValidE164(input.phone)) reasons.push("TELEFONO_INVALIDO");
  if (!isValidE164(input.callerPhone)) reasons.push("EMISOR_INVALIDO");
  if (input.phone === input.callerPhone) reasons.push("MISMO_NUMERO");
  if (!isValidEmail(input.email)) reasons.push("EMAIL_INVALIDO");
  if (!input.restaurantName?.trim()) reasons.push("FALTA_RESTAURANTE");
  if (!input.websiteOffer?.trim()) reasons.push("FALTA_OFERTA");

  if (control?.stopped) reasons.push("CAMPANAS_DETENIDAS");
  if ((control?.spentUsd || 0) + ctx.maxCallCost > ctx.spend.maxSpendUsd) reasons.push("TOPE_DE_GASTO");

  if (state) {
    // El opt-out no se puede saltar nunca, ni con "permitir rellamada".
    if (state.doNotCall) reasons.push("NO_LLAMAR");

    const lastAt = state.lastCallAt ? new Date(state.lastCallAt).getTime() : 0;
    const inFlight = ["queued", "calling", "in_progress"].includes(state.lastStatus);
    if (inFlight && now - lastAt < HOUR) reasons.push("LLAMADA_EN_CURSO");

    const noCall = ["provider_error", "aborted"].includes(state.lastStatus);
    if (!input.allowRecall && !noCall && lastAt) {
      const windowMs =
        state.lastResult === "NO_ANSWER" ? rules.noAnswerRetryHours * HOUR : rules.dedupDays * 24 * HOUR;
      if (now - lastAt < windowMs && !reasons.includes("LLAMADA_EN_CURSO")) reasons.push("LLAMADO_RECIENTEMENTE");
    }

    if (state.lastResult === "NO_ANSWER" && (state.noAnswerStreak || 0) >= rules.maxNoAnswerAttempts) {
      reasons.push("MAX_INTENTOS");
    }
  }

  if (!input.ignoreCallHours && !isWithinCallHours(new Date(now), rules)) reasons.push("FUERA_DE_HORARIO");
  return reasons;
}

// Clasificación determinista cuando no hubo conversación humana.
export function classifyWithoutConversation({ twilioStatus, answeredBy, userTurns }) {
  if (answeredBy && /^(machine|fax)/.test(answeredBy)) {
    return { result: "NO_ANSWER", callStatus: "BUZON_DE_VOZ" };
  }
  switch (twilioStatus) {
    case "busy":
      return { result: "NO_ANSWER", callStatus: "OCUPADO" };
    case "no-answer":
      return { result: "NO_ANSWER", callStatus: "NO_CONTESTA" };
    case "failed":
      return { result: "NO_ANSWER", callStatus: "FALLO_DE_CONEXION" };
    case "canceled":
      return { result: "NO_ANSWER", callStatus: "CANCELADA" };
    default:
      if (!userTurns) return { result: "NO_ANSWER", callStatus: "SIN_CONVERSACION" };
      return null; // hubo conversación: hay que analizarla
  }
}

export function estimateCostUsd(durationSeconds, estCostPerMinuteUsd) {
  if (!durationSeconds || durationSeconds <= 0) return 0;
  return Math.ceil(durationSeconds / 60) * estCostPerMinuteUsd;
}

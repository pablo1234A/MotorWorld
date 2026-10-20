// Toda la configuración sale de variables de entorno (ver .env.example).
// Los valores por defecto son seguros para empezar a probar.

const env = process.env;

function num(name, fallback) {
  const value = Number(env[name]);
  return Number.isFinite(value) && env[name] !== "" && env[name] !== undefined ? value : fallback;
}

function bool(name, fallback) {
  if (env[name] === undefined || env[name] === "") return fallback;
  return ["1", "true", "yes", "si", "sí"].includes(String(env[name]).toLowerCase());
}

export const config = {
  port: num("PORT", 3000),
  // URL pública HTTPS del servidor (Render, Railway, ngrok...). Twilio la necesita para los webhooks.
  publicBaseUrl: (env.PUBLIC_BASE_URL || "").replace(/\/+$/, ""),
  panelPassword: env.PANEL_PASSWORD || "",
  allowOpenPanel: bool("ALLOW_OPEN_PANEL", false),
  // Secreto para firmar el enlace WebSocket de cada llamada.
  appSecret: env.APP_SECRET || env.TWILIO_AUTH_TOKEN || "dev-secret-change-me",
  dataFile: env.DATA_FILE || "./data/db.json",

  twilio: {
    accountSid: env.TWILIO_ACCOUNT_SID || "",
    authToken: env.TWILIO_AUTH_TOKEN || "",
    validateSignature: bool("TWILIO_VALIDATE_SIGNATURE", true),
    machineDetection: bool("MACHINE_DETECTION", true),
    recordCalls: bool("RECORD_CALLS", false),
    ringTimeoutSeconds: num("RING_TIMEOUT_SECONDS", 25),
  },

  claude: {
    // Modelo por defecto: Claude Opus 5.5. Para menos latencia y coste puedes poner claude-haiku-5-5.
    model: env.CLAUDE_MODEL || "claude-opus-5-5",
    liveEffort: env.CLAUDE_LIVE_EFFORT || "low",
    analysisEffort: env.CLAUDE_ANALYSIS_EFFORT || "medium",
  },

  agent: {
    companyName: env.COMPANY_NAME || "NEXO",
    agentName: env.AGENT_NAME || "Lucía",
    ownerName: env.OWNER_NAME || "Pablo",
    language: env.CALL_LANGUAGE || "es-ES",
    defaultTtsProvider: env.TTS_PROVIDER || "ElevenLabs",
    defaultVoice: env.TTS_VOICE || "",
    maxCallSeconds: num("MAX_CALL_SECONDS", 480),
  },

  rules: {
    timezone: env.TIMEZONE || "Europe/Madrid",
    callWindows: env.CALL_WINDOWS || "10:00-13:00,16:30-20:00",
    blockSunday: bool("BLOCK_SUNDAY", true),
    dedupDays: num("DEDUP_DAYS", 30),
    noAnswerRetryHours: num("NO_ANSWER_RETRY_HOURS", 4),
    maxNoAnswerAttempts: num("MAX_NO_ANSWER_ATTEMPTS", 3),
  },

  spend: {
    // Tope de gasto total (USD). Al alcanzarlo, no se hacen más llamadas.
    maxSpendUsd: num("MAX_SPEND_USD", 9),
    // Coste estimado por minuto (Twilio + ConversationRelay + Claude). Ajústalo a tus tarifas reales.
    estCostPerMinuteUsd: num("EST_COST_PER_MINUTE_USD", 0.15),
  },

  email: {
    smtpHost: env.SMTP_HOST || "smtp.gmail.com",
    smtpPort: num("SMTP_PORT", 465),
    smtpUser: env.SMTP_USER || "",
    smtpPass: env.SMTP_PASS || "",
    from: env.EMAIL_FROM || env.SMTP_USER || "",
    defaultTo: env.DEFAULT_REPORT_EMAIL || env.SMTP_USER || "",
  },
};

// Lo máximo que puede costar una llamada según la duración máxima configurada.
export function maxCallCostEstimate(cfg = config) {
  return Math.ceil(cfg.agent.maxCallSeconds / 60) * cfg.spend.estCostPerMinuteUsd;
}

export function configProblems(cfg = config) {
  const problems = [];
  if (!cfg.twilio.accountSid || !cfg.twilio.authToken) problems.push("Faltan TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN");
  if (!cfg.publicBaseUrl.startsWith("https://")) problems.push("PUBLIC_BASE_URL debe ser una URL https pública");
  if (!process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_AUTH_TOKEN) problems.push("Falta ANTHROPIC_API_KEY");
  if (!cfg.email.smtpUser || !cfg.email.smtpPass) problems.push("Email sin configurar (SMTP_USER / SMTP_PASS): los resultados solo se verán en el panel");
  return problems;
}

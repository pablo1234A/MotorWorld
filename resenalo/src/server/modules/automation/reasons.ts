export const REASON_MESSAGES: Record<string, string> = {
  SUBSCRIPTION_INACTIVE: "No tienes una suscripción activa.",
  LIMIT_REACHED: "Has alcanzado el límite de correos de tu plan para este periodo.",
  NO_EMAIL_CONNECTION: "No hay ninguna cuenta de correo conectada.",
  EMAIL_DISCONNECTED: "La cuenta de correo se desconectó.",
  NEEDS_REAUTH: "La cuenta de correo necesita volver a autorizarse.",
  NO_REVIEW_URL: "Configura el enlace de reseñas de tu negocio.",
  INVALID_EMAIL: "El correo del cliente no es válido.",
  BOUNCED: "El correo del cliente fue rechazado anteriormente.",
  UNSUBSCRIBED: "El cliente se dio de baja de las solicitudes de opinión.",
  DUPLICATE: "Ya existe una solicitud para este mismo servicio.",
  COOLDOWN: "Ya se envió una solicitud a este cliente recientemente.",
  NO_MATCHING_RULE: "Ninguna automatización activa se aplica a este evento.",
  AUTOMATION_PAUSED: "La automatización está en pausa.",
  COMPLETION_TOO_OLD: "El servicio finalizó hace más de 90 días.",
  UNKNOWN_OUTCOME: "Resultado desconocido tras una interrupción; no se reintenta para evitar duplicados.",
  EXPIRED_ON_HOLD: "Cancelado tras más de 7 días en espera.",
  CANCELED_BY_USER: "Cancelado por el usuario.",
  MAX_ATTEMPTS: "Se agotaron los reintentos.",
  PROVIDER_REJECTED: "El proveedor rechazó el mensaje.",
  INVALID_RECIPIENT: "El proveedor rechazó la dirección del destinatario.",
};

export const reasonMessage = (code?: string | null) => (code ? (REASON_MESSAGES[code] ?? code) : null);

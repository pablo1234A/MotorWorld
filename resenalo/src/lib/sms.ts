// Texto de los SMS. Compartido entre servidor y editor (vista previa y contador de segmentos).
import { sanitizeHeader } from "./template";

export const DEFAULT_SMS =
  "Hola {{nombre_cliente}}, gracias por confiar en {{nombre_negocio}}. ¿Nos cuentas qué tal tu experiencia? {{enlace_resena}}";

const GSM7 =
  "@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà";
const GSM7_EXT = "^{}\\[~]|€";

/** Estimación de segmentos: GSM-7 (160/153) o UCS-2 (70/67) si hay caracteres fuera del alfabeto GSM. */
export function smsSegments(text: string) {
  let gsm = true;
  let len = 0;
  for (const ch of text) {
    if (GSM7.includes(ch)) len += 1;
    else if (GSM7_EXT.includes(ch)) len += 2;
    else {
      gsm = false;
      break;
    }
  }
  if (!gsm) len = [...text].length;
  const single = gsm ? 160 : 70;
  const multi = gsm ? 153 : 67;
  return { encoding: gsm ? "GSM-7" : "UCS-2", length: len, segments: len <= single ? 1 : Math.ceil(len / multi) };
}

/**
 * Texto final del SMS: variables sustituidas en una sola línea y la baja obligatoria al final.
 * Se fuerza un solo espacio entre frases para ahorrar caracteres.
 */
export function renderSms(body: string, vals: { customerName: string; businessName: string; reviewUrl: string; serviceName?: string | null; unsubscribeUrl: string }) {
  const map: Record<string, string> = {
    nombre_cliente: vals.customerName.trim().split(/\s+/)[0] ?? "",
    nombre_negocio: vals.businessName.trim(),
    enlace_resena: vals.reviewUrl,
    nombre_servicio: (vals.serviceName ?? "").trim() || "nuestro servicio",
  };
  const text = body.replace(/\{\{\s*([a-zA-Z_ñÑ]+)\s*\}\}/g, (_m, k: string) => map[k] ?? "").replace(/[ \t]+([,.;:!?])/g, "$1");
  return sanitizeHeader(text) + ` Baja: ${vals.unsubscribeUrl}`;
}

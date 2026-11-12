import "server-only";
import { ApiError } from "@/server/http/errors";

export const IMAGE_MAX_BYTES = 5 * 1024 * 1024;
export const AVATAR_MAX_BYTES = 2 * 1024 * 1024;

export type ImageKind = { mime: "image/jpeg" | "image/png" | "image/webp"; extension: "jpg" | "png" | "webp" };

/**
 * Detecta el tipo real de una imagen por sus bytes mágicos. Nunca se confía en la
 * extensión ni en el Content-Type declarados por el navegador.
 */
export function detectImage(bytes: Uint8Array): ImageKind | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return { mime: "image/jpeg", extension: "jpg" };
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 && bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a) {
    return { mime: "image/png", extension: "png" };
  }
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
    bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50
  ) {
    return { mime: "image/webp", extension: "webp" };
  }
  return null;
}

/** Nombre de archivo seguro para mostrar/guardar como metadato (no se usa en la ruta de Storage). */
export function safeFilename(name: string): string {
  const base = name.replace(/\\/g, "/").split("/").pop() ?? "archivo";
  const cleaned = base.normalize("NFKC").replace(/[\u0000-\u001f\u007f<>:"|?*]/g, "").replace(/\s+/g, " ").trim();
  return (cleaned || "archivo").slice(0, 120);
}

export async function readImageUpload(file: unknown, maxBytes: number): Promise<{ bytes: Uint8Array; kind: ImageKind; filename: string }> {
  if (!(file instanceof File)) throw new ApiError("bad_request", "No se ha recibido ningún archivo.");
  if (file.size === 0) throw new ApiError("validation_error", "El archivo está vacío.");
  if (file.size > maxBytes) {
    throw new ApiError("payload_too_large", `La imagen supera el tamaño máximo de ${Math.round(maxBytes / 1024 / 1024)} MB.`);
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  const kind = detectImage(bytes);
  if (!kind) throw new ApiError("unsupported_media_type", "Formato no admitido. Usa imágenes JPG, PNG o WebP.");
  return { bytes, kind, filename: safeFilename(file.name) };
}

/** Comprueba que un contenido es texto CSV plausible (sin bytes nulos ni binarios). */
export function looksLikeText(bytes: Uint8Array): boolean {
  const sample = bytes.subarray(0, 4096);
  let suspicious = 0;
  for (const byte of sample) {
    if (byte === 0) return false;
    if (byte < 9 || (byte > 13 && byte < 32)) suspicious += 1;
  }
  return suspicious <= sample.length * 0.01;
}

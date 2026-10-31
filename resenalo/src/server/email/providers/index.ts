import type { EmailProvider } from "@prisma/client";
import { googleProvider } from "./google";
import { microsoftProvider } from "./microsoft";
import type { MailProvider } from "./types";

const registry: Record<EmailProvider, MailProvider> = { GOOGLE: googleProvider, MICROSOFT: microsoftProvider };

let override: Partial<Record<EmailProvider, MailProvider>> = {};

export function getProvider(id: EmailProvider): MailProvider {
  return override[id] ?? registry[id];
}

/** Solo para pruebas automatizadas. */
export function setProviderOverride(id: EmailProvider, p: MailProvider | null) {
  if (p) override[id] = p;
  else delete override[id];
}
export function clearProviderOverrides() {
  override = {};
}

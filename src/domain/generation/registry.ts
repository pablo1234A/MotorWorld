import "server-only";
import { getEnv } from "@/lib/config/env";
import { createAnthropicProvider } from "./anthropic-provider";
import { templateProvider } from "./template-provider";
import type { GenerationProvider } from "./types";

let cached: GenerationProvider | null = null;

/**
 * Punto único de selección del proveedor de generación.
 * Para añadir otro modelo: implementa GenerationProvider y añade aquí su caso.
 */
export function getGenerationProvider(): GenerationProvider {
  if (cached) return cached;
  const env = getEnv();
  if (env.AI_PROVIDER === "anthropic" && env.ANTHROPIC_API_KEY) {
    cached = createAnthropicProvider({ apiKey: env.ANTHROPIC_API_KEY, model: env.AI_MODEL });
  } else {
    cached = templateProvider;
  }
  return cached;
}

export function generationProviderInfo() {
  const provider = getGenerationProvider();
  return { id: provider.id, method: provider.method, label: provider.label };
}

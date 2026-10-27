import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadConfig } from '../src/server/config.js';
import { Company } from '../src/server/company.js';
import type { LlmProvider } from '../src/server/llm/provider.js';
import { TEST_PRODUCT } from '../src/server/seed/testProduct.js';

/** Isolated company (own temp database + media dir), autopilot off, fast retries, no LLM unless injected. */
export function makeCompany(opts: { llmProvider?: LlmProvider } = {}) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'apc-test-'));
  const cfg = loadConfig({ dataDir, anthropicApiKey: null });
  const c = new Company(cfg, opts);
  c.scheduler.triggersEnabled = false;
  c.scheduler.retryBaseMs = 5;
  c.settings.update({ autopilot: false });
  const cleanup = () => {
    c.close();
    fs.rmSync(dataDir, { recursive: true, force: true });
  };
  return { c, cleanup, dataDir };
}

export function activeTestProduct(c: Company, overrides: Record<string, unknown> = {}) {
  const p = c.products.create({ ...TEST_PRODUCT, ...overrides });
  return c.products.activate(p.id);
}

export const hasFfmpeg = (c: Company) => c.integrations.ffmpeg.available;

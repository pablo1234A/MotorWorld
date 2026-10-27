import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig } from './config.js';
import { Company } from './company.js';
import { buildServer } from './api/server.js';

const cfg = loadConfig();
const company = new Company(cfg);
const here = path.dirname(fileURLToPath(import.meta.url));
const webDir = path.resolve(here, '../../dist/web');
const app = await buildServer(company, { webDir: process.env.NODE_ENV === 'production' ? webDir : null });

company.scheduler.start();
await app.listen({ port: cfg.port, host: cfg.host });

const ff = company.integrations.ffmpeg.available ? 'ffmpeg OK' : 'ffmpeg NOT FOUND (render engine unavailable)';
console.log(`\n  AI PRODUCT COMPANY  ·  http://${cfg.host}:${cfg.port}`);
console.log(`  brain: ${company.llm.engineLabel}${company.llm.available ? '' : '  (INTEGRATION_REQUIRED: set ANTHROPIC_API_KEY)'}  ·  ${ff}`);
console.log(`  data:  ${cfg.dataDir}\n`);

const shutdown = async () => {
  company.scheduler.stop();
  await app.close();
  company.close();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

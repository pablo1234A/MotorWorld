/**
 * PRIMER ESCENARIO DE PRUEBA
 * PRODUCT ACTIVE → ATLAS → ALEX → NOVA → NEO → REX → MAX → LUNA → DELIVERY CENTER → REPORT
 *
 * Runs against an isolated database in a temp folder (or DATA_DIR if --persist).
 *   npm run scenario            # temp data, removed afterwards
 *   npm run scenario -- --persist   # writes into ./data so you can open it in the UI
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadConfig } from '../src/server/config.js';
import { Company } from '../src/server/company.js';
import { seedTestProduct } from '../src/server/seed/testProduct.js';
import { localDate } from '../src/server/core/ids.js';

const persist = process.argv.includes('--persist');
const dataDir = persist ? path.resolve('data') : fs.mkdtempSync(path.join(os.tmpdir(), 'apc-scenario-'));
const cfg = loadConfig({ dataDir });
const c = new Company(cfg);
c.scheduler.triggersEnabled = false;
c.settings.update({ autopilot: false });

const line = (s = '') => console.log(s);
const t0 = Date.now();
line(`AI PRODUCT COMPANY — test scenario (${c.llm.engineLabel}) · data: ${dataDir}`);

const product = await seedTestProduct(c);
line(`✓ PRODUCT ACTIVE: ${product.name} (${product.images.length} image)`);

const run = c.workflows.start('strategy', { title: 'Quiero vender más este producto', createdBy: 'OWNER', priority: 'high', context: { goal: 'Atlas, quiero vender más este producto.' } });
line(`✓ Strategy run ${run.id}`);
await c.scheduler.drain(600_000);

line('\n── TASKS');
for (const t of c.tasks.list({ limit: 200 }).reverse()) line(`  [${t.status.padEnd(9)}] ${t.agentId.padEnd(5)} ${t.type.padEnd(22)} ${t.result?.summary ?? t.error ?? ''}`);

line('\n── COMMUNICATIONS');
for (const m of c.messages.internal({ limit: 200 }).reverse()) line(`  ${m.fromId} → ${m.toId}: ${m.content.split('\n')[0]}`);

line('\n── DELIVERY CENTER');
for (const v of c.videos.list()) line(`  ${v.status.padEnd(10)} score ${v.score ?? '—'} · rev ${v.revisions} · "${v.title}" · hook "${v.hook}"`);

line('\n── STORE FINDINGS');
for (const f of c.findings.list()) line(`  ${String(f.risk).padEnd(6)} ${f.status.padEnd(17)} ${f.problem}`);

line('\n── APPROVALS PENDING');
for (const a of c.approvals.list('PENDING')) line(`  ${a.risk} · ${a.title}`);

c.workflows.start('daily_report', { title: 'Daily report', productId: null, createdBy: 'OWNER', context: { date: localDate() } });
await c.scheduler.drain();
const report = c.reports.byDate(localDate());
line('\n── DAILY REPORT');
line(JSON.stringify({ bluf: report?.narrative.bluf, tasks: report?.data.tasks, videos: report?.data.videos, store: report?.data.store, hooks: report?.data.hooksCreated, concepts: report?.data.conceptsCreated }, null, 2));

const errors = c.activity.list({ kind: 'error' });
line(`\nErrors logged: ${errors.length}${errors.length ? '\n' + errors.map((e) => `  ${e.agentId}: ${e.error}`).join('\n') : ''}`);
line(`Done in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
c.close();
if (!persist) fs.rmSync(dataDir, { recursive: true, force: true });

import fs from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import { makeCompany, activeTestProduct, hasFfmpeg } from './helpers.js';
import { seedTestProduct } from '../src/server/seed/testProduct.js';
import { localDate } from '../src/server/core/ids.js';

describe('Video pipeline (PRODUCT ACTIVE → ATLAS → ALEX → NOVA → NEO → REX → MAX → LUNA → DELIVERY CENTER)', () => {
  let env: ReturnType<typeof makeCompany>;
  afterEach(() => env?.cleanup());

  it('runs the owner goal end-to-end and delivers a real, playable video', async (ctx) => {
    env = makeCompany();
    const { c } = env;
    if (!hasFfmpeg(c)) ctx.skip();
    await seedTestProduct(c);
    c.workflows.start('strategy', { title: 'Vender más', createdBy: 'OWNER', context: { goal: 'Quiero vender más vídeos de este producto' } });
    await c.scheduler.drain(600_000);

    // Tasks were created for every agent of the chain and all completed.
    const tasks = c.tasks.list({ limit: 200 });
    for (const type of ['atlas.strategy', 'alex.plan', 'nova.hooks', 'neo.blueprint', 'rex.produce', 'max.edit', 'luna.qa', 'alex.deliver', 'atlas.results_review']) {
      expect(tasks.some((t) => t.type === type && t.status === 'COMPLETED'), type).toBe(true);
    }
    expect(tasks.filter((t) => t.status === 'FAILED')).toEqual([]);

    // Agents communicated along the chain.
    const pairs = new Set(c.messages.internal({ limit: 500 }).map((m) => `${m.fromId}>${m.toId}`));
    for (const p of ['ATLAS>ALEX', 'ALEX>NOVA', 'NOVA>NEO', 'NEO>REX', 'REX>MAX', 'MAX>LUNA', 'LUNA>ALEX', 'ALEX>ATLAS']) expect(pairs.has(p), p).toBe(true);

    // Hooks, blueprint, raw and final video exist; the final file is real and short-form vertical.
    const videos = c.videos.list();
    expect(videos.length).toBeGreaterThanOrEqual(1);
    for (const v of videos) {
      expect(v.status).toBe('DELIVERED');
      expect((v.hooks as { textHooks: unknown[] }).textHooks.length).toBe(20);
      expect(v.blueprint).toBeTruthy();
      const final = c.videos.getAsset(v.finalAsset!)!;
      expect(fs.existsSync(final.path)).toBe(true);
      const probe = await c.integrations.ffmpeg.probe(final.path);
      expect(probe.durationSec).toBeGreaterThan(8);
      expect(probe.width / probe.height).toBeCloseTo(9 / 16, 2);
      expect(v.qa.at(-1)?.verdict).toBe('APPROVED');
    }

    // Product reached the agents (memory written from the product insights).
    expect(c.memory.list({ scope: 'product' }).some((m) => m.title === 'Insights de atención (NOVA)')).toBe(true);

    // Everything was logged and appears in the daily report.
    c.workflows.start('daily_report', { productId: null, createdBy: 'OWNER', context: { date: localDate() } });
    await c.scheduler.drain();
    const report = c.reports.byDate(localDate())!;
    expect(report.data.videos.approved).toBe(videos.length);
    expect(report.data.videos.delivered).toBe(videos.length);
    expect(report.data.hooksCreated).toBeGreaterThanOrEqual(65);
    expect(report.data.conceptsCreated).toBe(videos.length);
    expect(report.data.agentsActive).toEqual(expect.arrayContaining(['ATLAS', 'ALEX', 'NOVA', 'NEO', 'REX', 'MAX', 'LUNA']));
    expect(c.events.recent(500).map((e) => e.type)).toEqual(expect.arrayContaining(['VIDEO_CREATED', 'VIDEO_EDITED', 'VIDEO_SUBMITTED_QA', 'VIDEO_APPROVED', 'DELIVERY_CREATED', 'DAILY_REPORT_GENERATED']));
  });

  it('loops LUNA → responsible agent until the max revision cycles, then escalates to the owner', async (ctx) => {
    env = makeCompany();
    const { c } = env;
    if (!hasFfmpeg(c)) ctx.skip();
    activeTestProduct(c);
    c.settings.update({ qaApprovalThreshold: 100, maxRevisionCycles: 1 }); // impossible bar → forces revisions
    const run = c.workflows.start('video_pipeline', { title: 'QA loop', createdBy: 'OWNER' });
    await c.scheduler.drain(600_000);
    const qa = c.tasks.list({ workflowRunId: run.id }).filter((t) => t.type === 'luna.qa');
    expect(qa.length).toBe(2); // initial + 1 revision cycle
    const videoId = String(c.workflows.get(run.id).context.videoId);
    expect(c.videos.get(videoId).status).toBe('AWAITING_OWNER');
    expect(c.workflows.get(run.id).status).toBe('WAITING_APPROVAL');
    const approval = c.approvals.list('PENDING').find((a) => a.kind === 'video_max_revisions')!;
    expect(approval).toBeTruthy();
    // Owner approves the current version → ALEX delivers it.
    await c.approvals.resolve(approval.id, { decision: 'APPROVE', note: 'OK así' });
    await c.scheduler.drain(600_000);
    expect(c.videos.get(videoId).status).toBe('DELIVERED');
    expect(c.workflows.get(run.id).status).toBe('COMPLETED');
  });

  it('lets the owner request a revision from the Delivery Center', async (ctx) => {
    env = makeCompany();
    const { c } = env;
    if (!hasFfmpeg(c)) ctx.skip();
    activeTestProduct(c);
    const run = c.workflows.start('video_pipeline', { title: 'Owner revision', createdBy: 'OWNER' });
    await c.scheduler.drain(600_000);
    const videoId = String(c.workflows.get(run.id).context.videoId);
    expect(c.videos.get(videoId).status).toBe('DELIVERED');
    c.requestVideoRevision(videoId, 'MAX', 'CTA más grande y ritmo más rápido');
    expect(c.videos.get(videoId).status).toBe('REVISION');
    await c.scheduler.drain(600_000);
    const v = c.videos.get(videoId);
    expect(v.status).toBe('DELIVERED');
    expect(v.revisions).toBe(1);
    expect(c.videos.versions(videoId).filter((x) => x.stage === 'final').length).toBe(2);
  });
});

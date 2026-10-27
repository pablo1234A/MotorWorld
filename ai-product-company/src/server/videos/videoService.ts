import fs from 'node:fs';
import path from 'node:path';
import type { Database, Row } from '../db.js';
import { parseJson } from '../db.js';
import type { EventBus } from '../core/events.js';
import { newId, now } from '../core/ids.js';
import { NotFoundError } from '../core/errors.js';

export const VIDEO_STATUSES = ['HOOKS', 'BLUEPRINT', 'PRODUCING', 'EDITING', 'WAITING_QA', 'REVISION', 'APPROVED', 'DELIVERED', 'REJECTED', 'FAILED', 'AWAITING_OWNER'] as const;
export type VideoStatus = (typeof VIDEO_STATUSES)[number];

export const DELIVERY_STATUSES = ['PROCESSING', 'WAITING_QA', 'REVISION', 'APPROVED', 'DELIVERED', 'REJECTED', 'FAILED'] as const;
export type DeliveryStatus = (typeof DELIVERY_STATUSES)[number];

const toDeliveryStatus = (s: VideoStatus): DeliveryStatus =>
  ({
    HOOKS: 'PROCESSING',
    BLUEPRINT: 'PROCESSING',
    PRODUCING: 'PROCESSING',
    EDITING: 'PROCESSING',
    WAITING_QA: 'WAITING_QA',
    REVISION: 'REVISION',
    AWAITING_OWNER: 'REVISION',
    APPROVED: 'APPROVED',
    DELIVERED: 'DELIVERED',
    REJECTED: 'REJECTED',
    FAILED: 'FAILED',
  })[s] as DeliveryStatus;

export interface QAReview {
  cycle: number;
  verdict: 'APPROVED' | 'REVISION_REQUIRED' | 'REJECTED';
  score: number;
  summary: string;
  criteria: { criterion: string; score: number; max: number; evidence: string }[];
  issues: { what: string; why: string; fix: string; owner: 'NEO' | 'REX' | 'MAX'; severity: 'critical' | 'major' | 'minor' }[];
  technical: { check: string; passed: boolean; detail: string }[];
  engine: string;
  reviewedAt: string;
}

export interface Video {
  id: string;
  workflowRunId: string;
  productId: string;
  campaignId: string | null;
  title: string;
  status: VideoStatus;
  hook: string | null;
  hooks: unknown;
  blueprint: unknown;
  production: unknown;
  edit: unknown;
  qa: QAReview[];
  score: number | null;
  revisions: number;
  rawAsset: string | null;
  finalAsset: string | null;
  posterAsset: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface MediaAsset {
  id: string;
  kind: string;
  path: string;
  mime: string;
  size: number;
  meta: Record<string, unknown>;
  createdAt: string;
}

export interface HistoryEntry {
  at: string;
  by: string;
  event: string;
  detail?: string;
}

export class VideoService {
  constructor(private db: Database, private events: EventBus, readonly mediaDir: string) {}

  dirFor(videoId: string) {
    const dir = path.join(this.mediaDir, 'videos', videoId);
    fs.mkdirSync(dir, { recursive: true });
    return dir;
  }

  create(input: { workflowRunId: string; productId: string; campaignId: string | null; title: string; createdBy: string }): Video {
    const id = newId('vid');
    const ts = now();
    this.db.transaction(() => {
      this.db.insert('videos', {
        id,
        workflow_run_id: input.workflowRunId,
        product_id: input.productId,
        campaign_id: input.campaignId,
        title: input.title,
        status: 'HOOKS',
        qa: [],
        created_at: ts,
        updated_at: ts,
      });
      this.db.insert('deliveries', {
        id: newId('dlv'),
        video_id: id,
        product_id: input.productId,
        campaign_id: input.campaignId,
        title: input.title,
        status: 'PROCESSING',
        created_by: input.createdBy,
        history: [{ at: ts, by: input.createdBy, event: 'PIPELINE_STARTED', detail: 'Vídeo en producción' }],
        created_at: ts,
        updated_at: ts,
      });
    });
    this.events.emit('DELIVERY_CREATED', { videoId: id, title: input.title, productId: input.productId });
    return this.get(id);
  }

  get(id: string): Video {
    const r = this.db.get('SELECT * FROM videos WHERE id = ?', id);
    if (!r) throw new NotFoundError('Video');
    return toVideo(r);
  }

  list(filter: { productId?: string } = {}): Video[] {
    const rows = filter.productId
      ? this.db.all('SELECT * FROM videos WHERE product_id = ? ORDER BY created_at DESC', filter.productId)
      : this.db.all('SELECT * FROM videos ORDER BY created_at DESC');
    return rows.map(toVideo);
  }

  patch(id: string, patch: Partial<Pick<Video, 'hook' | 'hooks' | 'blueprint' | 'production' | 'edit' | 'score' | 'title'>> & { rawAsset?: string; finalAsset?: string; posterAsset?: string; revisions?: number }) {
    const map: Record<string, unknown> = { updated_at: now() };
    if ('hook' in patch) map.hook = patch.hook;
    if ('hooks' in patch) map.hooks = patch.hooks;
    if ('blueprint' in patch) map.blueprint = patch.blueprint;
    if ('production' in patch) map.production = patch.production;
    if ('edit' in patch) map.edit = patch.edit;
    if ('score' in patch) map.score = patch.score;
    if ('title' in patch) map.title = patch.title;
    if ('rawAsset' in patch) map.raw_asset = patch.rawAsset;
    if ('finalAsset' in patch) map.final_asset = patch.finalAsset;
    if ('posterAsset' in patch) map.poster_asset = patch.posterAsset;
    if ('revisions' in patch) map.revisions = patch.revisions;
    this.db.update('videos', id, map);
    if ('score' in patch) this.db.run('UPDATE deliveries SET score = ? WHERE video_id = ?', patch.score ?? null, id);
    if ('title' in patch) this.db.run('UPDATE deliveries SET title = ? WHERE video_id = ?', patch.title ?? '', id);
  }

  addQA(id: string, review: QAReview) {
    const v = this.get(id);
    this.db.update('videos', id, { qa: [...v.qa, review], score: review.score, updated_at: now() });
    this.db.run('UPDATE deliveries SET score = ? WHERE video_id = ?', review.score, id);
  }

  setStatus(id: string, status: VideoStatus, by: string, detail?: string) {
    const v = this.get(id);
    this.db.update('videos', id, { status, updated_at: now() });
    const dStatus = toDeliveryStatus(status);
    this.appendHistory(id, { at: now(), by, event: status, detail });
    this.db.run('UPDATE deliveries SET status = ?, updated_at = ? WHERE video_id = ?', dStatus, now(), id);
    if (v.status !== status) this.events.emit('DELIVERY_UPDATED', { videoId: id, status: dStatus, videoStatus: status, by });
  }

  appendHistory(videoId: string, entry: HistoryEntry) {
    const row = this.db.get<{ history: string }>('SELECT history FROM deliveries WHERE video_id = ?', videoId);
    const history = parseJson<HistoryEntry[]>(row?.history, []);
    history.push(entry);
    this.db.run('UPDATE deliveries SET history = ?, updated_at = ? WHERE video_id = ?', JSON.stringify(history), now(), videoId);
  }

  registerAsset(file: string, kind: string, mime: string, meta: Record<string, unknown> = {}): MediaAsset {
    const asset: MediaAsset = { id: newId('med'), kind, path: file, mime, size: fs.statSync(file).size, meta, createdAt: now() };
    this.db.insert('media_assets', { id: asset.id, kind, path: file, mime, size: asset.size, meta, created_at: asset.createdAt });
    return asset;
  }

  getAsset(id: string): MediaAsset | null {
    const r = this.db.get('SELECT * FROM media_assets WHERE id = ?', id);
    if (!r) return null;
    return { id: String(r.id), kind: String(r.kind), path: String(r.path), mime: String(r.mime), size: Number(r.size), meta: parseJson(r.meta, {}), createdAt: String(r.created_at) };
  }

  addVersion(videoId: string, stage: string, assetId: string | null, notes: string, by: string) {
    const n = Number(this.db.get<{ n: number }>('SELECT COUNT(*) AS n FROM video_versions WHERE video_id = ?', videoId)?.n ?? 0) + 1;
    this.db.insert('video_versions', { id: newId('vv'), video_id: videoId, version: n, stage, asset_id: assetId, notes, created_by: by, created_at: now() });
    return n;
  }

  versions(videoId: string) {
    return this.db.all('SELECT * FROM video_versions WHERE video_id = ? ORDER BY version', videoId).map((r) => ({
      id: String(r.id),
      version: Number(r.version),
      stage: String(r.stage),
      assetId: (r.asset_id as string) ?? null,
      notes: String(r.notes),
      createdBy: String(r.created_by),
      createdAt: String(r.created_at),
    }));
  }
}

function toVideo(r: Row): Video {
  return {
    id: String(r.id),
    workflowRunId: String(r.workflow_run_id),
    productId: String(r.product_id),
    campaignId: (r.campaign_id as string) ?? null,
    title: String(r.title),
    status: r.status as VideoStatus,
    hook: (r.hook as string) ?? null,
    hooks: parseJson(r.hooks, null),
    blueprint: parseJson(r.blueprint, null),
    production: parseJson(r.production, null),
    edit: parseJson(r.edit, null),
    qa: parseJson<QAReview[]>(r.qa, []),
    score: r.score == null ? null : Number(r.score),
    revisions: Number(r.revisions),
    rawAsset: (r.raw_asset as string) ?? null,
    finalAsset: (r.final_asset as string) ?? null,
    posterAsset: (r.poster_asset as string) ?? null,
    createdAt: String(r.created_at),
    updatedAt: String(r.updated_at),
  };
}

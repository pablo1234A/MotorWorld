import type { Database } from '../db.js';
import { parseJson } from '../db.js';
import type { ProductService } from '../products/productService.js';
import type { CampaignService } from '../campaigns/campaignService.js';
import type { HistoryEntry, VideoService } from '../videos/videoService.js';

export interface DeliveryRow {
  id: string;
  videoId: string;
  productId: string;
  productName: string;
  campaignId: string | null;
  campaignName: string | null;
  title: string;
  status: string;
  videoStatus: string;
  score: number | null;
  hook: string | null;
  createdBy: string;
  posterAsset: string | null;
  finalAsset: string | null;
  rawAsset: string | null;
  revisions: number;
  workflowRunId: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * DELIVERY CENTER — the company's inbox of finished work. A video is "done"
 * when it is DELIVERED here; no publishing platform is required.
 * (Rows are created and advanced by VideoService as the pipeline moves.)
 */
export class DeliveryService {
  constructor(
    private db: Database,
    private videos: VideoService,
    private products: ProductService,
    private campaigns: CampaignService,
  ) {}

  list(): DeliveryRow[] {
    return this.db
      .all('SELECT d.*, v.hook, v.status AS video_status, v.poster_asset, v.final_asset, v.raw_asset, v.revisions, v.workflow_run_id FROM deliveries d JOIN videos v ON v.id = d.video_id ORDER BY d.created_at DESC')
      .map((r) => ({
        id: String(r.id),
        videoId: String(r.video_id),
        productId: String(r.product_id),
        productName: this.products.find(String(r.product_id))?.name ?? '—',
        campaignId: (r.campaign_id as string) ?? null,
        campaignName: this.campaigns.getCampaign(r.campaign_id as string)?.name ?? null,
        title: String(r.title),
        status: String(r.status),
        videoStatus: String(r.video_status),
        score: r.score == null ? null : Number(r.score),
        hook: (r.hook as string) ?? null,
        createdBy: String(r.created_by),
        posterAsset: (r.poster_asset as string) ?? null,
        finalAsset: (r.final_asset as string) ?? null,
        rawAsset: (r.raw_asset as string) ?? null,
        revisions: Number(r.revisions),
        workflowRunId: String(r.workflow_run_id),
        createdAt: String(r.created_at),
        updatedAt: String(r.updated_at),
      }));
  }

  history(videoId: string): HistoryEntry[] {
    return parseJson<HistoryEntry[]>(this.db.get<{ history: string }>('SELECT history FROM deliveries WHERE video_id = ?', videoId)?.history, []);
  }

  detail(videoId: string) {
    const video = this.videos.get(videoId);
    return {
      delivery: this.list().find((d) => d.videoId === videoId) ?? null,
      video,
      history: this.history(videoId),
      versions: this.videos.versions(videoId),
    };
  }
}

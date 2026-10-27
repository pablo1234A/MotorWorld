import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import type { Database, Row } from '../db.js';
import { parseJson } from '../db.js';
import type { EventBus } from '../core/events.js';
import { newId, now } from '../core/ids.js';
import { NotFoundError, ValidationError } from '../core/errors.js';

const list = z.array(z.string().trim().min(1).max(500)).max(50).default([]);
const text = (max = 4000) => z.string().trim().max(max).default('');

/** PRODUCT CENTER — full product profile. Everything agents need lives here. */
export const ProductInputSchema = z.object({
  name: z.string().trim().min(1).max(160),
  description: text(),
  price: z.number().min(0).max(1_000_000).nullable().default(null),
  cost: z.number().min(0).max(1_000_000).nullable().default(null),
  currency: z.string().trim().max(8).default('EUR'),
  features: list,
  benefits: list,
  problemSolved: text(),
  targetAudience: text(),
  buyerPersona: text(),
  customerDesires: list,
  customerPains: list,
  objections: list,
  competitors: list,
  competitiveAdvantages: list,
  differentiators: list,
  brandTone: text(1000),
  visualStyle: text(1000),
  cta: text(300),
  storeUrl: z.union([z.literal(''), z.string().trim().url().max(500)]).default(''),
  additionalInfo: text(),
  notes: text(),
  status: z.enum(['draft', 'ready', 'paused', 'archived']).default('draft'),
});

export type ProductInput = z.infer<typeof ProductInputSchema>;

export interface ProductAsset {
  id: string;
  productId: string;
  kind: 'image' | 'video';
  filename: string;
  originalName: string;
  mime: string;
  size: number;
  createdAt: string;
}

export interface Product extends ProductInput {
  id: string;
  isActive: boolean;
  margin: number | null;
  marginPct: number | null;
  images: ProductAsset[];
  videos: ProductAsset[];
  campaigns: { id: string; name: string; status: string; objective: string }[];
  createdAt: string;
  updatedAt: string;
}

export const ALLOWED_IMAGE_MIME = ['image/png', 'image/jpeg', 'image/webp'];
export const ALLOWED_VIDEO_MIME = ['video/mp4', 'video/quicktime', 'video/webm'];

export class ProductService {
  constructor(private db: Database, private events: EventBus, private mediaDir: string) {}

  private hydrate(row: Row): Product {
    const data = ProductInputSchema.parse(parseJson(row.data, {}));
    const assets = this.db
      .all('SELECT * FROM product_assets WHERE product_id = ? ORDER BY created_at', String(row.id))
      .map(toAsset);
    const campaigns = this.db
      .all('SELECT id, name, status, objective FROM campaigns WHERE product_id = ? ORDER BY created_at DESC', String(row.id))
      .map((c) => ({ id: String(c.id), name: String(c.name), status: String(c.status), objective: String(c.objective) }));
    const margin = data.price != null && data.cost != null ? round2(data.price - data.cost) : null;
    const marginPct = margin != null && data.price ? round2((margin / data.price) * 100) : null;
    return {
      ...data,
      id: String(row.id),
      isActive: Number(row.is_active) === 1,
      margin,
      marginPct,
      images: assets.filter((a) => a.kind === 'image'),
      videos: assets.filter((a) => a.kind === 'video'),
      campaigns,
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at),
    };
  }

  list(): Product[] {
    return this.db.all('SELECT * FROM products ORDER BY is_active DESC, updated_at DESC').map((r) => this.hydrate(r));
  }

  get(id: string): Product {
    const row = this.db.get('SELECT * FROM products WHERE id = ?', id);
    if (!row) throw new NotFoundError('Product');
    return this.hydrate(row);
  }

  find(id: string | null | undefined): Product | null {
    if (!id) return null;
    const row = this.db.get('SELECT * FROM products WHERE id = ?', id);
    return row ? this.hydrate(row) : null;
  }

  getActive(): Product | null {
    const row = this.db.get('SELECT * FROM products WHERE is_active = 1');
    return row ? this.hydrate(row) : null;
  }

  create(input: unknown): Product {
    const data = ProductInputSchema.parse(input);
    const id = newId('prd');
    const ts = now();
    this.db.insert('products', { id, name: data.name, status: data.status, is_active: 0, data, created_at: ts, updated_at: ts });
    this.events.emit('PRODUCT_CREATED', { productId: id, name: data.name });
    return this.get(id);
  }

  update(id: string, input: unknown): Product {
    const current = this.get(id);
    const { id: _i, isActive: _a, margin: _m, marginPct: _p, images: _im, videos: _v, campaigns: _c, createdAt: _cr, updatedAt: _u, ...currentData } = current;
    const data = ProductInputSchema.parse({ ...currentData, ...(input as object) });
    this.db.update('products', id, { name: data.name, status: data.status, data, updated_at: now() });
    this.events.emit('PRODUCT_UPDATED', { productId: id, name: data.name, isActive: current.isActive });
    return this.get(id);
  }

  /** ACTIVE PRODUCT switch. Only one product is active at a time. */
  activate(id: string): Product {
    const product = this.get(id);
    if (product.status === 'archived') throw new ValidationError('An archived product cannot be activated');
    const previous = this.getActive();
    this.db.transaction(() => {
      this.db.run('UPDATE products SET is_active = 0 WHERE is_active = 1');
      this.db.run("UPDATE products SET is_active = 1, status = CASE WHEN status = 'draft' THEN 'ready' ELSE status END, updated_at = ? WHERE id = ?", now(), id);
    });
    if (previous && previous.id !== id) this.events.emit('PRODUCT_DEACTIVATED', { productId: previous.id, name: previous.name });
    this.events.emit('PRODUCT_ACTIVATED', { productId: id, name: product.name, previousProductId: previous?.id ?? null });
    return this.get(id);
  }

  deactivate(id: string): Product {
    const product = this.get(id);
    this.db.run('UPDATE products SET is_active = 0, updated_at = ? WHERE id = ?', now(), id);
    if (product.isActive) this.events.emit('PRODUCT_DEACTIVATED', { productId: id, name: product.name });
    return this.get(id);
  }

  remove(id: string) {
    const product = this.get(id);
    if (product.isActive) throw new ValidationError('Deactivate the product before deleting it');
    for (const asset of [...product.images, ...product.videos]) this.deleteAssetFile(asset);
    this.db.run('DELETE FROM products WHERE id = ?', id);
  }

  addAsset(productId: string, file: { buffer: Buffer; originalName: string; mime: string }): ProductAsset {
    this.get(productId);
    const kind = ALLOWED_IMAGE_MIME.includes(file.mime) ? 'image' : ALLOWED_VIDEO_MIME.includes(file.mime) ? 'video' : null;
    if (!kind) throw new ValidationError(`Unsupported file type ${file.mime}`);
    const ext = mimeExt(file.mime);
    const id = newId('ast');
    const filename = `${id}${ext}`;
    const dir = path.join(this.mediaDir, 'products', productId);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, filename), file.buffer);
    const asset: ProductAsset = {
      id,
      productId,
      kind,
      filename,
      originalName: file.originalName.slice(0, 200),
      mime: file.mime,
      size: file.buffer.length,
      createdAt: now(),
    };
    this.db.insert('product_assets', {
      id,
      product_id: productId,
      kind,
      filename,
      original_name: asset.originalName,
      mime: asset.mime,
      size: asset.size,
      created_at: asset.createdAt,
    });
    this.events.emit('PRODUCT_UPDATED', { productId, assetAdded: id });
    return asset;
  }

  removeAsset(productId: string, assetId: string) {
    const row = this.db.get('SELECT * FROM product_assets WHERE id = ? AND product_id = ?', assetId, productId);
    if (!row) throw new NotFoundError('Asset');
    this.deleteAssetFile(toAsset(row));
    this.db.run('DELETE FROM product_assets WHERE id = ?', assetId);
  }

  assetPath(asset: Pick<ProductAsset, 'productId' | 'filename'>): string {
    return path.join(this.mediaDir, 'products', asset.productId, asset.filename);
  }

  getAsset(assetId: string): ProductAsset | null {
    const row = this.db.get('SELECT * FROM product_assets WHERE id = ?', assetId);
    return row ? toAsset(row) : null;
  }

  private deleteAssetFile(asset: ProductAsset) {
    try {
      fs.rmSync(this.assetPath(asset), { force: true });
    } catch {
      /* already gone */
    }
  }
}

function toAsset(r: Row): ProductAsset {
  return {
    id: String(r.id),
    productId: String(r.product_id),
    kind: r.kind as 'image' | 'video',
    filename: String(r.filename),
    originalName: String(r.original_name),
    mime: String(r.mime),
    size: Number(r.size),
    createdAt: String(r.created_at),
  };
}

function mimeExt(mime: string): string {
  return (
    { 'image/png': '.png', 'image/jpeg': '.jpg', 'image/webp': '.webp', 'video/mp4': '.mp4', 'video/quicktime': '.mov', 'video/webm': '.webm' }[mime] ?? ''
  );
}

const round2 = (n: number) => Math.round(n * 100) / 100;

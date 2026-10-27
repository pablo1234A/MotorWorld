import type { Product } from './productService.js';

/**
 * PRODUCT CONTEXT PROPAGATION.
 * Every agent receives the ACTIVE PRODUCT automatically — but only the fields
 * relevant to its function (NOVA doesn't need the cost; EVA does need the store URL).
 */
export type ProductField =
  | 'name'
  | 'description'
  | 'pricing'
  | 'features'
  | 'benefits'
  | 'problemSolved'
  | 'targetAudience'
  | 'buyerPersona'
  | 'customerDesires'
  | 'customerPains'
  | 'objections'
  | 'competitors'
  | 'competitiveAdvantages'
  | 'differentiators'
  | 'brandTone'
  | 'visualStyle'
  | 'cta'
  | 'storeUrl'
  | 'assets'
  | 'additionalInfo'
  | 'notes'
  | 'campaigns';

export const ALL_PRODUCT_FIELDS: ProductField[] = [
  'name', 'description', 'pricing', 'features', 'benefits', 'problemSolved', 'targetAudience', 'buyerPersona',
  'customerDesires', 'customerPains', 'objections', 'competitors', 'competitiveAdvantages', 'differentiators',
  'brandTone', 'visualStyle', 'cta', 'storeUrl', 'assets', 'additionalInfo', 'notes', 'campaigns',
];

const LABELS: Record<ProductField, string> = {
  name: 'Nombre',
  description: 'Descripción',
  pricing: 'Precio / coste / margen',
  features: 'Características',
  benefits: 'Beneficios',
  problemSolved: 'Problema que resuelve',
  targetAudience: 'Público objetivo',
  buyerPersona: 'Buyer persona',
  customerDesires: 'Deseos del cliente',
  customerPains: 'Dolores del cliente',
  objections: 'Objeciones',
  competitors: 'Competidores',
  competitiveAdvantages: 'Ventajas competitivas',
  differentiators: 'Diferenciadores',
  brandTone: 'Tono de marca',
  visualStyle: 'Estilo visual',
  cta: 'CTA',
  storeUrl: 'URL de la tienda / página de producto',
  assets: 'Material disponible (imágenes / vídeos)',
  additionalInfo: 'Información adicional',
  notes: 'Notas internas',
  campaigns: 'Campañas relacionadas',
};

function fieldValue(product: Product, field: ProductField): string | null {
  switch (field) {
    case 'pricing': {
      if (product.price == null) return null;
      const parts = [`Precio ${product.price} ${product.currency}`];
      if (product.cost != null) parts.push(`coste ${product.cost} ${product.currency}`);
      if (product.margin != null) parts.push(`margen ${product.margin} ${product.currency} (${product.marginPct}%)`);
      return parts.join(' · ');
    }
    case 'assets': {
      const n = product.images.length;
      const v = product.videos.length;
      if (!n && !v) return null;
      return `${n} imagen(es), ${v} vídeo(s) subidos por el propietario`;
    }
    case 'campaigns':
      return product.campaigns.length ? product.campaigns.map((c) => `${c.name} [${c.status}] — ${c.objective}`).join('\n') : null;
    default: {
      const v = (product as unknown as Record<string, unknown>)[field];
      if (Array.isArray(v)) return v.length ? v.map((x) => `- ${x}`).join('\n') : null;
      if (typeof v === 'string') return v.trim() ? v.trim() : null;
      return v == null ? null : String(v);
    }
  }
}

export interface ProductContext {
  productId: string;
  productName: string;
  text: string;
  missing: ProductField[];
}

export function buildProductContext(product: Product, fields: ProductField[]): ProductContext {
  const lines: string[] = [`# PRODUCTO ACTIVO: ${product.name}`];
  const missing: ProductField[] = [];
  for (const f of fields) {
    if (f === 'name') continue;
    const value = fieldValue(product, f);
    if (value == null) {
      missing.push(f);
      continue;
    }
    lines.push(`\n## ${LABELS[f]}\n${value}`);
  }
  if (missing.length) {
    lines.push(
      `\n## Información NO definida por el propietario\n${missing.map((m) => `- ${LABELS[m]}`).join('\n')}\n` +
        'No inventes estos datos. Si son necesarios, trabaja con hipótesis explícitamente marcadas como HIPÓTESIS y recomiéndale al propietario completarlos.',
    );
  }
  return { productId: product.id, productName: product.name, text: lines.join('\n'), missing };
}

export function fieldLabel(f: ProductField) {
  return LABELS[f];
}

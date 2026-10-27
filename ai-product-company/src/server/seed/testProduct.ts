import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { Company } from '../company.js';
import type { ProductInput } from '../products/productService.js';

/**
 * FICTITIOUS TEST PRODUCT — only used to verify the system end-to-end.
 * Clearly marked as fictitious in its own notes.
 */
export const TEST_PRODUCT: Partial<ProductInput> = {
  name: 'PostureFlex (PRODUCTO DE PRUEBA)',
  description: 'Cojín lumbar ergonómico con memoria de forma y correa ajustable para sillas de oficina y coche.',
  price: 39.9,
  cost: 11.5,
  currency: 'EUR',
  features: ['Espuma con memoria de forma de alta densidad', 'Correa ajustable a cualquier silla', 'Funda transpirable lavable'],
  benefits: ['Reduce el dolor lumbar al estar sentado muchas horas', 'Mantiene la curvatura natural de la espalda', 'Se instala en 10 segundos'],
  problemSolved: 'Dolor de espalda baja por pasar muchas horas sentado con mala postura.',
  targetAudience: 'Trabajadores de oficina y teletrabajadores de 25-50 años',
  buyerPersona: 'Laura, 34, diseñadora en remoto, 9 horas al día en la silla, termina el día con la espalda cargada.',
  customerDesires: ['Terminar la jornada sin dolor de espalda', 'Sentarse bien sin tener que pensar en ello'],
  customerPains: ['Dolor lumbar al final del día', 'Cojines que se deforman en una semana'],
  objections: ['¿De verdad funciona o es otro cojín más?', '¿Se mueve de la silla?'],
  competitors: ['Cojines lumbares genéricos de marketplace'],
  competitiveAdvantages: ['Densidad de espuma que no se aplasta'],
  differentiators: ['Vuelve a su forma original en 3 segundos tras presionarlo'],
  brandTone: 'cercano, directo, sin tecnicismos',
  visualStyle: 'clean, luz natural, tonos azules y blancos',
  cta: 'Pruébalo 30 días',
  storeUrl: '',
  additionalInfo: 'Envío en 48h (dato de prueba).',
  notes: 'PRODUCTO FICTICIO creado para probar el sistema. No es un producto real.',
  status: 'ready',
};

/** Creates the test product, a generated test image (if a media engine exists) and activates it. */
export async function seedTestProduct(c: Company) {
  const product = c.products.create(TEST_PRODUCT);
  if (c.integrations.media.available) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'seed-'));
    const file = path.join(dir, 'product.png');
    await c.integrations.media.testProductImage(file, 'TEST PRODUCT');
    c.products.addAsset(product.id, { buffer: fs.readFileSync(file), originalName: 'test-product.png', mime: 'image/png' });
    fs.rmSync(dir, { recursive: true, force: true });
  }
  return c.products.activate(product.id);
}

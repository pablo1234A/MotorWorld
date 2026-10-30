import { describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config.js';
import { API, createTestApp } from './helpers.js';

/*
 * P0: el alta pide aceptar los términos y la política de privacidad. En producción la API no
 * arranca sin las direcciones de las versiones publicadas; fuera de ella, la aplicación dice
 * que están pendientes en lugar de inventarlas. Los borradores (docs/legal/) NO se publican.
 */

const prod = {
  NODE_ENV: 'production',
  LOG_LEVEL: 'silent',
  DATABASE_URL: 'postgres://u:p@localhost:5432/x',
  APP_WEB_URL: 'https://app.ejemplo.test',
};

describe('documentos legales (P0)', () => {
  it('producción exige las direcciones (https) de los términos y de la política de privacidad', () => {
    expect(() => loadConfig(prod)).toThrow(/LEGAL_TERMS_URL/);
    expect(() => loadConfig({ ...prod, LEGAL_TERMS_URL: 'https://ejemplo.test/terminos' })).toThrow(/LEGAL_PRIVACY_URL/);
    expect(() => loadConfig({ ...prod, LEGAL_TERMS_URL: 'http://ejemplo.test/terminos', LEGAL_PRIVACY_URL: 'https://ejemplo.test/privacidad' })).toThrow(/LEGAL_TERMS_URL/);
    expect(loadConfig({ ...prod, LEGAL_TERMS_URL: 'https://ejemplo.test/terminos', LEGAL_PRIVACY_URL: 'https://ejemplo.test/privacidad' }).legal).toEqual({
      termsUrl: 'https://ejemplo.test/terminos',
      privacyUrl: 'https://ejemplo.test/privacidad',
    });
  });

  it('sin documentos publicados (desarrollo y pruebas) lo dice; con ellos, devuelve sus direcciones', async () => {
    const { app } = await createTestApp();
    const pending = await app.inject({ method: 'GET', url: `${API}/public/legal` });
    expect(pending.statusCode).toBe(200);
    expect(pending.json()).toEqual({ legal: { termsUrl: null, privacyUrl: null, published: false } });
    const { app: published } = await createTestApp((c) => {
      c.legal = { termsUrl: 'https://ejemplo.test/terminos', privacyUrl: 'https://ejemplo.test/privacidad' };
    });
    expect((await published.inject({ method: 'GET', url: `${API}/public/legal` })).json()).toEqual({
      legal: { termsUrl: 'https://ejemplo.test/terminos', privacyUrl: 'https://ejemplo.test/privacidad', published: true },
    });
  });
});

import './polyfills';
import initSqlJs from 'sql.js/dist/sql-wasm-inline.js';
import { __configure, type DatabaseSync } from './shims/sqlite';
import { __load, __setPersistence } from './shims/fs';
import { deleteFile, loadAll, putFile, saveDb, wipe } from './persist';
import { BrowserAnimaticAdapter, BrowserMediaEngine, BrowserPageSnapshotSlot, BrowserRenderAdapter, detectCaps } from './media';
import { createLocalApi } from './localApi';

/**
 * AI PRODUCT COMPANY — single-file browser edition.
 * Boots the real company engine (agents, tasks, workflows, memory, QA…) inside
 * the page: SQLite in WebAssembly, media encoded with WebCodecs, everything
 * persisted to this browser's IndexedDB.
 */
async function boot() {
  const status = (t: string) => {
    const p = document.querySelector('#boot p');
    if (p) p.textContent = t;
  };
  status('Cargando base de datos…');
  const [SQL, saved] = await Promise.all([initSqlJs(), loadAll()]);

  let dbRef: DatabaseSync | null = null;
  let timer: number | null = null;
  const flush = () => {
    if (timer) clearTimeout(timer);
    timer = null;
    if (dbRef) void saveDb(dbRef.export());
  };
  __configure(SQL, saved.db, (db) => {
    dbRef = db;
    if (!timer) timer = window.setTimeout(flush, 1200);
  });
  __load(saved.files);
  __setPersistence((path, data) => void (data ? putFile(path, data) : deleteFile(path)));
  window.addEventListener('pagehide', flush);
  document.addEventListener('visibilitychange', () => document.visibilityState === 'hidden' && flush());

  status('Preparando el motor de vídeo…');
  await Promise.all([detectCaps(), document.fonts?.load('650 40px "Geist Variable"').catch(() => null)]);

  // Server modules are loaded after the shims are configured.
  const [{ Company }, { mount }] = await Promise.all([import('../server/company'), import('../web/App')]);
  const media = new BrowserMediaEngine();
  const company = new Company(
    {
      port: 0,
      host: '',
      dataDir: '/data',
      mediaDir: '/data/media',
      dbFile: '/data/company.db',
      cookieSecure: false,
      anthropicApiKey: null,
      llmModel: 'claude-opus-5-5',
      ffmpegPath: null,
      ffprobePath: null,
      fontFile: null,
      shopifyDomain: null,
      shopifyToken: null,
      isTest: false,
    },
    {
      integrations: {
        media,
        videoGenerators: [new BrowserAnimaticAdapter(media)],
        renderers: [new BrowserRenderAdapter(media)],
        pageSnapshot: new BrowserPageSnapshotSlot(),
        storageDescription: 'Vídeos, imágenes y datos guardados en este navegador (IndexedDB). Descarga los vídeos que quieras conservar.',
      },
    },
  );
  flush();

  window.__APC_LOCAL__ = createLocalApi(company, {
    reset: async () => {
      company.scheduler.stop();
      if (timer) clearTimeout(timer);
      dbRef = null;
      await wipe();
      setTimeout(() => window.location.reload(), 50);
    },
  });
  company.scheduler.start(1500);
  document.getElementById('boot')?.remove();
  mount(document.getElementById('root')!);
}

boot().catch((err) => {
  console.error(err);
  const p = document.querySelector('#boot p');
  if (p) p.textContent = `No se pudo arrancar: ${(err as Error).message}`;
});

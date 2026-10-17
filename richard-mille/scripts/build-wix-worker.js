#!/usr/bin/env node
/**
 * Empaqueta la web completa (frontend + backend) para Wix-managed headless:
 *   wix/dist/client/  → recursos estáticos (/assets/: css, js, imágenes), idénticos a los del repositorio
 *   wix/dist/server/  → el backend como worker (Cloudflare Workers runtime): páginas por idioma, SEO y API
 * Requiere esbuild (devDependency).  Uso: npm run build:wix-worker
 */
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const esbuild = require('esbuild');
const R = require('../server/render.js');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'wix', 'dist');
const src = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

fs.rmSync(OUT, { recursive: true, force: true });

// 1) Cliente: /assets tal cual
fs.cpSync(path.join(ROOT, 'assets'), path.join(OUT, 'client', 'assets'), { recursive: true });

// 2) Servidor: un único módulo ES para el runtime de Workers
esbuild.buildSync({
  entryPoints: [path.join(ROOT, 'wix', 'worker.js')],
  outfile: path.join(OUT, 'server', 'index.js'),
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: 'es2022',
  charset: 'utf8',
  loader: { '.html': 'text' },
  define: {
    __CSP_HASH__: JSON.stringify(crypto.createHash('sha256').update(R.inlineScript(src)).digest('base64')),
    __LASTMOD__: JSON.stringify(new Date(fs.statSync(path.join(ROOT, 'index.html')).mtimeMs).toISOString().slice(0, 10))
  },
  logLevel: 'warning'
});

const size = (d) => fs.readdirSync(d, { withFileTypes: true }).reduce((n, e) =>
  n + (e.isDirectory() ? size(path.join(d, e.name)) : fs.statSync(path.join(d, e.name)).size), 0);
console.log('✓ wix/dist/client ' + (size(path.join(OUT, 'client')) / 1024).toFixed(0) + ' KB · wix/dist/server ' +
  (size(path.join(OUT, 'server')) / 1024).toFixed(0) + ' KB');

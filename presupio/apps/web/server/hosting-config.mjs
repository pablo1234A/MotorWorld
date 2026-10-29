#!/usr/bin/env node
/*
 * Genera la configuración de cabeceras para alojamientos habituales a partir de
 * security-headers.mjs (única fuente):
 *  - dist/_headers (Netlify, Cloudflare Pages), tras `vite build`;
 *  - con --nginx, imprime el bloque de nginx (ops/nginx/presupio-web.conf se genera así).
 */
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { cacheHeaders, securityHeaders } from './security-headers.mjs';

export function netlifyHeaders() {
  const lines = ['/*', ...Object.entries(securityHeaders).map(([k, v]) => `  ${k}: ${v}`)];
  lines.push('/index.html', `  Cache-Control: ${cacheHeaders.html}`, '/assets/*', `  Cache-Control: ${cacheHeaders.assets}`);
  return `${lines.join('\n')}\n`;
}

export function nginxConfig() {
  const add = (indent) => Object.entries(securityHeaders).map(([k, v]) => `${indent}add_header ${k} "${v}" always;`).join('\n');
  return `# GENERADO por apps/web/server/hosting-config.mjs --nginx (no editar a mano).
# Frontend de Presupio detrás de HTTPS, con la API en el mismo origen (/api/).
# Nota: nginx no hereda add_header en un location que define los suyos; por eso se repiten.
server {
  # (En nginx ≥ 1.25.1 puede escribirse «listen 443 ssl;» + «http2 on;».)
  listen 443 ssl http2;
  server_name app.tu-dominio.es;
  # ssl_certificate y ssl_certificate_key: los de tu dominio.

  root /srv/presupio/web;
  server_tokens off;

${add('  ')}

  location /api/ {
    proxy_pass http://127.0.0.1:3000;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }

  location /assets/ {
${add('    ')}
    # Sin «always»: un 404 no debe quedar en caché un año.
    add_header Cache-Control "${cacheHeaders.assets}";
    try_files $uri =404;
  }

  location / {
${add('    ')}
    add_header Cache-Control "${cacheHeaders.html}" always;
    try_files $uri /index.html;
  }
}

server {
  listen 80;
  server_name app.tu-dominio.es;
  return 301 https://$host$request_uri;
}
`;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  if (process.argv.includes('--nginx')) {
    process.stdout.write(nginxConfig());
  } else {
    const dist = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'dist');
    writeFileSync(path.join(dist, '_headers'), netlifyHeaders());
    console.log('dist/_headers generado');
  }
}

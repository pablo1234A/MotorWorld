// SIMULADOR LOCAL DE LA API DE MENSAJES DE MAILGUN — SOLO PARA LAS PRUEBAS E2E.
// No es Mailgun ni se conecta a nada: acepta POST /v3/:dominio/messages, guarda cada
// mensaje en un archivo JSONL y responde como lo documenta Mailgun ({ id, message }).
import { appendFileSync } from 'node:fs';
import http from 'node:http';

const [port, file] = process.argv.slice(2);
let n = 0;
http
  .createServer((req, res) => {
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', () => {
      const ok = req.method === 'POST' && /^\/v3\/[^/]+\/messages$/.test(req.url ?? '') && req.headers.authorization?.startsWith('Basic ');
      if (!ok) {
        res.writeHead(404, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ message: 'not found' }));
        return;
      }
      const form = Object.fromEntries(new URLSearchParams(raw));
      const id = `simulador-${++n}@mg.e2e.test`;
      appendFileSync(file, `${JSON.stringify({ id, ...form })}\n`);
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ id: `<${id}>`, message: 'Queued. Thank you.' }));
    });
  })
  .listen(Number(port), '127.0.0.1');

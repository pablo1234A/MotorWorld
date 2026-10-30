#!/usr/bin/env node
/*
 * Comprobación tras `vite build`: el paquete publicado es el de producción. Falla si encuentra
 * restos de una compilación de desarrollo (JSX de desarrollo, rutas absolutas del equipo que
 * compiló) o mapas de código fuente, que no deben publicarse.
 */
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dist = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'dist');
const root = path.resolve(dist, '..', '..', '..');
const problems = [];
for (const file of readdirSync(path.join(dist, 'assets'))) {
  if (file.endsWith('.map')) problems.push(`${file}: mapa de código fuente`);
  if (!file.endsWith('.js')) continue;
  const code = readFileSync(path.join(dist, 'assets', file), 'utf8');
  if (code.includes('jsxDEV')) problems.push(`${file}: JSX de desarrollo`);
  if (code.includes(root)) problems.push(`${file}: ruta absoluta del equipo`);
}
if (problems.length) {
  console.error(`La compilación no es la de producción:\n- ${problems.join('\n- ')}`);
  process.exit(1);
}
console.log('Compilación de producción comprobada');

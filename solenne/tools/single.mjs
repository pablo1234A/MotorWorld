// Embeds every image into dist-single/index.html so the page needs no other file.
import fs from 'node:fs';
import path from 'node:path';
const root = path.resolve('public');
const map = {};
const alias = {};
const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).forEach((e) => {
  const f = path.join(d, e.name);
  if (e.isDirectory()) return walk(f);
  if (!f.endsWith('.webp')) return;
  const rel = path.relative(root, f).split(path.sep).join('/');
  const tour = rel.startsWith('assets/tour/');
  // the walkthrough keeps full-size photos; everything else ships one 960 px size to stay small
  if (tour ? f.endsWith('-960.webp') : !f.endsWith('-960.webp')) return;
  const data = `data:image/webp;base64,${fs.readFileSync(f).toString('base64')}`;
  map[rel] = data; alias[tour ? rel.replace('.webp', '-960.webp') : rel.replace('-960.webp', '.webp')] = rel;
});
walk(path.join(root, 'assets'));
const shim = `<script>(()=>{const M=${JSON.stringify(map)};const A=${JSON.stringify(alias)};const fix=(u)=>{if(!u)return u;const k=u.replace(/^\\.?\\//,'');return M[k]||M[A[k]]||u};const fixSet=(s)=>s.split(',').map(p=>{const [u,w]=p.trim().split(/\\s+/);return fix(u)+(w?' '+w:'')}).join(', ');
const d=Object.getOwnPropertyDescriptor(HTMLImageElement.prototype,'src');Object.defineProperty(HTMLImageElement.prototype,'src',{get(){return d.get.call(this)},set(v){d.set.call(this,fix(v))}});
const sa=Element.prototype.setAttribute;Element.prototype.setAttribute=function(n,v){if(this.tagName==='IMG'){if(n==='src')v=fix(v);if(n==='srcset')v=fixSet(v)}return sa.call(this,n,v)};
const walk=(n)=>{if(n.nodeType!==1)return;const imgs=n.tagName==='IMG'?[n]:n.querySelectorAll('img');imgs.forEach(i=>{const s=i.getAttribute('src'),ss=i.getAttribute('srcset');if(ss){i.removeAttribute('srcset');}if(s)i.setAttribute('src',s)})};
new MutationObserver(ms=>ms.forEach(m=>m.addedNodes.forEach(walk))).observe(document.documentElement,{childList:true,subtree:true});})();</script>`;
const file = 'dist-single/index.html';
let html = fs.readFileSync(file, 'utf8').replace(/<link rel="preload"[^>]*>/, '');
html = html.replace('<head>', '<head>' + shim);
fs.writeFileSync('Solenne.html', html);
console.log('Solenne.html', (fs.statSync('Solenne.html').size / 1e6).toFixed(1) + ' MB');

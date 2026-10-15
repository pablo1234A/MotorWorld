#!/usr/bin/env python3
"""Genera restaurante-puerto-rico-madrid.html: la web en un único archivo
(CSS, JavaScript, fuentes y favicon incrustados) para abrirla sin servidor.
Uso:  python3 scripts/generar-html-unico.py"""
import base64, os, re

raiz = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
leer = lambda r, m='r': open(os.path.join(raiz, r), m).read()

s = leer('index.html')
css = leer('assets/css/styles.css')
for f in ['fraunces-latin', 'fraunces-italic-latin', 'instrument-sans-latin']:
    b = base64.b64encode(leer(f'assets/fonts/{f}.woff2', 'rb')).decode()
    css = css.replace(f'url("../fonts/{f}.woff2")', f'url(data:font/woff2;base64,{b})')
js = leer('assets/js/main.js')

s = re.sub(r'<link rel="preload"[^>]*font[^>]*>\n', '', s)
s = re.sub(r'<link rel="stylesheet" href="/assets/css/styles\.css[^"]*">', lambda m: '<style>\n' + css + '\n</style>', s)
s = re.sub(r'<script src="/assets/js/main\.js[^"]*" defer></script>', lambda m: '<script>\n' + js + '\n</script>', s)
svg = base64.b64encode(leer('favicon.svg').strip().encode()).decode()
s = s.replace('<link rel="icon" href="/favicon.svg" type="image/svg+xml">',
              f'<link rel="icon" href="data:image/svg+xml;base64,{svg}" type="image/svg+xml">')
s = s.replace('<link rel="icon" href="/favicon-32.png" sizes="32x32" type="image/png">\n', '')
s = s.replace('<link rel="manifest" href="/site.webmanifest">\n', '')
s = s.replace('href="/apple-touch-icon.png"', 'href="apple-touch-icon.png"')
s = s.replace('"/assets/', '"assets/').replace(' /assets/', ' assets/').replace(', /assets/', ', assets/')
s = s.replace('href="/legal/"', 'href="legal/"')
assert '<style>' in s and 'main.js' not in s

open(os.path.join(raiz, 'restaurante-puerto-rico-madrid.html'), 'w').write(s)
print('✓ restaurante-puerto-rico-madrid.html', len(s) // 1024, 'KB')

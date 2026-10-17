import re, base64, os, json  # genera rolex-web.html: toda la web en un único archivo
R=os.path.dirname(os.path.abspath(__file__))+'/'
OUT=R+'rolex-web.html'
html=open(R+'index.html').read()
css=open(R+'assets/css/main.css').read()
site=open(R+'assets/js/site.js').read()
main=open(R+'assets/js/main.js').read()

imgs={}
def uri(name):
    if name not in imgs:
        imgs[name]='data:image/webp;base64,'+base64.b64encode(open(R+'assets/img/'+name+'.webp','rb').read()).decode()
    return imgs[name]

# anatomía: rutas dinámicas -> mapa de imágenes
main=main.replace('`assets/img/${a.img}.webp`','IMG[a.img]')
anat=re.findall(r'img: "(d-[a-z-]+)"', main)

legal_pages=[('aviso-legal','Aviso legal'),('privacidad','Política de privacidad'),('cookies','Política de cookies'),('condiciones','Condiciones de venta')]
sheets=''
for slug,title in legal_pages:
    p=open(R+slug+'.html').read()
    hero=re.search(r'<section class="legal-hero">.*?</section>',p,re.S).group(0)
    body=re.search(r'<div class="wrap legal">.*?</article>\s*</div>',p,re.S).group(0)
    sheets+=f'''
  <div class="legal-sheet" id="legal-{slug}" role="dialog" aria-modal="true" aria-label="{title}" hidden>
    <div class="legal-sheet__bar"><div class="wrap"><button type="button" class="link-u" data-close-legal><svg width="16" height="16"><use href="#i-left"/></svg>Volver a la web</button><span class="brand__word">ROLEX</span></div></div>
    {hero}
    {body}
  </div>'''

def fix_links(s):
    s=re.sub(r'href="(aviso-legal|privacidad|cookies|condiciones)\.html#([a-z-]+)"( target="_blank")?', r'href="#legal-\1" data-legal-anchor="\2"', s)
    s=re.sub(r'href="(aviso-legal|privacidad|cookies|condiciones)\.html"( target="_blank")?', r'href="#legal-\1"', s)
    s=s.replace('href="index.html#cita"','href="#cita" data-close-legal')
    return s
html=fix_links(html); sheets=fix_links(sheets)

legal_css='''
/* páginas legales embebidas */
.legal-sheet { position: fixed; inset: 0; z-index: 245; overflow-y: auto; overscroll-behavior: contain; background: var(--ivory); color: var(--on-light); animation: stepIn .6s var(--ease); }
.legal-sheet[hidden] { display: none; }
.legal-sheet__bar { position: sticky; top: 0; z-index: 2; background: rgba(244,241,234,.9); backdrop-filter: blur(14px); -webkit-backdrop-filter: blur(14px); border-bottom: 1px solid var(--line-light); }
.legal-sheet__bar .wrap { height: var(--header-h); display: flex; align-items: center; justify-content: space-between; }
.legal-sheet .legal-hero { padding-top: clamp(48px, 7vw, 96px); }
.legal-sheet .legal__toc { top: calc(var(--header-h) + 24px); }
'''
legal_js='''
/* páginas legales embebidas (versión de un solo archivo) */
(() => {
  let open = null;
  const show = (id, anchor) => {
    const el = document.getElementById(id); if (!el) return;
    if (open && open !== el) open.hidden = true;
    el.hidden = false; open = el; el.scrollTop = 0;
    document.body.classList.add("is-locked");
    ["drawer","checkout","quick"].forEach(x => { const m = document.getElementById(x); if (m && m.classList.contains("is-open")) m.querySelector("[data-close-modal],[data-close-quick],[data-close-drawer]")?.click(); });
    if (anchor) { const t = el.querySelector("#" + anchor); if (t) setTimeout(() => el.scrollTo({ top: t.offsetTop - 90 }), 30); }
    history.replaceState(null, "", "#" + id);
  };
  const hide = () => { if (!open) return; open.hidden = true; open = null; document.body.classList.remove("is-locked"); history.replaceState(null, "", location.pathname); };
  addEventListener("click", e => {
    const a = e.target.closest("a[href^='#'], [data-close-legal]"); if (!a) return;
    const href = a.getAttribute("href") || "";
    if (href.startsWith("#legal-")) { e.preventDefault(); e.stopImmediatePropagation(); show(href.slice(1), a.dataset.legalAnchor); return; }
    if (a.hasAttribute("data-close-legal")) { hide(); if (!href) { e.preventDefault(); e.stopImmediatePropagation(); } return; }
    const sheet = a.closest(".legal-sheet");
    if (sheet && href.length > 1) { const t = sheet.querySelector(href); if (t) { e.preventDefault(); e.stopImmediatePropagation(); sheet.scrollTo({ top: t.offsetTop - 90, behavior: "smooth" }); } }
  }, true);
  addEventListener("keydown", e => { if (e.key === "Escape" && open) hide(); });
  if (location.hash.startsWith("#legal-")) show(location.hash.slice(1));
})();
'''

css=css.replace('url("../img/d-movement.webp")', 'url("'+uri('d-movement')+'")')
css+=legal_css
img_map='window.IMG = '+json.dumps({n:uri(n) for n in sorted(set(anat))})+';\n'

def repl_paths(s):
    return re.sub(r'assets/img/([a-zA-Z0-9_-]+)\.webp', lambda m: uri(m.group(1)), s)
main=repl_paths(main); html=repl_paths(html)

html=html.replace('<link rel="preload" as="image" href="'+uri('submariner')+'">\n','')
html=re.sub(r'  <meta property="og:image"[^\n]*\n','',html)
html=html.replace('  <link rel="stylesheet" href="assets/css/main.css">','  <style>\n'+css+'\n  </style>')
html=html.replace('  <script src="assets/js/site.js"></script>\n  <script src="assets/js/main.js"></script>',
  '<script>\n'+img_map+'</script>\n<script>\n'+site+'\n</script>\n<script>\n'+main+'\n</script>\n<script>\n'+legal_js+'\n</script>')
html=html.replace('  <div class="lightbox" id="lightbox"', sheets.strip('\n')+'\n\n  <div class="lightbox" id="lightbox"',1)
assert 'assets/' not in html, [m for m in re.findall(r'.{40}assets/.{40}',html)][:5]
assert '.html"' not in html, re.findall(r'.{30}\.html".{10}',html)[:5]
open(OUT,'w').write(html)
print(OUT, round(os.path.getsize(OUT)/1024), 'KB', len(imgs),'imgs')

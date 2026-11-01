/**
 * Banner de consentimiento de cookies. Genera un fragmento autónomo (HTML +
 * JavaScript sin dependencias) que el cliente pega en su web. Principios:
 *  - Nada no necesario se ejecuta antes del consentimiento: los scripts se
 *    marcan con type="text/plain" y data-cookie-category, y se activan solo
 *    si se acepta su categoría.
 *  - «Rechazar» tiene el mismo nivel y el mismo estilo que «Aceptar» y está en
 *    la primera capa (guía de cookies de la AEPD); el consentimiento se puede retirar en cualquier momento.
 *  - La elección se guarda en una cookie técnica propia durante 12 meses y se
 *    vuelve a preguntar si cambia la configuración (versión).
 * Los textos son neutros y deben revisarse junto con la política de cookies.
 * El fragmento no incluye la marca Legalito (las agencias lo entregan a sus clientes).
 */

export type BannerCategoryId = "preferencias" | "analitica" | "publicitaria";

export interface BannerCategory {
  id: BannerCategoryId;
  label: string;
  description: string;
  /** Proveedores detectados en el formulario (solo informativo en el panel). */
  providers: string[];
}

export interface BannerOptions {
  siteName: string;
  policyUrl: string;
  categories: BannerCategory[];
  /** Color principal en hexadecimal (#RRGGBB). */
  color: string;
  position: "bar" | "box";
  /** Cambia cuando cambian las categorías: obliga a volver a pedir consentimiento. */
  version: string;
}

const PURPOSE: Record<BannerCategoryId, string> = {
  preferencias: "preferencias y contenidos integrados",
  analitica: "analítica",
  publicitaria: "publicidad",
};

function joinEs(items: string[]): string {
  return items.length <= 1 ? (items[0] ?? "") : `${items.slice(0, -1).join(", ")} y ${items.at(-1)}`;
}

export const CATEGORY_TEXT: Record<BannerCategoryId, { label: string; description: string }> = {
  preferencias: {
    label: "Preferencias y contenidos de terceros",
    description: "Permiten recordar tus preferencias y mostrar contenidos integrados de otros servicios, como vídeos o mapas.",
  },
  analitica: {
    label: "Analítica",
    description: "Nos ayudan a entender cómo se usa la web para mejorarla, con estadísticas de visitas.",
  },
  publicitaria: {
    label: "Publicidad",
    description: "Permiten medir nuestras campañas y mostrarte anuncios relacionados con tus intereses.",
  },
};

const ORDER: BannerCategoryId[] = ["preferencias", "analitica", "publicitaria"];
const KIND_TO_CATEGORY: Record<string, BannerCategoryId | undefined> = {
  Preferencias: "preferencias",
  Analítica: "analitica",
  Publicitaria: "publicitaria",
};

/** Categorías que requieren consentimiento a partir de la lista de cookies del documento. */
export function categoriesFromCookieList(list: { kind: string; provider: string }[]): BannerCategory[] {
  const found = new Map<BannerCategoryId, Set<string>>();
  for (const c of list) {
    const id = KIND_TO_CATEGORY[c.kind];
    if (!id) continue;
    if (!found.has(id)) found.set(id, new Set());
    found.get(id)!.add(c.provider);
  }
  return ORDER.filter((id) => found.has(id)).map((id) => ({ id, ...CATEGORY_TEXT[id], providers: [...found.get(id)!] }));
}

export function bannerVersion(categories: { id: string }[]): string {
  // Versión estable y legible: cambia solo si cambian las categorías.
  return `v1-${categories.map((c) => c.id).sort().join("-") || "none"}`;
}

const HEX = /^#[0-9a-fA-F]{6}$/;

export function normalizeOptions(o: BannerOptions): BannerOptions {
  return {
    ...o,
    siteName: o.siteName.trim().slice(0, 120) || "Este sitio web",
    policyUrl: /^(https?:\/\/|\/)[^\s"'<>]{0,300}$/.test(o.policyUrl.trim()) ? o.policyUrl.trim() : "/politica-de-cookies",
    color: HEX.test(o.color) ? o.color : "#1F3A5F",
    position: o.position === "box" ? "box" : "bar",
  };
}

/** JSON seguro para incrustar dentro de <script>. */
function scriptJson(v: unknown): string {
  const LS = String.fromCharCode(0x2028);
  const PS = String.fromCharCode(0x2029);
  return JSON.stringify(v).replace(/</g, "\\u003c").split(LS).join("\\u2028").split(PS).join("\\u2029");
}

/** Fragmento listo para pegar en el <head> de la web, antes de cualquier otro script. */
export function buildBannerSnippet(input: BannerOptions): string {
  const o = normalizeOptions(input);
  const config = {
    v: o.version,
    site: o.siteName,
    policy: o.policyUrl,
    color: o.color,
    pos: o.position,
    purposes: joinEs(o.categories.map((c) => PURPOSE[c.id])),
    cats: o.categories.map((c) => ({ id: c.id, label: c.label, desc: c.description })),
  };
  return `<!-- Consentimiento de cookies · pegar en <head> antes de otros scripts -->
<script>
(function () {
  var C = ${scriptJson(config)};
  var KEY = "cookie_consent", MAX_DAYS = 365, d = document, w = window;
  var mem = null; // Si el navegador bloquea las cookies, la elección se recuerda durante la visita.
  function read() {
    var s = mem;
    try {
      var m = d.cookie.match(new RegExp("(?:^|; )" + KEY + "=([^;]*)"));
      if (m) s = JSON.parse(decodeURIComponent(m[1]));
    } catch (e) {}
    if (!s || s.v !== C.v || Date.now() - s.t > MAX_DAYS * 864e5) return null;
    return s;
  }
  function write(cats) {
    var s = { v: C.v, t: Date.now(), c: cats };
    mem = s;
    try {
      d.cookie = KEY + "=" + encodeURIComponent(JSON.stringify(s)) + "; Max-Age=" + MAX_DAYS * 86400 + "; Path=/; SameSite=Lax" + (location.protocol === "https:" ? "; Secure" : "");
    } catch (e) {}
    return s;
  }
  function allowed(id) { var s = read(); return !!(s && s.c.indexOf(id) > -1); }
  function activate(cats) {
    var nodes = d.querySelectorAll('script[type="text/plain"][data-cookie-category]');
    for (var i = 0; i < nodes.length; i++) {
      var n = nodes[i];
      if (cats.indexOf(n.getAttribute("data-cookie-category")) < 0 || n.hasAttribute("data-cookie-activated")) continue;
      var s = d.createElement("script");
      for (var j = 0; j < n.attributes.length; j++) {
        var a = n.attributes[j];
        if (a.name !== "type" && a.name !== "data-cookie-category") s.setAttribute(a.name, a.value);
      }
      if (!n.src) s.text = n.text;
      n.setAttribute("data-cookie-activated", "");
      n.parentNode.insertBefore(s, n.nextSibling);
    }
    var frames = d.querySelectorAll("iframe[data-cookie-category][data-src]");
    for (var k = 0; k < frames.length; k++) {
      if (cats.indexOf(frames[k].getAttribute("data-cookie-category")) > -1 && !frames[k].src) frames[k].src = frames[k].getAttribute("data-src");
    }
    if (typeof w.gtag === "function") {
      w.gtag("consent", "update", {
        analytics_storage: cats.indexOf("analitica") > -1 ? "granted" : "denied",
        ad_storage: cats.indexOf("publicitaria") > -1 ? "granted" : "denied",
        ad_user_data: cats.indexOf("publicitaria") > -1 ? "granted" : "denied",
        ad_personalization: cats.indexOf("publicitaria") > -1 ? "granted" : "denied"
      });
    }
    try { w.dispatchEvent(new CustomEvent("cookieconsent", { detail: { categories: cats.slice() } })); } catch (e) {}
  }
  function esc(t) { return String(t).replace(/[&<>"']/g, function (c) { return "&#" + c.charCodeAt(0) + ";"; }); }
  var root, panel, lastFocus;
  function css() {
    if (d.getElementById("ccb-style")) return;
    var st = d.createElement("style");
    st.id = "ccb-style";
    st.textContent =
      ".ccb{position:fixed;z-index:2147483000;font:15px/1.5 system-ui,-apple-system,'Segoe UI',Roboto,Arial,sans-serif;color:#1d2533;background:#fff;box-shadow:0 10px 40px rgba(0,0,0,.18);box-sizing:border-box}" +
      ".ccb *{box-sizing:border-box}.ccb-bar{left:0;right:0;bottom:0;padding:18px 20px;border-top:1px solid #e3e6eb}" +
      ".ccb-box{left:16px;bottom:16px;max-width:420px;padding:20px;border-radius:14px;border:1px solid #e3e6eb}" +
      ".ccb-in{max-width:1100px;margin:0 auto;display:flex;flex-wrap:wrap;gap:14px 24px;align-items:center}.ccb-box .ccb-in{display:block}" +
      ".ccb-t{flex:1 1 420px;margin:0}.ccb-t strong{display:block;margin-bottom:2px}.ccb a{color:inherit;text-decoration:underline}" +
      ".ccb-btns{display:flex;flex-wrap:wrap;gap:8px}.ccb-box .ccb-btns{margin-top:14px}" +
      ".ccb button{font:inherit;font-weight:600;cursor:pointer;border-radius:8px;padding:9px 16px;border:2px solid " + C.color + ";background:" + C.color + ";color:#fff;min-height:42px}" +
      ".ccb button.ccb-sec{background:#fff;color:" + C.color + "}.ccb button:focus-visible{outline:3px solid #2F5D8C;outline-offset:2px}" +
      ".ccb-dlg{left:50%;top:50%;transform:translate(-50%,-50%);width:min(560px,calc(100% - 24px));max-height:calc(100% - 24px);overflow:auto;padding:24px;border-radius:14px}" +
      ".ccb-dlg h2{font-size:19px;margin:0 0 8px}.ccb-cat{border-top:1px solid #e3e6eb;padding:12px 0}.ccb-cat label{display:flex;gap:10px;align-items:flex-start;font-weight:600;cursor:pointer}" +
      ".ccb-cat input{width:20px;height:20px;margin-top:2px;accent-color:" + C.color + "}.ccb-cat p{margin:4px 0 0 30px;font-size:14px;color:#4b5563}" +
      ".ccb-back{position:fixed;inset:0;background:rgba(15,23,42,.45);z-index:2147482999}@media (max-width:600px){.ccb-box{left:8px;right:8px;max-width:none}.ccb-btns button{flex:1 1 auto}}";
    d.head.appendChild(st);
  }
  function close() {
    if (root) { root.remove(); root = null; }
    if (panel) { panel.remove(); panel = null; var b = d.getElementById("ccb-back"); if (b) b.remove(); }
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }
  function decide(cats) {
    var prev = read();
    var revoked = prev && prev.c.some(function (c) { return cats.indexOf(c) < 0; });
    write(cats);
    close();
    // Al retirar un consentimiento se recarga para que lo ya activado deje de ejecutarse.
    if (revoked) location.reload(); else activate(cats);
  }
  function all() { return C.cats.map(function (c) { return c.id; }); }
  function showBanner() {
    if (root || !C.cats.length) return;
    css();
    root = d.createElement("div");
    root.className = "ccb " + (C.pos === "box" ? "ccb-box" : "ccb-bar");
    root.setAttribute("role", "region");
    root.setAttribute("aria-label", "Consentimiento de cookies");
    root.innerHTML =
      '<div class="ccb-in"><p class="ccb-t"><strong>Usamos cookies</strong>' +
      esc(C.site) + " utiliza cookies propias y de terceros con fines de " + esc(C.purposes) +
      '. Puedes aceptarlas, rechazarlas o configurarlas. <a href="' + esc(C.policy) + '">Política de cookies</a></p>' +
      '<div class="ccb-btns"><button type="button" data-a="reject">Rechazar</button>' +
      '<button type="button" class="ccb-sec" data-a="config">Configurar</button>' +
      '<button type="button" data-a="accept">Aceptar</button></div></div>';
    root.addEventListener("click", function (e) {
      var a = e.target && e.target.getAttribute && e.target.getAttribute("data-a");
      if (a === "accept") decide(all());
      if (a === "reject") decide([]);
      if (a === "config") showSettings();
    });
    d.body.appendChild(root);
  }
  function showSettings() {
    if (panel) return;
    css();
    lastFocus = d.activeElement;
    if (root) { root.remove(); root = null; }
    var s = read(), cur = s ? s.c : [];
    var back = d.createElement("div");
    back.className = "ccb-back"; back.id = "ccb-back";
    panel = d.createElement("div");
    panel.className = "ccb ccb-dlg";
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-modal", "true");
    panel.setAttribute("aria-labelledby", "ccb-title");
    var h = '<h2 id="ccb-title">Configuración de cookies</h2><p>Elige qué cookies permites. Puedes cambiar tu elección cuando quieras. <a href="' + esc(C.policy) + '">Política de cookies</a></p>' +
      '<div class="ccb-cat"><label><input type="checkbox" checked disabled> Necesarias</label><p>Imprescindibles para que la web funcione y para recordar tu elección. No se pueden desactivar.</p></div>';
    C.cats.forEach(function (c) {
      h += '<div class="ccb-cat"><label><input type="checkbox" name="ccb" value="' + esc(c.id) + '"' + (cur.indexOf(c.id) > -1 ? " checked" : "") + "> " + esc(c.label) + "</label><p>" + esc(c.desc) + "</p></div>";
    });
    h += '<div class="ccb-btns" style="margin-top:12px"><button type="button" data-a="reject">Rechazar todas</button><button type="button" class="ccb-sec" data-a="save">Guardar selección</button><button type="button" data-a="accept">Aceptar todas</button></div>';
    panel.innerHTML = h;
    panel.addEventListener("click", function (e) {
      var a = e.target && e.target.getAttribute && e.target.getAttribute("data-a");
      if (a === "accept") decide(all());
      if (a === "reject") decide([]);
      if (a === "save") {
        var picked = [], boxes = panel.querySelectorAll('input[name="ccb"]');
        for (var i = 0; i < boxes.length; i++) if (boxes[i].checked) picked.push(boxes[i].value);
        decide(picked);
      }
    });
    panel.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && read()) { close(); return; }
      if (e.key !== "Tab") return;
      var f = panel.querySelectorAll("button, input:not([disabled]), a[href]");
      if (!f.length) return;
      if (e.shiftKey && d.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
      else if (!e.shiftKey && d.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
    });
    d.body.appendChild(back);
    d.body.appendChild(panel);
    var first = panel.querySelector('input[name="ccb"]') || panel.querySelector("button");
    if (first) first.focus();
  }
  w.cookieConsent = { open: showSettings, allowed: allowed, get: function () { var s = read(); return s ? s.c.slice() : null; } };
  d.addEventListener("click", function (e) {
    var t = e.target && e.target.closest && e.target.closest("[data-cookie-settings]");
    if (t) { e.preventDefault(); showSettings(); }
  });
  function init() { var s = read(); if (s) activate(s.c); else showBanner(); }
  if (d.readyState === "loading") d.addEventListener("DOMContentLoaded", init); else init();
})();
</script>`;
}

/** Ejemplos de cómo marcar los scripts para que esperen al consentimiento. */
export const TAGGING_EXAMPLES: { title: string; before: string; after: string }[] = [
  {
    title: "Google Analytics 4",
    before: `<script async src="https://www.googletagmanager.com/gtag/js?id=G-XXXX"></script>`,
    after: `<script type="text/plain" data-cookie-category="analitica" async src="https://www.googletagmanager.com/gtag/js?id=G-XXXX"></script>`,
  },
  {
    title: "Píxel de Meta u otro script en línea",
    before: `<script>\n  /* código del píxel */\n</script>`,
    after: `<script type="text/plain" data-cookie-category="publicitaria">\n  /* código del píxel */\n</script>`,
  },
  {
    title: "Vídeo de YouTube o mapa",
    before: `<iframe src="https://www.youtube.com/embed/ID"></iframe>`,
    after: `<iframe data-cookie-category="preferencias" data-src="https://www.youtube.com/embed/ID"></iframe>`,
  },
];

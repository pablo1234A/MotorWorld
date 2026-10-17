/* =========================================================================
   Comportamiento compartido (inicio + páginas legales):
   cabecera, menú móvil, revelado al hacer scroll, cookies, índice legal.
   ========================================================================= */
(() => {
  "use strict";

  const $ = (s, c = document) => c.querySelector(s);
  const $$ = (s, c = document) => [...c.querySelectorAll(s)];
  const store = {
    get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* almacenamiento no disponible */ } }
  };
  window.SITE = { $, $$, store };

  /* ---------------------------------------------------------------- cabecera */
  const header = $("#header");
  if (header) {
    let lastY = scrollY;
    const onScroll = () => {
      const y = scrollY;
      header.classList.toggle("is-solid", y > 40 && !document.body.classList.contains("in-dive"));
      const goingDown = y > lastY && y > 400;
      header.classList.toggle("is-hidden", goingDown && !document.body.classList.contains("menu-open"));
      lastY = y;

      // tema de la cabecera según la sección que tiene debajo
      if (!document.body.classList.contains("in-dive")) {
        const probe = document.elementFromPoint(innerWidth / 2, (header.offsetHeight || 70) + 4);
        const sec = probe && probe.closest("section, footer, .ticker");
        const light = sec && (sec.classList.contains("on-light") || sec.classList.contains("on-paper") || sec.classList.contains("legal-hero") || sec.closest(".legal-page"));
        header.classList.toggle("is-dark", !light && !!sec);
      }
    };
    addEventListener("scroll", onScroll, { passive: true });
    onScroll();
  }

  /* -------------------------------------------------------------- menú móvil */
  const menu = $("#menu"), menuBtn = $("#menuBtn");
  if (menu && menuBtn) {
    const setMenu = (open) => {
      menu.classList.toggle("is-open", open);
      menu.setAttribute("aria-hidden", String(!open));
      menuBtn.setAttribute("aria-expanded", String(open));
      menuBtn.setAttribute("aria-label", open ? "Cerrar menú" : "Abrir menú");
      menuBtn.querySelector("use").setAttribute("href", open ? "#i-close" : "#i-menu");
      if (!open) dispatchEvent(new Event("scroll"));
      document.body.classList.toggle("is-locked", open);
      document.body.classList.toggle("menu-open", open);
      header.classList.toggle("is-dark", open || header.classList.contains("is-dark"));
    };
    menuBtn.addEventListener("click", () => setMenu(!menu.classList.contains("is-open")));
    $$("a", menu).forEach(a => a.addEventListener("click", () => setMenu(false)));
    addEventListener("keydown", e => { if (e.key === "Escape" && menu.classList.contains("is-open")) setMenu(false); });
  }

  /* --------------------------------------------------- revelado progresivo */
  const reveal = new IntersectionObserver((entries) => {
    entries.forEach(en => {
      if (en.isIntersecting) { en.target.classList.add("is-in"); reveal.unobserve(en.target); }
    });
  }, { rootMargin: "0px 0px -8% 0px", threshold: .08 });
  $$("[data-reveal], .split-line").forEach(el => reveal.observe(el));
  window.SITE.reveal = reveal;

  /* ---------------------------------------------------------------- cookies */
  const ck = $("#cookies");
  if (ck) {
    const KEY = "rlx-consent-v1";
    const saved = store.get(KEY);
    const a = $("#ckAnalytics"), m = $("#ckMarketing");
    const show = (prefs) => {
      ck.classList.add("is-on"); ck.setAttribute("aria-hidden", "false");
      if (prefs) ck.classList.add("is-prefs");
      const cur = store.get(KEY);
      if (cur) { a.checked = !!cur.analytics; m.checked = !!cur.marketing; }
    };
    const hide = () => { ck.classList.remove("is-on", "is-prefs"); ck.setAttribute("aria-hidden", "true"); };
    const save = (analytics, marketing) => {
      store.set(KEY, { necessary: true, analytics, marketing, date: new Date().toISOString() });
      hide();
      document.dispatchEvent(new CustomEvent("consent", { detail: { analytics, marketing } }));
    };
    if (!saved) setTimeout(() => show(false), 2200);
    ck.addEventListener("click", e => {
      const b = e.target.closest("[data-ck]"); if (!b) return;
      const act = b.dataset.ck;
      if (act === "accept") save(true, true);
      if (act === "reject") save(false, false);
      if (act === "config") {
        if (ck.classList.contains("is-prefs")) save(a.checked, m.checked);
        else { ck.classList.add("is-prefs"); b.textContent = "Guardar preferencias"; }
      }
    });
    $$("[data-cookie-settings]").forEach(b => b.addEventListener("click", () => {
      show(true); const c = $('[data-ck="config"]', ck); if (c) c.textContent = "Guardar preferencias";
    }));
  }

  /* ------------------------------------------------- índice de páginas legales */
  const toc = $(".legal__toc");
  if (toc) {
    const links = $$("a", toc);
    const io = new IntersectionObserver(entries => {
      entries.forEach(en => {
        if (en.isIntersecting) links.forEach(l => l.classList.toggle("is-current", l.getAttribute("href") === "#" + en.target.id));
      });
    }, { rootMargin: "-20% 0px -70% 0px" });
    $$(".legal__body h2[id]").forEach(h => io.observe(h));
  }

  const y = $("#year"); if (y) y.textContent = new Date().getFullYear();
})();

/* =========================================================================
   ROLEX · SUBMARINER — Página de inicio
   1. Configuración y datos (productos, boutiques, anatomía)
   2. Precarga
   3. Inmersión: triple scroll (ensamblado → desmontaje → anatomía)
   4. Manifiesto, anatomía interactiva, historia horizontal
   5. Colección, cesta y checkout
   6. Reserva de cita, contacto y newsletter
   ========================================================================= */
(() => {
  "use strict";
  const { $, $$, store } = window.SITE;
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* =========================================================== 1 · DATOS */
  const CONFIG = {
    currency: new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }),
    // Si se indica una URL, los formularios envían un POST JSON a ella (Formspree, API propia, CRM…).
    endpoints: { booking: "", contact: "", order: "", newsletter: "" }
  };

  // Precios orientativos, IVA incluido. Cambie `img` cuando lleguen las fotografías de cada referencia.
  const PRODUCTS = {
    "126610LN": { name: "Submariner Date", sub: "Oystersteel · Bisel Cerachrom negro", price: 11350, img: "assets/img/submariner.webp", swatch: "#111" },
    "124060":   { name: "Submariner", sub: "Oystersteel · Sin fecha · Bisel negro", price: 10250, img: null, swatch: "#1a1a1a" },
    "126610LV": { name: "Submariner Date", sub: "Oystersteel · Bisel Cerachrom verde", price: 11750, img: null, swatch: "#0f5a3a" },
    "126619LB": { name: "Submariner Date", sub: "Oro blanco 18 ct · Bisel azul", price: 46100, img: null, swatch: "#1d3f86" }
  };
  const FAMILY = ["124060", "126610LV", "126619LB"];

  const BOUTIQUES = [
    { id: "mad", city: "Madrid", addr: "Calle de Serrano · Madrid", hours: "Lun–Sáb · 10:00–20:00" },
    { id: "bcn", city: "Barcelona", addr: "Passeig de Gràcia · Barcelona", hours: "Lun–Sáb · 10:00–20:00" },
    { id: "mbl", city: "Marbella", addr: "Puerto Banús · Marbella", hours: "Lun–Sáb · 10:30–21:00" }
  ];

  // Coordenadas en píxeles sobre assets/img/anatomy.webp (1224 × 1285)
  const ANATOMY = [
    { x: 705, y: 225, img: "d-bezel", t: "Bisel Cerachrom", d: "Bisel giratorio unidireccional graduado en 60 minutos. Su cerámica Cerachrom es prácticamente inrayable y su color no se altera con el agua salada ni con los rayos ultravioleta." },
    { x: 1015, y: 185, img: "d-crystal", t: "Cristal de zafiro", d: "Zafiro sintético prácticamente inrayable, con lente Cyclops que amplía dos veces y media la fecha para una lectura inmediata." },
    { x: 1005, y: 420, img: "d-gaskets", t: "Juntas de hermeticidad", d: "Juntas de alto rendimiento que, junto al fondo atornillado y la corona Triplock, garantizan la hermeticidad hasta 300 metros." },
    { x: 395, y: 210, img: "d-case", t: "Caja Oyster", d: "Carrura monobloque de 41 mm tallada en Oystersteel, una aleación de acero 904L reservada a Rolex, de brillo excepcional y gran resistencia a la corrosión." },
    { x: 385, y: 545, img: "d-dial", t: "Esfera", d: "Esfera negra lacada con índices aplicados en oro de 18 quilates rellenos de Chromalight, que emite una luz azul visible durante horas en la oscuridad." },
    { x: 640, y: 575, img: "d-hands", t: "Agujas", d: "Agujas de horas tipo Mercedes, símbolo del Submariner, y minutero de gran tamaño para leer el tiempo de inmersión de un vistazo." },
    { x: 1160, y: 580, img: "d-crown", t: "Corona Triplock", d: "Tres zonas de estanqueidad en la corona y su tubo. Se atornilla contra la caja como la escotilla de un submarino." },
    { x: 495, y: 830, img: "d-movement", t: "Calibre 3235", d: "Movimiento mecánico de carga automática íntegramente desarrollado y manufacturado por Rolex, con escape Chronergy patentado y unas 70 horas de reserva de marcha." },
    { x: 800, y: 770, img: "d-plates", t: "Platinas y puentes", d: "La arquitectura del calibre: platinas, puentes y rubíes sintéticos que reducen la fricción y aseguran la longevidad del mecanismo." },
    { x: 1020, y: 755, img: "d-balance", t: "Volante y espiral Parachrom", d: "La espiral Parachrom azul, de aleación paramagnética, es insensible a los campos magnéticos y hasta diez veces más precisa ante los golpes." },
    { x: 360, y: 1090, img: "d-caseback", t: "Fondo atornillado", d: "Fondo estriado que solo puede abrirse con una herramienta exclusiva de los relojeros de Rolex, sellando herméticamente el movimiento." },
    { x: 120, y: 640, img: "d-bracelet", t: "Brazalete Oyster", d: "Eslabones macizos de tres piezas con cierre Oysterlock de seguridad y extensión Glidelock, ajustable sin herramientas en pasos de 2 mm hasta 20 mm, ideal sobre un traje de neopreno." }
  ];

  const LAYERS = [
    { k: "bezel",    top: 0,   h: 117, side: "r", ax: 335, ay: 58,  name: "Bisel Cerachrom",   spec: "Cerámica inalterable · graduación 60 min" },
    { k: "crystal",  top: 117, h: 76,  side: "l", ax: 70,  ay: 38,  name: "Cristal de zafiro", spec: "Lente Cyclops sobre la fecha" },
    { k: "dial",     top: 193, h: 138, side: "r", ax: 312, ay: 69,  name: "Esfera",            spec: "Índices Chromalight en oro de 18 ct" },
    { k: "hands",    top: 331, h: 64,  side: "l", ax: 88,  ay: 30,  name: "Agujas",            spec: "Agujas Mercedes luminiscentes" },
    { k: "movement", top: 395, h: 181, side: "r", ax: 322, ay: 75,  name: "Calibre 3235",      spec: "Escape Chronergy · 70 h de reserva" },
    { k: "case",     top: 576, h: 180, side: "l", ax: 50,  ay: 82,  name: "Caja Oyster",       spec: "41 mm de Oystersteel · 300 m" },
    { k: "crown",    top: 590, h: 100, side: "r", ax: 262, ay: 46,  name: "Corona Triplock",   spec: "Triple sistema de hermeticidad", left: 332 },
    { k: "caseback", top: 756, h: 156, side: "r", ax: 306, ay: 58,  name: "Fondo atornillado", spec: "Cierre con herramienta exclusiva" },
    { k: "bracelet", top: 912, h: 383, side: "l", ax: 118, ay: 110, name: "Brazalete Oyster",  spec: "Oysterlock · extensión Glidelock" }
  ];
  const STAGE = { w: 620, h: 1295, cx: 192, cy: 650 };

  /* ===================================================== utilidades */
  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const ease = t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  const smooth = (a, b, v) => ease(clamp((v - a) / (b - a)));
  const money = n => CONFIG.currency.format(n);
  const mixRGB = (c1, c2, t) => `rgb(${c1.map((c, i) => Math.round(lerp(c, c2[i], t))).join(",")})`;
  const isMobile = () => innerWidth <= 760;

  let toastT;
  const toast = (msg) => {
    $("#toastTxt").textContent = msg;
    const t = $("#toast"); t.classList.add("is-on");
    clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove("is-on"), 3200);
  };

  const send = async (key, payload) => {
    const url = CONFIG.endpoints[key];
    if (!url) { await new Promise(r => setTimeout(r, 900)); return true; }
    const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify(payload) });
    if (!res.ok) throw new Error("HTTP " + res.status);
    return true;
  };
  const code = (prefix) => prefix + "-" + Date.now().toString(36).slice(-5).toUpperCase() + Math.random().toString(36).slice(2, 4).toUpperCase();

  /* =========================================================== 2 · PRECARGA */
  const preload = () => {
    const imgs = $$("#diveStage img, #diveWatch img");
    let done = 0;
    const bar = $("#loaderBar");
    const tick = () => { done++; bar.style.transform = `scaleX(${done / imgs.length})`; };
    const all = imgs.map(img => (img.decode ? img.decode() : Promise.resolve()).catch(() => {}).then(tick));
    const timeout = new Promise(r => setTimeout(r, 4000));
    Promise.race([Promise.all(all), timeout]).then(() => {
      setTimeout(() => {
        $("#loader").classList.add("is-done");
        document.body.classList.add("is-ready");
      }, 350);
    });
  };
  document.body.classList.add("is-locked");
  preload();
  addEventListener("load", () => document.body.classList.remove("is-locked"));
  setTimeout(() => document.body.classList.remove("is-locked"), 4500);

  /* ============================================ 3 · INMERSIÓN (triple scroll) */
  const dive = $("#inmersion");
  const D = {
    sticky: $("#diveSticky"), bg: $("#diveBg"), light: $("#diveLight"), glow: $("#diveGlow"),
    title: $("#diveTitle"), watch: $("#diveWatch"), stage: $("#diveStage"), labels: $("#diveLabels"),
    act1: $("#act1"), act2: $("#act2"), act3: $("#act3"),
    chapters: $$("#chapters li"), chaptersEl: $("#chapters"), gauge: $("#gauge"),
    depth: $("#depthVal"), gaugeBar: $("#gaugeBar"), canvas: $("#particles")
  };
  const header = $("#header");

  // ticks del profundímetro
  $("#gaugeTicks").innerHTML = Array.from({ length: 31 }, () => "<i></i>").join("");

  // capas + etiquetas
  const order = LAYERS.map((l, i) => ({ i, d: Math.abs(l.top + l.h / 2 - STAGE.cy) })).sort((a, b) => a.d - b.d);
  LAYERS.forEach((l, i) => {
    l.el = $(`.layer[data-layer="${l.k}"]`, D.stage);
    l.el.style.zIndex = 20 - i;
    l.rank = order.findIndex(o => o.i === i);
    l.c = l.top + l.h / 2;
    const tag = document.createElement("div");
    tag.className = "tag tag--" + l.side;
    tag.innerHTML = `<span class="tag__dot"></span><span class="tag__line"></span><span class="tag__txt"><span class="tag__n">${String(i + 1).padStart(2, "0")}</span><span class="tag__name">${l.name}</span><span class="tag__spec">${l.spec}</span></span>`;
    D.labels.appendChild(tag);
    l.tag = tag; l.line = $(".tag__line", tag);
  });

  let vw = innerWidth, vh = innerHeight, fit = 1, act3H = 0, act3Left = 0;
  const measure = () => {
    vw = innerWidth; vh = D.sticky.clientHeight || innerHeight;
    const hFit = (vh * (isMobile() ? .74 : .84)) / STAGE.h;
    const wFit = (vw / 2 - 10) / (STAGE.w - 25 - STAGE.cx); // la corona no debe salirse
    fit = Math.min(hFit, wFit);
    act3H = D.act3.offsetHeight;
    act3Left = vw - parseFloat(getComputedStyle(D.act3).right) - D.act3.offsetWidth;
    LAYERS.forEach(l => { l.tw = l.tag.offsetWidth; l.th = l.tag.offsetHeight; });
    const c = D.canvas, dpr = Math.min(devicePixelRatio || 1, 1.5);
    c.width = vw * dpr; c.height = vh * dpr; c.getContext("2d").setTransform(dpr, 0, 0, dpr, 0, 0);
    needs = true;
  };

  // partículas (plancton / burbujas)
  const P = Array.from({ length: reduced ? 0 : 70 }, () => ({
    x: Math.random(), y: Math.random(), r: Math.random() * 1.6 + .3, s: Math.random() * .00025 + .00006, a: Math.random() * .5 + .15, z: Math.random()
  }));
  const ctx = D.canvas.getContext("2d");
  const drawParticles = (p, alpha) => {
    ctx.clearRect(0, 0, vw, vh);
    if (alpha < .02) return;
    for (const q of P) {
      q.y -= q.s * (1 + q.z);
      if (q.y < -.05) { q.y = 1.05; q.x = Math.random(); }
      const y = ((q.y + p * (0.6 + q.z)) % 1.1) * vh;
      ctx.beginPath();
      ctx.arc(q.x * vw + Math.sin((q.y + q.z) * 9) * 8, y, q.r * (1 + q.z), 0, Math.PI * 2);
      ctx.fillStyle = `rgba(200,225,215,${q.a * alpha})`;
      ctx.fill();
    }
  };

  const IVORY = [244, 241, 234], ABYSS = [5, 7, 8];
  let target = 0, current = 0, needs = true, inView = true, counted = false, lastT = performance.now();

  const readScroll = () => {
    const r = dive.getBoundingClientRect();
    const total = dive.offsetHeight - vh;
    target = clamp(-r.top / total);
    const inside = r.top <= 0 && r.bottom > (header.offsetHeight || 70);
    document.body.classList.toggle("in-dive", inside || r.top > -10);
  };

  const render = (p) => {
    const m = isMobile();
    const bgT = smooth(.1, .3, p);

    // fondo: del marfil de superficie al negro abisal
    D.bg.style.backgroundColor = mixRGB(IVORY, ABYSS, bgT);
    D.light.style.opacity = bgT * (1 - smooth(.3, .9, p) * .75);
    D.glow.style.opacity = bgT * (.6 + .4 * smooth(.6, .9, p));
    D.canvas.style.opacity = bgT;

    // Acto I · título y reloj ensamblado
    const tOut = smooth(.02, .2, p);
    D.title.style.opacity = 1 - tOut;
    D.title.style.transform = `translateY(calc(-50% + ${-tOut * 12}vh)) scale(${1 + tOut * .12})`;
    D.title.style.letterSpacing = `${-0.02 + tOut * .12}em`;

    const wOut = smooth(.18, .3, p);
    const wScale = lerp(1, 1.06, smooth(0, .18, p)) * lerp(1, .9, wOut);
    D.watch.style.opacity = 1 - wOut;
    D.watch.style.transform = `translate(-50%, calc(-50% + ${-smooth(0, .18, p) * 2}vh)) scale(${wScale}) rotate(${-smooth(0, .2, p) * 4}deg)`;
    D.watch.style.filter = wOut > 0 ? `blur(${wOut * 6}px)` : "none";

    D.act1.style.opacity = 1 - smooth(.02, .1, p);
    D.act1.style.transform = `translateY(${smooth(.02, .1, p) * 20}px)`;

    // Escenario explosionado
    const zoomIn = lerp(1.45, 1, smooth(.24, .56, p));
    const a3 = smooth(.66, .8, p);
    const s3 = m ? Math.min(fit, Math.max(.2, (vh - act3H - (header.offsetHeight || 64) - 40) / STAGE.h)) / fit : .9;
    const s = fit * zoomIn * lerp(1, s3, a3);
    const r3 = m ? 0 : act3Left;
    const cx3 = m ? vw / 2 : Math.max(140 * fit * s3 + 24, Math.min(vw * .3, r3 - 40 - (STAGE.w - 25 - STAGE.cx) * fit * s3));
    const cxScreen = lerp(vw / 2, cx3, a3);
    const top3 = (header.offsetHeight || 64) + 16 + (STAGE.h * s) / 2;
    const cyScreen = lerp(vh / 2, m ? top3 : vh / 2, a3);
    const ox = cxScreen - STAGE.cx * s, oy = cyScreen - STAGE.cy * s;
    D.stage.style.transform = `translate3d(${ox}px, ${oy}px, 0) scale(${s})`;

    const layersIn = smooth(.2, .3, p);
    const labelsOut = m ? 1 - smooth(.62, .68, p) : 1 - smooth(.64, .7, p);
    for (const l of LAYERS) {
      const k = smooth(.22 + l.rank * .022, .46 + l.rank * .022, p);
      const dy = (STAGE.cy - l.c) * (1 - k) * .88;
      let dx = 0;
      if (l.k === "crown") dx = -(1 - smooth(.42, .58, p)) * 236;
      l.el.style.opacity = layersIn;
      l.el.style.transform = `translate3d(${dx}px, ${dy}px, 0)`;

      // etiqueta en coordenadas de pantalla
      const kl = l.k === "crown" ? smooth(.5, .62, p) : smooth(.55, .95, k);
      const op = kl * labelsOut * layersIn;
      const sx = ox + ((l.left || 0) + l.ax + dx) * s;
      const sy = oy + (l.top + l.ay + dy) * s;
      const gap = 10;
      let x = l.side === "r" ? sx + gap : sx - gap - l.tw;
      const offscreen = x < 4 || x + l.tw > vw - 4;
      l.tag.style.opacity = offscreen ? 0 : op;
      l.tag.style.transform = `translate3d(${x}px, ${sy - l.th / 2}px, 0)`;
      l.line.style.transform = `scaleX(${kl})`;
    }

    // Actos II y III
    const a2 = smooth(.3, .37, p) * (1 - smooth(.44, .5, p));
    D.act2.style.opacity = a2;
    D.act2.style.transform = `translateY(${(1 - smooth(.3, .37, p)) * 24 - smooth(.44, .5, p) * 24}px)`;
    D.act2.classList.toggle("is-live", a2 > .5);

    const a3in = smooth(.7, .8, p);
    D.act3.style.opacity = a3in;
    D.act3.style.transform = (m ? "" : "translateY(-50%) ") + `translateY(${(1 - a3in) * 30}px)`;
    D.act3.classList.toggle("is-live", a3in > .5);
    if (a3in > .5 && !counted) { counted = true; countUp(); }

    // riel de capítulos + profundímetro
    const ch = p < .28 ? 0 : p < .66 ? 1 : 2;
    D.chapters.forEach((li, i) => li.classList.toggle("is-on", i === ch));
    const ui = bgT > .5 ? "var(--on-dark)" : "var(--on-light)";
    D.chaptersEl.style.color = ui; D.gauge.style.color = ui;
    const uiIn = smooth(.06, .14, p);
    D.chaptersEl.style.opacity = uiIn;
    D.gauge.style.opacity = m ? uiIn * (1 - smooth(.66, .72, p)) : uiIn;
    const depth = Math.round(300 * smooth(.06, .82, p));
    D.depth.textContent = depth;
    D.gaugeBar.style.transform = `scaleY(${depth / 300})`;

    // cabecera
    if (document.body.classList.contains("in-dive")) {
      header.classList.toggle("is-dark", bgT > .45 || document.body.classList.contains("menu-open"));
      header.classList.remove("is-solid");
    }
    return bgT;
  };

  const countUp = () => {
    $$("[data-count]", D.act3).forEach(el => {
      const end = +el.dataset.count, t0 = performance.now(), dur = 1400;
      const step = (t) => {
        const k = clamp((t - t0) / dur);
        el.textContent = Math.round(end * (1 - Math.pow(1 - k, 3)));
        if (k < 1) requestAnimationFrame(step);
      };
      reduced ? (el.textContent = end) : requestAnimationFrame(step);
    });
  };

  new IntersectionObserver(([e]) => { inView = e.isIntersecting; if (inView) needs = true; }).observe(dive);

  let lastBg = 0;
  const loop = (t) => {
    const dt = Math.min(64, t - lastT); lastT = t;
    if (inView) {
      readScroll();
      const k = reduced ? 1 : 1 - Math.pow(1 - .11, dt / 16.67);
      const diff = target - current;
      if (Math.abs(diff) > .00005 || needs) {
        current = Math.abs(diff) < .00005 ? target : current + diff * k;
        lastBg = render(current);
        needs = false;
      }
      if (lastBg > .02 && P.length) drawParticles(current, lastBg);
    }
    requestAnimationFrame(loop);
  };
  measure();
  addEventListener("resize", () => { measure(); historyMeasure(); });
  requestAnimationFrame(loop);

  /* =================================================== 4 · MANIFIESTO */
  const mani = $("#manifesto");
  if (mani) {
    const wrapWords = (node) => {
      [...node.childNodes].forEach(n => {
        if (n.nodeType === 3) {
          const frag = document.createDocumentFragment();
          n.textContent.split(/(\s+)/).forEach(w => {
            if (!w) return;
            if (/^\s+$/.test(w)) frag.appendChild(document.createTextNode(w));
            else { const s = document.createElement("span"); s.className = "w"; s.textContent = w; frag.appendChild(s); }
          });
          n.replaceWith(frag);
        } else if (n.nodeType === 1) wrapWords(n);
      });
    };
    wrapWords(mani);
    const words = $$(".w", mani);
    const lit = () => {
      const r = mani.getBoundingClientRect();
      const k = clamp((innerHeight * .85 - r.top) / (r.height + innerHeight * .35));
      const n = Math.round(k * words.length);
      words.forEach((w, i) => w.classList.toggle("is-lit", i < n));
    };
    addEventListener("scroll", lit, { passive: true }); lit();
  }

  /* =================================================== ANATOMÍA */
  const fig = $("#anatomyFig");
  if (fig) {
    const list = $("#anaList");
    let cur = 0;
    ANATOMY.forEach((a, i) => {
      const b = document.createElement("button");
      b.className = "hotspot"; b.type = "button";
      b.style.left = (a.x / 1224 * 100) + "%"; b.style.top = (a.y / 1285 * 100) + "%";
      b.style.setProperty("--dl", (i * .23) + "s");
      b.setAttribute("aria-label", a.t);
      b.innerHTML = `<span class="hotspot__label">${a.t}</span>`;
      b.addEventListener("click", () => select(i));
      fig.appendChild(b); a.hs = b;

      const li = document.createElement("button");
      li.type = "button"; li.setAttribute("role", "tab");
      li.innerHTML = `<span>${String(i + 1).padStart(2, "0")}</span>${a.t}`;
      li.addEventListener("click", () => select(i));
      list.appendChild(li); a.li = li;
    });
    const thumb = $("#anaThumb"), img = $("#anaImg");
    const select = (i, silent) => {
      cur = (i + ANATOMY.length) % ANATOMY.length;
      const a = ANATOMY[cur];
      ANATOMY.forEach((x, j) => { x.hs.classList.toggle("is-active", j === cur); x.li.classList.toggle("is-active", j === cur); x.li.setAttribute("aria-selected", j === cur); });
      $("#anaIdx").textContent = `${String(cur + 1).padStart(2, "0")} / ${ANATOMY.length}`;
      $("#anaTitle").textContent = a.t;
      $("#anaDesc").textContent = a.d;
      if (silent) { img.src = `assets/img/${a.img}.webp`; img.alt = a.t; return; }
      thumb.classList.add("is-swap");
      setTimeout(() => { img.src = `assets/img/${a.img}.webp`; img.alt = a.t; img.onload = () => thumb.classList.remove("is-swap"); }, 250);
    };
    $("#anaPrev").addEventListener("click", () => select(cur - 1));
    $("#anaNext").addEventListener("click", () => select(cur + 1));
    select(0, true);
  }

  /* =================================================== HISTORIA (horizontal) */
  const hist = $("#historia"), track = $("#historyTrack"), hBar = $("#historyBar");
  let hDist = 0;
  function historyMeasure() {
    if (!hist) return;
    if (isMobile()) { hist.style.height = ""; track.style.transform = ""; hDist = 0; return; }
    hDist = Math.max(0, track.scrollWidth - innerWidth);
    hist.style.height = (innerHeight + hDist) + "px";
    historyScroll();
  }
  function historyScroll() {
    if (!hist || !hDist) return;
    const r = hist.getBoundingClientRect();
    const k = clamp(-r.top / hDist);
    track.style.transform = `translate3d(${-k * hDist}px,0,0)`;
    hBar.style.transform = `scaleX(${k})`;
  }
  addEventListener("scroll", historyScroll, { passive: true });
  addEventListener("load", historyMeasure);
  historyMeasure();

  /* =================================================== 5 · COLECCIÓN Y CESTA */
  $("#heroPrice").textContent = money(PRODUCTS["126610LN"].price);
  const sizeOut = $("#sizeOut");
  $$('input[name="size"]').forEach(r => r.addEventListener("change", () => { sizeOut.textContent = r.value; }));

  $("#cards").innerHTML = FAMILY.map((id, i) => {
    const p = PRODUCTS[id];
    const media = p.img
      ? `<img src="${p.img}" alt="Rolex ${p.name}, ${p.sub}" loading="lazy">`
      : `<img class="card__ghost" src="assets/img/submariner-sm.webp" alt="" loading="lazy"><span class="card__pending">Fotografía en preparación</span>`;
    return `<article class="card" data-reveal style="--d:${i * .08}s">
      <div class="card__media"><span class="card__dot" style="--sw:${p.swatch}"><i></i>${id}</span>${media}</div>
      <div class="card__body">
        <span class="card__ref">Oyster Perpetual</span>
        <h3 class="card__name">${p.name}</h3>
        <p class="muted" style="font-size:14px">${p.sub}</p>
        <div class="card__foot"><span class="card__price tnum">${money(p.price)}</span>
          <button class="card__add" data-add="${id}" aria-label="Añadir ${p.name} ${id} a la cesta"><svg><use href="#i-plus"/></svg></button>
        </div>
      </div>
    </article>`;
  }).join("");
  $$("#cards [data-reveal]").forEach(el => window.SITE.reveal.observe(el));

  const BAG_KEY = "rlx-bag-v1";
  let bag = (store.get(BAG_KEY) || []).filter(l => PRODUCTS[l.id]);
  const drawer = $("#drawer"), scrim = $("#scrim");
  const total = () => bag.reduce((s, l) => s + PRODUCTS[l.id].price, 0);

  const renderBag = () => {
    store.set(BAG_KEY, bag);
    const n = bag.length, cnt = $("#bagCount");
    cnt.textContent = n; cnt.classList.toggle("is-on", n > 0);
    const body = $("#drawerBody");
    if (!n) {
      body.innerHTML = `<div class="drawer__empty"><svg><use href="#i-bag"/></svg><p>Su cesta está vacía.</p><a class="link-u" href="#coleccion" data-close-drawer>Descubrir la colección</a></div>`;
    } else {
      body.innerHTML = bag.map((l, i) => {
        const p = PRODUCTS[l.id];
        return `<div class="line-item">
          <div class="line-item__img"><img src="${p.img || "assets/img/submariner-sm.webp"}" alt=""${p.img ? "" : ' style="opacity:.15;filter:grayscale(1)"'}></div>
          <div><span class="line-item__ref">Ref. ${l.id}</span><p class="line-item__name">${p.name}</p><p class="line-item__opt">${p.sub}<br>Muñeca: ${l.size}</p>
          <button class="line-item__rm" data-rm="${i}">Eliminar</button></div>
          <div class="line-item__price tnum">${money(p.price)}</div>
        </div>`;
      }).join("");
    }
    $("#drawerFoot").style.display = n ? "" : "none";
    $("#subTotal").textContent = money(total());
    $("#grandTotal").textContent = money(total());
  };

  let lastFocus = null;
  const openDrawer = () => {
    lastFocus = document.activeElement;
    drawer.classList.add("is-open"); scrim.classList.add("is-on");
    drawer.setAttribute("aria-hidden", "false"); document.body.classList.add("is-locked");
    setTimeout(() => drawer.focus(), 50);
  };
  const closeDrawer = () => {
    drawer.classList.remove("is-open"); drawer.setAttribute("aria-hidden", "true");
    if (!$("#checkout").classList.contains("is-open")) { scrim.classList.remove("is-on"); document.body.classList.remove("is-locked"); }
    if (lastFocus) lastFocus.focus({ preventScroll: true });
  };

  const addToBag = (id, btn) => {
    const size = id === "126610LN" ? ($('input[name="size"]:checked') || {}).value : "Ajuste en boutique";
    if (bag.some(l => l.id === id && l.size === size)) { toast("Esta referencia ya está en su cesta."); openDrawer(); return; }
    bag.push({ id, size });
    renderBag();
    const cnt = $("#bagCount"); cnt.classList.remove("is-bump"); void cnt.offsetWidth; cnt.classList.add("is-bump");
    flyToBag(btn, PRODUCTS[id].img);
    toast(`${PRODUCTS[id].name} · ${id} añadido a su cesta`);
    setTimeout(openDrawer, reduced ? 0 : 650);
  };

  // pequeña animación: la imagen vuela hasta la cesta
  const flyToBag = (btn, src) => {
    if (reduced || !btn) return;
    const from = (btn.closest(".product, .card") || btn).querySelector("img") || btn;
    const r1 = from.getBoundingClientRect(), r2 = $("#bagBtn").getBoundingClientRect();
    const ghost = document.createElement("img");
    ghost.src = src || "assets/img/submariner-sm.webp";
    Object.assign(ghost.style, { position: "fixed", zIndex: 300, left: r1.left + "px", top: r1.top + "px", width: r1.width + "px", height: r1.height + "px", objectFit: "contain", pointerEvents: "none", transition: "transform .8s cubic-bezier(.65,0,.35,1), opacity .8s" });
    document.body.appendChild(ghost);
    requestAnimationFrame(() => {
      const sc = 28 / Math.max(r1.width, r1.height);
      ghost.style.transformOrigin = "0 0";
      ghost.style.transform = `translate(${r2.left + 8 - r1.left}px, ${r2.top + 6 - r1.top}px) scale(${sc})`;
      ghost.style.opacity = ".2";
    });
    setTimeout(() => ghost.remove(), 850);
  };

  document.addEventListener("click", (e) => {
    const add = e.target.closest("[data-add]");
    if (add) { addToBag(add.dataset.add, add); return; }
    const rm = e.target.closest("[data-rm]");
    if (rm) { bag.splice(+rm.dataset.rm, 1); renderBag(); return; }
    if (e.target.closest("[data-close-drawer]")) { closeDrawer(); return; }
    if (e.target.closest("[data-close-modal]")) { closeCheckout(); return; }
    const z = e.target.closest("[data-zoom]");
    if (z) { const lb = $("#lightbox"); $("#lightboxImg").src = z.dataset.zoom; lb.classList.add("is-open"); lb.setAttribute("aria-hidden", "false"); return; }
    const bk = e.target.closest("[data-book]");
    if (bk) { const r2 = $("#r2"); if (r2) { r2.checked = true; r2.dispatchEvent(new Event("change", { bubbles: true })); } $("#bNotes").value = "Interés en Ref. " + bk.dataset.book; }
  });
  $("#bagBtn").addEventListener("click", openDrawer);
  scrim.addEventListener("click", () => { closeDrawer(); closeCheckout(); });
  $("#lightbox").addEventListener("click", function () { this.classList.remove("is-open"); this.setAttribute("aria-hidden", "true"); });
  addEventListener("keydown", e => {
    if (e.key !== "Escape") return;
    if ($("#checkout").classList.contains("is-open")) closeCheckout();
    else if (drawer.classList.contains("is-open")) closeDrawer();
    $("#lightbox").classList.remove("is-open");
  });
  renderBag();

  /* ---------------------------------------------------------- checkout */
  const modal = $("#checkout"), coForm = $("#checkoutForm");
  $("#oShop").innerHTML = BOUTIQUES.map(b => `<option value="${b.id}">${b.city} — ${b.addr}</option>`).join("");

  const openCheckout = () => {
    if (!bag.length) return;
    $("#miniItems").innerHTML = bag.map(l => {
      const p = PRODUCTS[l.id];
      return `<div class="mini-item"><img src="${p.img || "assets/img/submariner-sm.webp"}" alt=""${p.img ? "" : ' style="opacity:.2"'}><div><b>${p.name}</b>Ref. ${l.id} · ${l.size}</div><span class="tnum">${money(p.price)}</span></div>`;
    }).join("");
    $("#coSub").textContent = money(total()); $("#coTotal").textContent = money(total());
    coForm.style.display = ""; $("#orderOk").classList.remove("is-on");
    goStep(coForm, 1);
    drawer.classList.remove("is-open"); drawer.setAttribute("aria-hidden", "true");
    modal.classList.add("is-open"); modal.setAttribute("aria-hidden", "false"); scrim.classList.add("is-on");
    document.body.classList.add("is-locked");
    setTimeout(() => $("#oName").focus(), 300);
  };
  function closeCheckout() {
    if (!modal.classList.contains("is-open")) return;
    modal.classList.remove("is-open"); modal.setAttribute("aria-hidden", "true");
    scrim.classList.remove("is-on"); document.body.classList.remove("is-locked");
  }
  $("#checkoutBtn").addEventListener("click", openCheckout);

  $$('input[name="delivery"]').forEach(r => r.addEventListener("change", () => {
    const home = $('input[name="delivery"]:checked').value === "home";
    $("#addressFields").hidden = !home; $("#pickupFields").hidden = home;
  }));

  /* ------------------------------------------------ formularios: utilidades */
  const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  const setErr = (input, msg) => {
    const f = input.closest(".field, .check");
    if (!f) return !msg;
    f.classList.toggle("is-error", !!msg);
    const e = $(".field__err", f); if (e) e.textContent = msg || "";
    if (msg) input.setAttribute("aria-invalid", "true"); else input.removeAttribute("aria-invalid");
    return !msg;
  };
  const validate = (scope) => {
    let ok = true, first = null;
    $$("input, textarea, select", scope).forEach(inp => {
      if (inp.closest("[hidden]")) return;
      let msg = "";
      const v = (inp.value || "").trim();
      if (inp.type === "checkbox") { if (inp.required && !inp.checked) msg = "Obligatorio"; }
      else if (inp.required && !v) msg = "Campo obligatorio";
      else if (inp.type === "email" && v && !EMAIL.test(v)) msg = "Introduzca un correo válido";
      else if (inp.type === "tel" && v && v.replace(/\D/g, "").length < 9) msg = "Introduzca un teléfono válido";
      if (!setErr(inp, msg)) { ok = false; first = first || inp; }
    });
    if (first) first.focus();
    return ok;
  };
  $$("input, textarea").forEach(inp => inp.addEventListener("input", () => { if (inp.getAttribute("aria-invalid")) setErr(inp, ""); }));
  $$('.check input').forEach(inp => inp.addEventListener("change", () => setErr(inp, "")));

  const goStep = (form, n) => {
    $$(".step", form).forEach(s => s.classList.toggle("is-active", +s.dataset.step === n));
    $$(".steps-ind span", form).forEach((s, i) => s.classList.toggle("is-on", i < n));
    form.dataset.step = n;
  };
  const wireSteps = (form, beforeNext) => {
    form.addEventListener("click", e => {
      const n = +form.dataset.step || 1;
      if (e.target.closest("[data-next]")) {
        const step = $(`.step[data-step="${n}"]`, form);
        if (!validate(step) || (beforeNext && !beforeNext(n))) return;
        goStep(form, n + 1);
        const top = form.getBoundingClientRect().top;
        if (top < 0 && !form.closest(".modal")) scrollTo({ top: scrollY + top - 100, behavior: reduced ? "auto" : "smooth" });
      }
      if (e.target.closest("[data-prev]")) goStep(form, n - 1);
    });
  };
  const busy = (btn, on) => { btn.disabled = on; btn.dataset.label = btn.dataset.label || btn.innerHTML; btn.innerHTML = on ? "Enviando…" : btn.dataset.label; };

  wireSteps(coForm, (n) => {
    if (n === 2 && $('input[name="delivery"]:checked').value === "home") {
      const zip = $("#oZip");
      const ok = [$("#oAddr"), zip, $("#oCity")].map(i => setErr(i, i.value.trim() ? "" : "Campo obligatorio")).every(Boolean);
      if (ok && !/^\d{5}$/.test(zip.value.trim())) return setErr(zip, "Código postal de 5 dígitos");
      return ok;
    }
    return true;
  });
  coForm.addEventListener("submit", async e => {
    e.preventDefault();
    if (!validate($('.step[data-step="3"]', coForm))) return;
    const btn = $('button[type="submit"]', coForm); busy(btn, true);
    const fd = Object.fromEntries(new FormData(coForm));
    const id = code("RLX");
    try {
      await send("order", { ...fd, order: id, items: bag, total: total() });
      $("#orderCode").textContent = "Pedido " + id;
      $("#orderMsg").textContent = fd.payment === "Pasarela segura"
        ? "Hemos registrado su pedido. En la versión en producción será redirigido ahora a la pasarela bancaria segura."
        : fd.payment === "Transferencia"
          ? "Le hemos enviado por correo los datos para la transferencia. Su reloj queda reservado durante 72 horas."
          : "Su reloj queda reservado. Le esperamos en boutique para la entrega y el ajuste del brazalete.";
      coForm.style.display = "none"; $("#orderOk").classList.add("is-on");
      bag = []; renderBag(); coForm.reset(); $("#addressFields").hidden = true; $("#pickupFields").hidden = false;
    } catch { toast("No se ha podido enviar. Inténtelo de nuevo."); }
    busy(btn, false);
  });

  /* =================================================== 6 · RESERVA DE CITA */
  const bForm = $("#bookingForm");
  const shopOpts = $("#shopOpts");
  shopOpts.innerHTML = BOUTIQUES.map((b, i) => `<div class="opt"><input type="radio" name="shop" id="s-${b.id}" value="${b.city}"${i === 0 ? " checked" : ""}><label for="s-${b.id}"><b>${b.city}</b><small>${b.addr}</small></label></div>`).join("");
  $("#boutiqueList").innerHTML = BOUTIQUES.map(b => `<div class="boutique"><h3>${b.city}</h3><p>${b.addr} · ${b.hours}</p><a class="link-u" href="#cita" data-shop="${b.id}">Cita</a></div>`).join("");
  $$("[data-shop]").forEach(a => a.addEventListener("click", () => { const r = $("#s-" + a.dataset.shop); r.checked = true; r.dispatchEvent(new Event("change", { bubbles: true })); }));

  const booking = { date: null, time: null };
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const minDate = new Date(today); minDate.setDate(minDate.getDate() + 1);
  const maxDate = new Date(today); maxDate.setDate(maxDate.getDate() + 60);
  let view = new Date(minDate.getFullYear(), minDate.getMonth(), 1);
  const fmtMonth = new Intl.DateTimeFormat("es-ES", { month: "long", year: "numeric" });
  const fmtDay = new Intl.DateTimeFormat("es-ES", { weekday: "long", day: "numeric", month: "long" });

  const renderCal = () => {
    const mt = fmtMonth.format(view); $("#calMonth").textContent = mt.charAt(0).toUpperCase() + mt.slice(1);
    const first = (view.getDay() + 6) % 7; // lunes = 0
    const days = new Date(view.getFullYear(), view.getMonth() + 1, 0).getDate();
    let html = ["L", "M", "X", "J", "V", "S", "D"].map(d => `<span class="cal__dow">${d}</span>`).join("");
    html += "<span></span>".repeat(first);
    for (let d = 1; d <= days; d++) {
      const dt = new Date(view.getFullYear(), view.getMonth(), d);
      const off = dt < minDate || dt > maxDate || dt.getDay() === 0;
      const sel = booking.date && dt.getTime() === booking.date.getTime();
      const label = fmtDay.format(dt);
      html += `<button type="button" class="cal__day${sel ? " is-sel" : ""}${dt.getTime() === today.getTime() ? " is-today" : ""}" data-day="${d}" ${off ? "disabled" : ""} aria-label="${label}"${sel ? ' aria-pressed="true"' : ""}>${d}</button>`;
    }
    $("#calGrid").innerHTML = html;
    $("#calPrev").disabled = view <= new Date(minDate.getFullYear(), minDate.getMonth(), 1);
    $("#calNext").disabled = new Date(view.getFullYear(), view.getMonth() + 1, 1) > maxDate;
  };
  const renderSlots = () => {
    const box = $("#slots");
    if (!booking.date) { box.innerHTML = `<p class="slots__empty">Seleccione primero una fecha.</p>`; return; }
    const sat = booking.date.getDay() === 6;
    const base = sat ? ["10:00", "11:00", "12:00", "13:00"] : ["10:00", "11:00", "12:00", "13:00", "16:00", "17:00", "18:00", "19:00"];
    const seed = booking.date.getDate() * 7 + booking.date.getMonth() * 3;
    box.innerHTML = base.map((t, i) => {
      const taken = (seed + i * 5) % 7 === 0; // simulación de agenda ocupada
      return `<button type="button" class="slot${booking.time === t ? " is-sel" : ""}" data-time="${t}" ${taken ? "disabled aria-label=\"" + t + ", no disponible\"" : ""}>${t}</button>`;
    }).join("");
  };
  const renderSummary = () => {
    $("#sumReason").textContent = ($('input[name="reason"]:checked') || {}).value || "—";
    $("#sumShop").textContent = ($('input[name="shop"]:checked') || {}).value || "—";
    $("#sumDate").textContent = booking.date ? fmtDay.format(booking.date) : "—";
    $("#sumTime").textContent = booking.time || "—";
    $("#toStep3").disabled = !(booking.date && booking.time);
  };
  $("#calGrid").addEventListener("click", e => {
    const b = e.target.closest("[data-day]"); if (!b || b.disabled) return;
    booking.date = new Date(view.getFullYear(), view.getMonth(), +b.dataset.day); booking.time = null;
    renderCal(); renderSlots(); renderSummary();
  });
  $("#slots").addEventListener("click", e => {
    const b = e.target.closest("[data-time]"); if (!b || b.disabled) return;
    booking.time = b.dataset.time; renderSlots(); renderSummary();
  });
  $("#calPrev").addEventListener("click", () => { view = new Date(view.getFullYear(), view.getMonth() - 1, 1); renderCal(); });
  $("#calNext").addEventListener("click", () => { view = new Date(view.getFullYear(), view.getMonth() + 1, 1); renderCal(); });
  bForm.addEventListener("change", renderSummary);
  renderCal(); renderSummary();
  wireSteps(bForm);

  bForm.addEventListener("submit", async e => {
    e.preventDefault();
    if (!validate($('.step[data-step="3"]', bForm))) return;
    const btn = $('button[type="submit"]', bForm); busy(btn, true);
    const fd = Object.fromEntries(new FormData(bForm));
    const id = code("CITA");
    try {
      await send("booking", { ...fd, date: booking.date.toISOString().slice(0, 10), time: booking.time, code: id });
      $("#bookingCode").textContent = id;
      $("#bookingMsg").textContent = `${fmtDay.format(booking.date)} a las ${booking.time} en nuestra boutique de ${fd.shop}. Recibirá la confirmación en ${fd.email}.`;
      bForm.style.display = "none"; $("#bookingOk").classList.add("is-on");
    } catch { toast("No se ha podido enviar. Inténtelo de nuevo."); }
    busy(btn, false);
  });
  $("#bookingAgain").addEventListener("click", () => {
    bForm.reset(); booking.date = booking.time = null;
    renderCal(); renderSlots(); renderSummary(); goStep(bForm, 1);
    bForm.style.display = ""; $("#bookingOk").classList.remove("is-on");
  });

  /* ---------------------------------------------------------- contacto */
  const cForm = $("#contactForm");
  cForm.addEventListener("submit", async e => {
    e.preventDefault();
    if (!validate(cForm)) return;
    const btn = $('button[type="submit"]', cForm); busy(btn, true);
    try {
      await send("contact", Object.fromEntries(new FormData(cForm)));
      cForm.style.display = "none"; $("#contactOk").classList.add("is-on");
    } catch { toast("No se ha podido enviar. Inténtelo de nuevo."); }
    busy(btn, false);
  });

  /* ---------------------------------------------------------- newsletter */
  $("#newsForm").addEventListener("submit", async e => {
    e.preventDefault();
    const inp = $("#newsEmail"), msg = $("#newsMsg");
    if (!EMAIL.test(inp.value.trim())) { msg.textContent = "Introduzca un correo electrónico válido."; inp.focus(); return; }
    msg.textContent = "Enviando…";
    try { await send("newsletter", { email: inp.value.trim() }); msg.textContent = "Gracias. Revise su correo para confirmar la suscripción."; inp.value = ""; }
    catch { msg.textContent = "No se ha podido completar. Inténtelo de nuevo."; }
  });

  /* ---------------------------------------------------- navegación activa */
  const navLinks = $$(".nav a");
  const secIO = new IntersectionObserver(entries => {
    entries.forEach(en => {
      if (en.isIntersecting) navLinks.forEach(a => a.classList.toggle("is-current", a.getAttribute("href") === "#" + en.target.id));
    });
  }, { rootMargin: "-45% 0px -50% 0px" });
  ["inmersion", "anatomia", "coleccion", "historia"].forEach(id => { const s = document.getElementById(id); if (s) secIO.observe(s); });

  // desplazamiento suave a anclas (respetando la cabecera)
  document.addEventListener("click", e => {
    const a = e.target.closest('a[href^="#"]'); if (!a) return;
    const id = a.getAttribute("href").slice(1);
    const el = id === "top" ? document.body : document.getElementById(id);
    if (!el) return;
    e.preventDefault();
    const y = id === "top" ? 0 : el.getBoundingClientRect().top + scrollY;
    scrollTo({ top: y, behavior: reduced ? "auto" : "smooth" });
    history.replaceState(null, "", "#" + id);
  });
})();

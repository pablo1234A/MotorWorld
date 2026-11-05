/**
 * Stylesheet generator. Tokens come from the theme; every section background redefines the
 * local color variables so components adapt automatically (a card inside an inverse band
 * stays readable without per-component overrides).
 *
 * Motion follows Emil Kowalski's guidance: transform/opacity only, ease-out curves for
 * entrances, ≤ 600 ms, scale-on-press for buttons, everything disabled under
 * prefers-reduced-motion.
 */
import type { Theme } from "@/engine/schema";
import { contrast, ensureContrast, mix, readableOn } from "@/engine/util";

function stack(name: string, fallback: string) {
  return `"${name}", ${fallback}`;
}

export function themeVars(theme: Theme): string {
  const c = theme.colors;
  const r = theme.scale;
  // Fluid type scale: step n = base * r^n, clamped between mobile and desktop sizes.
  const step = (n: number) => {
    const max = 1.0625 * Math.pow(r, n);
    const min = Math.max(1, max * (n >= 4 ? 0.58 : n >= 2 ? 0.75 : 0.95));
    const vw = (max * 16) / 14.4;
    return `clamp(${min.toFixed(3)}rem, ${(vw * 0.55).toFixed(3)}vw + ${(min * 0.55).toFixed(3)}rem, ${max.toFixed(3)}rem)`;
  };
  const space = theme.density === "airy" ? 1.25 : theme.density === "compact" ? 0.78 : 1;
  const inverseBg = theme.mode === "dark" ? mix(c.text, c.bg, 0.06) : mix(c.text, c.bg, 0.02);
  const inverseText = readableOn(inverseBg, c.text, c.bg);
  const inverseMuted = ensureContrast(mix(inverseText, inverseBg, 0.35), inverseBg, 4.6);
  const accentText = readableOn(c.accent);
  const primarySoft = mix(c.bg, c.primary, theme.mode === "dark" ? 0.18 : 0.1);
  const onPrimaryMuted = ensureContrast(mix(c.primaryText, c.primary, 0.25), c.primary, 4.5);
  const linkOnBg = contrast(c.primary, c.bg) >= 4.5 ? c.primary : ensureContrast(c.primary, c.bg, 4.5);
  const display = theme.fonts.display;
  const serif = /Serif|Garamond|Playfair|Bodoni|Fraunces|Newsreader|Gloock|Young/i.test(display);
  return `:root{
--wb-bg:${c.bg};--wb-surface:${c.surface};--wb-text:${c.text};--wb-muted:${c.muted};--wb-border:${c.border};
--wb-primary:${c.primary};--wb-on-primary:${c.primaryText};--wb-on-primary-muted:${onPrimaryMuted};--wb-primary-soft:${primarySoft};
--wb-accent:${c.accent};--wb-on-accent:${accentText};--wb-link:${linkOnBg};
--wb-inverse:${inverseBg};--wb-on-inverse:${inverseText};--wb-on-inverse-muted:${inverseMuted};
--wb-font-display:${stack(display, serif ? "Georgia, 'Times New Roman', serif" : "ui-sans-serif, system-ui, sans-serif")};
--wb-font-body:${stack(theme.fonts.body, "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif")};
--wb-font-mono:${stack(theme.fonts.mono ?? "JetBrains Mono", "ui-monospace, 'SFMono-Regular', Menlo, monospace")};
--wb-radius:${theme.radius}px;--wb-radius-lg:${Math.round(theme.radius * 1.6)}px;--wb-radius-pill:${theme.radius >= 12 ? 999 : theme.radius}px;
--wb-space:${space};
--wb-s0:${step(0)};--wb-s1:${step(1)};--wb-s2:${step(2)};--wb-s3:${step(3)};--wb-s4:${step(4)};--wb-s5:${step(5)};--wb-s6:${step(6)};--wb-s7:${step(7)};
--wb-ease-out:cubic-bezier(.22,1,.36,1);--wb-ease-in-out:cubic-bezier(.65,0,.35,1);
--wb-heading-case:${theme.headingCase === "upper" ? "uppercase" : "none"};
--wb-heading-tracking:${theme.headingCase === "upper" ? "0.01em" : serif ? "-0.01em" : "-0.025em"};
--wb-heading-weight:${serif ? 400 : /Black|Anton|Archivo Black/.test(display) ? 400 : 600};
--wb-shadow:${theme.mode === "dark" ? "0 1px 0 rgba(255,255,255,.04) inset, 0 20px 50px -24px rgba(0,0,0,.7)" : "0 1px 2px rgba(16,16,20,.04), 0 18px 40px -24px rgba(16,16,20,.22)"};
color-scheme:${theme.mode};
}`;
}

export const BASE_CSS = String.raw`
*,*::before,*::after{box-sizing:border-box}
html{-webkit-text-size-adjust:100%;text-size-adjust:100%;scroll-behavior:smooth;scroll-padding-top:88px}
body{margin:0;background:var(--wb-bg);color:var(--wb-text);font-family:var(--wb-font-body);font-size:var(--wb-s0);line-height:1.6;-webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale;text-rendering:optimizeLegibility;overflow-x:hidden}
img,svg,video,canvas{display:block;max-width:100%}
img{height:auto}
a{color:inherit;text-decoration:none}
button,input,select,textarea{font:inherit;color:inherit}
:focus-visible{outline:2px solid var(--wb-primary);outline-offset:3px;border-radius:4px}
::selection{background:var(--wb-primary);color:var(--wb-on-primary)}
.wb-skip{position:absolute;left:-9999px;top:8px;z-index:1000;background:var(--wb-primary);color:var(--wb-on-primary);padding:10px 16px;border-radius:var(--wb-radius)}
.wb-skip:focus{left:12px}
.wb-sr{position:absolute!important;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}

/* ─── Section shells & color contexts ─── */
.wb-s{--c-bg:var(--wb-bg);--c-text:var(--wb-text);--c-muted:var(--wb-muted);--c-border:var(--wb-border);--c-card:var(--wb-surface);--c-btn:var(--wb-primary);--c-on-btn:var(--wb-on-primary);--c-link:var(--wb-link);
  position:relative;background:var(--c-bg);color:var(--c-text);padding-block:calc(var(--pad) * var(--wb-space))}
.wb-s.bg-surface{--c-bg:var(--wb-surface);--c-card:var(--wb-bg)}
.wb-s.bg-primary{--c-bg:var(--wb-primary);--c-text:var(--wb-on-primary);--c-muted:var(--wb-on-primary-muted);--c-border:color-mix(in srgb,var(--wb-on-primary) 22%,transparent);--c-card:color-mix(in srgb,var(--wb-on-primary) 8%,var(--wb-primary));--c-btn:var(--wb-on-primary);--c-on-btn:var(--wb-primary);--c-link:var(--wb-on-primary)}
.wb-s.bg-inverse{--c-bg:var(--wb-inverse);--c-text:var(--wb-on-inverse);--c-muted:var(--wb-on-inverse-muted);--c-border:color-mix(in srgb,var(--wb-on-inverse) 16%,transparent);--c-card:color-mix(in srgb,var(--wb-on-inverse) 6%,var(--wb-inverse));--c-link:var(--wb-on-inverse)}
.wb-s.bg-accent{--c-bg:var(--wb-accent);--c-text:var(--wb-on-accent);--c-muted:var(--wb-on-accent);--c-border:color-mix(in srgb,var(--wb-on-accent) 22%,transparent);--c-card:color-mix(in srgb,var(--wb-on-accent) 8%,var(--wb-accent));--c-btn:var(--wb-on-accent);--c-on-btn:var(--wb-accent);--c-link:var(--wb-on-accent)}
.pad-none{--pad:0rem}.pad-sm{--pad:2.5rem}.pad-md{--pad:4.5rem}.pad-lg{--pad:6.5rem}.pad-xl{--pad:9rem}
@media (max-width:720px){.pad-sm{--pad:2rem}.pad-md{--pad:3.25rem}.pad-lg{--pad:4.25rem}.pad-xl{--pad:5.5rem}}
.wb-c{width:min(100% - 2*clamp(1.25rem,4vw,3rem),1200px);margin-inline:auto}
.w-narrow .wb-c{max-width:760px}.w-wide .wb-c{max-width:1440px}.w-full .wb-c{width:100%;max-width:none}
.al-center .wb-head{text-align:center;margin-inline:auto}
.al-center .wb-head .wb-sub{margin-inline:auto}

/* ─── Typography ─── */
.wb-h{font-family:var(--wb-font-display);font-weight:var(--wb-heading-weight);letter-spacing:var(--wb-heading-tracking);text-transform:var(--wb-heading-case);line-height:1.06;margin:0;text-wrap:balance}
.wb-h1{font-size:var(--wb-s6);line-height:1}
.wb-h2{font-size:var(--wb-s4)}
.wb-h3{font-size:var(--wb-s2);line-height:1.2}
.wb-h4{font-size:var(--wb-s1);line-height:1.3}
.wb-eyebrow{display:inline-flex;align-items:center;gap:.6em;font-family:var(--wb-font-mono);font-size:.78rem;letter-spacing:.14em;text-transform:uppercase;color:var(--c-muted);margin:0 0 1.25rem}
.wb-eyebrow::before{content:"";width:1.6em;height:1px;background:currentColor;opacity:.7}
.al-center .wb-eyebrow::before{display:none}
.wb-sub{font-size:var(--wb-s1);color:var(--c-muted);max-width:42ch;margin:1.1rem 0 0;line-height:1.5;text-wrap:pretty}
.wb-body{color:var(--c-muted);max-width:60ch;margin:1rem 0 0;text-wrap:pretty}
.wb-head{max-width:46rem;margin-bottom:clamp(2.5rem,5vw,4rem)}
.wb-head-row{display:flex;justify-content:space-between;align-items:flex-end;gap:2rem;flex-wrap:wrap;margin-bottom:clamp(2.5rem,5vw,4rem)}
.wb-head-row .wb-head{margin-bottom:0}
.wb-mono{font-family:var(--wb-font-mono)}

/* ─── Buttons ─── */
.wb-ctas{display:flex;flex-wrap:wrap;gap:.75rem;margin-top:2.25rem}
.al-center .wb-ctas{justify-content:center}
.wb-btn{--h:3rem;display:inline-flex;align-items:center;justify-content:center;gap:.55em;height:var(--h);padding:0 1.4rem;border-radius:var(--wb-radius-pill);font-weight:600;font-size:.95rem;letter-spacing:-.005em;border:1px solid transparent;cursor:pointer;white-space:nowrap;
  transition:transform .16s var(--wb-ease-out),background-color .2s,color .2s,border-color .2s,box-shadow .2s;-webkit-tap-highlight-color:transparent;user-select:none}
.wb-btn:active{transform:scale(.97)}
.wb-btn-primary{background:var(--c-btn);color:var(--c-on-btn)}
.wb-btn-secondary{border-color:var(--c-border);color:var(--c-text);background:color-mix(in srgb,var(--c-text) 3%,transparent)}
.wb-btn-ghost{color:var(--c-text)}
.wb-btn-link{height:auto;padding:0;border-radius:0;color:var(--c-link);border-bottom:1px solid currentColor}
.wb-btn .wb-icon{width:1.05em;height:1.05em;transition:transform .2s var(--wb-ease-out)}
@media (hover:hover) and (pointer:fine){
  .wb-btn-primary:hover{box-shadow:0 10px 26px -12px color-mix(in srgb,var(--c-btn) 80%,transparent)}
  .wb-btn-secondary:hover{border-color:var(--c-text)}
  .wb-btn:hover .wb-icon{transform:translateX(2px)}
}

/* ─── Media ─── */
.wb-media{position:relative;overflow:hidden;border-radius:var(--wb-radius-lg);background:var(--c-card);isolation:isolate}
.wb-media img{width:100%;height:100%;object-fit:cover}
.wb-media figcaption,.wb-credit{position:absolute;right:.6rem;bottom:.5rem;font-size:.68rem;padding:.15rem .5rem;border-radius:99px;background:rgba(0,0,0,.45);color:#fff;backdrop-filter:blur(6px)}
.wb-credit a{text-decoration:underline}
.ar-hero{aspect-ratio:4/3.2}.ar-wide{aspect-ratio:16/9}.ar-sq{aspect-ratio:1}.ar-tall{aspect-ratio:4/5}

/* ─── Navbar ─── */
.wb-nav{position:sticky;top:0;z-index:50;padding-block:0;background:color-mix(in srgb,var(--c-bg) 82%,transparent);backdrop-filter:saturate(1.4) blur(14px);-webkit-backdrop-filter:saturate(1.4) blur(14px);border-bottom:1px solid transparent;transition:border-color .3s,background-color .3s}
.wb-nav.is-scrolled{border-bottom-color:var(--c-border)}
.wb-nav .wb-c{display:flex;align-items:center;justify-content:space-between;gap:1.5rem;height:72px}
.wb-logo{font-family:var(--wb-font-display);font-weight:var(--wb-heading-weight);font-size:1.3rem;letter-spacing:var(--wb-heading-tracking);text-transform:var(--wb-heading-case);white-space:nowrap;display:flex;align-items:center;gap:.55rem}
.wb-logo-mark{width:.7rem;height:.7rem;border-radius:var(--wb-radius-pill);background:var(--wb-primary);display:inline-block}
.wb-links{display:flex;align-items:center;gap:clamp(1rem,2.2vw,2rem);list-style:none;margin:0;padding:0}
.wb-links a{font-size:.92rem;color:var(--c-muted);transition:color .2s;position:relative;padding-block:.4rem}
.wb-links a:hover,.wb-links a[aria-current=page]{color:var(--c-text)}
.wb-links a[aria-current=page]::after{content:"";position:absolute;left:0;right:0;bottom:-2px;height:1px;background:currentColor}
.wb-nav .wb-btn{--h:2.5rem;padding:0 1.1rem;font-size:.88rem}
.wb-burger{display:none;width:44px;height:44px;border:1px solid var(--c-border);border-radius:var(--wb-radius-pill);background:transparent;align-items:center;justify-content:center;cursor:pointer}
.wb-nav-center .wb-c{display:grid;grid-template-columns:1fr auto 1fr}
.wb-nav-center .wb-logo{justify-self:center;grid-column:2}
.wb-nav-center .wb-links{grid-column:1;grid-row:1}
.wb-nav-center .wb-nav-end{grid-column:3;justify-self:end}
.wb-nav-floating{background:transparent;backdrop-filter:none;-webkit-backdrop-filter:none;border:0;padding-top:.9rem}
.wb-nav-floating .wb-c{height:60px;padding-inline:1.1rem .5rem;border:1px solid var(--c-border);border-radius:var(--wb-radius-pill);background:color-mix(in srgb,var(--c-bg) 78%,transparent);backdrop-filter:saturate(1.4) blur(14px);-webkit-backdrop-filter:saturate(1.4) blur(14px);box-shadow:var(--wb-shadow);width:min(100% - 2rem,1100px)}
.wb-nav-end{display:flex;align-items:center;gap:.6rem}
.wb-cart-btn{position:relative}
.wb-cart-count{position:absolute;top:-4px;right:-4px;min-width:18px;height:18px;border-radius:9px;background:var(--wb-primary);color:var(--wb-on-primary);font-size:.68rem;display:grid;place-items:center;padding:0 4px;font-weight:700}
@media (max-width:860px){
  .wb-burger{display:inline-flex}
  .wb-links{position:fixed;inset:72px 0 auto 0;flex-direction:column;align-items:stretch;gap:0;padding:.5rem clamp(1.25rem,4vw,3rem) 1.5rem;background:var(--c-bg);border-bottom:1px solid var(--c-border);
    transform:translateY(-8px);opacity:0;visibility:hidden;transition:transform .25s var(--wb-ease-out),opacity .2s,visibility .2s}
  .wb-links a{display:block;padding:1rem 0;font-size:1.1rem;border-bottom:1px solid var(--c-border);color:var(--c-text)}
  .wb-nav.is-open .wb-links{transform:none;opacity:1;visibility:visible}
  .wb-nav .wb-nav-end .wb-btn-primary{display:none}
  .wb-nav-center .wb-c{display:flex}
  .wb-nav-floating .wb-links{inset:84px 1rem auto 1rem;border:1px solid var(--c-border);border-radius:var(--wb-radius-lg)}
}

/* ─── Hero ─── */
.wb-hero{overflow:hidden}
.wb-hero-centered .wb-c{text-align:center;display:flex;flex-direction:column;align-items:center}
.wb-hero-centered .wb-sub{margin-inline:auto;max-width:38ch}
.wb-hero-centered .wb-ctas{justify-content:center}
.wb-hero-centered .wb-hero-media{margin-top:clamp(3rem,6vw,5rem);width:100%}
.wb-hero-centered .wb-media{aspect-ratio:16/8}
.wb-hero-split .wb-c{display:grid;grid-template-columns:1.05fr .95fr;gap:clamp(2rem,5vw,5rem);align-items:center}
.wb-hero-editorial .wb-h1{font-size:var(--wb-s7);line-height:.94}
.wb-hero-editorial .wb-hero-grid{display:grid;grid-template-columns:repeat(12,1fr);gap:1.5rem;align-items:end;margin-top:clamp(2.5rem,5vw,4.5rem)}
.wb-hero-editorial .wb-hero-grid .wb-media{grid-column:1/9;aspect-ratio:16/10}
.wb-hero-editorial .wb-hero-grid .wb-hero-aside{grid-column:9/13}
.wb-hero-editorial .wb-sub{margin-top:0}
.wb-hero-fullbleed{min-height:min(92svh,900px);display:flex;align-items:flex-end;--c-text:#fff;--c-muted:rgba(255,255,255,.78);--c-border:rgba(255,255,255,.3);--c-btn:#fff;--c-on-btn:#0b0b0c;color:#fff}
.wb-hero-fullbleed .wb-hero-bg{position:absolute;inset:0;z-index:0}
.wb-hero-fullbleed .wb-hero-bg img{width:100%;height:100%;object-fit:cover}
.wb-hero-fullbleed .wb-hero-bg::after{content:"";position:absolute;inset:0;background:linear-gradient(180deg,rgba(0,0,0,.15) 0%,rgba(0,0,0,.25) 40%,rgba(0,0,0,calc(.45 + var(--ov,.25))) 100%)}
.wb-hero-fullbleed .wb-c{position:relative;z-index:1}
.wb-hero-fullbleed .wb-h1{max-width:16ch}
.wb-hero-product .wb-c{text-align:center}
.wb-hero-product .wb-sub{margin-inline:auto}
.wb-hero-product .wb-ctas{justify-content:center}
.wb-hero-product .wb-device{margin:clamp(3rem,6vw,5rem) auto 0;max-width:1080px;border:1px solid var(--c-border);border-radius:calc(var(--wb-radius-lg) + 6px);padding:6px;background:linear-gradient(180deg,color-mix(in srgb,var(--c-text) 8%,transparent),transparent);box-shadow:var(--wb-shadow)}
.wb-hero-product .wb-device-bar{display:flex;gap:6px;padding:8px 10px}
.wb-hero-product .wb-device-bar i{width:9px;height:9px;border-radius:50%;background:var(--c-border)}
.wb-hero-product .wb-media{aspect-ratio:16/9;border-radius:var(--wb-radius-lg)}
.wb-hero-poster .wb-h1{font-size:clamp(3rem,12vw,11rem);line-height:.86;letter-spacing:-.03em;max-width:none;word-break:break-word}
.wb-hero-poster .wb-poster-row{display:grid;grid-template-columns:1fr 1fr;gap:2rem;margin-top:2.5rem;border-top:2px solid var(--c-text);padding-top:1.5rem}
.wb-hero-poster .wb-media{aspect-ratio:21/8;margin-top:2.5rem;border-radius:var(--wb-radius)}
@media (max-width:860px){
  .wb-hero-split .wb-c{grid-template-columns:1fr}
  .wb-hero-editorial .wb-hero-grid{grid-template-columns:1fr}
  .wb-hero-editorial .wb-hero-grid .wb-media,.wb-hero-editorial .wb-hero-grid .wb-hero-aside{grid-column:auto}
  .wb-hero-poster .wb-poster-row{grid-template-columns:1fr}
  .wb-hero-centered .wb-media{aspect-ratio:4/3}
}

/* ─── Logos & marquee ─── */
.wb-logos .wb-logo-row{display:flex;flex-wrap:wrap;justify-content:space-between;gap:1.5rem 3rem;align-items:center}
.wb-logo-word{font-family:var(--wb-font-display);font-size:1.35rem;letter-spacing:-.02em;color:var(--c-muted);opacity:.85;white-space:nowrap}
.wb-marquee-track{display:flex;gap:3rem;width:max-content;animation:wb-marquee var(--dur,38s) linear infinite}
.wb-marquee-wrap{overflow:hidden;mask-image:linear-gradient(90deg,transparent,#000 8%,#000 92%,transparent);-webkit-mask-image:linear-gradient(90deg,transparent,#000 8%,#000 92%,transparent)}
.wb-marquee-wrap:hover .wb-marquee-track{animation-play-state:paused}
.wb-marquee .wb-marquee-word{font-family:var(--wb-font-display);font-size:var(--wb-s5);line-height:1.1;white-space:nowrap;display:inline-flex;align-items:center;gap:3rem;text-transform:var(--wb-heading-case)}
.wb-marquee .wb-marquee-word::after{content:"";width:.35em;height:.35em;border-radius:50%;background:var(--wb-primary)}
@keyframes wb-marquee{to{transform:translateX(-50%)}}

/* ─── Features ─── */
.wb-grid{display:grid;gap:clamp(1rem,2vw,1.5rem)}
.wb-features-grid .wb-grid{grid-template-columns:repeat(auto-fit,minmax(min(100%,250px),1fr))}
.wb-card{background:var(--c-card);border:1px solid var(--c-border);border-radius:var(--wb-radius-lg);padding:clamp(1.4rem,2.5vw,2rem);transition:transform .25s var(--wb-ease-out),border-color .25s}
@media (hover:hover) and (pointer:fine){.wb-card-hover:hover{transform:translateY(-3px);border-color:color-mix(in srgb,var(--c-text) 30%,var(--c-border))}}
.wb-ic{width:2.75rem;height:2.75rem;display:grid;place-items:center;border-radius:calc(var(--wb-radius) + 4px);background:var(--wb-primary-soft);color:var(--wb-primary);margin-bottom:1.25rem}
.bg-primary .wb-ic,.bg-inverse .wb-ic,.bg-accent .wb-ic{background:color-mix(in srgb,var(--c-text) 10%,transparent);color:var(--c-text)}
.wb-card .wb-h4{margin-bottom:.5rem}
.wb-card p{margin:0;color:var(--c-muted);font-size:.97rem}
.wb-features-bento .wb-grid{grid-template-columns:repeat(6,1fr);grid-auto-rows:minmax(200px,auto)}
.wb-features-bento .wb-card:nth-child(1){grid-column:span 4;grid-row:span 2;display:flex;flex-direction:column;justify-content:flex-end;background:linear-gradient(160deg,var(--wb-primary-soft),var(--c-card) 60%)}
.wb-features-bento .wb-card:nth-child(1) .wb-h4{font-size:var(--wb-s3);font-family:var(--wb-font-display);line-height:1.1}
.wb-features-bento .wb-card:nth-child(2),.wb-features-bento .wb-card:nth-child(3){grid-column:span 2}
.wb-features-bento .wb-card:nth-child(n+4){grid-column:span 2}
.wb-features-list .wb-feature-row{display:grid;grid-template-columns:5rem 1fr 1.3fr;gap:2rem;padding:2rem 0;border-top:1px solid var(--c-border);align-items:baseline}
.wb-features-list .wb-feature-row:last-child{border-bottom:1px solid var(--c-border)}
.wb-features-list .wb-num{font-family:var(--wb-font-mono);color:var(--c-muted);font-size:.85rem}
.wb-features-list .wb-feature-row p{margin:0;color:var(--c-muted)}
@media (max-width:860px){
  .wb-features-bento .wb-grid{grid-template-columns:1fr}
  .wb-features-bento .wb-card{grid-column:auto!important;grid-row:auto!important}
  .wb-features-list .wb-feature-row{grid-template-columns:1fr;gap:.5rem}
}

/* ─── Showcase ─── */
.wb-showcase .wb-split{display:grid;grid-template-columns:1fr 1fr;gap:clamp(2rem,6vw,6rem);align-items:center}
.wb-showcase.is-flipped .wb-split>.wb-media{order:2}
.wb-showcase .wb-media{aspect-ratio:5/4}
.wb-showcase-offset .wb-split{grid-template-columns:1.25fr 1fr}
.wb-showcase-offset .wb-media{aspect-ratio:4/5;transform:translateY(var(--parallax,0))}
.wb-showcase-offset .wb-split>div:not(.wb-media){padding-block:2rem}
@media (max-width:860px){.wb-showcase .wb-split,.wb-showcase-offset .wb-split{grid-template-columns:1fr}.wb-showcase.is-flipped .wb-split>.wb-media{order:0}}

/* ─── Steps ─── */
.wb-steps-numbered .wb-grid{grid-template-columns:repeat(auto-fit,minmax(min(100%,240px),1fr));counter-reset:step}
.wb-step{border-top:1px solid var(--c-border);padding-top:1.5rem}
.wb-step-n{font-family:var(--wb-font-display);font-size:var(--wb-s4);line-height:1;color:var(--wb-primary);display:block;margin-bottom:1rem}
.bg-primary .wb-step-n,.bg-inverse .wb-step-n{color:var(--c-text)}
.wb-step p{margin:.5rem 0 0;color:var(--c-muted)}
.wb-steps-rail .wb-rail{position:relative;display:grid;gap:2.5rem;padding-left:2.5rem}
.wb-steps-rail .wb-rail::before{content:"";position:absolute;left:.55rem;top:.5rem;bottom:.5rem;width:1px;background:var(--c-border)}
.wb-steps-rail .wb-rail-fill{position:absolute;left:.55rem;top:.5rem;width:1px;height:calc((100% - 1rem) * var(--progress,0));background:var(--wb-primary);transition:height .1s linear}
.wb-steps-rail .wb-step{border:0;padding:0;position:relative}
.wb-steps-rail .wb-step::before{content:"";position:absolute;left:-2.5rem;top:.45rem;width:1.15rem;height:1.15rem;border-radius:50%;border:1px solid var(--c-border);background:var(--c-bg)}

/* ─── Stats ─── */
.wb-stats-row .wb-grid{grid-template-columns:repeat(auto-fit,minmax(min(100%,180px),1fr));gap:0}
.wb-stats-row .wb-stat{padding:1rem 1.5rem;border-left:1px solid var(--c-border)}
.wb-stats-row .wb-stat:first-child{border-left:0;padding-left:0}
.wb-stat-v{font-family:var(--wb-font-display);font-size:var(--wb-s5);line-height:1;letter-spacing:-.03em;display:block;font-variant-numeric:tabular-nums}
.wb-stat-l{color:var(--c-muted);margin-top:.6rem;display:block;font-size:.95rem}
.wb-stats-cards .wb-grid{grid-template-columns:repeat(auto-fit,minmax(min(100%,220px),1fr))}
@media (max-width:720px){.wb-stats-row .wb-stat{border-left:0;padding-left:0;border-top:1px solid var(--c-border);padding-top:1.25rem}}

/* ─── Gallery ─── */
.wb-gallery-grid .wb-grid{grid-template-columns:repeat(auto-fill,minmax(min(100%,320px),1fr))}
.wb-gallery-masonry .wb-masonry{columns:3 280px;column-gap:1.25rem}
.wb-gallery-masonry .wb-tile{break-inside:avoid;margin-bottom:1.25rem}
.wb-gallery-masonry .wb-tile:nth-child(3n+1) .wb-media{aspect-ratio:4/5}
.wb-gallery-masonry .wb-tile:nth-child(3n+2) .wb-media{aspect-ratio:1}
.wb-gallery-masonry .wb-tile:nth-child(3n) .wb-media{aspect-ratio:4/3}
.wb-gallery-scroller .wb-scroller{display:grid;grid-auto-flow:column;grid-auto-columns:min(78%,440px);gap:1.25rem;overflow-x:auto;scroll-snap-type:x mandatory;padding-bottom:1rem;overscroll-behavior-x:contain;scrollbar-width:thin}
.wb-gallery-scroller .wb-tile{scroll-snap-align:start}
.wb-tile .wb-media{aspect-ratio:4/3}
.wb-tile .wb-media img{transition:transform .8s var(--wb-ease-out)}
@media (hover:hover) and (pointer:fine){.wb-tile:hover .wb-media img{transform:scale(1.04)}}
.wb-tile-meta{display:flex;justify-content:space-between;gap:1rem;margin-top:.85rem;font-size:.95rem}
.wb-tile-meta span:last-child{color:var(--c-muted);font-family:var(--wb-font-mono);font-size:.8rem}

/* ─── Testimonials ─── */
.wb-quote{margin:0}
.wb-quote blockquote{margin:0;font-size:var(--wb-s1);line-height:1.45;text-wrap:pretty}
.wb-quote figcaption{margin-top:1.4rem;display:flex;align-items:center;gap:.8rem;font-size:.92rem}
.wb-avatar{width:2.5rem;height:2.5rem;border-radius:50%;display:grid;place-items:center;background:var(--wb-primary-soft);color:var(--wb-primary);font-weight:700;font-size:.85rem;flex:none}
.wb-quote figcaption span{color:var(--c-muted);display:block}
.wb-testimonials-grid .wb-grid{grid-template-columns:repeat(auto-fit,minmax(min(100%,300px),1fr))}
.wb-testimonials-single .wb-quote{max-width:56rem}
.wb-testimonials-single .wb-quote blockquote{font-family:var(--wb-font-display);font-size:var(--wb-s4);line-height:1.15;letter-spacing:var(--wb-heading-tracking)}
.wb-testimonials-single .wb-quote-more{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,280px),1fr));gap:2rem;margin-top:4rem;padding-top:2.5rem;border-top:1px solid var(--c-border)}
.wb-testimonials-marquee .wb-marquee-track{gap:1.25rem}
.wb-testimonials-marquee .wb-card{width:min(80vw,380px)}

/* ─── Pricing ─── */
.wb-pricing .wb-grid{grid-template-columns:repeat(auto-fit,minmax(min(100%,280px),1fr));align-items:stretch}
.wb-plan{display:flex;flex-direction:column;gap:1.25rem;position:relative}
.wb-plan.is-featured{border-color:var(--wb-primary);box-shadow:0 0 0 1px var(--wb-primary),var(--wb-shadow)}
.wb-plan-badge{position:absolute;top:-.75rem;left:1.5rem;background:var(--wb-primary);color:var(--wb-on-primary);font-size:.72rem;font-weight:700;letter-spacing:.04em;padding:.3rem .7rem;border-radius:99px}
.wb-price{font-family:var(--wb-font-display);font-size:var(--wb-s5);line-height:1;letter-spacing:-.03em}
.wb-price small{font-family:var(--wb-font-body);font-size:.9rem;color:var(--c-muted);letter-spacing:0;margin-left:.25rem}
.wb-checks{list-style:none;margin:0;padding:0;display:grid;gap:.7rem;font-size:.95rem}
.wb-checks li{display:flex;gap:.6rem;align-items:flex-start}
.wb-checks .wb-icon{color:var(--wb-primary);flex:none;margin-top:.15rem;width:18px;height:18px}
.wb-plan .wb-btn{margin-top:auto;width:100%}
.wb-pricing-compact .wb-plan{flex-direction:row;align-items:center;justify-content:space-between;flex-wrap:wrap}
.wb-pricing-compact .wb-grid{grid-template-columns:1fr}

/* ─── Products ─── */
.wb-products .wb-grid{grid-template-columns:repeat(auto-fill,minmax(min(100%,260px),1fr));gap:clamp(1.25rem,2.5vw,2rem)}
.wb-product{display:flex;flex-direction:column;gap:.9rem}
.wb-product .wb-media{aspect-ratio:4/5}
.wb-product-info{display:flex;justify-content:space-between;gap:1rem;align-items:flex-start}
.wb-product-info h3{font-size:1.02rem;font-weight:600;margin:0;font-family:var(--wb-font-body);letter-spacing:-.01em}
.wb-product-info p{margin:.25rem 0 0;color:var(--c-muted);font-size:.9rem}
.wb-product-price{font-variant-numeric:tabular-nums;font-weight:600;white-space:nowrap}
.wb-badge{position:absolute;top:.75rem;left:.75rem;z-index:2;background:var(--c-bg);color:var(--c-text);font-size:.72rem;font-weight:600;padding:.3rem .65rem;border-radius:99px;letter-spacing:.01em}
.wb-add{--h:2.6rem;width:100%}
.wb-products-inventory .wb-grid{grid-template-columns:repeat(auto-fill,minmax(min(100%,330px),1fr))}
.wb-products-inventory .wb-media{aspect-ratio:16/10}
.wb-products-inventory .wb-product{background:var(--c-card);border:1px solid var(--c-border);border-radius:var(--wb-radius-lg);padding:.6rem .6rem 1.25rem}
.wb-products-inventory .wb-product-body{padding:0 .75rem;display:grid;gap:.9rem}
.wb-specs{display:grid;grid-template-columns:1fr 1fr;gap:.5rem 1rem;font-size:.85rem;color:var(--c-muted);font-family:var(--wb-font-mono);padding:.9rem 0;border-block:1px solid var(--c-border)}
.wb-products-inventory .wb-product-price{font-family:var(--wb-font-display);font-size:var(--wb-s3);letter-spacing:-.02em}
.wb-products-courses .wb-product{background:var(--c-card);border:1px solid var(--c-border);border-radius:var(--wb-radius-lg);padding:1.5rem;gap:1.1rem}
.wb-products-courses .wb-media{display:none}
.wb-level{font-family:var(--wb-font-mono);font-size:.75rem;letter-spacing:.1em;text-transform:uppercase;color:var(--wb-primary)}
.wb-filters{display:flex;gap:.5rem;flex-wrap:wrap;margin-bottom:2rem}
.wb-chip{border:1px solid var(--c-border);background:transparent;border-radius:99px;padding:.5rem 1rem;font-size:.88rem;cursor:pointer;transition:background-color .2s,color .2s,border-color .2s}
.wb-chip[aria-pressed=true]{background:var(--c-text);color:var(--c-bg);border-color:var(--c-text)}

/* ─── Cart drawer ─── */
.wb-cart{position:fixed;inset:0;z-index:100;visibility:hidden}
.wb-cart.is-open{visibility:visible}
.wb-cart-scrim{position:absolute;inset:0;background:rgba(0,0,0,.45);opacity:0;transition:opacity .25s}
.wb-cart.is-open .wb-cart-scrim{opacity:1}
.wb-cart-panel{position:absolute;right:0;top:0;bottom:0;width:min(100%,420px);background:var(--wb-bg);color:var(--wb-text);border-left:1px solid var(--wb-border);display:flex;flex-direction:column;transform:translateX(100%);transition:transform .35s var(--wb-ease-out)}
.wb-cart.is-open .wb-cart-panel{transform:none}
.wb-cart-head{display:flex;justify-content:space-between;align-items:center;padding:1.25rem 1.5rem;border-bottom:1px solid var(--wb-border)}
.wb-cart-items{flex:1;overflow:auto;padding:1rem 1.5rem;display:grid;align-content:start;gap:1rem}
.wb-cart-line{display:grid;grid-template-columns:1fr auto;gap:.25rem 1rem;padding-bottom:1rem;border-bottom:1px solid var(--wb-border)}
.wb-qty{display:inline-flex;align-items:center;border:1px solid var(--wb-border);border-radius:99px}
.wb-qty button{width:2rem;height:2rem;border:0;background:transparent;cursor:pointer}
.wb-cart-foot{padding:1.25rem 1.5rem;border-top:1px solid var(--wb-border);display:grid;gap:.9rem}
.wb-cart-total{display:flex;justify-content:space-between;font-weight:600}
.wb-cart-note{font-size:.8rem;color:var(--wb-muted);margin:0}
.wb-icon-btn{width:2.5rem;height:2.5rem;border-radius:50%;border:1px solid var(--c-border,var(--wb-border));background:transparent;display:inline-grid;place-items:center;cursor:pointer;transition:transform .16s var(--wb-ease-out)}
.wb-icon-btn:active{transform:scale(.94)}

/* ─── Menu ─── */
.wb-menu-cat{font-family:var(--wb-font-mono);font-size:.78rem;letter-spacing:.14em;text-transform:uppercase;color:var(--c-muted);margin:0 0 1rem;padding-bottom:.75rem;border-bottom:1px solid var(--c-border)}
.wb-menu-columns .wb-menu-groups{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,340px),1fr));gap:3rem 4rem}
.wb-dish{display:grid;grid-template-columns:1fr auto;gap:.15rem 1.5rem;padding:.9rem 0}
.wb-dish h3{margin:0;font-size:1.08rem;font-weight:600;font-family:var(--wb-font-body)}
.wb-dish p{margin:0;color:var(--c-muted);font-size:.93rem;grid-column:1}
.wb-dish .wb-dish-price{font-variant-numeric:tabular-nums;font-weight:600;grid-row:1;grid-column:2}
.wb-menu-list .wb-menu-groups{max-width:760px;margin-inline:auto;display:grid;gap:3rem}
.wb-menu-note{margin-top:3rem;color:var(--c-muted);font-size:.88rem}

/* ─── Team ─── */
.wb-team .wb-grid{grid-template-columns:repeat(auto-fill,minmax(min(100%,240px),1fr))}
.wb-person .wb-media{aspect-ratio:4/5;margin-bottom:1rem}
.wb-person h3{margin:0;font-size:1.05rem}
.wb-person span{color:var(--wb-primary);font-size:.85rem;font-family:var(--wb-font-mono)}
.wb-person p{margin:.5rem 0 0;color:var(--c-muted);font-size:.93rem}

/* ─── Timeline ─── */
.wb-tl{display:grid;gap:0;border-left:1px solid var(--c-border);margin-left:.5rem}
.wb-tl-item{display:grid;grid-template-columns:10rem 1fr;gap:2rem;padding:1.75rem 0 1.75rem 2rem;position:relative}
.wb-tl-item::before{content:"";position:absolute;left:-.35rem;top:2.2rem;width:.7rem;height:.7rem;border-radius:50%;background:var(--wb-primary)}
.wb-tl-item time{font-family:var(--wb-font-mono);color:var(--c-muted);font-size:.85rem;padding-top:.3rem}
.wb-tl-item p{margin:.4rem 0 0;color:var(--c-muted)}
@media (max-width:720px){.wb-tl-item{grid-template-columns:1fr;gap:.25rem}}

/* ─── FAQ ─── */
.wb-faq-list{border-top:1px solid var(--c-border)}
.wb-faq details{border-bottom:1px solid var(--c-border)}
.wb-faq summary{list-style:none;cursor:pointer;display:flex;justify-content:space-between;align-items:center;gap:1.5rem;padding:1.4rem 0;font-weight:600;font-size:1.06rem}
.wb-faq summary::-webkit-details-marker{display:none}
.wb-faq summary .wb-icon{transition:transform .25s var(--wb-ease-out);flex:none}
.wb-faq details[open] summary .wb-icon{transform:rotate(45deg)}
.wb-faq .wb-faq-a{color:var(--c-muted);padding:0 0 1.4rem;max-width:62ch}
.wb-faq-split .wb-c{display:grid;grid-template-columns:.8fr 1.2fr;gap:clamp(2rem,6vw,6rem);align-items:start}
.wb-faq-split .wb-head{position:sticky;top:6rem}
@media (max-width:860px){.wb-faq-split .wb-c{grid-template-columns:1fr}.wb-faq-split .wb-head{position:static}}

/* ─── CTA ─── */
.wb-cta-banner .wb-cta-box{display:flex;justify-content:space-between;align-items:center;gap:2rem;flex-wrap:wrap}
.wb-cta-banner .wb-ctas{margin-top:0}
.wb-cta-big .wb-c{text-align:center}
.wb-cta-big .wb-h2{font-size:var(--wb-s6);max-width:18ch;margin-inline:auto}
.wb-cta-big .wb-sub{margin-inline:auto}
.wb-cta-big .wb-ctas{justify-content:center}
.wb-cta-split .wb-cta-box{display:grid;grid-template-columns:1.2fr .8fr;gap:3rem;align-items:end;border-top:1px solid var(--c-border);padding-top:3rem}
.wb-cta-split .wb-ctas{justify-content:flex-end}
@media (max-width:860px){.wb-cta-split .wb-cta-box{grid-template-columns:1fr}.wb-cta-split .wb-ctas{justify-content:flex-start}}

/* ─── Forms ─── */
.wb-form{display:grid;gap:1rem}
.wb-form-row{display:grid;grid-template-columns:1fr 1fr;gap:1rem}
.wb-field{display:grid;gap:.4rem}
.wb-field label{font-size:.85rem;font-weight:500}
.wb-field label .req{color:var(--wb-primary);margin-left:.15rem}
.wb-input{width:100%;min-height:3rem;padding:.75rem 1rem;border-radius:calc(var(--wb-radius) + 2px);border:1px solid var(--c-border);background:color-mix(in srgb,var(--c-bg) 92%,var(--c-text));color:var(--c-text);font-size:16px;transition:border-color .2s,box-shadow .2s;appearance:none}
textarea.wb-input{min-height:8rem;resize:vertical}
select.wb-input{background-image:linear-gradient(45deg,transparent 50%,currentColor 50%),linear-gradient(135deg,currentColor 50%,transparent 50%);background-position:calc(100% - 20px) 50%,calc(100% - 15px) 50%;background-size:5px 5px;background-repeat:no-repeat;padding-right:2.5rem}
.wb-input:focus{outline:none;border-color:var(--wb-primary);box-shadow:0 0 0 3px color-mix(in srgb,var(--wb-primary) 22%,transparent)}
.wb-input[aria-invalid=true]{border-color:#d93636}
.wb-check{display:flex;gap:.6rem;align-items:flex-start;font-size:.9rem}
.wb-hp{position:absolute!important;left:-10000px;width:1px;height:1px;overflow:hidden}
.wb-form-msg{font-size:.92rem;padding:.85rem 1rem;border-radius:var(--wb-radius);display:none}
.wb-form-msg.is-ok{display:block;background:color-mix(in srgb,#1f9d55 14%,transparent);color:var(--c-text)}
.wb-form-msg.is-err{display:block;background:color-mix(in srgb,#d93636 14%,transparent);color:var(--c-text)}
.wb-form .wb-btn[disabled]{opacity:.6;cursor:progress}
.wb-contact-split .wb-c{display:grid;grid-template-columns:.85fr 1.15fr;gap:clamp(2.5rem,6vw,6rem)}
.wb-contact-centered .wb-c{max-width:720px}
.wb-contact-centered .wb-head{text-align:center;margin-inline:auto}
.wb-contact-list{list-style:none;margin:2.5rem 0 0;padding:0;display:grid;gap:1.25rem}
.wb-contact-list li{display:flex;gap:.9rem;align-items:flex-start}
.wb-contact-list .wb-icon{color:var(--wb-primary);margin-top:.2rem;flex:none}
.wb-contact-list strong{display:block;font-size:.8rem;font-family:var(--wb-font-mono);letter-spacing:.08em;text-transform:uppercase;color:var(--c-muted);font-weight:500}
.wb-contact-list a:hover{color:var(--c-link)}
.wb-form-card{background:var(--c-card);border:1px solid var(--c-border);border-radius:var(--wb-radius-lg);padding:clamp(1.5rem,3vw,2.5rem)}
@media (max-width:860px){.wb-contact-split .wb-c{grid-template-columns:1fr}.wb-form-row{grid-template-columns:1fr}}
.wb-news-inline .wb-c{display:flex;justify-content:space-between;align-items:center;gap:2rem;flex-wrap:wrap}
.wb-news-inline .wb-head{margin:0}
.wb-news-form{display:flex;gap:.6rem;flex-wrap:wrap;min-width:min(100%,420px)}
.wb-news-form .wb-input{flex:1;min-width:200px;border-radius:var(--wb-radius-pill)}
.wb-news-card .wb-c{max-width:760px;text-align:center}
.wb-news-card .wb-head{margin-inline:auto}
.wb-news-card .wb-news-form{justify-content:center;margin-inline:auto;max-width:520px}

/* ─── Rich text & custom ─── */
.wb-prose{max-width:68ch}
.wb-prose p{color:var(--c-muted);white-space:pre-line}
.wb-custom :where(h1,h2,h3){font-family:var(--wb-font-display);letter-spacing:var(--wb-heading-tracking)}

/* ─── Dashboard ─── */
.wb-dash{border:1px solid var(--c-border);border-radius:var(--wb-radius-lg);background:var(--c-card);overflow:hidden;box-shadow:var(--wb-shadow)}
.wb-dash-top{display:flex;justify-content:space-between;align-items:center;padding:1rem 1.25rem;border-bottom:1px solid var(--c-border);font-size:.88rem}
.wb-dash-top .wb-pills{display:flex;gap:.35rem}
.wb-dash-top .wb-pills span{padding:.3rem .7rem;border-radius:99px;font-size:.78rem;color:var(--c-muted)}
.wb-dash-top .wb-pills span.is-on{background:var(--wb-primary-soft);color:var(--wb-primary)}
.wb-kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,180px),1fr));border-bottom:1px solid var(--c-border)}
.wb-kpi{padding:1.25rem;border-right:1px solid var(--c-border)}
.wb-kpi:last-child{border-right:0}
.wb-kpi span{font-size:.82rem;color:var(--c-muted);display:block}
.wb-kpi strong{display:block;font-family:var(--wb-font-display);font-size:var(--wb-s3);letter-spacing:-.02em;margin-top:.35rem;font-variant-numeric:tabular-nums}
.wb-kpi em{font-style:normal;font-size:.8rem;color:#1f9d55}
.wb-chart{padding:1.25rem}
.wb-chart svg{width:100%;height:auto}
.wb-chart .ln{fill:none;stroke:var(--wb-primary);stroke-width:2.2;stroke-linejoin:round;stroke-linecap:round}
.wb-chart .ar{fill:var(--wb-primary);opacity:.12}
.wb-chart .gr{stroke:var(--c-border);stroke-width:1}
.wb-chart text{fill:var(--c-muted);font-size:11px;font-family:var(--wb-font-mono)}

/* ─── 3D scene ─── */
.wb-scene3d{min-height:min(100svh,960px);display:flex;align-items:center;overflow:hidden}
.wb-scene3d canvas.wb-gl{position:absolute;inset:0;width:100%!important;height:100%!important;z-index:0}
.wb-scene3d .wb-scene-fallback{position:absolute;inset:0;z-index:0;background:radial-gradient(60% 60% at 70% 45%,color-mix(in srgb,var(--wb-primary) 55%,transparent),transparent 70%),radial-gradient(40% 40% at 25% 70%,color-mix(in srgb,var(--wb-accent) 40%,transparent),transparent 70%)}
.wb-scene3d .wb-c{position:relative;z-index:1;pointer-events:none}
.wb-scene3d .wb-c a,.wb-scene3d .wb-c button{pointer-events:auto}
.wb-scene3d .wb-h1{max-width:14ch}
.wb-scene-hint{position:absolute;bottom:1.5rem;left:50%;transform:translateX(-50%);z-index:1;font-family:var(--wb-font-mono);font-size:.72rem;letter-spacing:.14em;text-transform:uppercase;color:var(--c-muted)}

/* ─── Footer ─── */
.wb-footer .wb-foot{display:grid;grid-template-columns:1.4fr 1fr;gap:3rem}
.wb-footer .wb-foot-links{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:.75rem 2rem;list-style:none;margin:0;padding:0;align-content:start}
.wb-footer .wb-foot-links a{color:var(--c-muted);transition:color .2s}
.wb-footer .wb-foot-links a:hover{color:var(--c-text)}
.wb-footer .wb-foot-base{display:flex;justify-content:space-between;gap:1rem;flex-wrap:wrap;margin-top:4rem;padding-top:1.5rem;border-top:1px solid var(--c-border);font-size:.85rem;color:var(--c-muted)}
.wb-footer p{color:var(--c-muted);max-width:40ch}
.wb-footer-minimal .wb-foot{display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap}
.wb-footer-minimal .wb-foot-links{display:flex;gap:1.5rem}
.wb-footer-minimal .wb-foot-base{margin-top:2rem}
.wb-footer-big .wb-bigmark{font-family:var(--wb-font-display);font-size:clamp(3rem,15vw,14rem);line-height:.85;letter-spacing:-.04em;margin-top:4rem;text-transform:var(--wb-heading-case);white-space:nowrap;overflow:hidden;opacity:.95}
@media (max-width:720px){.wb-footer .wb-foot{grid-template-columns:1fr}}

/* ─── Motion ─── */
.wb-anim{opacity:0;transform:translateY(18px);transition:opacity .7s var(--wb-ease-out),transform .7s var(--wb-ease-out);transition-delay:var(--d,0s)}
.wb-anim[data-anim=fade]{transform:none}
.wb-anim[data-anim=scale]{transform:scale(.96)}
.wb-anim[data-anim=reveal]{transform:none;clip-path:inset(0 0 100% 0);transition:clip-path .9s var(--wb-ease-in-out),opacity .5s}
.wb-anim.is-in{opacity:1;transform:none;clip-path:inset(0 0 0 0)}
.wb-stagger>*{opacity:0;transform:translateY(16px);transition:opacity .6s var(--wb-ease-out),transform .6s var(--wb-ease-out)}
.wb-stagger.is-in>*{opacity:1;transform:none}
.wb-js-off .wb-anim,.wb-js-off .wb-stagger>*{opacity:1;transform:none;clip-path:none}
@media (prefers-reduced-motion:reduce){
  html{scroll-behavior:auto}
  .wb-anim,.wb-stagger>*{opacity:1!important;transform:none!important;clip-path:none!important;transition:none!important}
  .wb-marquee-track{animation:none}
  .wb-tile .wb-media img,.wb-card,.wb-btn{transition:none}
}

/* ─── Responsive visibility ─── */
@media (min-width:1025px){.hide-desktop{display:none!important}}
@media (min-width:721px) and (max-width:1024px){.hide-tablet{display:none!important}}
@media (max-width:720px){.hide-mobile{display:none!important}}
`;

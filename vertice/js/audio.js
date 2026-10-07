// Sistema de audio: síntesis procedural original pre-renderizada (OfflineAudioContext)
// + reproducción posicional con PannerNode, buses y límites de voces.
import { rand } from './util.js';

const SR = 24000;
const noiseCache = new Map();

function makeNoise(ctx, dur, color = 'white') {
  // búferes de ruido compartidos entre renderizados (mismo sampleRate)
  const key = color + ctx.sampleRate;
  const cached = noiseCache.get(key);
  if (cached && cached.duration >= dur) return cached;
  dur = Math.max(dur, 6);
  const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
  const b = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = b.getChannelData(0);
  let last = 0, p0 = 0, p1 = 0, p2 = 0;
  for (let i = 0; i < len; i++) {
    const w = Math.random() * 2 - 1;
    if (color === 'brown') { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; }
    else if (color === 'pink') { p0 = 0.99765 * p0 + w * 0.099046; p1 = 0.963 * p1 + w * 0.2965164; p2 = 0.57 * p2 + w * 1.0526913; d[i] = (p0 + p1 + p2 + w * 0.1848) * 0.2; }
    else d[i] = w;
  }
  noiseCache.set(key, b);
  return b;
}

// --- helpers de síntesis
function src(ctx, buf) { const s = ctx.createBufferSource(); s.buffer = buf; return s; }
function filt(ctx, type, f, q = 0.7) { const n = ctx.createBiquadFilter(); n.type = type; n.frequency.value = f; n.Q.value = q; return n; }
function envG(ctx, t, a, peak, d, hold = 0) {
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.00001, t);
  g.gain.exponentialRampToValueAtTime(Math.max(peak, 0.00002), t + Math.max(a, 0.0005));
  if (hold > 0) g.gain.setValueAtTime(peak, t + a + hold);
  g.gain.exponentialRampToValueAtTime(0.00001, t + a + hold + d);
  return g;
}
function chain(...nodes) { for (let i = 0; i < nodes.length - 1; i++) nodes[i].connect(nodes[i + 1]); return nodes[nodes.length - 1]; }
function noiseLayer(ctx, out, buf, t, type, f, q, a, peak, d, offset = 0) {
  const s = src(ctx, buf); const fl = filt(ctx, type, f, q); const g = envG(ctx, t, a, peak, d);
  chain(s, fl, g, out); s.start(t, offset); s.stop(t + a + d + 0.05);
  return fl;
}
function tone(ctx, out, t, type, f0, f1, a, peak, d, slideT) {
  const o = ctx.createOscillator(); o.type = type;
  o.frequency.setValueAtTime(f0, t);
  if (f1 && f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + (slideT || a + d));
  const g = envG(ctx, t, a, peak, d);
  chain(o, g, out); o.start(t); o.stop(t + a + d + 0.05);
  return o;
}
function shaper(ctx, amount = 2.5) {
  const ws = ctx.createWaveShaper();
  const n = 1024, c = new Float32Array(n);
  for (let i = 0; i < n; i++) { const x = (i / (n - 1)) * 2 - 1; c[i] = Math.tanh(x * amount) / Math.tanh(amount); }
  ws.curve = c; return ws;
}

async function render(dur, channels, fn, sr = SR) {
  const ctx = new OfflineAudioContext(channels, Math.ceil(sr * dur), sr);
  fn(ctx);
  const buf = await ctx.startRendering();
  // normalizar
  let peak = 0;
  for (let c = 0; c < buf.numberOfChannels; c++) {
    const d = buf.getChannelData(c);
    for (let i = 0; i < d.length; i++) { const v = Math.abs(d[i]); if (v > peak) peak = v; }
  }
  if (peak > 0) {
    const k = 0.92 / peak;
    for (let c = 0; c < buf.numberOfChannels; c++) { const d = buf.getChannelData(c); for (let i = 0; i < d.length; i++) d[i] *= k; }
  }
  return buf;
}

// ---------------------------------------------------------------- GENERADORES
const GUN = {
  ar: { crack: 3200, body: 1500, bd: 0.085, thump: 115, td: 0.09, tail: 950, tl: 0.6, echo: 0.24, mech: 0.12 },
  ar2: { crack: 2800, body: 1150, bd: 0.11, thump: 92, td: 0.11, tail: 800, tl: 0.75, echo: 0.28, mech: 0.12 },
  smg: { crack: 3800, body: 2000, bd: 0.06, thump: 150, td: 0.06, tail: 1100, tl: 0.38, echo: 0.18, mech: 0.16 },
  shotgun: { crack: 2200, body: 850, bd: 0.17, thump: 68, td: 0.16, tail: 650, tl: 1.0, echo: 0.34, mech: 0.05 },
  sniper: { crack: 3500, body: 1050, bd: 0.14, thump: 58, td: 0.18, tail: 700, tl: 1.5, echo: 0.42, mech: 0.05 },
  lmg: { crack: 3000, body: 1250, bd: 0.1, thump: 88, td: 0.1, tail: 820, tl: 0.75, echo: 0.28, mech: 0.1 },
  dmr: { crack: 3300, body: 1300, bd: 0.11, thump: 84, td: 0.13, tail: 850, tl: 1.0, echo: 0.33, mech: 0.08 },
  pistol: { crack: 3600, body: 2100, bd: 0.055, thump: 165, td: 0.06, tail: 1200, tl: 0.38, echo: 0.18, mech: 0.18 },
  revolver: { crack: 3000, body: 1250, bd: 0.11, thump: 92, td: 0.11, tail: 850, tl: 0.8, echo: 0.3, mech: 0.08 },
  mp: { crack: 4200, body: 2300, bd: 0.05, thump: 175, td: 0.05, tail: 1300, tl: 0.32, echo: 0.15, mech: 0.18 },
  turret: { crack: 2600, body: 900, bd: 0.12, thump: 70, td: 0.14, tail: 600, tl: 0.9, echo: 0.3, mech: 0.05 },
};

function genShot(p) {
  const dur = 0.25 + p.tl + 0.5;
  return render(dur, 1, (ctx) => {
    const wn = makeNoise(ctx, 2.2), br = makeNoise(ctx, 2.2, 'brown');
    const sum = ctx.createGain(); sum.gain.value = 1;
    const sat = shaper(ctx, 2.2);
    const out = ctx.createGain(); out.gain.value = 0.8;
    chain(sum, sat, out, ctx.destination);
    const t = 0.002;
    noiseLayer(ctx, sum, wn, t, 'highpass', p.crack, 0.7, 0.0008, 1.0, 0.03, rand(0, 1));
    const bodyF = noiseLayer(ctx, sum, wn, t, 'lowpass', p.body, 0.9, 0.0015, 1.1, p.bd, rand(0, 1));
    bodyF.frequency.exponentialRampToValueAtTime(p.body * 0.35, t + p.bd);
    tone(ctx, sum, t, 'sine', p.thump * 1.6, p.thump * 0.45, 0.002, 1.3, p.td, p.td);
    tone(ctx, sum, t, 'triangle', p.thump * 3.1, p.thump, 0.001, 0.35, p.td * 0.6);
    // cola (reverberación urbana)
    const tail = noiseLayer(ctx, sum, br, t + 0.01, 'lowpass', p.tail, 0.5, 0.02, 0.32, p.tl, rand(0, 0.5));
    tail.frequency.exponentialRampToValueAtTime(p.tail * 0.4, t + p.tl);
    // ecos tempranos
    const d1 = ctx.createDelay(1); d1.delayTime.value = 0.09 + rand(0, 0.04);
    const d2 = ctx.createDelay(1); d2.delayTime.value = 0.21 + rand(0, 0.06);
    const eg1 = ctx.createGain(); eg1.gain.value = p.echo;
    const eg2 = ctx.createGain(); eg2.gain.value = p.echo * 0.5;
    const ef = filt(ctx, 'lowpass', 1400);
    sum.connect(ef); ef.connect(d1); ef.connect(d2); d1.connect(eg1); d2.connect(eg2); eg1.connect(out); eg2.connect(out);
    // mecánica
    noiseLayer(ctx, sum, wn, t + 0.035, 'bandpass', 4800, 3, 0.001, p.mech, 0.02, rand(0, 1));
  });
}

function genExplosion(big = true) {
  return render(big ? 3.2 : 2.2, 1, (ctx) => {
    const wn = makeNoise(ctx, 3.5), br = makeNoise(ctx, 3.5, 'brown');
    const sum = ctx.createGain(); const sat = shaper(ctx, 3); chain(sum, sat, ctx.destination);
    const t = 0.005;
    noiseLayer(ctx, sum, wn, t, 'highpass', 1800, 0.7, 0.001, 0.8, 0.06);
    const f = noiseLayer(ctx, sum, wn, t, 'lowpass', 2400, 0.8, 0.003, 1.2, 0.5);
    f.frequency.exponentialRampToValueAtTime(180, t + 0.6);
    tone(ctx, sum, t, 'sine', 90, 32, 0.004, 1.6, big ? 1.1 : 0.7, 0.9);
    const r = noiseLayer(ctx, sum, br, t + 0.02, 'lowpass', 420, 0.6, 0.03, 0.9, big ? 2.6 : 1.6);
    r.frequency.exponentialRampToValueAtTime(90, t + 2.2);
    // escombros
    for (let i = 0; i < 10; i++) {
      const tt = t + 0.25 + Math.random() * 1.2;
      noiseLayer(ctx, sum, wn, tt, 'bandpass', rand(1500, 4500), 4, 0.001, rand(0.05, 0.15), rand(0.02, 0.06), rand(0, 2));
    }
  });
}

function genClick(f, q, dur, peak = 1, ping = 0) {
  return render(dur + 0.1, 1, (ctx) => {
    const wn = makeNoise(ctx, 0.5);
    noiseLayer(ctx, ctx.destination, wn, 0.002, 'bandpass', f, q, 0.001, peak, dur);
    if (ping) tone(ctx, ctx.destination, 0.002, 'sine', ping, ping * 0.98, 0.001, 0.3, dur * 1.5);
  });
}

function genSeq(steps, totalDur) {
  // steps: [{t, f, q, d, peak, ping, low}]
  return render(totalDur, 1, (ctx) => {
    const wn = makeNoise(ctx, 1);
    for (const s of steps) {
      noiseLayer(ctx, ctx.destination, wn, s.t, s.type || 'bandpass', s.f, s.q || 2, 0.001, s.peak || 1, s.d || 0.03, rand(0, 0.5));
      if (s.ping) tone(ctx, ctx.destination, s.t, 'sine', s.ping, s.ping * 0.97, 0.001, s.pingPeak || 0.25, (s.d || 0.03) * 2);
      if (s.low) tone(ctx, ctx.destination, s.t, 'sine', s.low, s.low * 0.6, 0.001, 0.6, 0.06);
    }
  });
}

function genStep(variant, metal = false) {
  return render(0.22, 1, (ctx) => {
    const wn = makeNoise(ctx, 0.4), br = makeNoise(ctx, 0.4, 'brown');
    const t = 0.002;
    noiseLayer(ctx, ctx.destination, br, t, 'lowpass', 380 + variant * 40, 0.8, 0.004, 1, 0.07);
    noiseLayer(ctx, ctx.destination, wn, t + 0.01, 'bandpass', metal ? 2600 : 1400 + variant * 200, metal ? 6 : 1.2, 0.002, metal ? 0.5 : 0.25, 0.05);
    if (metal) tone(ctx, ctx.destination, t, 'sine', 900 + variant * 70, 880, 0.001, 0.12, 0.12);
  });
}

function genImpact(kind) {
  return render(kind === 'glass' ? 0.8 : 0.4, 1, (ctx) => {
    const wn = makeNoise(ctx, 1);
    const t = 0.002;
    if (kind === 'concrete') {
      noiseLayer(ctx, ctx.destination, wn, t, 'bandpass', 2400, 1, 0.001, 1, 0.045);
      noiseLayer(ctx, ctx.destination, wn, t + 0.02, 'lowpass', 900, 0.7, 0.005, 0.35, 0.15);
    } else if (kind === 'metal') {
      noiseLayer(ctx, ctx.destination, wn, t, 'highpass', 3000, 0.7, 0.001, 0.7, 0.02);
      for (const f of [1320, 2710, 4180, 5600]) tone(ctx, ctx.destination, t, 'sine', f, f * 0.995, 0.001, 0.25, 0.25);
    } else if (kind === 'wood') {
      noiseLayer(ctx, ctx.destination, wn, t, 'bandpass', 1100, 1.5, 0.001, 1, 0.06);
      tone(ctx, ctx.destination, t, 'triangle', 320, 240, 0.001, 0.4, 0.08);
    } else if (kind === 'body') {
      noiseLayer(ctx, ctx.destination, wn, t, 'lowpass', 500, 0.8, 0.002, 1, 0.08);
      tone(ctx, ctx.destination, t, 'sine', 140, 70, 0.002, 0.8, 0.1);
    } else if (kind === 'glass') {
      noiseLayer(ctx, ctx.destination, wn, t, 'highpass', 4000, 0.7, 0.001, 1, 0.12);
      for (let i = 0; i < 14; i++) tone(ctx, ctx.destination, t + Math.random() * 0.5, 'sine', rand(2800, 7500), 0, 0.001, rand(0.08, 0.25), rand(0.05, 0.15));
    } else if (kind === 'dirt') {
      noiseLayer(ctx, ctx.destination, wn, t, 'lowpass', 1200, 0.7, 0.002, 1, 0.08);
    }
  });
}

function genWhoosh(dur, f0, f1, peak = 1) {
  return render(dur + 0.1, 1, (ctx) => {
    const wn = makeNoise(ctx, dur + 0.2);
    const s = src(ctx, wn); const f = filt(ctx, 'bandpass', f0, 1.6);
    f.frequency.setValueAtTime(f0, 0); f.frequency.exponentialRampToValueAtTime(f1, dur);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, 0); g.gain.exponentialRampToValueAtTime(peak, dur * 0.6); g.gain.exponentialRampToValueAtTime(0.0001, dur);
    chain(s, f, g, ctx.destination); s.start(0); s.stop(dur + 0.05);
  });
}

function genLoop(kind, dur) {
  return render(dur, 1, (ctx) => {
    if (kind === 'rain') {
      const wn = makeNoise(ctx, dur + 0.1);
      const s = src(ctx, wn); const f = filt(ctx, 'bandpass', 3800, 0.4); const g = ctx.createGain(); g.gain.value = 0.6;
      chain(s, f, g, ctx.destination); s.start(0);
      const s2 = src(ctx, makeNoise(ctx, dur + 0.1, 'pink')); const f2 = filt(ctx, 'lowpass', 900); const g2 = ctx.createGain(); g2.gain.value = 0.5;
      chain(s2, f2, g2, ctx.destination); s2.start(0);
      for (let i = 0; i < dur * 30; i++) noiseLayer(ctx, ctx.destination, wn, Math.random() * (dur - 0.05), 'bandpass', rand(2000, 6000), 6, 0.001, rand(0.05, 0.2), 0.01, rand(0, 1));
    } else if (kind === 'wind') {
      const s = src(ctx, makeNoise(ctx, dur + 0.1, 'brown')); const f = filt(ctx, 'lowpass', 500, 0.8);
      const g = ctx.createGain(); g.gain.value = 0.5;
      const lfo = ctx.createOscillator(); lfo.frequency.value = 2 / dur; const lg = ctx.createGain(); lg.gain.value = 0.35;
      lfo.connect(lg); lg.connect(g.gain); lfo.start(0);
      const lfo2 = ctx.createOscillator(); lfo2.frequency.value = 3 / dur; const lg2 = ctx.createGain(); lg2.gain.value = 250;
      lfo2.connect(lg2); lg2.connect(f.frequency); lfo2.start(0);
      chain(s, f, g, ctx.destination); s.start(0);
    } else if (kind === 'drone') {
      for (const [f, a] of [[90, 0.5], [180, 0.35], [270, 0.15], [45, 0.4]]) {
        const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f;
        const fl = filt(ctx, 'lowpass', 1200); const g = ctx.createGain(); g.gain.value = a;
        chain(o, fl, g, ctx.destination); o.start(0);
      }
      const s = src(ctx, makeNoise(ctx, dur + 0.1)); const f = filt(ctx, 'bandpass', 600, 0.8); const g = ctx.createGain(); g.gain.value = 0.3;
      chain(s, f, g, ctx.destination); s.start(0);
    } else if (kind === 'engine') {
      for (const [f, a] of [[50, 0.6], [100, 0.4], [150, 0.25], [200, 0.12]]) {
        const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f;
        const fl = filt(ctx, 'lowpass', 700); const g = ctx.createGain(); g.gain.value = a;
        chain(o, fl, g, ctx.destination); o.start(0);
      }
      const am = ctx.createOscillator(); am.frequency.value = 25; const ag = ctx.createGain(); ag.gain.value = 0.25;
      const mg = ctx.createGain(); mg.gain.value = 0.8; am.connect(ag); ag.connect(mg.gain); am.start(0);
      const s = src(ctx, makeNoise(ctx, dur + 0.1, 'brown')); const f = filt(ctx, 'lowpass', 300);
      chain(s, f, mg, ctx.destination); s.start(0);
    } else if (kind === 'fire') {
      const s = src(ctx, makeNoise(ctx, dur + 0.1, 'brown')); const f = filt(ctx, 'lowpass', 700); const g = ctx.createGain(); g.gain.value = 0.6;
      chain(s, f, g, ctx.destination); s.start(0);
      const wn = makeNoise(ctx, 0.5);
      for (let i = 0; i < dur * 14; i++) noiseLayer(ctx, ctx.destination, wn, Math.random() * (dur - 0.05), 'bandpass', rand(1500, 5000), 3, 0.001, rand(0.1, 0.4), 0.012, rand(0, 0.4));
    }
  });
}

function genThunder() {
  return render(5, 1, (ctx) => {
    const br = makeNoise(ctx, 5.5, 'brown'), wn = makeNoise(ctx, 1);
    noiseLayer(ctx, ctx.destination, wn, 0.01, 'lowpass', 2500, 0.7, 0.002, 0.6, 0.15);
    for (let i = 0; i < 6; i++) {
      const t = 0.05 + i * rand(0.3, 0.7);
      noiseLayer(ctx, ctx.destination, br, t, 'lowpass', rand(150, 300), 0.7, 0.05, rand(0.4, 1), rand(0.8, 2.2), rand(0, 2));
    }
  });
}

function genTinnitus() {
  return render(3.2, 1, (ctx) => {
    tone(ctx, ctx.destination, 0.01, 'sine', 3900, 3850, 0.02, 0.5, 3.0);
  });
}

function genUI(kind) {
  return render(kind === 'confirm' || kind === 'levelup' ? 0.6 : 0.15, 1, (ctx) => {
    const d = ctx.destination;
    if (kind === 'click') { tone(ctx, d, 0.001, 'square', 1800, 1500, 0.001, 0.25, 0.03); }
    else if (kind === 'hover') { tone(ctx, d, 0.001, 'sine', 1200, 1250, 0.002, 0.2, 0.04); }
    else if (kind === 'back') { tone(ctx, d, 0.001, 'triangle', 700, 500, 0.002, 0.4, 0.07); }
    else if (kind === 'confirm') { tone(ctx, d, 0.001, 'triangle', 660, 660, 0.002, 0.4, 0.12); tone(ctx, d, 0.09, 'triangle', 990, 990, 0.002, 0.45, 0.3); }
    else if (kind === 'levelup') { [523, 659, 784, 1046].forEach((f, i) => tone(ctx, d, i * 0.08, 'triangle', f, f, 0.003, 0.4, 0.3)); }
    else if (kind === 'hit') { tone(ctx, d, 0.001, 'sine', 2300, 2100, 0.001, 0.7, 0.035); noiseLayer(ctx, d, makeNoise(ctx, 0.2), 0.001, 'highpass', 5000, 0.7, 0.001, 0.3, 0.02); }
    else if (kind === 'head') { tone(ctx, d, 0.001, 'sine', 3100, 3000, 0.001, 0.6, 0.06); tone(ctx, d, 0.001, 'sine', 4650, 4600, 0.001, 0.35, 0.08); }
    else if (kind === 'kill') { tone(ctx, d, 0.001, 'square', 1500, 1400, 0.001, 0.25, 0.05); tone(ctx, d, 0.05, 'square', 2200, 2100, 0.001, 0.25, 0.08); }
    else if (kind === 'beep') { tone(ctx, d, 0.001, 'square', 2100, 2100, 0.001, 0.25, 0.06); }
    else if (kind === 'alert') { tone(ctx, d, 0.001, 'sawtooth', 880, 880, 0.002, 0.25, 0.1); }
  });
}

function genSting(kind) {
  return render(3.5, 2, (ctx) => {
    const notes = kind === 'win' ? [220, 277.2, 329.6, 440, 554.4] : kind === 'lose' ? [146.8, 174.6, 220, 293.7] : [196, 246.9, 293.7, 392];
    const out = ctx.createGain(); out.gain.value = 0.5; out.connect(ctx.destination);
    for (const f of notes) {
      for (const det of [-6, 6]) {
        const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; o.detune.value = det;
        const fl = filt(ctx, 'lowpass', 400); fl.frequency.linearRampToValueAtTime(kind === 'lose' ? 900 : 2200, 1.2); fl.frequency.linearRampToValueAtTime(500, 3.3);
        const g = envG(ctx, 0.01, 0.3, 0.2, 2.8, 0.2);
        chain(o, fl, g, out); o.start(0); o.stop(3.4);
      }
    }
    tone(ctx, out, 0.01, 'sine', notes[0] / 2, notes[0] / 2, 0.01, 0.9, 2.5);
    const br = makeNoise(ctx, 2, 'brown');
    noiseLayer(ctx, out, br, 0.01, 'lowpass', 200, 0.8, 0.005, 1.2, 1.2);
  });
}

// Música de menú original: Re menor, 96 BPM, 16 compases
function genMusic() {
  const bpm = 96, beat = 60 / bpm, bars = 16, dur = bars * 4 * beat;
  return render(dur + 2, 2, (ctx) => {
    const master = ctx.createGain(); master.gain.value = 0.7; master.connect(ctx.destination);
    const midi = (m) => 440 * Math.pow(2, (m - 69) / 12);
    // progresión: Dm Bb F C (4 compases cada uno)
    const chords = [[50, 53, 57], [46, 50, 53], [53, 57, 60], [48, 52, 55]];
    const wn = makeNoise(ctx, 2), br = makeNoise(ctx, 2, 'brown');
    // pads
    const padBus = ctx.createGain(); padBus.gain.value = 0.16;
    const padF = filt(ctx, 'lowpass', 900, 0.6); chain(padBus, padF, master);
    chords.forEach((ch, ci) => {
      const t0 = ci * 4 * 4 * beat, t1 = t0 + 16 * beat;
      for (const n of ch) {
        for (const det of [-9, 0, 9]) {
          const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = midi(n + 12); o.detune.value = det;
          const g = ctx.createGain();
          g.gain.setValueAtTime(0.0001, t0); g.gain.linearRampToValueAtTime(0.3, t0 + 1.8); g.gain.setValueAtTime(0.3, t1 - 0.8); g.gain.linearRampToValueAtTime(0.0001, t1 + 0.4);
          chain(o, g, padBus); o.start(t0); o.stop(t1 + 0.5);
        }
      }
    });
    // bajo en corcheas
    for (let i = 0; i < bars * 8; i++) {
      const t = i * beat / 2; const ci = Math.floor(i / 32);
      const root = chords[ci][0] - 12;
      const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = midi(root);
      const f = filt(ctx, 'lowpass', i % 2 ? 260 : 420, 4);
      const g = envG(ctx, t, 0.005, i % 2 ? 0.18 : 0.3, beat * 0.4);
      chain(o, f, g, master); o.start(t); o.stop(t + beat);
    }
    // percusión tipo taiko
    for (let b = 0; b < bars; b++) {
      for (let q = 0; q < 4; q++) {
        const t = (b * 4 + q) * beat;
        if (q === 0 || q === 2 || (b % 4 === 3 && q === 3)) {
          tone(ctx, master, t, 'sine', 95, 42, 0.003, 0.9, 0.45, 0.3);
          noiseLayer(ctx, master, br, t, 'lowpass', 300, 0.8, 0.002, 0.5, 0.2);
        }
        if (b >= 4 && (q === 1 || q === 3)) noiseLayer(ctx, master, wn, t, 'bandpass', 1800, 1.2, 0.001, 0.22, 0.12, rand(0, 1));
        if (b >= 8) for (let s = 0; s < 4; s++) noiseLayer(ctx, master, wn, t + s * beat / 4, 'highpass', 7000, 0.7, 0.001, s === 2 ? 0.08 : 0.04, 0.03, rand(0, 1));
        if (b % 4 === 3 && q === 3) for (let s = 1; s < 4; s++) tone(ctx, master, t + s * beat / 4, 'sine', 120, 60, 0.002, 0.4, 0.12);
      }
    }
    // arpegio
    for (let i = 0; i < bars * 16; i++) {
      const b = Math.floor(i / 16); if (b < 8) continue;
      const t = i * beat / 4; const ci = Math.floor(b / 4) % 4;
      const ch = chords[ci]; const n = ch[[0, 1, 2, 1, 2, 0, 1, 2][i % 8]] + 24;
      const o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = midi(n);
      const f = filt(ctx, 'lowpass', 2400);
      const g = envG(ctx, t, 0.003, 0.08, beat * 0.22);
      chain(o, f, g, master); o.start(t); o.stop(t + beat * 0.4);
    }
  }, 22050);
}

// ---------------------------------------------------------------- MOTOR
export const Audio = {
  ctx: null, buffers: {}, ready: false, voices: 0, maxVoices: 28,
  master: null, sfx: null, music: null, ui: null, amb: null, muffle: null,
  musicSrc: null, listenerPos: { x: 0, y: 0, z: 0 },
  vol: { master: 0.85, music: 0.55, sfx: 0.9 },

  init() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC({ latencyHint: 'interactive' });
    const c = this.ctx;
    this.comp = c.createDynamicsCompressor();
    this.comp.threshold.value = -14; this.comp.ratio.value = 4; this.comp.attack.value = 0.003; this.comp.release.value = 0.2;
    this.master = c.createGain(); this.master.connect(this.comp); this.comp.connect(c.destination);
    this.muffle = c.createBiquadFilter(); this.muffle.type = 'lowpass'; this.muffle.frequency.value = 20000;
    this.sfx = c.createGain(); this.sfx.connect(this.muffle); this.muffle.connect(this.master);
    this.music = c.createGain(); this.music.connect(this.master);
    this.ui = c.createGain(); this.ui.connect(this.master);
    this.amb = c.createGain(); this.amb.connect(this.muffle);
    this.applyVolumes();
  },
  resume() { if (this.ctx && this.ctx.state !== 'running') this.ctx.resume().catch(() => {}); },
  setVolumes(v) { Object.assign(this.vol, v); this.applyVolumes(); },
  applyVolumes() {
    if (!this.ctx) return;
    this.master.gain.value = this.vol.master;
    this.music.gain.value = this.vol.music * 0.8;
    this.sfx.gain.value = this.vol.sfx;
    this.amb.gain.value = this.vol.sfx * 0.7;
    this.ui.gain.value = Math.max(this.vol.sfx, 0.4) * 0.6;
  },

  async generate(progress) {
    if (typeof OfflineAudioContext === 'undefined') { this.ready = true; return; }
    const jobs = [];
    for (const k of Object.keys(GUN)) jobs.push([`gun_${k}`, () => genShot(GUN[k])]);
    jobs.push(['explosion', () => genExplosion(true)], ['explosion_s', () => genExplosion(false)]);
    jobs.push(['mag_out', () => genSeq([{ t: 0.005, f: 2200, q: 3, d: 0.03, peak: 1, ping: 1700 }, { t: 0.06, f: 900, q: 1, d: 0.08, peak: 0.4 }], 0.3)]);
    jobs.push(['mag_in', () => genSeq([{ t: 0.005, f: 1200, q: 2, d: 0.03, peak: 0.6 }, { t: 0.05, f: 3000, q: 4, d: 0.02, peak: 1, ping: 2400, low: 180 }], 0.3)]);
    jobs.push(['bolt', () => genSeq([{ t: 0.005, f: 2600, q: 3, d: 0.03, peak: 1, ping: 1500 }, { t: 0.16, f: 3200, q: 4, d: 0.025, peak: 1, ping: 2100 }], 0.4)]);
    jobs.push(['pump', () => genSeq([{ t: 0.005, f: 900, q: 1.5, d: 0.07, peak: 1, low: 160 }, { t: 0.18, f: 1300, q: 2, d: 0.06, peak: 1, low: 200 }], 0.45)]);
    jobs.push(['dry', () => genClick(3500, 5, 0.015, 1, 2600)]);
    jobs.push(['swap', () => genSeq([{ t: 0.005, f: 1500, q: 1, d: 0.06, peak: 0.6 }, { t: 0.1, f: 2800, q: 3, d: 0.02, peak: 0.8, ping: 1900 }], 0.3)]);
    jobs.push(['pin', () => genSeq([{ t: 0.005, f: 5000, q: 6, d: 0.02, peak: 0.8, ping: 3200, pingPeak: 0.5 }], 0.3)]);
    jobs.push(['throw', () => genWhoosh(0.35, 400, 1600, 1)]);
    jobs.push(['whiz', () => render(0.25, 1, (ctx) => { const wn = makeNoise(ctx, 1); const f = noiseLayer(ctx, ctx.destination, wn, 0.002, 'bandpass', 5200, 2.5, 0.01, 1, 0.12, rand(0, 2)); f.frequency.exponentialRampToValueAtTime(1400, 0.14); noiseLayer(ctx, ctx.destination, wn, 0.001, 'highpass', 6000, 0.7, 0.001, 0.6, 0.02, rand(0, 2)); })]);
    jobs.push(['bounce', () => genSeq([{ t: 0.003, f: 2800, q: 5, d: 0.02, peak: 1, ping: 2300, pingPeak: 0.4 }], 0.2)]);
    jobs.push(['whistle', () => render(1.9, 1, (ctx) => { const o = tone(ctx, ctx.destination, 0.01, 'sine', 1900, 520, 0.4, 0.5, 1.4, 1.8); const v = ctx.createOscillator(); v.frequency.value = 9; const vg = ctx.createGain(); vg.gain.value = 25; v.connect(vg); vg.connect(o.frequency); v.start(0); })]);
    jobs.push(['smoke', () => genWhoosh(2.6, 1500, 5000, 0.6)]);
    jobs.push(['flash', () => render(1.2, 1, (ctx) => { const wn = makeNoise(ctx, 1.3); noiseLayer(ctx, ctx.destination, wn, 0.003, 'highpass', 1200, 0.7, 0.001, 1, 0.25); tone(ctx, ctx.destination, 0.003, 'square', 2400, 2200, 0.001, 0.3, 0.6); })]);
    jobs.push(['tinnitus', () => genTinnitus()]);
    jobs.push(['thunder', () => genThunder()]);
    jobs.push(['flyby', () => genWhoosh(4, 200, 1400, 1)]);
    for (let i = 0; i < 4; i++) jobs.push([`step${i}`, () => genStep(i)]);
    jobs.push(['stepm', () => genStep(1, true)], ['land', () => genSeq([{ t: 0.005, f: 300, q: 0.8, d: 0.12, peak: 1, type: 'lowpass', low: 90 }], 0.3)]);
    for (const k of ['concrete', 'metal', 'wood', 'body', 'glass', 'dirt']) jobs.push([`imp_${k}`, () => genImpact(k)]);
    for (const k of ['rain', 'wind', 'drone', 'engine', 'fire']) jobs.push([`loop_${k}`, () => genLoop(k, k === 'wind' ? 8 : k === 'engine' ? 1 : 3)]);
    for (const k of ['click', 'hover', 'back', 'confirm', 'levelup', 'hit', 'head', 'kill', 'beep', 'alert']) jobs.push([`ui_${k}`, () => genUI(k)]);
    for (const k of ['win', 'lose', 'start']) jobs.push([`sting_${k}`, () => genSting(k)]);
    let i = 0;
    for (const [name, fn] of jobs) {
      try { this.buffers[name] = await fn(); } catch (e) { console.warn('audio gen fail', name, e); }
      i++; if (progress) progress(i / jobs.length);
    }
    this.ready = true;
  },
  async generateMusic() {
    if (typeof OfflineAudioContext === 'undefined' || this.buffers.music) return;
    try { this.buffers.music = await genMusic(); } catch (e) { console.warn('music gen fail', e); }
    if (this.wantMusic) { this.wantMusic = false; this.playMusic(); }
  },

  setListener(pos, fwd, up) {
    if (!this.ctx) return;
    const L = this.ctx.listener;
    this.listenerPos.x = pos.x; this.listenerPos.y = pos.y; this.listenerPos.z = pos.z;
    if (L.positionX) {
      const t = this.ctx.currentTime;
      L.positionX.setValueAtTime(pos.x, t); L.positionY.setValueAtTime(pos.y, t); L.positionZ.setValueAtTime(pos.z, t);
      L.forwardX.setValueAtTime(fwd.x, t); L.forwardY.setValueAtTime(fwd.y, t); L.forwardZ.setValueAtTime(fwd.z, t);
      L.upX.setValueAtTime(up.x, t); L.upY.setValueAtTime(up.y, t); L.upZ.setValueAtTime(up.z, t);
    } else if (L.setPosition) {
      L.setPosition(pos.x, pos.y, pos.z); L.setOrientation(fwd.x, fwd.y, fwd.z, up.x, up.y, up.z);
    }
  },

  // Reproduce un sonido. opts: pos (Vector3 o null=2D), vol, rate, bus, ref, occluded, loop, priority
  play(name, opts = {}) {
    if (!this.ctx || !this.ready) return null;
    const buf = this.buffers[name];
    if (!buf) return null;
    const c = this.ctx;
    const vol = opts.vol ?? 1;
    let dist = 0;
    if (opts.pos) {
      const dx = opts.pos.x - this.listenerPos.x, dy = opts.pos.y - this.listenerPos.y, dz = opts.pos.z - this.listenerPos.z;
      dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
      const maxD = opts.maxDist ?? 160;
      if (dist > maxD) return null;
    }
    if (this.voices >= this.maxVoices && !opts.loop && !opts.priority) {
      if (vol < 0.6 || dist > 25) return null;
    }
    const s = c.createBufferSource();
    s.buffer = buf; s.loop = !!opts.loop;
    s.playbackRate.value = (opts.rate ?? 1) * (opts.jitter ? 1 + (Math.random() - 0.5) * opts.jitter : 1);
    const g = c.createGain(); g.gain.value = vol;
    let last = s;
    let filter = null;
    if (opts.pos) {
      const occl = opts.occluded ? 0.55 : 1;
      const lpf = Math.max(700, 20000 * Math.exp(-dist / 70)) * (opts.occluded ? 0.12 : 1);
      if (lpf < 16000 || opts.loop) {
        filter = c.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = Math.max(400, lpf);
        last.connect(filter); last = filter;
      }
      g.gain.value = vol * occl;
      const p = c.createPanner();
      p.panningModel = 'equalpower'; p.distanceModel = 'inverse';
      p.refDistance = opts.ref ?? 4; p.rolloffFactor = opts.rolloff ?? 1.1; p.maxDistance = 400;
      if (p.positionX) { p.positionX.value = opts.pos.x; p.positionY.value = opts.pos.y; p.positionZ.value = opts.pos.z; }
      else p.setPosition(opts.pos.x, opts.pos.y, opts.pos.z);
      last.connect(g); g.connect(p); p.connect(this[opts.bus || 'sfx']);
      var panner = p;
    } else {
      last.connect(g); g.connect(this[opts.bus || 'sfx']);
    }
    s.start(c.currentTime + (opts.delay || 0), opts.offset || 0);
    this.voices++;
    const voice = {
      src: s, gain: g, panner, filter,
      stop: () => { try { s.stop(); } catch (e) { /* ya parado */ } },
      setPos: (v) => { if (!panner) return; if (panner.positionX) { const t = c.currentTime; panner.positionX.setTargetAtTime(v.x, t, 0.05); panner.positionY.setTargetAtTime(v.y, t, 0.05); panner.positionZ.setTargetAtTime(v.z, t, 0.05); } else panner.setPosition(v.x, v.y, v.z); },
      setVol: (v) => { g.gain.setTargetAtTime(v, c.currentTime, 0.05); },
      setRate: (r) => { s.playbackRate.setTargetAtTime(r, c.currentTime, 0.05); },
    };
    s.onended = () => { this.voices--; try { g.disconnect(); if (panner) panner.disconnect(); if (filter) filter.disconnect(); } catch (e) { /* */ } };
    return voice;
  },
  ui2d(name, vol = 1) { return this.play(name, { bus: 'ui', vol, priority: true }); },

  playMusic() {
    if (this.ctx && !this.buffers.music) { this.wantMusic = true; return; }
    if (!this.ctx || !this.buffers.music || this.musicSrc) return;
    const s = this.ctx.createBufferSource(); s.buffer = this.buffers.music; s.loop = true;
    s.loopEnd = 16 * 4 * (60 / 96);
    const g = this.ctx.createGain(); g.gain.value = 0.0001; g.gain.exponentialRampToValueAtTime(1, this.ctx.currentTime + 2);
    s.connect(g); g.connect(this.music); s.start();
    this.musicSrc = s; this.musicGain = g;
  },
  stopMusic(fade = 1) {
    this.wantMusic = false;
    if (!this.musicSrc) return;
    const s = this.musicSrc, g = this.musicGain, t = this.ctx.currentTime;
    g.gain.cancelScheduledValues(t); g.gain.setValueAtTime(g.gain.value, t); g.gain.exponentialRampToValueAtTime(0.0001, t + fade);
    s.stop(t + fade + 0.05);
    this.musicSrc = null;
  },
  setMuffle(amount) { // 0 = normal, 1 = muy amortiguado
    if (!this.ctx) return;
    const f = 20000 * Math.pow(1 - Math.min(0.97, amount), 3) + 250;
    this.muffle.frequency.setTargetAtTime(f, this.ctx.currentTime, 0.08);
  },
};

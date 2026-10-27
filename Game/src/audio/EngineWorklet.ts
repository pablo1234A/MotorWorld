/**
 * AudioWorklet processor source for the procedural engine.
 * Each cylinder firing injects a damped pressure pulse; pulses pass through a set of
 * exhaust formant resonators and a feedback comb (pipe resonance), plus induction noise,
 * then soft saturation. Firing offsets per engine layout give the characteristic rumble.
 */
export const ENGINE_WORKLET = /* js */ `
class Biquad {
  constructor() { this.b0=1; this.b1=0; this.b2=0; this.a1=0; this.a2=0; this.z1=0; this.z2=0; }
  bandpass(f, q, sr) {
    const w = 2*Math.PI*f/sr, a = Math.sin(w)/(2*q), c = Math.cos(w), n = 1 + a;
    this.b0 = a/n; this.b1 = 0; this.b2 = -a/n; this.a1 = -2*c/n; this.a2 = (1-a)/n;
  }
  lowpass(f, q, sr) {
    const w = 2*Math.PI*f/sr, a = Math.sin(w)/(2*q), c = Math.cos(w), n = 1 + a;
    this.b0 = (1-c)/2/n; this.b1 = (1-c)/n; this.b2 = (1-c)/2/n; this.a1 = -2*c/n; this.a2 = (1-a)/n;
  }
  run(x) { const y = this.b0*x + this.z1; this.z1 = this.b1*x - this.a1*y + this.z2; this.z2 = this.b2*x - this.a2*y; return y; }
}

class EngineProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      { name: 'rpm', defaultValue: 900, minValue: 0, maxValue: 12000, automationRate: 'k-rate' },
      { name: 'throttle', defaultValue: 0, minValue: 0, maxValue: 1, automationRate: 'k-rate' },
      { name: 'load', defaultValue: 0, minValue: -1, maxValue: 1, automationRate: 'k-rate' },
      { name: 'muffle', defaultValue: 0, minValue: 0, maxValue: 1, automationRate: 'k-rate' },
    ];
  }
  constructor(opts) {
    super();
    const p = (opts && opts.processorOptions) || {};
    this.cyl = p.cylinders || 4;
    this.rasp = p.rasp ?? 0.5;
    this.rumble = p.rumble ?? 0.4;
    this.pipe = p.pipe ?? 1;
    this.firing = p.firing || 'even';
    this.phase = 0;
    this.pulses = [];
    this.offsets = this.makeOffsets();
    this.next = 0;
    const sr = sampleRate;
    this.f = [new Biquad(), new Biquad(), new Biquad(), new Biquad()];
    const base = 95 / this.pipe;
    this.f[0].bandpass(base, 1.4, sr);
    this.f[1].bandpass(base * 3.1, 2.2, sr);
    this.f[2].bandpass(base * 7.7, 2.6, sr);
    this.f[3].bandpass(1900 + 900 * this.rasp, 1.1, sr);
    this.lp = new Biquad();
    this.lp.lowpass(4000, 0.7, sr);
    this.lpF = 4000;
    this.combLen = Math.max(8, Math.round(sr * (0.0042 * this.pipe)));
    this.comb = new Float32Array(this.combLen);
    this.ci = 0;
    this.noise = 0;
    this.dc = 0;
    this.port.onmessage = (e) => { if (e.data && e.data.cfg) Object.assign(this, e.data.cfg); };
  }
  makeOffsets() {
    const n = this.cyl;
    const o = [];
    for (let i = 0; i < n; i++) o.push(i / n);
    if (this.firing === 'crossplane') {
      // uneven bank-to-bank intervals -> burble
      const j = [0, 0.11, 0.25, 0.36, 0.5, 0.58, 0.75, 0.86];
      return j.slice(0, n);
    }
    if (this.firing === 'flat') return o.map((v, i) => v + (i % 2 ? 0.012 : 0));
    return o;
  }
  process(inputs, outputs, params) {
    const out = outputs[0][0];
    if (!out) return true;
    const rpm = Math.max(300, params.rpm[0]);
    const thr = params.throttle[0];
    const load = params.load[0];
    const muffle = params.muffle[0];
    const sr = sampleRate;
    const cycleHz = rpm / 120; // one 720-degree cycle
    const dPhase = cycleHz / sr;
    const amp = 0.25 + 0.75 * Math.max(0, thr) * (0.55 + 0.45 * Math.max(0, load)) + (load < 0 ? 0.08 : 0);
    const pulseF = (160 + rpm * 0.045) / this.pipe;
    const decay = Math.exp(-(260 + rpm * 0.06) / sr);
    const targetLp = (1200 + rpm * 0.55 + thr * 3500) * (1 - muffle * 0.72);
    if (Math.abs(targetLp - this.lpF) > 80) { this.lpF += (targetLp - this.lpF) * 0.3; this.lp.lowpass(Math.min(sr * 0.45, this.lpF), 0.75, sr); }
    const fb = 0.42 + 0.1 * this.rumble;
    for (let s = 0; s < out.length; s++) {
      this.phase += dPhase;
      if (this.phase >= 1) { this.phase -= 1; this.next = 0; }
      while (this.next < this.offsets.length && this.phase >= this.offsets[this.next]) {
        const jitter = 0.88 + Math.random() * 0.24 + (this.firing === 'crossplane' && this.next % 2 ? 0.15 : 0);
        this.pulses.push({ age: 0, e: 1, a: amp * jitter, w: 2 * Math.PI * pulseF * (0.95 + Math.random() * 0.1) / sr });
        this.next++;
      }
      let x = 0;
      for (let k = this.pulses.length - 1; k >= 0; k--) {
        const p = this.pulses[k];
        x += p.a * p.e * Math.sin(p.w * p.age);
        p.e *= decay;
        p.age++;
        if (p.e < 0.004) this.pulses.splice(k, 1);
      }
      // exhaust resonances
      const r0 = this.f[0].run(x) * (1.6 + this.rumble * 2.2);
      const r1 = this.f[1].run(x) * 1.2;
      const r2 = this.f[2].run(x) * (0.5 + this.rasp * 0.9);
      const white = Math.random() * 2 - 1;
      this.noise = this.noise * 0.6 + white * 0.4;
      const rasp = this.f[3].run(white * Math.abs(x) * 2.4) * this.rasp * (0.3 + thr);
      let y = r0 + r1 + r2 + rasp + x * 0.35;
      // pipe comb resonance
      const c = this.comb[this.ci];
      const yc = y + c * fb;
      this.comb[this.ci] = yc;
      this.ci = (this.ci + 1) % this.combLen;
      y = (y + yc * 0.6) * 0.8;
      // induction hiss
      y += white * 0.018 * thr * (rpm / 7000);
      y = this.lp.run(y);
      // dc block + soft clip
      this.dc = this.dc * 0.995 + y * 0.005;
      y = Math.tanh((y - this.dc) * (1.4 + thr * 1.2)) * 0.6;
      out[s] = y;
    }
    for (let ch = 1; ch < outputs[0].length; ch++) outputs[0][ch].set(out);
    return true;
  }
}
registerProcessor('mw-engine', EngineProcessor);
`;

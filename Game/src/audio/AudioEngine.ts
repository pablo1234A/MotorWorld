import { clamp, lerp, smoothstep } from '../core/MathUtil';
import type { EngineSound } from '../vehicles/CarCatalog';
import { ENGINE_WORKLET } from './EngineWorklet';

export interface EngineState {
  rpm: number;
  throttle: number;
  load: number;
  boost: number; // 0..1 normalized
  redline: number;
}

/** Procedural engine voice (AudioWorklet, with an oscillator fallback). */
export class EngineVoice {
  readonly out: GainNode;
  private node: AudioWorkletNode | null = null;
  private oscs: OscillatorNode[] = [];
  private lp: BiquadFilterNode | null = null;
  private turbo: OscillatorNode;
  private turboGain: GainNode;
  private shaper: WaveShaperNode | null = null;
  muffle = 0;

  constructor(private a: AudioEngine, sound: EngineSound, cylinders: number, useWorklet: boolean, private turboAmount: number) {
    const ctx = a.ctx;
    this.out = ctx.createGain();
    this.out.gain.value = 0;
    if (useWorklet && a.workletReady) {
      this.node = new AudioWorkletNode(ctx, 'mw-engine', {
        numberOfInputs: 0, numberOfOutputs: 1, outputChannelCount: [1],
        processorOptions: { cylinders, rasp: sound.rasp, rumble: sound.rumble, pipe: sound.pipe, firing: sound.firing === 'crossplane' ? 'crossplane' : sound.firing === 'flat' ? 'flat' : 'even' },
      });
      this.node.connect(this.out);
    } else {
      // fallback: detuned saws + square through a lowpass and soft clip
      this.lp = ctx.createBiquadFilter();
      this.lp.type = 'lowpass';
      this.lp.Q.value = 2;
      this.shaper = ctx.createWaveShaper();
      const curve = new Float32Array(256);
      for (let i = 0; i < 256; i++) curve[i] = Math.tanh(((i / 255) * 2 - 1) * 2.2);
      this.shaper.curve = curve;
      for (const [type, mul, g] of [['sawtooth', 1, 0.35], ['square', 0.5, 0.25], ['sawtooth', 2, 0.15]] as [OscillatorType, number, number][]) {
        const o = ctx.createOscillator();
        o.type = type;
        const og = ctx.createGain();
        og.gain.value = g;
        (o as any).__mul = mul;
        o.connect(og).connect(this.lp);
        o.start();
        this.oscs.push(o);
      }
      this.lp.connect(this.shaper).connect(this.out);
    }
    this.turbo = ctx.createOscillator();
    this.turbo.type = 'sine';
    this.turboGain = ctx.createGain();
    this.turboGain.gain.value = 0;
    this.turbo.connect(this.turboGain).connect(this.out);
    this.turbo.start();
    this.cyl = cylinders;
  }
  private cyl: number;

  set(s: EngineState, volume: number) {
    const t = this.a.ctx.currentTime;
    if (this.node) {
      const p = this.node.parameters;
      p.get('rpm')!.setTargetAtTime(s.rpm, t, 0.02);
      p.get('throttle')!.setTargetAtTime(s.throttle, t, 0.03);
      p.get('load')!.setTargetAtTime(s.load, t, 0.05);
      p.get('muffle')!.setTargetAtTime(this.muffle, t, 0.1);
    } else {
      const f = (s.rpm / 60) * (this.cyl / 2);
      for (const o of this.oscs) o.frequency.setTargetAtTime(f * (o as any).__mul * 0.5, t, 0.02);
      this.lp!.frequency.setTargetAtTime((600 + s.rpm * 0.4 + s.throttle * 2500) * (1 - this.muffle * 0.6), t, 0.05);
    }
    this.turbo.frequency.setTargetAtTime(1800 + s.boost * 5200 + s.rpm * 0.15, t, 0.05);
    this.turboGain.gain.setTargetAtTime(this.turboAmount * s.boost * s.boost * 0.045, t, 0.08);
    this.out.gain.setTargetAtTime(volume * (0.55 + 0.45 * s.throttle), t, 0.05);
  }

  dispose() {
    this.out.disconnect();
    this.node?.disconnect();
    for (const o of this.oscs) o.stop();
    this.turbo.stop();
  }
}

/** Looping filtered noise source with controllable gain. */
class NoiseLayer {
  readonly gain: GainNode;
  readonly filter: BiquadFilterNode;
  constructor(a: AudioEngine, type: BiquadFilterType, freq: number, q: number, dest: AudioNode, brown = false) {
    const ctx = a.ctx;
    const src = ctx.createBufferSource();
    src.buffer = brown ? a.brownNoise : a.noise;
    src.loop = true;
    this.filter = ctx.createBiquadFilter();
    this.filter.type = type;
    this.filter.frequency.value = freq;
    this.filter.Q.value = q;
    this.gain = ctx.createGain();
    this.gain.gain.value = 0;
    src.connect(this.filter).connect(this.gain).connect(dest);
    src.start(0, Math.random() * 2);
  }
  set(v: number, tc = 0.06) {
    this.gain.gain.setTargetAtTime(v, this.gain.context.currentTime, tc);
  }
}

/**
 * Game audio: mixer buses, player engine, tyres, wind, rain, ambience, one-shot SFX,
 * traffic voices with distance attenuation, sirens and a generative menu soundtrack.
 */
export class AudioEngine {
  ctx!: AudioContext;
  master!: GainNode;
  engineBus!: GainNode;
  sfxBus!: GainNode;
  ambBus!: GainNode;
  musicBus!: GainNode;
  noise!: AudioBuffer;
  brownNoise!: AudioBuffer;
  workletReady = false;
  /** True once start() was called (user gesture). */
  private starting = false;
  /** True when every node is built and the engine can be driven. */
  started = false;
  private player: EngineVoice | null = null;
  private tireSqueal!: NoiseLayer;
  private tireSqueal2!: NoiseLayer;
  private gravel!: NoiseLayer;
  private wind!: NoiseLayer;
  private rain!: NoiseLayer;
  private cityHum!: NoiseLayer;
  private sea!: NoiseLayer;
  private scrape!: NoiseLayer;
  private road!: NoiseLayer;
  private sirenOsc: OscillatorNode | null = null;
  private sirenGain: GainNode | null = null;
  private traffic: { osc: OscillatorNode; gain: GainNode; pan: StereoPannerNode; lp: BiquadFilterNode }[] = [];
  private music: { gain: GainNode; timer: number } | null = null;
  private birdTimer = 2;
  private cricketTimer = 1;
  volumes = { master: 0.9, engine: 0.85, sfx: 0.8, music: 0.5 };
  private lastBackfire = 0;

  /** Must be called from a user gesture (mobile autoplay policy). */
  async start() {
    if (this.starting) {
      if (this.ctx && this.ctx.state !== 'running') await this.ctx.resume();
      return;
    }
    this.starting = true;
    const AC = window.AudioContext || (window as any).webkitAudioContext;
    this.ctx = new AC({ latencyHint: 'interactive' });
    const ctx = this.ctx;
    this.master = ctx.createGain();
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 4;
    this.master.connect(comp).connect(ctx.destination);
    this.engineBus = ctx.createGain();
    this.sfxBus = ctx.createGain();
    this.ambBus = ctx.createGain();
    this.musicBus = ctx.createGain();
    for (const b of [this.engineBus, this.sfxBus, this.ambBus, this.musicBus]) b.connect(this.master);
    this.applyVolumes();
    // noise buffers
    const len = ctx.sampleRate * 2;
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.brownNoise = ctx.createBuffer(1, len, ctx.sampleRate);
    const b = this.brownNoise.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02;
      b[i] = last * 3.5;
    }
    try {
      const url = URL.createObjectURL(new Blob([ENGINE_WORKLET], { type: 'application/javascript' }));
      await ctx.audioWorklet.addModule(url);
      this.workletReady = true;
    } catch {
      this.workletReady = false;
    }
    this.tireSqueal = new NoiseLayer(this, 'bandpass', 950, 6, this.sfxBus);
    this.tireSqueal2 = new NoiseLayer(this, 'bandpass', 1500, 9, this.sfxBus);
    this.gravel = new NoiseLayer(this, 'lowpass', 900, 0.7, this.sfxBus);
    this.wind = new NoiseLayer(this, 'lowpass', 500, 0.5, this.sfxBus, true);
    this.road = new NoiseLayer(this, 'lowpass', 260, 0.7, this.sfxBus, true);
    this.rain = new NoiseLayer(this, 'highpass', 2600, 0.5, this.ambBus);
    this.cityHum = new NoiseLayer(this, 'lowpass', 180, 0.5, this.ambBus, true);
    this.sea = new NoiseLayer(this, 'lowpass', 700, 0.5, this.ambBus);
    this.scrape = new NoiseLayer(this, 'bandpass', 3200, 2, this.sfxBus);
    for (let i = 0; i < 3; i++) {
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 400;
      const gain = ctx.createGain();
      gain.gain.value = 0;
      const pan = ctx.createStereoPanner();
      osc.connect(lp).connect(gain).connect(pan).connect(this.sfxBus);
      osc.start();
      this.traffic.push({ osc, gain, pan, lp });
    }
    this.started = true;
  }

  applyVolumes() {
    if (!this.started) return;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(this.volumes.master, t, 0.05);
    this.engineBus.gain.setTargetAtTime(this.volumes.engine, t, 0.05);
    this.sfxBus.gain.setTargetAtTime(this.volumes.sfx, t, 0.05);
    this.ambBus.gain.setTargetAtTime(this.volumes.sfx * 0.8, t, 0.05);
    this.musicBus.gain.setTargetAtTime(this.volumes.music, t, 0.05);
  }

  suspend() {
    if (this.started && this.ctx.state === 'running') this.ctx.suspend();
  }
  resume() {
    if (this.started && this.ctx.state !== 'running') this.ctx.resume();
  }

  setPlayerEngine(sound: EngineSound, cylinders: number, turbo: number) {
    if (!this.started) return;
    this.player?.dispose();
    this.player = new EngineVoice(this, sound, cylinders, true, turbo);
    this.player.out.connect(this.engineBus);
  }

  /** Per-frame update of the continuous layers. */
  update(p: {
    engine: EngineState | null; speed: number; slip: number; loose: number; scrape: number; interior: boolean; rain: number; city: number; coast: number;
    nature: number; night: number; paused: boolean;
  }) {
    if (!this.started) return;
    const silent = p.paused;
    if (this.player && p.engine) {
      this.player.muffle = p.interior ? 0.55 : 0;
      this.player.set(p.engine, silent ? 0 : 0.9);
    }
    const v = p.speed;
    this.tireSqueal.set(silent ? 0 : clamp(p.slip, 0, 1) * 0.22 * (1 - p.loose));
    this.tireSqueal2.set(silent ? 0 : clamp(p.slip - 0.3, 0, 1) * 0.12 * (1 - p.loose));
    this.tireSqueal.filter.frequency.setTargetAtTime(850 + p.slip * 300, this.ctx.currentTime, 0.1);
    this.gravel.set(silent ? 0 : p.loose * clamp(v / 25, 0, 1) * 0.35 + p.loose * p.slip * 0.2);
    this.wind.set(silent ? 0 : clamp((v * v) / 6000, 0, 0.5) * (p.interior ? 0.4 : 1));
    this.wind.filter.frequency.setTargetAtTime(350 + v * 12, this.ctx.currentTime, 0.2);
    this.road.set(silent ? 0 : clamp(v / 40, 0, 1) * 0.18);
    this.scrape.set(silent ? 0 : p.scrape * 0.3);
    this.rain.set(p.rain * (p.interior ? 0.5 : 0.28));
    this.cityHum.set(p.city * 0.25);
    this.sea.set(p.coast * 0.22 * (0.6 + 0.4 * Math.sin(this.ctx.currentTime * 0.4)));
    // birds by day in nature, crickets at night
    this.birdTimer -= 1 / 60;
    if (!silent && p.nature > 0.3 && p.night < 0.3 && this.birdTimer <= 0) {
      this.birdTimer = 1.5 + Math.random() * 4;
      this.chirp();
    }
    this.cricketTimer -= 1 / 60;
    if (!silent && p.nature > 0.2 && p.night > 0.6 && this.cricketTimer <= 0) {
      this.cricketTimer = 0.4 + Math.random() * 0.8;
      this.cricket();
    }
  }

  /** Engine voices for nearby traffic: [distance, pan, speed]. */
  updateTraffic(cars: { dist: number; pan: number; speed: number; approach: number }[], paused: boolean) {
    if (!this.started) return;
    const t = this.ctx.currentTime;
    this.traffic.forEach((tv, i) => {
      const c = cars[i];
      if (!c || paused) {
        tv.gain.gain.setTargetAtTime(0, t, 0.1);
        return;
      }
      const doppler = 1 + clamp(c.approach / 340, -0.2, 0.2);
      tv.osc.frequency.setTargetAtTime((35 + c.speed * 2.2) * doppler, t, 0.05);
      tv.lp.frequency.setTargetAtTime(250 + c.speed * 20, t, 0.1);
      tv.gain.gain.setTargetAtTime(clamp(1 - c.dist / 60, 0, 1) ** 2 * 0.12, t, 0.1);
      tv.pan.pan.setTargetAtTime(clamp(c.pan, -1, 1), t, 0.05);
    });
  }

  siren(on: boolean, intensity = 1) {
    if (!this.started) return;
    if (on && !this.sirenOsc) {
      this.sirenOsc = this.ctx.createOscillator();
      this.sirenOsc.type = 'sawtooth';
      const lfo = this.ctx.createOscillator();
      lfo.frequency.value = 0.55;
      const lfoGain = this.ctx.createGain();
      lfoGain.gain.value = 330;
      lfo.connect(lfoGain).connect(this.sirenOsc.frequency);
      this.sirenOsc.frequency.value = 950;
      const lp = this.ctx.createBiquadFilter();
      lp.frequency.value = 2200;
      this.sirenGain = this.ctx.createGain();
      this.sirenGain.gain.value = 0;
      this.sirenOsc.connect(lp).connect(this.sirenGain).connect(this.sfxBus);
      this.sirenOsc.start();
      lfo.start();
    }
    if (this.sirenGain) this.sirenGain.gain.setTargetAtTime(on ? 0.05 * intensity : 0, this.ctx.currentTime, 0.2);
  }

  // ------------------------------------------------------------- one-shots
  private env(dest: AudioNode, dur: number, peak: number, attack = 0.005): GainNode {
    const g = this.ctx.createGain();
    const t = this.ctx.currentTime;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(peak, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    g.connect(dest);
    return g;
  }

  private noiseBurst(dur: number, peak: number, type: BiquadFilterType, freq: number, q = 1, sweepTo?: number) {
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, this.ctx.currentTime + dur);
    src.connect(f).connect(this.env(this.sfxBus, dur, peak));
    src.start(0, Math.random());
    src.stop(this.ctx.currentTime + dur + 0.05);
  }

  private tone(freq: number, dur: number, peak: number, type: OscillatorType = 'sine', bus?: AudioNode, slideTo?: number) {
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, this.ctx.currentTime + dur);
    o.connect(this.env(bus ?? this.sfxBus, dur, peak));
    o.start();
    o.stop(this.ctx.currentTime + dur + 0.05);
  }

  play(name: string, gain = 1) {
    if (!this.started || this.ctx.state !== 'running') return;
    switch (name) {
      case 'click':
        this.tone(1400, 0.05, 0.05 * gain, 'triangle');
        break;
      case 'hover':
        this.tone(900, 0.03, 0.02 * gain, 'triangle');
        break;
      case 'buy':
        this.tone(660, 0.12, 0.08, 'triangle');
        setTimeout(() => this.tone(990, 0.2, 0.08, 'triangle'), 90);
        setTimeout(() => this.tone(1320, 0.35, 0.07, 'triangle'), 180);
        break;
      case 'error':
        this.tone(220, 0.25, 0.08, 'square');
        break;
      case 'beep':
        this.tone(880, 0.25, 0.12, 'square');
        break;
      case 'go':
        this.tone(1320, 0.6, 0.14, 'square');
        break;
      case 'checkpoint':
        this.tone(1040, 0.12, 0.08, 'triangle');
        setTimeout(() => this.tone(1560, 0.2, 0.08, 'triangle'), 80);
        break;
      case 'win':
        [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => this.tone(f, 0.5, 0.08, 'triangle'), i * 120));
        break;
      case 'lose':
        [392, 330, 262].forEach((f, i) => setTimeout(() => this.tone(f, 0.5, 0.07, 'triangle'), i * 160));
        break;
      case 'levelup':
        [523, 784, 1046, 1568].forEach((f, i) => setTimeout(() => this.tone(f, 0.6, 0.07, 'sine'), i * 90));
        break;
      case 'toast':
        this.tone(1760, 0.18, 0.04, 'sine');
        break;
      case 'impact':
        this.noiseBurst(0.35 * gain + 0.1, 0.5 * clamp(gain, 0.1, 1), 'lowpass', 1600, 0.7, 120);
        this.tone(55, 0.3, 0.4 * clamp(gain, 0.1, 1), 'sine', undefined, 30);
        break;
      case 'shift':
        this.noiseBurst(0.06, 0.08, 'bandpass', 600, 1.5);
        break;
      case 'blowoff':
        this.noiseBurst(0.45, 0.16 * gain, 'bandpass', 2600, 1.6, 700);
        break;
      case 'backfire':
        if (this.ctx.currentTime - this.lastBackfire < 0.08) return;
        this.lastBackfire = this.ctx.currentTime;
        this.noiseBurst(0.09, 0.35 * gain, 'lowpass', 900, 1, 200);
        this.tone(80, 0.08, 0.25 * gain, 'square', undefined, 40);
        break;
      case 'horn':
        this.tone(415, 0.5, 0.06, 'square');
        this.tone(523, 0.5, 0.05, 'square');
        break;
      case 'thunder':
        this.noiseBurst(3.5, 0.5 * gain, 'lowpass', 300, 0.5, 40);
        break;
      case 'nitro':
        this.noiseBurst(0.8, 0.12, 'highpass', 3000, 0.7, 6000);
        break;
      case 'nearmiss':
        this.noiseBurst(0.4, 0.15, 'bandpass', 900, 1.5, 300);
        break;
      case 'tick':
        // indicator relay: short dry click
        this.noiseBurst(0.018, 0.09 * gain, 'bandpass', 3200, 2.5);
        this.tone(1900, 0.012, 0.03 * gain, 'square');
        break;
      case 'tock':
        this.noiseBurst(0.018, 0.07 * gain, 'bandpass', 2300, 2.5);
        this.tone(1300, 0.012, 0.025 * gain, 'square');
        break;
      case 'landing':
        this.noiseBurst(0.2, 0.2 * gain, 'lowpass', 400, 0.8, 80);
        break;
    }
  }

  private chirp() {
    const base = 2800 + Math.random() * 1600;
    for (let k = 0; k < 2 + Math.floor(Math.random() * 3); k++)
      setTimeout(() => this.tone(base, 0.09, 0.012, 'sine', this.ambBus, base * 1.3), k * 110);
  }
  private cricket() {
    for (let k = 0; k < 3; k++) setTimeout(() => this.tone(4300, 0.03, 0.006, 'square', this.ambBus), k * 45);
  }

  // ------------------------------------------------------------- generative menu music
  startMusic() {
    if (!this.started || this.music) return;
    const gain = this.ctx.createGain();
    gain.gain.value = 0;
    gain.connect(this.musicBus);
    gain.gain.setTargetAtTime(0.6, this.ctx.currentTime, 1.5);
    const delay = this.ctx.createDelay(1);
    delay.delayTime.value = 0.375;
    const fb = this.ctx.createGain();
    fb.gain.value = 0.35;
    delay.connect(fb).connect(delay);
    delay.connect(gain);
    // A minor progression: Am F C G
    const chords = [[220, 261.6, 329.6], [174.6, 220, 261.6], [261.6, 329.6, 392], [196, 246.9, 293.7]];
    let step = 0;
    const play = () => {
      if (!this.music) return;
      const t = this.ctx.currentTime;
      const ch = chords[Math.floor(step / 8) % 4];
      if (step % 8 === 0) {
        for (const f of ch) {
          for (const det of [-6, 6]) {
            const o = this.ctx.createOscillator();
            o.type = 'sawtooth';
            o.frequency.value = f / 2;
            o.detune.value = det;
            const lp = this.ctx.createBiquadFilter();
            lp.frequency.setValueAtTime(400, t);
            lp.frequency.linearRampToValueAtTime(1400, t + 1.5);
            lp.frequency.linearRampToValueAtTime(500, t + 3);
            const g = this.ctx.createGain();
            g.gain.setValueAtTime(0, t);
            g.gain.linearRampToValueAtTime(0.018, t + 0.8);
            g.gain.linearRampToValueAtTime(0, t + 3.2);
            o.connect(lp).connect(g).connect(gain);
            o.start(t);
            o.stop(t + 3.3);
          }
        }
        // bass
        const b = this.ctx.createOscillator();
        b.type = 'triangle';
        b.frequency.value = ch[0] / 4;
        const bg = this.ctx.createGain();
        bg.gain.setValueAtTime(0.08, t);
        bg.gain.exponentialRampToValueAtTime(0.001, t + 3);
        b.connect(bg).connect(gain);
        b.start(t);
        b.stop(t + 3.1);
      }
      // arpeggio
      const nf = ch[step % 3] * (step % 4 === 3 ? 2 : 1);
      const o = this.ctx.createOscillator();
      o.type = 'triangle';
      o.frequency.value = nf;
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.025, t);
      g.gain.exponentialRampToValueAtTime(0.0005, t + 0.35);
      o.connect(g);
      g.connect(gain);
      g.connect(delay);
      o.start(t);
      o.stop(t + 0.4);
      // hat
      if (step % 2 === 0) this.noiseBurstTo(gain, 0.04, 0.012);
      step++;
    };
    const timer = window.setInterval(play, 375);
    this.music = { gain, timer };
  }

  private noiseBurstTo(dest: AudioNode, dur: number, peak: number) {
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    const f = this.ctx.createBiquadFilter();
    f.type = 'highpass';
    f.frequency.value = 7000;
    src.connect(f).connect(this.env(dest, dur, peak));
    src.start(0, Math.random());
    src.stop(this.ctx.currentTime + dur + 0.02);
  }

  stopMusic() {
    if (!this.music) return;
    const m = this.music;
    this.music = null;
    m.gain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.5);
    setTimeout(() => {
      clearInterval(m.timer);
      m.gain.disconnect();
    }, 2500);
  }
}

export { lerp, smoothstep };

// Sonidos sintetizados (sin archivos): discretos y opcionales.
let ctx: AudioContext | null = null;

function ac() {
  if (!ctx) {
    const C = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!C) return null;
    ctx = new C();
  }
  return ctx;
}

function tone(freq: number, start: number, dur: number, gain = 0.05, type: OscillatorType = 'sine') {
  const c = ac();
  if (!c) return;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.value = freq;
  g.gain.setValueAtTime(0, c.currentTime + start);
  g.gain.linearRampToValueAtTime(gain, c.currentTime + start + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + start + dur);
  o.connect(g).connect(c.destination);
  o.start(c.currentTime + start);
  o.stop(c.currentTime + start + dur + 0.05);
}

export const sound = {
  tick() {
    tone(880, 0, 0.12, 0.035);
  },
  success() {
    tone(660, 0, 0.14, 0.04);
    tone(990, 0.08, 0.2, 0.04);
  },
  win() {
    [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.09, 0.35, 0.045, 'triangle'));
  },
};

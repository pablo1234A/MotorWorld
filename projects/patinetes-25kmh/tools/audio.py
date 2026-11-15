"""Música original + efectos de sonido sintetizados (numpy), sincronizados con cues.json.

Uso: python3 audio.py <proyecto>
Salidas: 05_audio/music/music.wav, 05_audio/sfx/sfx.wav (48 kHz estéreo).
Todo se genera por síntesis: sin muestras de terceros ni licencias externas.
"""
import json, sys, wave
from pathlib import Path
import numpy as np

proj = Path(sys.argv[1])
SR = 48000
tl = json.loads((proj / "07_edit/timeline.json").read_text(encoding="utf-8"))
cues = json.loads((proj / "05_audio/sfx/cues.json").read_text())
DUR = tl["duration"]
N = int(DUR * SR)
rng = np.random.default_rng(7)
sc = {s["id"]: s for s in tl["scenes"]}

def tt(n): return np.arange(n) / SR
def env(n, a, r, shape=2.0):
    t = tt(n); e = np.minimum(1, t / max(a, 1e-4)) * np.exp(-np.maximum(0, t - a) * shape / max(r, 1e-4)); return e
def lp_fast(x, fc, passes=2):
    # filtro paso bajo por convolución (media móvil) — rápido para pistas largas
    k = max(1, int(SR / fc / 2)); ker = np.ones(k) / k
    for _ in range(passes): x = np.convolve(x, ker, mode="same")
    return x
def hp_fast(x, fc): return x - lp_fast(x, fc)
def bp_noise(n, lo, hi): return hp_fast(lp_fast(rng.standard_normal(n), hi), lo)
def write(path, st):
    st = np.clip(st, -1, 1); path.parent.mkdir(parents=True, exist_ok=True)
    with wave.open(str(path), "wb") as w:
        w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR)
        w.writeframes((st.T.reshape(-1) * 32767).astype(np.int16).tobytes())
def stereo(x, pan=0.0): return np.stack([x * np.sqrt((1 - pan) / 2), x * np.sqrt((1 + pan) / 2)])
def midi(m): return 440 * 2 ** ((m - 69) / 12)

# ------------------------------------------------------------------ MÚSICA
BPM = 92; beat = 60 / BPM; bar = 4 * beat
music = np.zeros((2, N))
def add(buf, x, t0, pan=0.0):
    i = int(t0 * SR); x = stereo(x, pan) if x.ndim == 1 else x
    j = min(buf.shape[1], i + x.shape[1])
    if j > i: buf[:, i:j] += x[:, : j - i]

# intensidad por escena (0..1)
inten = {"s1_gancho": .8, "s2_ley": .55, "s3_energia": .6, "s4_reaccion": .9, "s5_ruedas": 1.0, "s6_datos": .7, "s7_cierre": .5}
def scene_at(t):
    for s in tl["scenes"]:
        if s["start"] - .01 <= t < s["end"]: return s["id"]
    return tl["scenes"][-1]["id"]

# progresión: Am F C G (tensa) y cierre F G C C (resolución)
prog = [(57, [57, 60, 64]), (53, [53, 57, 60]), (48, [55, 60, 64]), (55, [55, 59, 62])]
close_prog = [(53, [53, 57, 60]), (55, [55, 59, 62]), (48, [52, 55, 60]), (48, [52, 55, 60])]
t_close = sc["s7_cierre"]["start"]
nb = int(np.ceil(DUR / bar)) + 1
for b in range(nb):
    t0 = b * bar
    if t0 >= DUR: break
    root, chord = (close_prog[(b - int(t_close // bar)) % 4] if t0 >= t_close - .1 else prog[b % 4])
    I = inten[scene_at(t0)]
    n = int(bar * SR) + SR // 2
    t = tt(n)
    # pad: sierras desafinadas, filtradas
    pad = np.zeros(n)
    for m in chord:
        for det in (-0.08, 0.08):
            f = midi(m + 12) * 2 ** (det / 12)
            pad += 2 * ((t * f) % 1) - 1
    pad = lp_fast(pad, 900 + 900 * I) * 0.045
    pad *= np.minimum(1, t / 0.6) * np.minimum(1, (n / SR - t) / 0.5)
    add(music, pad * .9, t0, -0.2); add(music, pad * .9, t0 + 0.012, 0.2)
    # bajo a corcheas
    for k in range(8):
        tb = t0 + k * beat / 2
        nn = int(beat / 2 * SR)
        x = np.sin(2 * np.pi * midi(root - 12) * tt(nn)) * env(nn, .005, .18) * (0.16 if k % 2 == 0 else 0.09) * (0.6 + .5 * I)
        add(music, x, tb)
    # pulso (bombo suave) y hi-hat en escenas tensas
    for k in range(4):
        tb = t0 + k * beat
        if I >= .6:
            nn = int(.35 * SR); tk = tt(nn)
            kick = np.sin(2 * np.pi * (48 + 70 * np.exp(-tk * 30)) * tk) * np.exp(-tk * 9) * .32 * I
            add(music, kick, tb)
        if I >= .75:
            nn = int(.06 * SR)
            hat = hp_fast(rng.standard_normal(nn), 6000) * env(nn, .001, .03) * .05
            add(music, hat, tb + beat / 2, .3)
    # arpegio pluck en datos y cierre
    if scene_at(t0) in ("s6_datos", "s7_cierre", "s2_ley"):
        notes = chord + [chord[0] + 12]
        for k in range(8):
            nn = int(.5 * SR); tk = tt(nn); f = midi(notes[k % 4] + 12)
            x = (np.sin(2 * np.pi * f * tk) + .3 * np.sin(4 * np.pi * f * tk)) * np.exp(-tk * 7) * .05
            add(music, x, t0 + k * beat / 2, (-.4 if k % 2 else .4))
# fade in/out
fade = np.ones(N); fade[: int(.8 * SR)] = np.linspace(0, 1, int(.8 * SR)); fade[-int(2.0 * SR):] = np.linspace(1, 0, int(2.0 * SR))
music *= fade
write(proj / "05_audio/music/music.wav", music / max(1e-6, np.abs(music).max()) * 0.7)

# ------------------------------------------------------------------ EFECTOS
sfx = np.zeros((2, N))
def whoosh(d=.55, up=True):
    n = int(d * SR); t = tt(n)
    x = bp_noise(n, 300, 3000) * np.sin(np.pi * t / d) ** 2
    return x * .5
def tone_sweep(f0, f1, d, harm=(1, .35, .15)):
    n = int(d * SR); f = np.linspace(f0, f1, n); ph = 2 * np.pi * np.cumsum(f) / SR
    return sum(a * np.sin(ph * (i + 1)) for i, a in enumerate(harm))
def motor_curve(times, freqs, d):
    n = int(d * SR); f = np.interp(tt(n), times, freqs); ph = 2 * np.pi * np.cumsum(f) / SR
    x = .5 * np.sin(ph) + .25 * np.sin(2 * ph) + .12 * np.sin(3.01 * ph) + .03 * rng.standard_normal(n)
    return lp_fast(x, 4000) * .32
def thump(f=60, d=.5, a=.9):
    n = int(d * SR); t = tt(n); return np.sin(2 * np.pi * (f + 90 * np.exp(-t * 25)) * t) * np.exp(-t * 7) * a
def click(d=.03, hi=2000):
    n = int(d * SR); return hp_fast(rng.standard_normal(n), hi) * env(n, .0005, d / 3)

tF = next(c["t"] for c in cues if c["type"] == "beep") - .05
def make(cu):
    k = cu["type"]
    if k in ("whoosh", "whoosh_in"): return whoosh(.9 if k == "whoosh_in" else .5)
    if k == "motor":
        d = tF + 1.6 - cu["t"]
        return motor_curve([0, 2.4, tF - cu["t"], tF - cu["t"] + .9, d], [140, 520, 520, 260, 250], d) * np.minimum(1, np.minimum(tt(int(d * SR)) / .2, (d - tt(int(d * SR))) / .5))
    if k == "motor_short": return motor_curve([0, 1.4], [240, 260], 1.4) * env(int(1.4 * SR), .1, 1.2, 1)
    if k == "motor_fast": return motor_curve([0, 1.4], [380, 560], 1.4) * env(int(1.4 * SR), .1, 1.2, 1)
    if k == "beep":
        n = int(.1 * SR); b = np.sin(2 * np.pi * 1500 * tt(n)) * env(n, .003, .08) * .3
        return np.concatenate([b, np.zeros(int(.07 * SR)), b])
    if k == "stamp": return thump(80, .45, .9) + np.pad(click(.04, 1500) * .6, (0, int(.41 * SR)))
    if k == "brake":
        n = int(.7 * SR); return bp_noise(n, 2500, 5000) * env(n, .05, .6, 1.5) * .35 + np.sin(2 * np.pi * 2900 * tt(n)) * env(n, .05, .5, 2) * .05
    if k == "sign":
        n = int(1.2 * SR); t = tt(n); return sum(np.sin(2 * np.pi * f * t) * np.exp(-t * dcy) for f, dcy in ((523, 4), (1320, 6), (2210, 9))) * .12
    if k == "pop":
        n = int(.12 * SR); t = tt(n); return np.sin(2 * np.pi * (900 - 2500 * t) * t) * env(n, .002, .07) * .35
    if k == "buzz":
        n = int(.4 * SR); t = tt(n); return lp_fast(np.sign(np.sin(2 * np.pi * 140 * t)), 2500) * env(n, .005, .35, 1) * .22
    if k == "steps":
        out = np.zeros(int(3.2 * SR))
        for i in range(6):
            s = thump(110, .12, .25) + np.pad(bp_noise(int(.05 * SR), 400, 2500) * .08 * env(int(.05 * SR), .001, .03), (0, int(.07 * SR)))
            j = int(i * .5 * SR); out[j:j + len(s)] += s
        return out
    if k == "chalk":
        n = int(1.0 * SR); t = tt(n); return bp_noise(n, 1800, 6000) * (0.5 + .5 * np.sign(np.sin(2 * np.pi * 9 * t))) * env(n, .02, .9, 1) * .18
    if k == "hit":
        return thump(48, 1.2, .9) + np.pad(bp_noise(int(.3 * SR), 100, 1500) * env(int(.3 * SR), .002, .25) * .3, (0, int(.9 * SR)))
    if k == "tick":
        return np.concatenate([click(.02, 3000) * .5, np.zeros(int(.48 * SR)), click(.02, 3000) * .35])
    if k == "horn":  # timbre de bici
        n = int(1.0 * SR); t = tt(n); return (np.sin(2 * np.pi * 2350 * t) + .6 * np.sin(2 * np.pi * 3110 * t)) * np.exp(-t * 5) * .16
    if k == "bump": return thump(90, .25, .5)
    if k == "crash":
        n = int(1.2 * SR); t = tt(n)
        metal = sum(np.sin(2 * np.pi * f * t) * np.exp(-t * d) for f, d in ((420, 6), (870, 8), (1730, 10), (2610, 12))) * .1
        return thump(55, 1.2, 1.0) + bp_noise(n, 200, 4000) * env(n, .002, .4) * .35 + metal
    if k == "scrape":
        n = int(1.0 * SR); return bp_noise(n, 800, 5000) * env(n, .03, .9, 1.5) * .22
    if k == "siren":
        d = 5.5; n = int(d * SR); t = tt(n)
        f = np.where((t * 1.4) % 1 < .5, 960, 770); ph = 2 * np.pi * np.cumsum(f) / SR
        x = lp_fast(np.sin(ph) + .3 * np.sin(2 * ph), 3000) * np.sin(np.pi * t / d) ** 2 * .2
        return np.stack([x * (1 - t / d) * 1.2, x * (t / d) * 1.2])  # pasa de izquierda a derecha
    if k == "paper":
        n = int(.35 * SR); return bp_noise(n, 1500, 7000) * np.sin(np.pi * tt(n) / .35) ** 2 * .18
    if k == "rise":
        d = .9; n = int(d * SR); return (bp_noise(n, 500, 6000) * .25 + tone_sweep(200, 900, d, (1,)) * .08) * (tt(n) / d) ** 2
    raise ValueError(k)

for cu in cues:
    x = make(cu) * cu["gain"]
    add(sfx, x, cu["t"])
write(proj / "05_audio/sfx/sfx.wav", sfx * 0.9)
print("music + sfx ok", DUR)

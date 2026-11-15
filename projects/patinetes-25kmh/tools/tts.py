"""Construye la pista de voz y timeline.json a partir de las frases WAV.

Uso: python3 tts.py <proyecto> [modelo_piper.onnx]
Las frases que falten se sintetizan con Piper (respaldo). La voz principal se
genera antes con tools/tts_chatterbox.py, que deja los WAV en 05_audio/voice/.
Reanudable: si el wav de una frase existe, no se regenera.
Tiempos de palabra: si existe 05_audio/voice/alignment.json (tools/align.py, Whisper)
se usan esos; si no, se reparten proporcionalmente a la longitud de cada palabra.
"""
import json, sys, wave, re
from pathlib import Path
import numpy as np
from piper import PiperVoice, SynthesisConfig

proj = Path(sys.argv[1])
model = sys.argv[2] if len(sys.argv) > 2 else None
SR = None
GAP_HUMOR = 0.42  # pausa antes de un remate humorístico
GAP_LINE = 0.28
GAP_SCENE = 0.55
LEAD_IN = 0.45

data = json.loads((proj / "01_script/narration.json").read_text(encoding="utf-8"))
vdir = proj / "05_audio/voice"
vdir.mkdir(parents=True, exist_ok=True)
voice = None

def read_wav(p):
    global SR
    with wave.open(str(p)) as w:
        if SR is None: SR = w.getframerate()
        assert w.getframerate() == SR and w.getnchannels() == 1, f"{p}: todas las frases deben ser mono y a {SR} Hz"
        return np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16).astype(np.float32) / 32768

def piper_synth(text, p):
    global voice
    if voice is None:
        voice = PiperVoice.load(model)
    with wave.open(str(p), "wb") as w:
        voice.synthesize_wav(text, w, syn_config=SynthesisConfig(length_scale=1.02, noise_scale=0.6, noise_w_scale=0.8))

lines_of = lambda sc: [(l, "normal") if isinstance(l, str) else (l["text"], l.get("style", "normal")) for l in sc["lines"]]
for sc in data["scenes"]:
    for li, (text, _) in enumerate(lines_of(sc)):
        p = vdir / f"{sc['id']}_{li}.wav"
        if not p.exists():
            assert model, f"Falta {p.name}: genera la voz con tts_chatterbox.py o pasa un modelo Piper"
            piper_synth(text, p)
read_wav(vdir / f"{data['scenes'][0]['id']}_0.wav")

def trim(x, thr=0.01):
    idx = np.where(np.abs(x) > thr)[0]
    if len(idx) == 0:
        return x
    a = max(0, idx[0] - int(0.02 * SR)); b = min(len(x), idx[-1] + int(0.06 * SR))
    return x[a:b], a / SR

ap = vdir / "alignment.json"
ALIGN = json.loads(ap.read_text()) if ap.exists() else {}

track = [np.zeros(int(LEAD_IN * SR), np.float32)]
t = LEAD_IN
timeline = {"title": data["title"], "scenes": []}
for si, sc in enumerate(data["scenes"]):
    scene = {"id": sc["id"], "start": t, "lines": []}
    L = lines_of(sc)
    for li, (text, style) in enumerate(L):
        p = vdir / f"{sc['id']}_{li}.wav"
        if style == "humor" and li > 0:  # pausa cómica antes del remate
            extra = GAP_HUMOR - GAP_LINE
            track.append(np.zeros(int(extra * SR), np.float32)); t += extra
        x, off = trim(read_wav(p))
        dur = len(x) / SR
        words = text.split()
        al = ALIGN.get(f"{sc['id']}_{li}")
        if al and al["sig"].startswith(text + "|") and len(al["words"]) == len(words):
            wl = [{"w": w, "start": round(t + max(0, a - off), 3), "end": round(t + min(dur, b - off), 3)} for w, (a, b) in zip(words, al["words"])]
        else:
            weights = np.array([len(re.sub(r"[^\wáéíóúñü]", "", w, flags=re.I)) + 1.5 for w in words], float)
            cum = np.concatenate([[0], np.cumsum(weights)]) / weights.sum() * dur
            wl = [{"w": w, "start": round(t + cum[i], 3), "end": round(t + cum[i + 1], 3)} for i, w in enumerate(words)]
        scene["lines"].append({"text": text, "style": style, "start": round(t, 3), "end": round(t + dur, 3), "words": wl})
        track.append(x)
        t += dur
        gap = GAP_LINE if li < len(L) - 1 else GAP_SCENE
        track.append(np.zeros(int(gap * SR), np.float32)); t += gap
    scene["end"] = round(t, 3)
    timeline["scenes"].append(scene)

tail = 1.6
track.append(np.zeros(int(tail * SR), np.float32)); t += tail
timeline["scenes"][-1]["end"] = round(t, 3)
timeline["duration"] = round(t, 3)
y = np.concatenate(track)
with wave.open(str(vdir / "narration_full.wav"), "wb") as w:
    w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR)
    w.writeframes((np.clip(y, -1, 1) * 32767).astype(np.int16).tobytes())
(proj / "07_edit/timeline.json").write_text(json.dumps(timeline, ensure_ascii=False, indent=1), encoding="utf-8")
for s in timeline["scenes"]:
    print(f"{s['id']:14s} {s['start']:6.2f} -> {s['end']:6.2f}  ({s['end']-s['start']:.2f}s)")
print("TOTAL", round(t, 2))

"""Genera la voz por frases con Piper y construye timeline.json.

Uso: python3 tts.py <proyecto> <modelo.onnx>
Cada frase se sintetiza por separado (reanudable: si el wav existe, no se regenera).
Los tiempos de palabra se reparten proporcionalmente a la longitud de cada palabra
dentro de su frase (Piper no da alineación por palabra).
"""
import json, sys, wave, re
from pathlib import Path
import numpy as np
from piper import PiperVoice, SynthesisConfig

proj = Path(sys.argv[1])
model = sys.argv[2]
SR = 22050
GAP_LINE = 0.28
GAP_SCENE = 0.55
LEAD_IN = 0.45

data = json.loads((proj / "01_script/narration.json").read_text(encoding="utf-8"))
vdir = proj / "05_audio/voice"
vdir.mkdir(parents=True, exist_ok=True)
voice = PiperVoice.load(model)
cfg = SynthesisConfig(length_scale=1.02, noise_scale=0.6, noise_w_scale=0.8)

def read_wav(p):
    with wave.open(str(p)) as w:
        return np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16).astype(np.float32) / 32768

def trim(x, thr=0.01):
    idx = np.where(np.abs(x) > thr)[0]
    if len(idx) == 0:
        return x
    a = max(0, idx[0] - int(0.02 * SR)); b = min(len(x), idx[-1] + int(0.06 * SR))
    return x[a:b]

track = [np.zeros(int(LEAD_IN * SR), np.float32)]
t = LEAD_IN
timeline = {"title": data["title"], "scenes": []}
for si, sc in enumerate(data["scenes"]):
    scene = {"id": sc["id"], "start": t, "lines": []}
    for li, text in enumerate(sc["lines"]):
        p = vdir / f"{sc['id']}_{li}.wav"
        if not p.exists():
            with wave.open(str(p), "wb") as w:
                voice.synthesize_wav(text, w, syn_config=cfg)
        x = trim(read_wav(p))
        dur = len(x) / SR
        words = text.split()
        weights = np.array([len(re.sub(r"[^\wáéíóúñü]", "", w, flags=re.I)) + 1.5 for w in words], float)
        cum = np.concatenate([[0], np.cumsum(weights)]) / weights.sum() * dur
        wl = [{"w": w, "start": round(t + cum[i], 3), "end": round(t + cum[i + 1], 3)} for i, w in enumerate(words)]
        scene["lines"].append({"text": text, "start": round(t, 3), "end": round(t + dur, 3), "words": wl})
        track.append(x)
        t += dur
        gap = GAP_LINE if li < len(sc["lines"]) - 1 else GAP_SCENE
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

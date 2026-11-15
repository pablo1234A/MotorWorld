"""Voz neuronal realista con Chatterbox multilingüe (Resemble AI, licencia MIT, uso local en CPU).

Uso (en un entorno con chatterbox-tts y faster-whisper):
    HF_HUB_DISABLE_XET=1 python tts_chatterbox.py <proyecto> <referencia.wav> [--force]

- La referencia fija el timbre/acento (se usa una muestra de la voz CC0 es_ES "davefx").
- Las frases style=humor se generan con más expresividad (exaggeration) y algo más pausadas.
- Por cada frase se generan N tomas; se elige automáticamente la que Whisper transcribe más
  fiel al guion y con ritmo natural (palabras/segundo). Reanudable: no rehace WAV existentes.
"""
import sys, re, json, wave, difflib
from pathlib import Path
import numpy as np
import torch

torch.set_num_threads(4)
_load = torch.load  # los pesos se guardaron en GPU: forzar CPU
torch.load = lambda *a, **k: _load(*a, **{**k, "map_location": "cpu"})
from chatterbox.mtl_tts import ChatterboxMultilingualTTS
from faster_whisper import WhisperModel

proj, ref = Path(sys.argv[1]), sys.argv[2]
force = "--force" in sys.argv
TAKES = 3
STYLE = {"normal": dict(exaggeration=0.6, cfg_weight=0.4, temperature=0.8),
         "humor": dict(exaggeration=0.85, cfg_weight=0.3, temperature=0.85)}
# cómo se debe PRONUNCIAR (el guion conserva la grafía para los subtítulos)
SAY = {r"\bDGT\b": "De Ge Te"}
NUM = {"50": "cincuenta", "25": "veinticinco", "2021": "dos mil veintiuno", "6": "seis", "7": "siete", "14": "catorce",
       "20": "veinte", "2024": "dos mil veinticuatro", "13": "trece", "8": "ocho", "93": "noventa y tres",
       "419": "cuatrocientos diecinueve", "4": "cuatro", "2": "dos"}

def words(s):
    s = s.lower()
    s = re.sub(r"\bde\s*g\.?\s*t\.?e?\b|\bdgt\b|de ge te", "dgt", s)
    toks = re.sub(r"[^\wáéíóúñü ]", " ", s).split()
    return " ".join(NUM.get(t, t) for t in toks).split()

data = json.loads((proj / "01_script/narration.json").read_text(encoding="utf-8"))
vdir = proj / "05_audio/voice"; vdir.mkdir(parents=True, exist_ok=True)
tts = ChatterboxMultilingualTTS.from_pretrained(torch.device("cpu"))
asr = WhisperModel("small", device="cpu", compute_type="int8")
report = {}
for sc in data["scenes"]:
    for li, l in enumerate(sc["lines"]):
        text, style = (l, "normal") if isinstance(l, str) else (l["text"], l.get("style", "normal"))
        out = vdir / f"{sc['id']}_{li}.wav"
        if out.exists() and not force:
            continue
        say = text
        for a, b in SAY.items(): say = re.sub(a, b, say)
        best = None
        for k in range(TAKES):
            torch.manual_seed(1000 * li + k + hash(sc["id"]) % 997)
            wav = tts.generate(say, language_id="es", audio_prompt_path=ref, **STYLE[style]).squeeze(0).numpy()
            y16 = np.interp(np.arange(0, len(wav), tts.sr / 16000), np.arange(len(wav)), wav).astype(np.float32)
            hyp = " ".join(s.text for s in asr.transcribe(y16, language="es")[0])
            sim = difflib.SequenceMatcher(a=words(text), b=words(hyp)).ratio()
            voiced = np.where(np.abs(wav) > 0.02)[0]
            dur = (voiced[-1] - voiced[0]) / tts.sr if len(voiced) else 0.01
            wps = len(text.split()) / dur
            score = sim - 0.15 * max(0, abs(wps - 3.0) - 0.6)  # ritmo natural ≈ 2,4–3,6 palabras/s
            print(f"{out.name} toma {k}: sim={sim:.2f} pal/s={wps:.2f} score={score:.2f} | {hyp.strip()}", flush=True)
            if best is None or score > best[0]:
                best = (score, wav, hyp.strip(), sim, wps)
            if sim >= 0.97 and 2.3 <= wps <= 3.7:
                break
        pcm = (np.clip(best[1], -1, 1) * 32767).astype(np.int16)
        with wave.open(str(out), "wb") as w:
            w.setnchannels(1); w.setsampwidth(2); w.setframerate(tts.sr); w.writeframes(pcm.tobytes())
        report[out.stem] = {"texto": text, "estilo": style, "transcripcion": best[2], "similitud": round(best[3], 3), "palabras_s": round(best[4], 2)}
rp = vdir / "takes_report.json"
old = json.loads(rp.read_text(encoding="utf-8")) if rp.exists() else {}
old.update(report); rp.write_text(json.dumps(old, ensure_ascii=False, indent=1), encoding="utf-8")
print("voz ok")

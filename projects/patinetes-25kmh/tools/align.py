"""Alinea palabra a palabra cada frase WAV con Whisper (faster-whisper).

Uso: HF_HUB_DISABLE_XET=1 python3 align.py <proyecto>
Salida: 05_audio/voice/alignment.json  {"<escena>_<i>": [[ini, fin], ...] por palabra del guion}
Las palabras del guion que Whisper no reconozca se interpolan entre sus vecinas.
"""
import json, sys, re, wave, difflib
from pathlib import Path
import numpy as np
from faster_whisper import WhisperModel

proj = Path(sys.argv[1]); vdir = proj / "05_audio/voice"
data = json.loads((proj / "01_script/narration.json").read_text(encoding="utf-8"))
out_p = vdir / "alignment.json"
cache = json.loads(out_p.read_text()) if out_p.exists() else {}
model = WhisperModel("small", device="cpu", compute_type="int8")
NUM = {"50": "cincuenta", "25": "veinticinco", "2021": "dos mil veintiuno", "6": "seis", "7": "siete", "14": "catorce",
       "20": "veinte", "2024": "dos mil veinticuatro", "13": "trece", "8": "ocho", "93": "noventa y tres", "419": "cuatrocientos diecinueve", "4": "cuatro"}
norm = lambda w: re.sub(r"[^\wáéíóúñü]", "", w.lower())

for sc in data["scenes"]:
    for li, l in enumerate(sc["lines"]):
        text = l if isinstance(l, str) else l["text"]
        key = f"{sc['id']}_{li}"; wav = vdir / f"{key}.wav"
        sig = f"{text}|{wav.stat().st_mtime_ns}"
        if key in cache and cache[key].get("sig") == sig:
            continue
        with wave.open(str(wav)) as w:
            sr = w.getframerate(); x = np.frombuffer(w.readframes(w.getnframes()), np.int16).astype(np.float32) / 32768
        if sr != 16000:  # remuestreo lineal a 16 kHz
            x = np.interp(np.arange(0, len(x), sr / 16000), np.arange(len(x)), x).astype(np.float32)
        segs, _ = model.transcribe(x, language="es", word_timestamps=True, initial_prompt=text)
        hyp = []
        for s in segs:
            for w in s.words:
                toks = NUM.get(norm(w.word), norm(w.word)).split()
                for k, t in enumerate(toks):  # un número leído como varias palabras
                    a = w.start + (w.end - w.start) * k / len(toks); b = w.start + (w.end - w.start) * (k + 1) / len(toks)
                    hyp.append((t, a, b))
        ref = [norm(w) for w in text.split()]
        times = [None] * len(ref)
        sm = difflib.SequenceMatcher(a=ref, b=[h[0] for h in hyp], autojunk=False)
        for blk in sm.get_matching_blocks():
            for k in range(blk.size):
                times[blk.a + k] = [hyp[blk.b + k][1], hyp[blk.b + k][2]]
        dur = len(x) / 16000
        # interpola huecos
        known = [i for i, t in enumerate(times) if t]
        for i in range(len(ref)):
            if times[i]: continue
            prev = max([k for k in known if k < i], default=None); nxt = min([k for k in known if k > i], default=None)
            a = times[prev][1] if prev is not None else 0.0; b = times[nxt][0] if nxt is not None else dur
            gap = [k for k in range(len(ref)) if (prev is None or k > prev) and (nxt is None or k < nxt)]
            j = gap.index(i); n = len(gap)
            times[i] = [a + (b - a) * j / n, a + (b - a) * (j + 1) / n]
        cache[key] = {"sig": sig, "words": [[round(a, 3), round(b, 3)] for a, b in times], "matched": len(known), "total": len(ref)}
        print(f"{key}: {len(known)}/{len(ref)} palabras alineadas")
out_p.write_text(json.dumps(cache, ensure_ascii=False, indent=1))

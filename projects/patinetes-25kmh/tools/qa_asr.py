import sys
from faster_whisper import WhisperModel
m = WhisperModel("small", device="cpu", compute_type="int8")
import numpy as np; audio=np.fromfile(sys.argv[1],dtype=np.float32)
segs, info = m.transcribe(audio, language="es", word_timestamps=False, beam_size=5)
for s in segs: print(f"[{s.start:5.1f}-{s.end:5.1f}] {s.text.strip()}")

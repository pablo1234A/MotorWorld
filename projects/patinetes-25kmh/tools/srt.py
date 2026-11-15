"""Genera 06_captions/subtitles.srt desde timeline.json (cifras en número, ≤ 2 líneas)."""
import json, sys, re
from pathlib import Path
proj = Path(sys.argv[1])
tl = json.loads((proj / "07_edit/timeline.json").read_text(encoding="utf-8"))
disp = json.loads((proj / "01_script/narration.json").read_text(encoding="utf-8"))["captions_display"]
keys = sorted(disp, key=lambda k: -len(k.split()))
norm = lambda w: re.sub(r"[.,;:¿?¡!]", "", w.lower())
def ts(t):
    ms = int(round(t * 1000)); h, ms = divmod(ms, 3600000); m, ms = divmod(ms, 60000); s, ms = divmod(ms, 1000)
    return f"{h:02}:{m:02}:{s:02},{ms:03}"
cues = []
for sc in tl["scenes"]:
    for L in sc["lines"]:
        ws, toks, i = L["words"], [], 0
        while i < len(ws):
            for k in keys:
                n = len(k.split())
                if " ".join(norm(x["w"]) for x in ws[i:i + n]) == k:
                    p = re.search(r"[.,;:?!]+$", ws[i + n - 1]["w"]); toks.append({"w": disp[k] + (p.group(0) if p else ""), "start": ws[i]["start"], "end": ws[i + n - 1]["end"]}); i += n; break
            else:
                toks.append(ws[i]); i += 1
        cur = []
        for t in toks:
            cur.append(t)
            if len(cur) >= 9 or re.search(r"[.,;:?!]$", t["w"]):
                cues.append(cur); cur = []
        if cur: cues.append(cur)
out = []
for i, c in enumerate(cues, 1):
    nxt = cues[i][0]["start"] if i < len(cues) else c[-1]["end"] + .5
    words = [w["w"] for w in c]
    text = " ".join(words)
    if len(text) > 38:
        mid = len(words) // 2; text = " ".join(words[:mid]) + "\n" + " ".join(words[mid:])
    out.append(f"{i}\n{ts(c[0]['start'])} --> {ts(min(nxt - .01, c[-1]['end'] + .15))}\n{text}\n")
(proj / "06_captions/subtitles.srt").write_text("\n".join(out), encoding="utf-8")
print(len(out), "subtítulos")

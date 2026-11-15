"""Genera 02_storyboard/scenes.json y storyboard.md a partir de timeline.json."""
import json, sys
from pathlib import Path
proj = Path(sys.argv[1]); tl = json.loads((proj / "07_edit/timeline.json").read_text(encoding="utf-8"))
plan = {
 "s1_gancho": ("Plano general de calle nocturna; zoom lento hacia dentro", "Piloto en silueta acelera por el carril bici; el velocímetro sube a 50 y cae a 25; sello LIMITADO A 25", ["LIMITADO A 25"], ["whoosh", "motor que sube/baja con la velocidad", "pitido", "frenada", "sello"]),
 "s2_ley": ("Plano general, travelling lateral", "Señal de 25 crece en la acera; peatones caminan; patinete fantasma en la acera, tachado en rojo", ["REAL DECRETO 970/2020", "6 – 25 km/h", "ACERA: PROHIBIDO"], ["whoosh", "señal metálica", "pop", "zumbido de error", "pasos"]),
 "s3_energia": ("Interior (aula) con lámpara de pie cálida; zoom lento", "El profesor en silueta señala la pizarra; se escribe E = ½·m·v²; bloques: 1 a 25 km/h, 4 a 50 km/h", ["× 4", "VELOCIDAD ×2 = ENERGÍA ×4"], ["tiza", "pops", "golpe grave"]),
 "s4_reaccion": ("Vista 3/4 elevada de un paso de cebra; cámara fija", "Un peatón cruza; regla de distancia en 1 s: 7 m a 25 km/h y 14 m a 50 km/h, justo hasta el peatón; destello rojo", ["1 s", "25 km/h", "50 km/h", "7 m / 14 m", "¡PEATÓN!"], ["tic de reloj", "motor", "timbre", "pasos"]),
 "s5_ruedas": ("Primer plano de la rueda (zoom 2,6×) → plano general", "Cota de 20 cm en la rueda; pasada a 25: bote en el bache; pasada a 50: vuelco y caída (sin violencia explícita)", ["RUEDAS DE 20 cm", "25 → SUSTO", "50 → CAÍDA"], ["motor", "bote", "choque", "arrastre"]),
 "s6_datos": ("Calle nocturna con panel de datos; cruza una ambulancia", "Barras 2023 (8) → 2024 (13) fallecidos; barras-edificio de hospitalizados 2020–2024 (93 → 419)", ["+62,5 %", "×4,5 EN 4 AÑOS"], ["sirena (paneo izq.→dcha.)", "pops", "golpes graves"]),
 "s7_cierre": ("Amanecer cálido; zoom lento", "El piloto, con casco, circula tranquilo a 25; tarjeta SEGURO OBLIGATORIO (Ley 5/2025) con sello VIGENTE; gran 25 km/h final", ["SEGURO OBLIGATORIO", "VIGENTE", "25 km/h"], ["papel", "sello", "subida", "golpe final"]),
}
sc = []
for s in tl["scenes"]:
    st = 0.0 if s is tl["scenes"][0] else s["start"]
    e, a, r, x = plan[s["id"]]
    sc.append({"id": s["id"], "inicio": round(st, 2), "fin": round(s["end"], 2), "duracion": round(s["end"] - st, 2),
               "voz": [l["text"] for l in s["lines"]], "encuadre": e, "accion": a, "rotulos": r, "sonido": x})
(proj / "02_storyboard/scenes.json").write_text(json.dumps({"titulo": tl["title"], "formato": "1080x1920, 30 fps", "duracion": tl["duration"], "escenas": sc}, ensure_ascii=False, indent=1), encoding="utf-8")
md = [f"# Storyboard — {tl['title']}", "", f"Duración total: {tl['duration']:.1f} s · 1080×1920 · 30 fps", "",
      "| # | Tiempo | Encuadre | Acción | Voz | Rótulos | Sonido |", "|---|---|---|---|---|---|---|"]
for i, d in enumerate(sc, 1):
    md.append(f"| {i} | {d['inicio']:.1f}–{d['fin']:.1f} s | {d['encuadre']} | {d['accion']} | {' '.join(d['voz'])} | {', '.join(d['rotulos'])} | {', '.join(d['sonido'])} |")
(proj / "02_storyboard/storyboard.md").write_text("\n".join(md) + "\n", encoding="utf-8")
print("storyboard ok")

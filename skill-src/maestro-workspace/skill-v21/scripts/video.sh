#!/usr/bin/env bash
# Exportaciones de vídeo profesionales con ffmpeg (probadas). Uso: scripts/video.sh <orden> <entrada> [salida]
#   info      entrada              → resolución, fps, códecs, duración y volumen (LUFS)
#   audio     entrada [salida]     → voz limpia + normalizado exacto a -16 LUFS (2 pasadas; LUFS=-14 para YouTube)
#   vertical  entrada [salida]     → 9:16 1080×1920 con fondo desenfocado (no recorta el sujeto)
#   recorte   entrada [salida]     → 9:16 1080×1920 recortando el centro
#   cuadrado  entrada [salida]     → 1:1 1080×1080
#   web       entrada [salida]     → hero de web: 1920 px, sin audio, ligero, arranque rápido
#   scrub     entrada [salida]     → para scroll-scrub: keyframe en cada frame
#   gif       entrada [salida]     → GIF con paleta optimizada (720 px, 15 fps)
#   mini      entrada [segundo]    → miniatura JPG del segundo indicado (por defecto 3)
#   subs      entrada              → genera subtítulos .srt con Whisper (si está instalado: pip install openai-whisper)
#   quemar    entrada subs.srt [salida] → subtítulos quemados estilo redes (grandes, contorno, zona segura)
#   paquete   entrada              → todas las versiones de entrega en una carpeta
set -euo pipefail
cmd="${1:-}"; in="${2:-}"
[[ -z "$cmd" || -z "$in" ]] && { sed -n '2,16p' "$0"; exit 1; }
[[ -f "$in" ]] || { echo "No existe: $in"; exit 1; }
base="${in%.*}"; LUFS="${LUFS:--16}"
ff() { ffmpeg -hide_banner -loglevel error -stats -y "$@"; }
has_audio() { [[ -n "$(ffprobe -v error -select_streams a -show_entries stream=index -of csv=p=0 "$1")" ]]; }
H264=(-c:v libx264 -preset slow -crf 18 -pix_fmt yuv420p -profile:v high -movflags +faststart)
AAC=(-c:a aac -b:a 192k -ar 48000)

case "$cmd" in
  info)
    ffprobe -v error -show_entries stream=codec_type,codec_name,width,height,r_frame_rate,bit_rate:format=duration,size -of compact=p=0 "$in"
    if has_audio "$in"; then ffmpeg -hide_banner -nostats -i "$in" -af ebur128=peak=true -f null - 2>&1 | grep -E "^\s+(I:|LRA:|Peak:)" | tail -3; fi ;;
  audio)
    out="${3:-${base}_audio.mp4}"
    has_audio "$in" || { echo "El vídeo no tiene audio"; exit 1; }
    pre="highpass=f=80,afftdn=nf=-25,acompressor=threshold=-18dB:ratio=3:attack=10:release=100"
    m=$(ffmpeg -hide_banner -nostats -i "$in" -af "$pre,loudnorm=I=$LUFS:TP=-1.5:LRA=11:print_format=json" -f null - 2>&1 | sed -n '/{/,/}/p')
    g() { echo "$m" | grep "\"$1\"" | sed -E 's/.*: "?([^",]+)"?,?/\1/'; }
    ff -i "$in" -af "$pre,loudnorm=I=$LUFS:TP=-1.5:LRA=11:measured_I=$(g input_i):measured_TP=$(g input_tp):measured_LRA=$(g input_lra):measured_thresh=$(g input_thresh):offset=$(g target_offset):linear=true" -c:v copy "${AAC[@]}" "$out"
    echo "→ $out" ;;
  vertical)
    out="${3:-${base}_9x16.mp4}"
    ff -i "$in" -filter_complex "[0:v]split[a][b];[a]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,boxblur=30:3,eq=brightness=-0.08[bg];[b]scale=1080:1920:force_original_aspect_ratio=decrease[fg];[bg][fg]overlay=(W-w)/2:(H-h)/2,setsar=1,fps=30[v]" \
      -map "[v]" -map 0:a? "${H264[@]}" "${AAC[@]}" "$out"; echo "→ $out" ;;
  recorte)
    out="${3:-${base}_9x16c.mp4}"
    ff -i "$in" -vf "scale=-2:1920,crop=1080:1920,setsar=1,fps=30" -map 0:v -map 0:a? "${H264[@]}" "${AAC[@]}" "$out"; echo "→ $out" ;;
  cuadrado)
    out="${3:-${base}_1x1.mp4}"
    ff -i "$in" -vf "crop='min(iw,ih)':'min(iw,ih)',scale=1080:1080,setsar=1" -map 0:v -map 0:a? "${H264[@]}" "${AAC[@]}" "$out"; echo "→ $out" ;;
  web)
    out="${3:-${base}_web.mp4}"
    ff -i "$in" -vf "scale='min(1920,iw)':-2" -c:v libx264 -preset slow -crf 25 -pix_fmt yuv420p -movflags +faststart -an "$out"
    ff -ss 0 -i "$out" -frames:v 1 -q:v 3 "${out%.*}_poster.jpg"; echo "→ $out (+ póster)" ;;
  scrub)
    out="${3:-${base}_scrub.mp4}"
    ff -i "$in" -vf "scale='min(1920,iw)':-2" -c:v libx264 -preset slow -crf 22 -g 1 -pix_fmt yuv420p -movflags +faststart -an "$out"; echo "→ $out" ;;
  gif)
    out="${3:-${base}.gif}"
    ff -i "$in" -vf "fps=15,scale=720:-1:flags=lanczos,split[s0][s1];[s0]palettegen=stats_mode=diff[p];[s1][p]paletteuse=dither=bayer:bayer_scale=4" "$out"; echo "→ $out" ;;
  mini)
    t="${3:-3}"; out="${base}_mini.jpg"
    ff -ss "$t" -i "$in" -frames:v 1 -vf "scale=1280:720:force_original_aspect_ratio=increase,crop=1280:720" -q:v 2 "$out"; echo "→ $out" ;;
  subs)
    command -v whisper >/dev/null || { echo "Instala Whisper: pip install openai-whisper  (o usa whisper.cpp)"; exit 1; }
    whisper "$in" --language Spanish --model "${WHISPER_MODEL:-small}" --output_format srt --output_dir "$(dirname "$in")" --word_timestamps True --max_words_per_line 4
    echo "→ ${base}.srt (revisa nombres y cifras a mano)" ;;
  quemar)
    srt="${3:-}"; out="${4:-${base}_subs.mp4}"; [[ -f "$srt" ]] || { echo "Falta el .srt"; exit 1; }
    h=$(ffprobe -v error -select_streams v:0 -show_entries stream=height -of csv=p=0 "$in"); mv=$(( h > 1500 ? 260 : 60 ))
    ff -i "$in" -vf "subtitles='${srt}':force_style='FontName=Montserrat,FontSize=15,Bold=1,PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,BorderStyle=1,Outline=2.5,Shadow=0,Alignment=2,MarginV=${mv}'" \
      -map 0:v -map 0:a? "${H264[@]}" -c:a copy "$out"; echo "→ $out" ;;
  paquete)
    d="${base}_entrega"; mkdir -p "$d"; n="$(basename "$base")"
    if has_audio "$in"; then "$0" audio "$in" "$d/${n}_master.mp4"; src="$d/${n}_master.mp4"; else ff -i "$in" "${H264[@]}" "$d/${n}_master.mp4"; src="$d/${n}_master.mp4"; fi
    "$0" vertical "$src" "$d/${n}_9x16.mp4"; "$0" cuadrado "$src" "$d/${n}_1x1.mp4"; "$0" web "$src" "$d/${n}_web.mp4"
    ff -ss 3 -i "$src" -frames:v 1 -vf "scale=1280:720:force_original_aspect_ratio=increase,crop=1280:720" -q:v 2 "$d/${n}_miniatura.jpg"
    echo "→ carpeta $d"; ls -la "$d" ;;
  *) sed -n '2,16p' "$0"; exit 1 ;;
esac

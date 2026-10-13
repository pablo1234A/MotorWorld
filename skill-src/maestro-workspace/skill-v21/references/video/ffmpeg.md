# ffmpeg: recetas exactas

Para lo habitual usa `scripts/video.sh` (ya probado). Recetas sueltas:

## Información
`ffprobe -v error -show_entries stream=codec_name,width,height,r_frame_rate,bit_rate -show_entries format=duration -of compact entrada.mp4`

## Cortar y unir
- Cortar sin recodificar (rápido; corta en keyframes): `ffmpeg -ss 00:00:05 -to 00:00:20 -i in.mp4 -c copy out.mp4`
- Cortar exacto (recodifica): `ffmpeg -ss 5 -to 20 -i in.mp4 -c:v libx264 -crf 18 -preset slow -c:a aac -b:a 192k out.mp4`
- Unir clips con el mismo formato: lista `file 'a.mp4'` por línea en `lista.txt` → `ffmpeg -f concat -safe 0 -i lista.txt -c copy out.mp4`

## Reencuadrar
- Vertical 9:16 con fondo desenfocado: `-filter_complex "[0:v]split[a][b];[a]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,boxblur=30:3,eq=brightness=-0.08[bg];[b]scale=1080:-2[fg];[bg][fg]overlay=(W-w)/2:(H-h)/2"`
- Recorte central 9:16 (sin fondo): `-vf "crop=ih*9/16:ih,scale=1080:1920"`
- Cuadrado 1:1: `-vf "crop=min(iw\,ih):min(iw\,ih),scale=1080:1080"`

## Audio
- Normalizar a −16 LUFS (dos pasadas = exacto; `scripts/video.sh audio` lo hace): `-af loudnorm=I=-16:TP=-1.5:LRA=11`
- Limpiar voz: `-af "highpass=f=80,afftdn=nf=-25,acompressor=threshold=-18dB:ratio=3:attack=10:release=100,loudnorm=I=-16:TP=-1.5"`
- Música bajo la voz (ducking): `-filter_complex "[1:a]volume=0.5[m];[m][0:a]sidechaincompress=threshold=0.05:ratio=8:attack=20:release=300[duck];[0:a][duck]amix=inputs=2:duration=first:weights=1 0.6"`
- Quitar audio: `-an`. Extraer audio: `-vn -c:a libmp3lame -q:a 2 voz.mp3`

## Texto y subtítulos
- Quemar SRT con estilo: `-vf "subtitles=subs.srt:force_style='FontName=Montserrat,FontSize=16,Bold=1,PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,Outline=3,Shadow=0,Alignment=2,MarginV=180'"`
- Marca de agua: `-i logo.png -filter_complex "overlay=W-w-40:40"`

## Velocidad y fps
- Cámara lenta suave por interpolación: `-vf "minterpolate=fps=60:mi_mode=mci,setpts=2*PTS"` (lento; para resultados top usa RIFE/Topaz).
- Acelerar ×2 con audio: `-filter_complex "[0:v]setpts=0.5*PTS[v];[0:a]atempo=2[a]" -map "[v]" -map "[a]"`

## Exportar para web
- Hero de web sin audio, ligero: `-c:v libx264 -crf 24 -preset slow -pix_fmt yuv420p -movflags +faststart -an -vf scale=1920:-2`
- WebM/AV1 más ligero: `-c:v libsvtav1 -crf 35 -preset 6 -an` (si tu ffmpeg tiene SVT-AV1)
- Vídeo para scroll-scrub (keyframe en cada frame): `-c:v libx264 -g 1 -crf 22 -pix_fmt yuv420p -movflags +faststart -an`
- GIF de calidad: `-vf "fps=15,scale=720:-1:flags=lanczos,split[s0][s1];[s0]palettegen[p];[s1][p]paletteuse=dither=bayer"`
- Miniatura del segundo 3: `-ss 3 -i in.mp4 -frames:v 1 -q:v 2 mini.jpg`

## Color
- LUT: `-vf "lut3d=look.cube"`; mezcla al 60 %: `-filter_complex "[0:v]split[a][b];[b]lut3d=look.cube[l];[a][l]blend=all_opacity=0.6"`
- Ajuste rápido: `-vf "eq=contrast=1.06:saturation=1.1:gamma=0.98"`

#!/usr/bin/env bash
# Mezcla final: voz (protagonista) + música con ducking + efectos, normalizado a -14 LUFS.
set -euo pipefail
P="${1:-.}"
cd "$P"
ffmpeg -y -v error \
  -i 05_audio/voice/narration_full.wav -i 05_audio/music/music.wav -i 05_audio/sfx/sfx.wav \
  -filter_complex "\
[0:a]aresample=48000,highpass=f=80,equalizer=f=3000:t=q:w=1:g=2,acompressor=threshold=-20dB:ratio=3:attack=5:release=120,volume=1.6,aformat=channel_layouts=stereo,asplit=2[v][vsc];\
[1:a]volume=0.22[m];\
[m][vsc]sidechaincompress=threshold=0.03:ratio=6:attack=20:release=350[md];\
[2:a]volume=0.55[s];\
[v][md][s]amix=inputs=3:normalize=0:duration=longest,loudnorm=I=-14:TP=-1.5:LRA=11[out]" \
  -map "[out]" -ar 48000 05_audio/mix/mix.wav
ffmpeg -y -v error -i 04_animation/scene_renders/video_noaudio.mp4 -i 05_audio/mix/mix.wav \
  -map 0:v -map 1:a -c:v copy -c:a aac -b:a 192k -shortest -movflags +faststart 08_exports/final_1080x1920.mp4
ffmpeg -y -v error -ss 4.9 -i 08_exports/final_1080x1920.mp4 -frames:v 1 08_exports/thumbnail.png
echo "mix ok"

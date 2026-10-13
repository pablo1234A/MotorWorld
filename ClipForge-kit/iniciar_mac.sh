#!/bin/sh
# Mac/Linux: necesita Python 3 y FFmpeg (Mac: brew install ffmpeg)
cd "$(dirname "$0")"
python3 -m pip install -q --upgrade yt-dlp
if [ "$1" = "clips" ]; then
  python3 hacer_clips.py "https://youtu.be/QBP8Nmx_m6Q" --clips 10 --duracion 30
else
  python3 clipforge_helper.py
fi

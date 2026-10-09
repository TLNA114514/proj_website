#!/usr/bin/env python3
"""Create lighter web playback variants; keep existing MP4s and originals intact."""
from pathlib import Path
import shutil
import subprocess

ROOT = Path(__file__).resolve().parents[1]
ffmpeg = shutil.which('ffmpeg')
if not ffmpeg:
    import imageio_ffmpeg
    ffmpeg = imageio_ffmpeg.get_ffmpeg_exe()

for folder in sorted((ROOT / 'assets/videos').iterdir()):
    if not folder.is_dir():
        continue
    for kind in ('rgb', 'tactile', 'contact'):
        source = folder / f'{kind}.mp4'
        if not source.exists():
            continue
        target = folder / f'{kind}-preview.mp4'
        if target.exists() and target.stat().st_mtime >= source.stat().st_mtime:
            continue
        subprocess.run([
            ffmpeg, '-hide_banner', '-loglevel', 'error', '-nostdin', '-y',
            '-i', str(source), '-vf', 'scale=768:-2,setsar=1', '-an',
            '-c:v', 'libx264', '-preset', 'slow', '-crf', '27' if kind == 'rgb' else '25',
            '-g', '30', '-keyint_min', '30', '-sc_threshold', '0',
            '-pix_fmt', 'yuv420p', '-movflags', '+faststart', str(target),
        ], check=True)
        print(f'{folder.name}/{kind}: {source.stat().st_size:,} → {target.stat().st_size:,} bytes', flush=True)

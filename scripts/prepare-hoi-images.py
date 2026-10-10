"""Prepare website derivatives; never change or remove the supplied originals."""
import argparse
from pathlib import Path
from PIL import Image, ImageChops

parser = argparse.ArgumentParser()
parser.add_argument("downloads", type=Path)
args = parser.parse_args()
root = Path(__file__).resolve().parents[1] / "assets" / "hoi"
for name in ("apple", "cube", "milk"):
    dest = root / name
    dest.mkdir(parents=True, exist_ok=True)
    rgb = Image.open(args.downloads / "hoi-in-the-wild" / name / "01_input.png").convert("RGB")
    # Find the photo rectangle, excluding only near-white exterior padding.
    channels = rgb.split()
    darkest = ImageChops.darker(ImageChops.darker(channels[0], channels[1]), channels[2])
    bbox = darkest.point(lambda value: 255 if value < 248 else 0).getbbox()
    rgb = rgb.crop(bbox)
    rgb.save(dest / "rgb.webp", quality=90, method=6)
    for kind in ("tactile", "contact"):
        im = Image.open(args.downloads / "hoi-0921" / name / "query_0" / f"right_{kind}.png").convert("RGBA")
        im.thumbnail((768, 768), Image.Resampling.LANCZOS)
        im.save(dest / f"{kind}.webp", quality=90, method=6)
    print(f"{name}: RGB crop {bbox} → {rgb.size}; {sum(p.stat().st_size for p in dest.glob('*.webp')):,} image bytes")

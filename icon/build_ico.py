"""
Create icon/icon.ico from icon/donner_256.png (or the first PNG in this folder).
Run from repo root: uv run python icon/build_ico.py
"""
from pathlib import Path

from PIL import Image

HERE = Path(__file__).resolve().parent
OUT = HERE / "icon.ico"
SIZES = [(16, 16), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)]

preferred = HERE / "donner_256.png"
png_files = sorted(HERE.glob("*.png"))
source_png = preferred if preferred.is_file() else (png_files[0] if png_files else None)
if not source_png:
    raise SystemExit(f"No PNG found in {HERE}")

img = Image.open(source_png).convert("RGBA")
if img.size != (256, 256):
    img = img.resize((256, 256), Image.Resampling.LANCZOS)

img.save(OUT, format="ICO", sizes=SIZES)
print(f"Generated {OUT} from {source_png.name} with sizes {SIZES}")

"""Génère les icônes PWA et Android de PAYZIK (PNG, PIL uniquement)."""

from pathlib import Path
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "public" / "icons"
ANDROID = ROOT / "android" / "app" / "src" / "main" / "res"
OUT.mkdir(parents=True, exist_ok=True)

NAVY = (11, 40, 70)
TEAL = (1, 204, 182)
INDIGO = (79, 70, 229)


def gradient(size: int) -> Image.Image:
    img = Image.new("RGB", (size, size), NAVY)
    draw = ImageDraw.Draw(img)
    for y in range(size):
        t = y / max(size - 1, 1)
        color = tuple(int(NAVY[i] + (INDIGO[i] - NAVY[i]) * t * 0.55) for i in range(3))
        draw.line((0, y, size, y), fill=color)
    return img


def draw_mark(draw: ImageDraw.ImageDraw, size: int, cx: float, cy: float, scale: float) -> None:
    """Lettre P géométrique, centrée sur (cx, cy)."""
    left = int(cx - size * 0.14 * scale)
    top = int(cy - size * 0.20 * scale)
    right = int(cx + size * 0.10 * scale)
    bottom = int(cy + size * 0.20 * scale)
    stroke = max(2, int(size * 0.055 * scale))
    draw.rounded_rectangle((left, top, right, bottom), radius=int(size * 0.05 * scale), fill=NAVY)
    draw.rectangle((left + stroke * 2, top + stroke, right - stroke, bottom - stroke), fill=TEAL)
    draw.rectangle(
        (left + stroke * 2, int(cy - size * 0.02 * scale), right + stroke * 2, int(cy + size * 0.02 * scale)),
        fill=NAVY,
    )
    draw.rectangle(
        (int(cx + size * 0.02 * scale), int(cy - size * 0.02 * scale), right + stroke * 2, bottom),
        fill=NAVY,
    )


def pwa_icon(size: int, maskable: bool) -> Image.Image:
    img = gradient(size)
    draw = ImageDraw.Draw(img)
    pad = int(size * (0.17 if maskable else 0.10))
    draw.rounded_rectangle(
        (pad, pad, size - pad, size - pad), radius=int(size * 0.22), fill=TEAL
    )
    draw_mark(draw, size, size / 2, size / 2, 1.0)
    return img


def round_icon(size: int) -> Image.Image:
    img = pwa_icon(size, False).convert("RGBA")
    mask = Image.new("L", (size, size), 0)
    ImageDraw.Draw(mask).ellipse((0, 0, size - 1, size - 1), fill=255)
    img.putalpha(mask)
    return img


def android_foreground(size: int) -> Image.Image:
    """Calque avant des icônes adaptatives : fond transparent, symbole en zone sûre."""
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    tile = int(size * 0.58)
    left = (size - tile) // 2
    draw.rounded_rectangle(
        (left, left, left + tile, left + tile), radius=int(tile * 0.22), fill=TEAL
    )
    draw_mark(draw, size, size / 2, size / 2, 0.58)
    return img


# --- PWA ---
for s in (192, 512):
    pwa_icon(s, False).save(OUT / f"icon-{s}.png", optimize=True)
    pwa_icon(s, True).save(OUT / f"icon-maskable-{s}.png", optimize=True)

# --- Android ---
DENSITIES = {"mdpi": 48, "hdpi": 72, "xhdpi": 96, "xxhdpi": 144, "xxxhdpi": 192}
FOREGROUND = {"mdpi": 108, "hdpi": 162, "xhdpi": 216, "xxhdpi": 324, "xxxhdpi": 432}
for density, size in DENSITIES.items():
    folder = ANDROID / f"mipmap-{density}"
    if not folder.exists():
        continue
    pwa_icon(size, False).save(folder / "ic_launcher.png", optimize=True)
    round_icon(size).save(folder / "ic_launcher_round.png", optimize=True)
    android_foreground(FOREGROUND[density]).save(folder / "ic_launcher_foreground.png", optimize=True)

# --- iOS ---
ios_icon = ROOT / "ios" / "App" / "App" / "Assets.xcassets" / "AppIcon.appiconset" / "AppIcon-512@2x.png"
if ios_icon.parent.exists():
    pwa_icon(1024, False).save(ios_icon, optimize=True)

bg = ANDROID / "values" / "ic_launcher_background.xml"
if bg.exists():
    bg.write_text(
        '<?xml version="1.0" encoding="utf-8"?>\n'
        "<resources>\n"
        '    <color name="ic_launcher_background">#0B2846</color>\n'
        "</resources>\n",
        encoding="utf-8",
    )

print(f"Icônes PWA générées dans {OUT}")
print("Icônes Android générées dans android/app/src/main/res/mipmap-*")

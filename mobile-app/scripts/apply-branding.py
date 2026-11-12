#!/usr/bin/env python3
"""Apply the official DCDS logo to freshly generated Capacitor native projects.

Run from mobile-app after npx cap add:
  python scripts/apply-branding.py android
  python scripts/apply-branding.py ios
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parents[1]
LOGO_PATH = ROOT / "branding" / "dcds-logo.png"

ANDROID_DENSITIES = {
    "mdpi": (48, 108), "hdpi": (72, 162), "xhdpi": (96, 216),
    "xxhdpi": (144, 324), "xxxhdpi": (192, 432),
}
ANDROID_SPLASH_PORT = {
    "mdpi": (320, 480), "hdpi": (480, 800), "xhdpi": (720, 1280),
    "xxhdpi": (960, 1600), "xxxhdpi": (1280, 1920),
}
ANDROID_SPLASH_LAND = {
    "mdpi": (480, 320), "hdpi": (800, 480), "xhdpi": (1280, 720),
    "xxhdpi": (1600, 960), "xxxhdpi": (1920, 1280),
}


def load_logo() -> Image.Image:
    if not LOGO_PATH.is_file():
        raise FileNotFoundError(f"Official DCDS logo not found: {LOGO_PATH}")
    logo = Image.open(LOGO_PATH).convert("RGBA")
    if logo.width != logo.height or logo.width < 64:
        raise ValueError("The DCDS logo must be a square PNG at least 64x64 pixels.")
    return logo


def square_icon(logo: Image.Image, size: int) -> Image.Image:
    scaled = logo.resize((size, size), Image.Resampling.LANCZOS)
    rgb = logo.convert("RGB")
    background = Image.new("RGB", (size, size))
    draw = ImageDraw.Draw(background)
    for y in range(size):
        source_y = round(y * (logo.height - 1) / max(1, size - 1))
        draw.line((0, y, size, y), fill=rgb.getpixel((logo.width // 2, source_y)))
    background.paste(scaled, (0, 0), scaled.getchannel("A"))
    return background.convert("RGBA")


def adaptive_foreground(logo: Image.Image, size: int) -> Image.Image:
    # Keep the complete logo inside Android's central adaptive-icon safe zone.
    canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    mark_size = round(size * 0.62)
    mark = logo.resize((mark_size, mark_size), Image.Resampling.LANCZOS)
    canvas.alpha_composite(mark, ((size - mark_size) // 2, (size - mark_size) // 2))
    return canvas


def splash_image(logo: Image.Image, size: tuple[int, int]) -> Image.Image:
    width, height = size
    top, bottom = (20, 0, 38), (47, 0, 83)
    bg = Image.new("RGB", size)
    draw = ImageDraw.Draw(bg)
    for y in range(height):
        t = y / max(1, height - 1)
        color = tuple(round(top[i] * (1 - t) + bottom[i] * t) for i in range(3))
        draw.line((0, y, width, y), fill=color)

    glow_width = max(1, round(min(width, height) * 0.70))
    glow = Image.new("RGBA", size, (0, 0, 0, 0))
    gd = ImageDraw.Draw(glow)
    cx, cy = width // 2, height // 2
    gd.ellipse((cx - glow_width // 2, cy - glow_width // 2,
                cx + glow_width // 2, cy + glow_width // 2),
               fill=(132, 0, 205, 65))
    glow = glow.filter(ImageFilter.GaussianBlur(max(1, round(min(width, height) * 0.14))))
    result = Image.alpha_composite(bg.convert("RGBA"), glow)
    mark_size = round(min(width, height) * 0.46)
    mark = logo.resize((mark_size, mark_size), Image.Resampling.LANCZOS)
    result.alpha_composite(mark, ((width - mark_size) // 2, (height - mark_size) // 2))
    return result.convert("RGB")


def apply_android(logo: Image.Image) -> None:
    res = ROOT / "android" / "app" / "src" / "main" / "res"
    if not res.is_dir():
        raise FileNotFoundError("Android project missing; run npx cap add android first.")

    for density, (icon_size, adaptive_size) in ANDROID_DENSITIES.items():
        folder = res / f"mipmap-{density}"
        folder.mkdir(parents=True, exist_ok=True)
        icon = square_icon(logo, icon_size)
        icon.save(folder / "ic_launcher.png", optimize=True)
        icon.save(folder / "ic_launcher_round.png", optimize=True)
        adaptive_foreground(logo, adaptive_size).save(
            folder / "ic_launcher_foreground.png", optimize=True
        )

    # Android themed icons use a white, transparent monochrome wordmark.
    monochrome = Image.new("RGBA", logo.size, (255, 255, 255, 0))
    source = logo.convert("RGB")
    source_pixels, mono_pixels = source.load(), monochrome.load()
    selected = 0
    for y in range(logo.height):
        for x in range(logo.width):
            r, g, b = source_pixels[x, y]
            spread = max(r, g, b) - min(r, g, b)
            light = (r + g + b) / 3
            if light > 188 and spread < 55:
                alpha = round(min(255, max(0, (light - 165) * 3.2)))
                if alpha:
                    mono_pixels[x, y] = (255, 255, 255, alpha)
                    selected += 1
    if selected < 100:
        raise ValueError("Could not extract the DCDS wordmark for Android themed icons.")
    (res / "drawable").mkdir(parents=True, exist_ok=True)
    monochrome.save(res / "drawable" / "ic_launcher_monochrome.png", optimize=True)
    v33 = res / "mipmap-anydpi-v33"
    v33.mkdir(parents=True, exist_ok=True)
    (v33 / "ic_launcher.xml").write_text(
        '<?xml version="1.0" encoding="utf-8"?>\n'
        '<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">\n'
        '  <background android:drawable="@color/ic_launcher_background"/>\n'
        '  <foreground android:drawable="@mipmap/ic_launcher_foreground"/>\n'
        '  <monochrome android:drawable="@drawable/ic_launcher_monochrome"/>\n'
        '</adaptive-icon>\n', encoding="utf-8"
    )
    (res / "values" / "ic_launcher_background.xml").write_text(
        '<?xml version="1.0" encoding="utf-8"?>\n'
        '<resources><color name="ic_launcher_background">#8500D6</color></resources>\n',
        encoding="utf-8"
    )

    for density, dimensions in ANDROID_SPLASH_PORT.items():
        folder = res / f"drawable-port-{density}"
        folder.mkdir(parents=True, exist_ok=True)
        splash_image(logo, dimensions).save(folder / "splash.png", optimize=True)
    for density, dimensions in ANDROID_SPLASH_LAND.items():
        folder = res / f"drawable-land-{density}"
        folder.mkdir(parents=True, exist_ok=True)
        splash_image(logo, dimensions).save(folder / "splash.png", optimize=True)
    splash_image(logo, (480, 320)).save(res / "drawable" / "splash.png", optimize=True)


def apply_ios(logo: Image.Image) -> None:
    assets = ROOT / "ios" / "App" / "App" / "Assets.xcassets"
    if not assets.is_dir():
        raise FileNotFoundError("iOS project missing; run npx cap add ios first.")

    iconset = assets / "AppIcon.appiconset"
    iconset.mkdir(parents=True, exist_ok=True)
    square_icon(logo, 1024).save(iconset / "AppIcon-512@2x.png", optimize=True)
    (iconset / "Contents.json").write_text(json.dumps({
        "images": [{
            "filename": "AppIcon-512@2x.png", "idiom": "universal",
            "platform": "ios", "size": "1024x1024"
        }],
        "info": {"author": "xcode", "version": 1}
    }, indent=2) + "\n", encoding="utf-8")

    splashset = assets / "Splash.imageset"
    splashset.mkdir(parents=True, exist_ok=True)
    artwork = splash_image(logo, (2732, 2732))
    for filename in ["splash-2732x2732-2.png", "splash-2732x2732-1.png",
                     "splash-2732x2732.png"]:
        artwork.save(splashset / filename, optimize=True)
    (splashset / "Contents.json").write_text(json.dumps({
        "images": [
            {"idiom": "universal", "filename": "splash-2732x2732-2.png", "scale": "1x"},
            {"idiom": "universal", "filename": "splash-2732x2732-1.png", "scale": "2x"},
            {"idiom": "universal", "filename": "splash-2732x2732.png", "scale": "3x"}
        ],
        "info": {"version": 1, "author": "xcode"}
    }, indent=2) + "\n", encoding="utf-8")


def main() -> None:
    if len(sys.argv) != 2 or sys.argv[1] not in {"android", "ios"}:
        raise SystemExit("Usage: python scripts/apply-branding.py android|ios")
    logo = load_logo()
    if sys.argv[1] == "android":
        apply_android(logo)
    else:
        apply_ios(logo)
    print(f"Applied official DCDS branding to the generated {sys.argv[1]} project.")


if __name__ == "__main__":
    main()

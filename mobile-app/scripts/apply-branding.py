#!/usr/bin/env python3
"""Apply the official DCDS logo to freshly generated Capacitor native projects.

Run from mobile-app after npx cap add:
  python scripts/apply-branding.py android
  python scripts/apply-branding.py ios
"""
from __future__ import annotations

import base64
import io
import json
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parents[1]
LOGO_PARTS = sorted((ROOT / "branding").glob("dcds-logo.webp.base64.part-*"))

ANDROID_DENSITIES = {
    "mdpi": (48, 108), "hdpi": (72, 162), "xhdpi": (96, 216),
    "xxhdpi": (144, 324), "xxxhdpi": (192, 432),
}
# White, portrait first frame; the mobile-only HTML intro adds the brand text.
ANDROID_SPLASH_PORT = {
    "mdpi": (384, 832), "hdpi": (576, 1248), "xhdpi": (768, 1664),
    "xxhdpi": (1152, 2496), "xxxhdpi": (1536, 3328),
}
ANDROID_SPLASH_LAND = {
    "mdpi": (480, 320), "hdpi": (720, 480), "xhdpi": (960, 640),
    "xxhdpi": (1440, 960), "xxxhdpi": (1920, 1280),
}


def load_logo() -> Image.Image:
    # Prefer the existing 512px public app icon used in the supplied reference.
    high_resolution_icon = ROOT / "www" / "assets" / "dcds-splash-icon-v4-512.png"
    if high_resolution_icon.is_file():
        logo = Image.open(high_resolution_icon).convert("RGBA")
    else:
        if len(LOGO_PARTS) != 3:
            raise FileNotFoundError(
                "DCDS logo source is missing: build the web bundle first or restore the branding source parts."
            )
        encoded = "".join(part.read_text(encoding="ascii").strip() for part in LOGO_PARTS)
        logo_bytes = base64.b64decode(encoded, validate=True)
        logo = Image.open(io.BytesIO(logo_bytes)).convert("RGBA")
    if logo.width != logo.height or logo.width < 64:
        raise ValueError("The DCDS logo must be a square image at least 64x64 pixels.")
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
    """Create the first native launch frame: white canvas with a large DCDS icon."""
    width, height = size
    canvas = Image.new("RGBA", size, (255, 255, 255, 255))
    mark_size = round(width * 0.66)
    mark = logo.resize((mark_size, mark_size), Image.Resampling.LANCZOS)
    canvas.alpha_composite(mark, ((width - mark_size) // 2, (height - mark_size) // 2))
    return canvas.convert("RGB")


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
    splash_image(logo, (384, 832)).save(res / "drawable" / "splash.png", optimize=True)

    # AndroidX / Android 12 launch contract: white background plus app icon.
    (res / "values" / "dcds_launch_background.xml").write_text(
        '<?xml version="1.0" encoding="utf-8"?>\n'
        '<resources><color name="dcds_launch_background">#FFFFFF</color></resources>\n',
        encoding="utf-8"
    )
    styles_path = res / "values" / "styles.xml"
    styles = styles_path.read_text(encoding="utf-8")
    launch_style = (
        '<style name="AppTheme.NoActionBarLaunch" parent="Theme.SplashScreen">\n'
        '        <item name="windowSplashScreenBackground">@color/dcds_launch_background</item>\n'
        '        <item name="windowSplashScreenAnimatedIcon">@mipmap/ic_launcher</item>\n'
        '        <item name="windowSplashScreenAnimationDuration">250</item>\n'
        '        <item name="postSplashScreenTheme">@style/AppTheme.NoActionBar</item>\n'
        '    </style>'
    )
    updated_styles, replacements = __import__("re").subn(
        r'<style name="AppTheme[.]NoActionBarLaunch" parent="Theme[.]SplashScreen">(?s:.*?)</style>',
        launch_style,
        styles,
        count=1
    )
    if replacements != 1:
        raise ValueError("Could not locate Capacitor's AppTheme.NoActionBarLaunch style.")
    styles_path.write_text(updated_styles, encoding="utf-8")


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

    # Correct 1x/2x/3x portrait assets for the iOS launch storyboard.
    splashset = assets / "Splash.imageset"
    splashset.mkdir(parents=True, exist_ok=True)
    splash_specs = [
        ("Splash-1x.png", (390, 844), "1x"),
        ("Splash-2x.png", (780, 1688), "2x"),
        ("Splash-3x.png", (1170, 2532), "3x"),
    ]
    image_entries = []
    for filename, dimensions, scale in splash_specs:
        splash_image(logo, dimensions).save(splashset / filename, optimize=True)
        image_entries.append({
            "idiom": "universal", "filename": filename, "scale": scale
        })
    (splashset / "Contents.json").write_text(json.dumps({
        "images": image_entries,
        "info": {"version": 1, "author": "xcode"}
    }, indent=2) + "\n", encoding="utf-8")

    storyboard = ROOT / "ios" / "App" / "App" / "Base.lproj" / "LaunchScreen.storyboard"
    if not storyboard.is_file():
        raise FileNotFoundError("iOS LaunchScreen.storyboard is missing from the generated project.")
    storyboard_text = storyboard.read_text(encoding="utf-8")
    if 'contentMode="scaleAspectFill"' not in storyboard_text:
        raise ValueError("Expected Capacitor launch-screen image view to use scaleAspectFill.")
    storyboard.write_text(
        storyboard_text.replace('contentMode="scaleAspectFill"', 'contentMode="scaleAspectFit"', 1),
        encoding="utf-8"
    )


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

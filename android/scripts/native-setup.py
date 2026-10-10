#!/usr/bin/env python3
"""Prepares the generated Android project (android/android) for the Google Play build of Chairbook.

Run after `npx cap add android` and before `npx cap sync android`. The android/android directory
is regenerated in CI on every run, so everything that differs from Capacitor's template is
applied here, in one place, and the script fails loudly if the template has changed shape.

  1. Launcher icon  ios/icons/icon-1024.png -> legacy and round mipmaps at every density, and the
                    adaptive-icon foreground (full icon on the 108 dp canvas; the chair sits inside the
                    72 dp safe zone) on the icon's own plum field colour. The template otherwise ships Capacitor's logo.
  2. Splash         Template splash images (Capacitor logo) replaced with the app icon centred on
                    the #FBF4F3 app background, matching the iOS launch screen.
  3. Version        versionCode and versionName from the environment (BUILD_NUMBER, VERSION_NAME).
  4. Checks         applicationId and namespace are com.hakoya.chairbook; targetSdk is at least 35.

Usage:  BUILD_NUMBER=7 VERSION_NAME=1.0.0 python3 scripts/native-setup.py
"""
import os, re, sys
from PIL import Image

AND = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))   # .../android
ROOT = os.path.dirname(AND)
PROJ = os.path.join(AND, "android")
RES = os.path.join(PROJ, "app", "src", "main", "res")
APP_GRADLE = os.path.join(PROJ, "app", "build.gradle")
VARS = os.path.join(PROJ, "variables.gradle")
APP_ID = "com.hakoya.chairbook"
ICON_BG = "#33222C"            # icon field colour
SPLASH_BG = (251, 244, 243)    # #FBF4F3, same as the iOS launch screen

def die(msg):
    sys.exit(f"native-setup: {msg}")

for p in (RES, APP_GRADLE, VARS):
    if not os.path.exists(p):
        die(f"{p} not found; run `npx cap add android` first")

src = Image.open(os.path.join(ROOT, "ios", "icons", "icon-1024.png")).convert("RGBA")
if src.size != (1024, 1024):
    die(f"ios/icons/icon-1024.png is {src.size}, expected 1024x1024")

# 1. Launcher icon ---------------------------------------------------------------------
DENS = {"mdpi": 1.0, "hdpi": 1.5, "xhdpi": 2.0, "xxhdpi": 3.0, "xxxhdpi": 4.0}
for d, s in DENS.items():
    folder = os.path.join(RES, f"mipmap-{d}")
    for name in ("ic_launcher.png", "ic_launcher_round.png", "ic_launcher_foreground.png"):
        if not os.path.exists(os.path.join(folder, name)):
            die(f"template changed: {folder}/{name} missing")
    legacy = round(48 * s)
    src.resize((legacy, legacy), Image.LANCZOS).save(os.path.join(folder, "ic_launcher.png"))
    # Round legacy icon: the square icon clipped to a circle.
    rnd = src.resize((legacy, legacy), Image.LANCZOS)
    mask = Image.new("L", (legacy, legacy), 0)
    from PIL import ImageDraw
    ImageDraw.Draw(mask).ellipse((0, 0, legacy - 1, legacy - 1), fill=255)
    out = Image.new("RGBA", (legacy, legacy), (0, 0, 0, 0))
    out.paste(rnd, (0, 0), mask)
    out.save(os.path.join(folder, "ic_launcher_round.png"))
    # Adaptive foreground: 108 dp canvas. The icon's field is the adaptive background colour, so
    # the full icon fills the canvas (the bookmark ribbon stays attached to the top edge) and
    # the chair, about 45% of the icon's width, sits inside the 72 dp safe zone.
    canvas = round(108 * s)
    art = canvas
    fg = Image.new("RGBA", (canvas, canvas), (0, 0, 0, 0))
    fg.paste(src.resize((art, art), Image.LANCZOS), ((canvas - art) // 2, (canvas - art) // 2))
    fg.save(os.path.join(folder, "ic_launcher_foreground.png"))

bg_xml = os.path.join(RES, "values", "ic_launcher_background.xml")
if not os.path.exists(bg_xml):
    die("template changed: values/ic_launcher_background.xml missing")
xml = open(bg_xml, encoding="utf-8").read()
xml, n = re.subn(r'(<color name="ic_launcher_background">)#[0-9A-Fa-f]{6}(</color>)', rf"\g<1>{ICON_BG}\g<2>", xml)
if n != 1:
    die("ic_launcher_background colour not found")
open(bg_xml, "w", encoding="utf-8").write(xml)

# 2. Splash ----------------------------------------------------------------------------
count = 0
for folder in os.listdir(RES):
    if not folder.startswith("drawable"):
        continue
    p = os.path.join(RES, folder, "splash.png")
    if not os.path.exists(p):
        continue
    w, h = Image.open(p).size
    splash = Image.new("RGB", (w, h), SPLASH_BG)
    side = max(48, round(min(w, h) * 0.28))
    mark = src.resize((side, side), Image.LANCZOS)
    splash.paste(mark, ((w - side) // 2, (h - side) // 2), mark)
    splash.save(p)
    count += 1
if count == 0:
    die("no splash.png found in drawable folders")

# 3. Version ---------------------------------------------------------------------------
code = os.environ.get("BUILD_NUMBER", "1")
name = os.environ.get("VERSION_NAME", "1.0.0")
if not code.isdigit():
    die(f"BUILD_NUMBER must be an integer, got {code!r}")
g = open(APP_GRADLE, encoding="utf-8").read()
g, n1 = re.subn(r"versionCode \d+", f"versionCode {code}", g)
g, n2 = re.subn(r'versionName "[^"]*"', f'versionName "{name}"', g)
if n1 != 1 or n2 != 1:
    die("versionCode/versionName not found exactly once in app/build.gradle")
open(APP_GRADLE, "w", encoding="utf-8").write(g)

# 4. Checks ----------------------------------------------------------------------------
if f'applicationId "{APP_ID}"' not in g:
    die(f"applicationId is not {APP_ID}; check capacitor.config.json")
if f'namespace = "{APP_ID}"' not in g and f"namespace \"{APP_ID}\"" not in g:
    die(f"namespace is not {APP_ID}")
v = open(VARS, encoding="utf-8").read()
m = re.search(r"targetSdkVersion = (\d+)", v)
if not m or int(m.group(1)) < 35:
    die(f"targetSdkVersion too low: {m.group(1) if m else 'missing'}")
print(f"native-setup: icons {len(DENS)} densities, {count} splash images, "
      f"versionCode {code}, versionName {name}, targetSdk {m.group(1)}")

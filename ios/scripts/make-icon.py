#!/usr/bin/env python3
"""Draws ios/icons/icon-1024.png, the Chairbook App Store icon: a salon chair in blush on the
app's plum, with a rose bookmark ribbon (the "book"). Colors are the app's own palette
(--ink #33222C, --blush #FBF4F3, --rose #B25B6C). Opaque RGB (App Store rule).
Run once after changing the design; the PNG is committed."""
import os
from PIL import Image, ImageDraw
IOS = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
S = 4
PLUM, BLUSH, ROSE, ROSE_TINT = (51, 34, 44), (251, 244, 243), (178, 91, 108), (243, 226, 228)
def r(*v): return [int(x * S) for x in v]
im = Image.new("RGB", (1024 * S, 1024 * S), PLUM)
d = ImageDraw.Draw(im)
# bookmark ribbon, top right
d.polygon([tuple(r(690, 0)), tuple(r(820, 0)), tuple(r(820, 250)), tuple(r(755, 205)), tuple(r(690, 250))], fill=ROSE)
# chair: backrest, seat, two armrests, pole, base (centred on x = 512)
d.rounded_rectangle(r(372, 250, 652, 560), radius=70 * S, fill=BLUSH)          # backrest
d.rounded_rectangle(r(322, 525, 702, 625), radius=48 * S, fill=BLUSH)          # seat
d.rounded_rectangle(r(282, 455, 342, 595), radius=30 * S, fill=ROSE_TINT)      # left arm
d.rounded_rectangle(r(682, 455, 742, 595), radius=30 * S, fill=ROSE_TINT)      # right arm
d.rectangle(r(484, 625, 540, 752), fill=BLUSH)                                 # pole
d.rounded_rectangle(r(337, 745, 687, 795), radius=25 * S, fill=ROSE)           # base
out = os.path.join(IOS, "icons", "icon-1024.png")
os.makedirs(os.path.dirname(out), exist_ok=True)
im.resize((1024, 1024), Image.LANCZOS).save(out)
print("wrote", out)

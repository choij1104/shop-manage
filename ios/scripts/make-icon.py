#!/usr/bin/env python3
"""Draws ios/icons/icon-1024.png, the Chairbook App Store icon (version 1.1 identity).

A champagne booking ring on graphite: an open ring (the day around the chair) whose gap holds a
mint dot (a paid visit), and three schedule bars inside, the middle one longest, like the day rail
on the Today screen. Colors are the app's own tokens: graphite #111316 -> #262B33, champagne
#E8B86C / #F4CF91, mint #7FD3AE. Opaque RGB (App Store rule). Run after changing the design;
the PNG is committed."""
import math, os
from PIL import Image, ImageDraw, ImageFilter

IOS = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
S = 4
N = 1024 * S
GOLD, GOLD_2, MINT = (232, 184, 108), (244, 207, 145), (127, 211, 174)

# graphite background with a soft diagonal light from the top right
bg = Image.new("RGB", (N, N))
px = bg.load()
top, bottom = (40, 45, 54), (14, 16, 19)
for y in range(0, N, S):
    for x in range(0, N, S):
        t = min(1.0, max(0.0, (y * 0.7 + (N - x) * 0.3) / N))
        c = tuple(int(top[i] + (bottom[i] - top[i]) * t) for i in range(3))
        for dy in range(S):
            for dx in range(S):
                px[x + dx, y + dy] = c
glow = Image.new("L", (N, N), 0)
ImageDraw.Draw(glow).ellipse([N * 0.45, -N * 0.25, N * 1.25, N * 0.55], fill=50)
glow = glow.filter(ImageFilter.GaussianBlur(N * 0.09))
bg = Image.composite(Image.new("RGB", (N, N), GOLD), bg, glow)

d = ImageDraw.Draw(bg)
cx, cy, R, W = N * 0.5, N * 0.5, N * 0.33, N * 0.085
# open ring from 300 deg round to 240 deg (gap at the top right)
d.arc([cx - R, cy - R, cx + R, cy + R], start=-30, end=270 - 0, fill=GOLD, width=int(W))
# round caps
for ang in (-30, 270):
    a = math.radians(ang)
    ex, ey = cx + (R - W / 2) * math.cos(a), cy + (R - W / 2) * math.sin(a)
    d.ellipse([ex - W / 2, ey - W / 2, ex + W / 2, ey + W / 2], fill=GOLD)
# mint dot in the gap
a = math.radians(-60)
mx, my = cx + (R - W / 2) * math.cos(a), cy + (R - W / 2) * math.sin(a)
rd = W * 0.62
d.ellipse([mx - rd, my - rd, mx + rd, my + rd], fill=MINT)
# three schedule bars
bh = N * 0.05
for i, (w, col) in enumerate(((0.30, GOLD_2), (0.40, GOLD_2), (0.22, GOLD_2))):
    y = cy + (i - 1) * N * 0.105
    x0 = cx - N * 0.2
    d.rounded_rectangle([x0, y - bh / 2, x0 + N * w, y + bh / 2], radius=bh / 2, fill=col)

out = os.path.join(IOS, "icons", "icon-1024.png")
os.makedirs(os.path.dirname(out), exist_ok=True)
bg.resize((1024, 1024), Image.LANCZOS).save(out)
print("wrote", out)

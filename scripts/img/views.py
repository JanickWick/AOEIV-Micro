#!/usr/bin/env python3
"""Zerlegt ein Chroma-Key-Ansichtsblatt (drei Ansichten nebeneinander auf Grün) in Einzelbilder
auf Weiß, quadratisch mit Rand – als Eingabe für die 3D-Erzeugung.
Aufruf: python3 -I scripts/img/views.py <blatt.png> <ausgabe-basis> <name1,name2,name3> [--pad 0.08]"""
import sys, argparse
import numpy as np
from PIL import Image

ap = argparse.ArgumentParser()
ap.add_argument('inp'); ap.add_argument('out'); ap.add_argument('names')
ap.add_argument('--pad', type=float, default=0.08)
ap.add_argument('--min-gap', type=int, default=12)
a = ap.parse_args()
names = a.names.split(',')
im = Image.open(a.inp).convert('RGB')
arr = np.asarray(im).astype(np.int16)
r, g, b = arr[..., 0], arr[..., 1], arr[..., 2]
# Chroma-Key: grün dominiert deutlich
green = (g > 120) & (g > r + 60) & (g > b + 60)
fg = ~green
cols = fg.any(axis=0)
# Spaltenbereiche mit Vordergrund, Lücken kleiner als min-gap überbrücken
segs = []
x = 0
W = len(cols)
while x < W:
    if cols[x]:
        x0 = x
        while x < W and (cols[x] or (x + a.min_gap < W and cols[x:x + a.min_gap].any())):
            x += 1
        segs.append((x0, x))
    else:
        x += 1
segs = [s for s in segs if s[1] - s[0] > W * 0.05]
if len(segs) != len(names):
    sys.exit(f'{len(segs)} Figuren gefunden, {len(names)} erwartet: {segs}')
for (x0, x1), name in zip(segs, names):
    rows = fg[:, x0:x1].any(axis=1)
    y0, y1 = np.argmax(rows), len(rows) - np.argmax(rows[::-1])
    crop = arr[y0:y1, x0:x1]
    mask = fg[y0:y1, x0:x1]
    h, w = mask.shape
    side = int(max(h, w) * (1 + 2 * a.pad))
    out = np.full((side, side, 3), 255, dtype=np.uint8)
    oy, ox = (side - h) // 2, (side - w) // 2
    region = out[oy:oy + h, ox:ox + w]
    region[mask] = crop[mask].astype(np.uint8)
    Image.fromarray(out).save(f'{a.out}-{name}.png')
    print(f'{a.out}-{name}.png {side}×{side}')

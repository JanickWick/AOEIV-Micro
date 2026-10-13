#!/usr/bin/env python3
"""Setzt den Textur-Atlas einer Figur aus Material-Bildern zusammen.

  python3 scripts/img/atlas.py src/data/atlas/archer.json public/textures/units/archer

Erzeugt <aus>.png (Farbe, sRGB) und <aus>-mask.png (Teamfarben-Maske, weiß = Teamfarbe).
Quellen: assets/raw/units/<name>.png (nahtlos gemachte Kopie aus assets/processed/units, falls
vorhanden) oder eine Flachfarbe '#rrggbb'. Optionen je Region: team, desaturate, darken.
"""
import json
import os
import sys

import numpy as np
from PIL import Image, ImageOps

RAW = 'assets/raw/units'
PROC = 'assets/processed/units'


def load_source(name, w, h):
    if name.startswith('#'):
        return Image.new('RGB', (w, h), name)
    for d in (PROC, RAW):
        p = os.path.join(d, name + '.png')
        if os.path.exists(p):
            im = Image.open(p).convert('RGB')
            return im.resize((w, h), Image.LANCZOS)
    raise SystemExit(f'Quelle fehlt: {name}')


def main(spec_path, out_base):
    spec = json.load(open(spec_path))
    size = spec['size']
    atlas = Image.new('RGB', (size, size), '#808080')
    mask = Image.new('L', (size, size), 0)
    for name, r in spec['regions'].items():
        x0, y0, x1, y1 = r['rect']
        w, h = x1 - x0, y1 - y0
        im = load_source(r['source'], w, h)
        if 'faceWidth' in r:
            # Gesicht nur auf den vorderen Teil des Kopfumfangs legen, Rest in der Randfarbe des Bildes
            src = Image.open(os.path.join(RAW, r['source'] + '.png')).convert('RGB')
            pad = src.getpixel((8, src.height // 2))
            fw = int(w * r['faceWidth'])
            im = Image.new('RGB', (w, h), pad)
            im.paste(src.resize((fw, h), Image.LANCZOS), ((w - fw) // 2, 0))
        if r.get('desaturate'):
            im = ImageOps.grayscale(im).convert('RGB')
            # Helligkeit auf mittleres Grau normieren, damit die Teamfarbe die Farbe bestimmt
            a = np.asarray(im).astype(np.float32)
            a = np.clip(a * (150.0 / max(1.0, a.mean())), 0, 255)
            im = Image.fromarray(a.astype(np.uint8))
        if 'darken' in r:
            a = np.asarray(im).astype(np.float32) * r['darken']
            im = Image.fromarray(np.clip(a, 0, 255).astype(np.uint8))
        atlas.paste(im, (x0, y0))
        if r.get('team'):
            mask.paste(255, (x0, y0, x1, y1))
        print(f'{name:10s} {w}x{h} <- {r["source"]}')
    os.makedirs(os.path.dirname(out_base), exist_ok=True)
    atlas.save(out_base + '.png', optimize=True)
    mask.save(out_base + '-mask.png', optimize=True)
    print('→', out_base + '.png', out_base + '-mask.png')


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])

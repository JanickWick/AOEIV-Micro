#!/usr/bin/env python3
"""Nachbearbeitung erzeugter Grafiken (Pillow + NumPy, keine weiteren Abhängigkeiten).

  python3 scripts/img/tools.py key   <ein.png> <aus.png> [--fringe]   Chroma-Grün freistellen -> RGBA
  python3 scripts/img/tools.py seam  <ein.png> <aus.png> [--band 0.12] Kachelnaht ausblenden
  python3 scripts/img/tools.py check <bild.png> [...]                  Auflösung, Alpha-Rand, Nahtmaß
  python3 scripts/img/tools.py tile  <ein.png> <aus.png>               2x2-Kachelvorschau
"""
import sys
import numpy as np
from PIL import Image


def load(path):
    return np.asarray(Image.open(path).convert('RGBA')).astype(np.float32)


def key_green(img, fringe=True):
    """Freistellen eines flachen #00FF00-Hintergrunds. Weicher Rand über den Grünüberschuss."""
    r, g, b, _ = img[..., 0], img[..., 1], img[..., 2], img[..., 3]
    # Grünüberschuss gegenüber dem stärkeren der beiden anderen Kanäle (0 … 255)
    excess = g - np.maximum(r, b)
    # Vollständig Hintergrund ab ~110 Überschuss, voll deckend unter ~30 (weiche Kante)
    alpha = np.clip(1.0 - (excess - 30.0) / 80.0, 0.0, 1.0)
    out = img.copy()
    if fringe:
        # Grünsaum entfernen: Grün auf das Mittel der anderen Kanäle begrenzen, wo es dominiert
        cap = np.maximum(r, b) + 8.0
        out[..., 1] = np.where(g > cap, cap, g)
    out[..., 3] = alpha * 255.0
    # Halbtransparente Pixel: Farbe vom Grün entsättigen
    return out


def seam_blend(img, band=0.12):
    """Kachelnaht ausblenden: Bild um die Hälfte verschieben, die Mittelkreuz-Naht mit der
    ursprünglichen Bildmitte überblenden, zurückschieben. Rand-Pixel passen danach zueinander."""
    h, w = img.shape[:2]
    rolled = np.roll(np.roll(img, h // 2, axis=0), w // 2, axis=1)
    bw, bh = int(w * band), int(h * band)
    # Gewicht 1 am Naht-Kreuz, 0 außerhalb des Bands
    x = np.abs(np.arange(w) - w / 2) / max(bw, 1)
    y = np.abs(np.arange(h) - h / 2) / max(bh, 1)
    wx = np.clip(1.0 - x, 0, 1)
    wy = np.clip(1.0 - y, 0, 1)
    wgt = np.maximum(wx[None, :], wy[:, None])
    wgt = (wgt * wgt * (3 - 2 * wgt))[..., None]  # smoothstep
    mixed = rolled * (1 - wgt) + img * wgt
    return np.roll(np.roll(mixed, -(h // 2), axis=0), -(w // 2), axis=1)


def seam_score(img):
    rgb = img[..., :3]
    lr = np.abs(rgb[:, 0] - rgb[:, -1]).mean()
    tb = np.abs(rgb[0] - rgb[-1]).mean()
    inner = np.abs(rgb[:, 1:] - rgb[:, :-1]).mean()
    return lr, tb, inner


def check(path):
    im = Image.open(path)
    img = np.asarray(im.convert('RGBA')).astype(np.float32)
    h, w = img.shape[:2]
    pow2 = (w & (w - 1) == 0) and (h & (h - 1) == 0)
    lr, tb, inner = seam_score(img)
    msg = [f'{path}: {w}x{h} {im.mode}', f'Zweierpotenz={pow2}', f'Naht l/r={lr:.1f} o/u={tb:.1f} innen={inner:.1f}']
    if im.mode == 'RGBA':
        a = img[..., 3]
        border = np.concatenate([a[0], a[-1], a[:, 0], a[:, -1]])
        msg.append(f'Alpha-Rand max={border.max():.0f} (0 = sauber freigestellt)')
        msg.append(f'deckend={100 * (a > 250).mean():.0f}%')
    print('  '.join(msg))


def save(img, path):
    Image.fromarray(np.clip(img, 0, 255).astype(np.uint8), 'RGBA').save(path)


def main(argv):
    if len(argv) < 2:
        print(__doc__); return 1
    cmd = argv[1]
    if cmd == 'key':
        save(key_green(load(argv[2]), fringe='--no-fringe' not in argv), argv[3])
    elif cmd == 'seam':
        band = float(argv[argv.index('--band') + 1]) if '--band' in argv else 0.12
        save(seam_blend(load(argv[2]), band), argv[3])
    elif cmd == 'check':
        for p in argv[2:]:
            check(p)
    elif cmd == 'tile':
        im = Image.open(argv[2]).convert('RGB'); im.thumbnail((512, 512))
        c = Image.new('RGB', (im.width * 2, im.height * 2))
        for x in (0, im.width):
            for y in (0, im.height):
                c.paste(im, (x, y))
        c.save(argv[3])
    else:
        print(__doc__); return 1
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv))

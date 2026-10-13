import { describe, expect, it } from 'vitest';
import { makeSplatMaps } from '../src/app/render3d/terrain';
import { SCENERY_MODELS } from '../src/app/render3d/scenery';
import type { DecorKind } from '../src/sim/decor';
import type { World } from '../src/sim/types';

function fakeWorld(seed: number): World {
  return { seed, map: { width: 48, height: 40 } } as unknown as World;
}

describe('Gelände-Verteilungskarte', () => {
  it('ist deterministisch aus dem Seed und bleibt im Wertebereich', () => {
    const a = makeSplatMaps(fakeWorld(7));
    const b = makeSplatMaps(fakeWorld(7));
    const c = makeSplatMaps(fakeWorld(8));
    const da = a.splat.image.data as Uint8Array;
    const db = b.splat.image.data as Uint8Array;
    const dc = c.splat.image.data as Uint8Array;
    expect(da.length).toBe(48 * 4 * 40 * 4 * 4);
    expect(Array.from(da.subarray(0, 4096))).toEqual(Array.from(db.subarray(0, 4096)));
    let diff = 0;
    for (let i = 0; i < da.length; i += 97) if (da[i] !== dc[i]) diff++;
    expect(diff).toBeGreaterThan(0);
    // Jede Bodenart kommt vor, aber keine deckt die Karte ganz
    for (let ch = 0; ch < 4; ch++) {
      let sum = 0;
      for (let i = ch; i < da.length; i += 4) sum += da[i]!;
      const mean = sum / (da.length / 4) / 255;
      expect(mean).toBeGreaterThan(0.01);
      expect(mean).toBeLessThan(0.45);
    }
    const m = a.macro.image.data as Uint8Array;
    expect(m.length).toBe(64 * 64 * 4);
  });
});

describe('Landschaftsmodelle', () => {
  it('decken jede Deko-Art mit mindestens einem Modell ab', () => {
    const kinds: DecorKind[] = ['tree', 'rock', 'bush', 'building'];
    for (const k of kinds) {
      expect(SCENERY_MODELS[k].length).toBeGreaterThan(0);
      for (const d of SCENERY_MODELS[k]) {
        expect(d.file).toMatch(/^models\/[a-z-]+\.glb$/);
        expect(d.height).toBeGreaterThan(0);
        expect(d.sway).toBeGreaterThanOrEqual(0);
      }
    }
  });
});

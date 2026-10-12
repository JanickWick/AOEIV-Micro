import { describe, expect, it } from 'vitest';
import { SCENARIOS } from '../src/data/scenarios/index';
import { hashWorld } from '../src/sim/hash';
import { maxOverlap } from '../src/sim/movement';
import { buildWorldFromScenario } from '../src/sim/scenario';
import { defs } from './helpers';

describe('Szenarien', () => {
  it('alle Szenarien lassen sich bauen, Einheiten überlappen nicht', () => {
    for (const sc of SCENARIOS) {
      const w = buildWorldFromScenario(defs, sc);
      const expected = sc.groups.reduce((s, g) => s + g.count, 0);
      expect(w.units.length).toBe(expected);
      expect(maxOverlap(w)).toBeLessThan(1e-6);
      for (const u of w.units) {
        expect(u.pos.x).toBeGreaterThan(0);
        expect(u.pos.y).toBeGreaterThan(0);
        expect(u.pos.x).toBeLessThan(sc.map.width);
        expect(u.pos.y).toBeLessThan(sc.map.height);
      }
    }
  });

  it('zufällige Startpositionen hängen nur vom Seed ab', () => {
    const sc = SCENARIOS[0]!;
    const a = buildWorldFromScenario(defs, sc, { randomStart: true, seed: 42 });
    const b = buildWorldFromScenario(defs, sc, { randomStart: true, seed: 42 });
    const c = buildWorldFromScenario(defs, sc, { randomStart: true, seed: 43 });
    expect(hashWorld(a)).toBe(hashWorld(b));
    expect(hashWorld(a)).not.toBe(hashWorld(c));
  });
});

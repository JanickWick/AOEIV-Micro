import { describe, expect, it } from 'vitest';
import { SCENARIOS } from '../src/data/scenarios/index';
import { generateDecor, obstaclesOf } from '../src/sim/decor';
import { hashWorld } from '../src/sim/hash';
import { dist } from '../src/sim/math';
import { createRng } from '../src/sim/rng';
import { buildWorldFromScenario } from '../src/sim/scenario';
import { runTicks, stepWorld } from '../src/sim/step';
import { defs, makeWorld, spawn } from './helpers';

describe('Deko und Hindernisse', () => {
  it('Deko ist deterministisch, liegt im Randstreifen und meidet freie Zonen', () => {
    const map = { width: 64, height: 48 };
    const zones = [{ center: { x: 32, y: 24 }, radius: 14 }];
    const a = generateDecor(createRng(3), map, { keepClear: zones });
    const b = generateDecor(createRng(3), map, { keepClear: zones });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(a.length).toBeGreaterThan(20);
    for (const d of a) {
      expect(dist(d.pos, { x: 32, y: 24 })).toBeGreaterThanOrEqual(14);
      if (d.kind !== 'building') {
        const inBand = d.pos.x < 10 || d.pos.x > 54 || d.pos.y < 10 || d.pos.y > 38;
        expect(inBand, `${d.kind} ${d.pos.x},${d.pos.y}`).toBe(true);
      }
    }
    expect(obstaclesOf(a).every((o) => o.radius > 0)).toBe(true);
    expect(a.some((d) => d.kind === 'bush' && d.radius === 0)).toBe(true);
  });

  it('eine Einheit läuft um einen Baum herum und kommt an', () => {
    const w = makeWorld();
    w.obstacles = [{ pos: { x: 15, y: 10 }, radius: 0.6 }];
    const u = spawn(w, 'spearman', 10, 10);
    stepWorld(w, [{ kind: 'move', unitIds: [u.id], target: { x: 20, y: 10 }, queue: false }]);
    let minToTree = Infinity;
    for (let i = 0; i < 60 * 20 && u.orders.length > 0; i++) {
      stepWorld(w);
      minToTree = Math.min(minToTree, dist(u.pos, { x: 15, y: 10 }));
    }
    expect(u.orders.length).toBe(0);
    expect(dist(u.pos, { x: 20, y: 10 })).toBeLessThan(0.2);
    expect(minToTree).toBeGreaterThan(0.6 + u.radius - 0.05);
  });

  it('Einheiten werden aus Hindernissen herausgeschoben', () => {
    const w = makeWorld();
    w.obstacles = [{ pos: { x: 10, y: 10 }, radius: 1 }];
    const u = spawn(w, 'archer', 10.2, 10);
    runTicks(w, 5);
    expect(dist(u.pos, { x: 10, y: 10 })).toBeGreaterThanOrEqual(1 + u.radius - 1e-6);
  });

  it('Szenarien erzeugen Deko außerhalb der Kampfzone; Welt ohne Deko bleibt wie bisher', () => {
    for (const sc of SCENARIOS) {
      const w = buildWorldFromScenario(defs, sc);
      expect(w.decor.length).toBeGreaterThan(0);
      for (const g of sc.groups) for (const o of w.obstacles) expect(dist(o.pos, g.center)).toBeGreaterThanOrEqual(12);
      const plain = buildWorldFromScenario(defs, sc, { decor: false });
      expect(plain.decor.length).toBe(0);
      // Einheiten-Startpositionen sind unabhängig von der Deko
      expect(plain.units.map((u) => [u.pos.x, u.pos.y])).toEqual(w.units.map((u) => [u.pos.x, u.pos.y]));
    }
    const a = buildWorldFromScenario(defs, SCENARIOS[0]!);
    const b = buildWorldFromScenario(defs, SCENARIOS[0]!);
    expect(hashWorld(a)).toBe(hashWorld(b));
  });
});

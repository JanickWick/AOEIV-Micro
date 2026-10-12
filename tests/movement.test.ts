import { describe, expect, it } from 'vitest';
import { hashWorld } from '../src/sim/hash';
import { dist } from '../src/sim/math';
import { maxOverlap } from '../src/sim/movement';
import { stepWorld, runTicks } from '../src/sim/step';
import type { Command } from '../src/sim/types';
import { makeWorld, spawn } from './helpers';

describe('Bewegung', () => {
  it('eine Einheit erreicht ihr Ziel und überschreitet nie ihr Maximaltempo', () => {
    const w = makeWorld();
    const u = spawn(w, 'spearman', 10, 10);
    stepWorld(w, [{ kind: 'move', unitIds: [u.id], target: { x: 20, y: 10 }, queue: false }]);
    let maxStep = 0;
    for (let i = 0; i < 60 * 12; i++) {
      stepWorld(w);
      maxStep = Math.max(maxStep, dist(u.pos, u.prevPos));
      if (u.orders.length === 0) break;
    }
    expect(u.orders.length).toBe(0);
    expect(dist(u.pos, { x: 20, y: 10 })).toBeLessThan(0.1);
    expect(maxStep).toBeLessThanOrEqual(u.maxSpeed * w.dt + 1e-9);
  });

  it('Laufzeit entspricht Tempo aus den Daten (Spearman 1,25 Tiles/s über 10 Tiles ≈ 8 s)', () => {
    const w = makeWorld();
    const u = spawn(w, 'spearman', 10, 10);
    stepWorld(w, [{ kind: 'move', unitIds: [u.id], target: { x: 20, y: 10 }, queue: false }]);
    let ticks = 1;
    while (u.orders.length > 0 && ticks < 60 * 20) {
      stepWorld(w);
      ticks++;
    }
    const seconds = ticks / 60;
    expect(seconds).toBeGreaterThan(7.9);
    expect(seconds).toBeLessThan(8.6);
  });

  it('Reiter ist schneller als Speerkämpfer', () => {
    const w = makeWorld();
    const s = spawn(w, 'spearman', 10, 10);
    const h = spawn(w, 'horseman', 10, 14);
    stepWorld(w, [
      { kind: 'move', unitIds: [s.id], target: { x: 30, y: 10 }, queue: false },
      { kind: 'move', unitIds: [h.id], target: { x: 30, y: 14 }, queue: false },
    ]);
    runTicks(w, 60 * 5);
    expect(h.pos.x).toBeGreaterThan(s.pos.x + 2);
  });

  it('Stopp hält die Einheit sofort an', () => {
    const w = makeWorld();
    const u = spawn(w, 'spearman', 10, 10);
    stepWorld(w, [{ kind: 'move', unitIds: [u.id], target: { x: 20, y: 10 }, queue: false }]);
    runTicks(w, 30);
    const cmd: Command = { kind: 'stop', unitIds: [u.id] };
    stepWorld(w, [cmd]);
    const p = { ...u.pos };
    runTicks(w, 30);
    expect(u.orders.length).toBe(0);
    expect(dist(u.pos, p)).toBeLessThan(1e-9);
  });

  it('eingereihte Wegpunkte werden der Reihe nach abgearbeitet', () => {
    const w = makeWorld();
    const u = spawn(w, 'horseman', 10, 10);
    stepWorld(w, [
      { kind: 'move', unitIds: [u.id], target: { x: 15, y: 10 }, queue: false },
      { kind: 'move', unitIds: [u.id], target: { x: 15, y: 15 }, queue: true },
      { kind: 'move', unitIds: [u.id], target: { x: 10, y: 15 }, queue: true },
    ]);
    expect(u.orders.length).toBe(3);
    const visited: string[] = [];
    for (let i = 0; i < 60 * 30 && u.orders.length > 0; i++) {
      stepWorld(w);
      for (const e of w.events) if (e.kind === 'arrived') visited.push(`${Math.round(u.pos.x)},${Math.round(u.pos.y)}`);
    }
    expect(visited).toEqual(['15,10', '15,15', '10,15']);
  });

  it('ein neuer Befehl ohne Shift ersetzt die Warteschlange', () => {
    const w = makeWorld();
    const u = spawn(w, 'horseman', 10, 10);
    stepWorld(w, [
      { kind: 'move', unitIds: [u.id], target: { x: 15, y: 10 }, queue: false },
      { kind: 'move', unitIds: [u.id], target: { x: 15, y: 15 }, queue: true },
    ]);
    stepWorld(w, [{ kind: 'move', unitIds: [u.id], target: { x: 5, y: 10 }, queue: false }]);
    expect(u.orders.length).toBe(1);
    expect(u.orders[0]).toMatchObject({ kind: 'move', target: { x: 5, y: 10 } });
  });

  it('Ziele außerhalb der Karte werden auf die Karte begrenzt', () => {
    const w = makeWorld();
    const u = spawn(w, 'spearman', 10, 10);
    stepWorld(w, [{ kind: 'move', unitIds: [u.id], target: { x: -50, y: 1000 }, queue: false }]);
    const t = (u.orders[0] as { target: { x: number; y: number } }).target;
    expect(t.x).toBeCloseTo(u.radius);
    expect(t.y).toBeCloseTo(w.map.height - u.radius);
  });
});

describe('Kollision und Formation', () => {
  it('zwei Einheiten mit demselben Ziel stapeln sich nicht', () => {
    const w = makeWorld();
    const a = spawn(w, 'spearman', 10, 10);
    const b = spawn(w, 'spearman', 10, 14);
    stepWorld(w, [
      { kind: 'move', unitIds: [a.id], target: { x: 20, y: 12 }, queue: false },
      { kind: 'move', unitIds: [b.id], target: { x: 20, y: 12 }, queue: false },
    ]);
    runTicks(w, 60 * 15);
    expect(a.orders.length).toBe(0);
    expect(b.orders.length).toBe(0);
    expect(maxOverlap(w)).toBeLessThan(0.02);
    expect(dist(a.pos, b.pos)).toBeGreaterThanOrEqual(a.radius + b.radius - 0.02);
  });

  it('Gruppenbefehl: alle kommen in lockerer Formation ohne Überlappung an', () => {
    const w = makeWorld();
    const units = [];
    for (let i = 0; i < 10; i++) units.push(spawn(w, 'archer', 10 + (i % 5), 10 + Math.floor(i / 5)));
    const ids = units.map((u) => u.id);
    stepWorld(w, [{ kind: 'move', unitIds: ids, target: { x: 30, y: 20 }, queue: false }]);
    // Alle Plätze unterschiedlich und um das Ziel herum
    const targets = units.map((u) => (u.orders[0] as { target: { x: number; y: number } }).target);
    for (let i = 0; i < targets.length; i++)
      for (let j = i + 1; j < targets.length; j++) expect(dist(targets[i]!, targets[j]!)).toBeGreaterThan(0.5);
    const cx = targets.reduce((s, t) => s + t.x, 0) / targets.length;
    const cy = targets.reduce((s, t) => s + t.y, 0) / targets.length;
    expect(cx).toBeCloseTo(30, 1);
    expect(cy).toBeCloseTo(20, 1);

    runTicks(w, 60 * 25);
    for (const u of units) expect(u.orders.length).toBe(0);
    expect(maxOverlap(w)).toBeLessThan(0.02);
    for (const u of units) expect(dist(u.pos, { x: 30, y: 20 })).toBeLessThan(4);
  });

  it('gemischte Gruppe läuft mit dem Tempo der langsamsten Einheit', () => {
    const w = makeWorld();
    const s = spawn(w, 'spearman', 10, 10);
    const h = spawn(w, 'horseman', 10, 12);
    stepWorld(w, [{ kind: 'move', unitIds: [s.id, h.id], target: { x: 40, y: 11 }, queue: false }]);
    runTicks(w, 60 * 5);
    expect(Math.abs(h.pos.x - s.pos.x)).toBeLessThan(2);
  });

  it('Formation: Nahkämpfer stehen vor Schützen', () => {
    const w = makeWorld();
    const a = spawn(w, 'archer', 10, 10);
    const m = spawn(w, 'man-at-arms', 10, 12);
    stepWorld(w, [{ kind: 'move', unitIds: [a.id, m.id], target: { x: 30, y: 11 }, queue: false }]);
    const ta = (a.orders[0] as { target: { x: number } }).target;
    const tm = (m.orders[0] as { target: { x: number } }).target;
    expect(tm.x).toBeGreaterThan(ta.x);
  });

  it('eine blockierte Einheit gibt in Zielnähe auf statt ewig zu schieben', () => {
    const w = makeWorld();
    const blocker = spawn(w, 'man-at-arms', 20, 10);
    const u = spawn(w, 'spearman', 10, 10);
    stepWorld(w, [{ kind: 'move', unitIds: [u.id], target: { x: 20, y: 10 }, queue: false }]);
    runTicks(w, 60 * 15);
    expect(u.orders.length).toBe(0);
    expect(dist(u.pos, blocker.pos)).toBeGreaterThanOrEqual(u.radius + blocker.radius - 0.02);
    expect(dist(u.pos, { x: 20, y: 10 })).toBeLessThan(1.5);
  });
});

describe('Determinismus', () => {
  function run(seed: number) {
    const w = makeWorld(seed);
    const ids = [];
    for (let i = 0; i < 12; i++) ids.push(spawn(w, i % 3 === 0 ? 'horseman' : 'archer', 10 + (i % 4), 10 + Math.floor(i / 4)).id);
    for (let t = 0; t < 600; t++) {
      const cmds: Command[] = [];
      if (t % 90 === 0) cmds.push({ kind: 'move', unitIds: ids, target: { x: w.rng.range(5, 59), y: w.rng.range(5, 43) }, queue: t % 180 === 0 });
      stepWorld(w, cmds);
    }
    return hashWorld(w);
  }

  it('gleicher Seed und gleiche Befehle ergeben denselben Zustand', () => {
    expect(run(7)).toBe(run(7));
  });

  it('anderer Seed ergibt anderen Zustand', () => {
    expect(run(7)).not.toBe(run(8));
  });
});

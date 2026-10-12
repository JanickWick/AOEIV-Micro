import { describe, expect, it } from 'vitest';
import { formationColumns, wedgeRows } from '../src/sim/formation';
import { computeMinimapLayout, minimapContains, minimapScreenToWorld, minimapWorldToScreen } from '../src/app/minimap';
import { SCREEN_UP } from '../src/app/camera3d';
import { makeWorld, spawn } from './helpers';
import { stepWorld } from '../src/sim/step';
import { dist } from '../src/sim/math';
import type { UnitState } from '../src/sim/types';

describe('Minimap-Raute', () => {
  const m = computeMinimapLayout(1920, 1080, 64, 64, true, 240);
  it('Welt ↔ Bild ist umkehrbar und die Kartenmitte liegt im Zentrum', () => {
    const c = minimapWorldToScreen(m, { x: 32, y: 32 });
    expect(c.x).toBeCloseTo(m.cx);
    expect(c.y).toBeCloseTo(m.cy);
    for (const p of [{ x: 0, y: 0 }, { x: 64, y: 0 }, { x: 10, y: 50 }]) {
      const back = minimapScreenToWorld(m, minimapWorldToScreen(m, p));
      expect(back.x).toBeCloseTo(p.x, 6);
      expect(back.y).toBeCloseTo(p.y, 6);
    }
  });
  it('Bildschirm-oben der Raute entspricht der Kamerarichtung', () => {
    const a = minimapWorldToScreen(m, { x: 32, y: 32 });
    const b = minimapWorldToScreen(m, { x: 32 + SCREEN_UP.x * 10, y: 32 + SCREEN_UP.y * 10 });
    expect(b.y).toBeLessThan(a.y - 20);
    expect(Math.abs(b.x - a.x)).toBeLessThan(0.01);
  });
  it('Treffertest: Ecken der Box außerhalb der Raute, Mitte innerhalb', () => {
    expect(minimapContains(m, { x: m.cx, y: m.cy })).toBe(true);
    expect(minimapContains(m, { x: m.x0 + 2, y: m.y0 + 2 })).toBe(false);
    const r = computeMinimapLayout(1920, 1080, 64, 48, false, 240);
    expect(minimapContains(r, { x: r.x0 + 2, y: r.cy })).toBe(true);
    expect(minimapContains(r, { x: r.x0 + 2, y: r.y0 + 2 })).toBe(false); // Karte ist flacher als die Box
  });
});

describe('Formationen und Löschen', () => {
  it('aufgelockert erhöht den Abstand, versetzt verschiebt jede zweite Reihe, Löschen zählt als Tod', () => {
    const w = makeWorld();
    const units: UnitState[] = [];
    for (let i = 0; i < 6; i++) units.push(spawn(w, 'archer', 10 + i * 0.6, 10));
    const ids = units.map((u) => u.id);
    const spacingFor = () => {
      stepWorld(w, [{ kind: 'move', unitIds: ids, target: { x: 30, y: 20 }, queue: false }]);
      const t = units.map((u) => (u.orders[0] as { target: { x: number; y: number } }).target);
      let min = Infinity;
      for (let i = 0; i < t.length; i++) for (let j = i + 1; j < t.length; j++) min = Math.min(min, dist(t[i]!, t[j]!));
      return min;
    };
    const line = spacingFor();
    stepWorld(w, [{ kind: 'formation', unitIds: ids, formation: 'spread' }]);
    const spread = spacingFor();
    expect(spread).toBeGreaterThan(line + 0.4);
    stepWorld(w, [{ kind: 'formation', unitIds: ids, formation: 'wedge' }]);
    stepWorld(w, [{ kind: 'move', unitIds: ids, target: { x: 30, y: 10 }, queue: false }]);
    // Keil: Reihen 1 / 3 / 2 (von hinten), also drei verschiedene Vorwärts-Positionen (Bewegung in +x)
    const xs = units.map((u) => Math.round((u.orders[0] as { target: { x: number } }).target.x * 100));
    const byRow = new Map<number, number>();
    for (const x of xs) byRow.set(x, (byRow.get(x) ?? 0) + 1);
    expect([...byRow.values()].sort((a, b) => a - b)).toEqual([1, 2, 3]);
    stepWorld(w, [{ kind: 'delete', unitIds: [ids[0]!] }]);
    expect(units[0]!.alive).toBe(false);
    expect(w.events.some((e) => e.kind === 'died' && e.unitId === ids[0] && e.killerId === null)).toBe(true);
  });
});

describe('Formationen nach Clips 8–10', () => {
  it('Linie: 15 Einheiten in 3 Reihen zu 5, Nahkampf vorn, Kavallerie hinten; Keil 1/3/5/6; aufgelockert doppelt so weit', () => {
    expect(formationColumns(3)).toBe(3);
    expect(formationColumns(10)).toBe(5);
    expect(wedgeRows(15)).toEqual([1, 3, 5, 6]);
    const w = makeWorld();
    const units: UnitState[] = [];
    for (let i = 0; i < 5; i++) units.push(spawn(w, 'horseman', 10, 10 + i));
    for (let i = 0; i < 5; i++) units.push(spawn(w, 'archer', 11, 10 + i));
    for (let i = 0; i < 5; i++) units.push(spawn(w, 'spearman', 12, 10 + i));
    const ids = units.map((u) => u.id);
    const targets = () => {
      stepWorld(w, [{ kind: 'move', unitIds: ids, target: { x: 40, y: 12 }, queue: false }]);
      return units.map((u) => ({ u, t: (u.orders[0] as { target: { x: number; y: number } }).target }));
    };
    // Linie: Bewegung in +x → Speere vorn (größtes x), Reiter hinten
    const line = targets();
    const xOf = (defId: string) => line.filter((e) => e.u.defId === defId).map((e) => e.t.x);
    const rowsX = new Set(line.map((e) => Math.round(e.t.x * 100)));
    expect(rowsX.size).toBe(3);
    expect(Math.min(...xOf('spearman'))).toBeGreaterThan(Math.max(...xOf('archer')));
    expect(Math.min(...xOf('archer'))).toBeGreaterThan(Math.max(...xOf('horseman')));
    const width = (defId: string) => {
      const ys = line.filter((e) => e.u.defId === defId).map((e) => e.t.y);
      return Math.max(...ys) - Math.min(...ys);
    };
    // Aufgelockert: Breite der Reihen verdoppelt
    stepWorld(w, [{ kind: 'formation', unitIds: ids, formation: 'spread' }]);
    const spread = targets();
    const widthSpread = (defId: string) => {
      const ys = spread.filter((e) => e.u.defId === defId).map((e) => e.t.y);
      return Math.max(...ys) - Math.min(...ys);
    };
    expect(widthSpread('archer')).toBeCloseTo(width('archer') * 2, 5);
    // Keil: Reihenbreiten 1, 3, 5, 6 von hinten, Reiter an der Spitze
    stepWorld(w, [{ kind: 'formation', unitIds: ids, formation: 'wedge' }]);
    const wedge = targets();
    const byRow = new Map<number, typeof wedge>();
    for (const e of wedge) {
      const k = Math.round(e.t.x * 100);
      byRow.set(k, [...(byRow.get(k) ?? []), e]);
    }
    const rows = [...byRow.entries()].sort((a, b) => a[0] - b[0]).map((r) => r[1]);
    expect(rows.map((r) => r.length)).toEqual([1, 3, 5, 6]);
    expect(rows[0]![0]!.u.defId).toBe('horseman');
  });
});

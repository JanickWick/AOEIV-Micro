import { describe, expect, it } from 'vitest';
import { ControlGroups } from '../src/app/groups';
import { GRID_DEFAULT_PRESET, ACTIONS, bindingFromEvent, HotkeyMap, MEIN_LAYOUT_PRESET, PRESETS, sameBinding } from '../src/app/hotkeys';
import { dist } from '../src/sim/math';
import { runTicks, stepWorld } from '../src/sim/step';
import type { SimEvent } from '../src/sim/types';
import { makeWorld, spawn } from './helpers';

describe('Patrouille', () => {
  it('pendelt zwischen Start und Ziel', () => {
    const w = makeWorld();
    const h = spawn(w, 'horseman', 10, 10);
    stepWorld(w, [{ kind: 'patrol', unitIds: [h.id], target: { x: 16, y: 10 }, queue: false }]);
    let maxX = 0;
    let minXAfterTurn = Infinity;
    let reachedFar = false;
    for (let i = 0; i < 60 * 12; i++) {
      stepWorld(w);
      maxX = Math.max(maxX, h.pos.x);
      if (h.pos.x > 15.5) reachedFar = true;
      if (reachedFar) minXAfterTurn = Math.min(minXAfterTurn, h.pos.x);
    }
    expect(reachedFar).toBe(true);
    expect(minXAfterTurn).toBeLessThan(10.5); // wieder zurück
    expect(h.orders.length).toBe(1); // Patrouille endet nicht
  });

  it('greift unterwegs an und patrouilliert danach weiter', () => {
    const w = makeWorld();
    const s = spawn(w, 'spearman', 10, 10);
    const archer = spawn(w, 'archer', 14, 11, 1);
    archer.attack.cooldownLeft = 1e9;
    archer.hp = 8;
    stepWorld(w, [{ kind: 'patrol', unitIds: [s.id], target: { x: 18, y: 10 }, queue: false }]);
    runTicks(w, 60 * 20);
    expect(archer.alive).toBe(false);
    expect(s.orders[0]?.kind).toBe('patrol');
    expect(s.speed).toBeGreaterThan(0);
  });
});

describe('Formation ausrichten', () => {
  it('Bewegungsbefehl mit Blickrichtung dreht die Formationsreihe quer zur Richtung', () => {
    const w = makeWorld();
    const units = [spawn(w, 'archer', 10, 10), spawn(w, 'archer', 10, 11), spawn(w, 'archer', 10, 12)];
    const ids = units.map((u) => u.id);
    stepWorld(w, [{ kind: 'move', unitIds: ids, target: { x: 30, y: 20 }, queue: false, facing: { x: 0, y: 1 } }]);
    const targets = units.map((u) => (u.orders[0] as { target: { x: number; y: number } }).target);
    // Blick nach unten: die Reihe liegt waagerecht (gleiches y, verschiedene x)
    const ys = new Set(targets.map((t) => Math.round(t.y * 100)));
    const xs = new Set(targets.map((t) => Math.round(t.x * 100)));
    expect(ys.size).toBe(1);
    expect(xs.size).toBe(3);
  });
});

describe('Position halten einreihen', () => {
  it('Halten nach einem Bewegungsbefehl wird nach der Ankunft wirksam', () => {
    const w = makeWorld();
    const a = spawn(w, 'archer', 10, 10);
    stepWorld(w, [
      { kind: 'move', unitIds: [a.id], target: { x: 13, y: 10 }, queue: false },
      { kind: 'hold', unitIds: [a.id], queue: true },
    ]);
    expect(a.orders.map((o) => o.kind)).toEqual(['move', 'hold']);
    runTicks(w, 60 * 5);
    expect(a.orders[0]?.kind).toBe('hold');
    expect(dist(a.pos, { x: 13, y: 10 })).toBeLessThan(0.2);
  });
});

describe('Hotkeys', () => {
  it('Presets decken alle Aktionen ab und Modifier werden exakt verglichen', () => {
    for (const p of PRESETS) for (const a of ACTIONS) expect(Array.isArray(p.bindings[a.id]), `${p.id} ${a.id}`).toBe(true);
    const m = new HotkeyMap('raster-vorschlag');
    expect(m.match({ code: 'Digit1', ctrlKey: false, shiftKey: false, altKey: false })).toBe('group.select.1');
    expect(m.match({ code: 'Digit1', ctrlKey: true, shiftKey: false, altKey: false })).toBe('group.set.1');
    expect(m.match({ code: 'Digit1', ctrlKey: false, shiftKey: true, altKey: false })).toBe('group.add.1');
    expect(m.match({ code: 'KeyA', ctrlKey: false, shiftKey: false, altKey: false })).toBe('unit.attackMove');
    expect(m.match({ code: 'KeyA', ctrlKey: true, shiftKey: false, altKey: false })).toBeNull();
    void GRID_DEFAULT_PRESET;
  });

  it('"Mein Layout" ist Standard und entspricht der Spieldatei', () => {
    const m = new HotkeyMap();
    expect(m.presetId).toBe('mein-layout');
    expect(m.match({ code: 'KeyA', ctrlKey: false, shiftKey: false, altKey: false })).toBe('unit.attackMove');
    expect(m.match({ code: 'KeyS', ctrlKey: false, shiftKey: false, altKey: false })).toBe('unit.stop');
    expect(m.match({ code: 'KeyD', ctrlKey: false, shiftKey: false, altKey: false })).toBe('unit.patrol');
    expect(m.match({ code: 'KeyV', ctrlKey: false, shiftKey: false, altKey: false })).toBe('unit.hold');
    expect(m.match({ code: 'KeyC', ctrlKey: true, shiftKey: true, altKey: false })).toBe('select.allMilitary');
    expect(m.match({ code: 'Tab', ctrlKey: false, shiftKey: false, altKey: false })).toBe('subselect.next');
    expect(m.match({ code: 'Tab', ctrlKey: true, shiftKey: false, altKey: false })).toBe('subselect.prev');
    expect(m.match({ code: 'Numpad3', ctrlKey: true, shiftKey: true, altKey: false })).toBe('group.addExclusive.3');
    expect(m.match({ code: 'Digit0', ctrlKey: true, shiftKey: false, altKey: false })).toBe('group.set.0');
    expect(m.match({ code: 'Backspace', ctrlKey: true, shiftKey: false, altKey: false })).toBe('group.removeAll');
    expect(m.match({ code: 'F5', ctrlKey: false, shiftKey: false, altKey: false })).toBe('camera.focusSelection');
    expect(MEIN_LAYOUT_PRESET['select.allOfType']).toEqual([]);
  });

  it('Umbelegen, Konflikte und Reset', () => {
    const m = new HotkeyMap('raster-vorschlag');
    const b = bindingFromEvent({ code: 'KeyQ', ctrlKey: false, shiftKey: false, altKey: false })!;
    expect(m.conflicts(b)).toEqual([]);
    m.set('unit.attackMove', [b]);
    expect(m.conflicts(b, 'unit.attackMove')).toEqual([]);
    expect(m.conflicts(b)).toEqual(['unit.attackMove']);
    expect(m.isCustom('unit.attackMove')).toBe(true);
    expect(m.isCustom('unit.stop')).toBe(false);
    expect(m.match({ code: 'KeyQ', ctrlKey: false, shiftKey: false, altKey: false })).toBe('unit.attackMove');
    m.resetToPreset();
    expect(sameBinding(m.get('unit.attackMove')[0]!, { code: 'KeyA' })).toBe(true);
    expect(bindingFromEvent({ code: 'ShiftLeft', ctrlKey: false, shiftKey: true, altKey: false })).toBeNull();
  });
});

describe('Kontrollgruppen', () => {
  it('setzen, hinzufügen, tote Einheiten entfernen', () => {
    const w = makeWorld();
    const a = spawn(w, 'archer', 10, 10);
    const b = spawn(w, 'archer', 11, 10);
    const c = spawn(w, 'horseman', 12, 10);
    const g = new ControlGroups();
    g.set(1, [a.id, b.id]);
    g.add(1, [c.id, a.id]);
    expect(g.get(1, w.units).sort()).toEqual([a.id, b.id, c.id]);
    expect(g.groupsOf(a.id)).toEqual([1]);
    b.alive = false;
    expect(g.get(1, w.units).sort()).toEqual([a.id, c.id]);
    g.set(2, []);
    expect(g.get(2, w.units)).toEqual([]);
    g.set(2, [a.id, c.id]);
    g.addExclusive(3, [a.id]);
    expect(g.get(1, w.units)).toEqual([c.id]);
    expect(g.get(2, w.units)).toEqual([c.id]);
    expect(g.get(3, w.units)).toEqual([a.id]);
    g.removeFromAll([c.id]);
    expect(g.get(1, w.units)).toEqual([]);
    expect(g.get(2, w.units)).toEqual([]);
  });
});

describe('Befehlsketten', () => {
  it('Attack-Move, dann Bewegung: beides wird der Reihe nach abgearbeitet', () => {
    const w = makeWorld(1, 80, 48);
    const s = spawn(w, 'spearman', 5, 10);
    const archer = spawn(w, 'archer', 12, 11, 1);
    archer.attack.cooldownLeft = 1e9;
    archer.hp = 8;
    stepWorld(w, [
      { kind: 'attackMove', unitIds: [s.id], target: { x: 20, y: 10 }, queue: false },
      { kind: 'move', unitIds: [s.id], target: { x: 20, y: 20 }, queue: true },
    ]);
    const arrivals: SimEvent[] = [];
    for (let i = 0; i < 60 * 40 && s.orders.length > 0; i++) {
      stepWorld(w);
      arrivals.push(...w.events.filter((e) => e.kind === 'arrived'));
    }
    expect(archer.alive).toBe(false);
    expect(arrivals.length).toBe(2);
    expect(dist(s.pos, { x: 20, y: 20 })).toBeLessThan(0.5);
  });
});

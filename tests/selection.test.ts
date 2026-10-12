import { describe, expect, it } from 'vitest';
import { addToSelection, normalizeRect, pruneSelection, toggleSelection, unitAtPoint, unitsInRect, unitsOfTypeInRect } from '../src/app/selection';
import { makeWorld, spawn } from './helpers';

describe('Auswahl', () => {
  it('Auswahlrahmen wählt nur eigene Einheiten mit Mittelpunkt im Rechteck', () => {
    const w = makeWorld();
    const a = spawn(w, 'archer', 10, 10);
    const b = spawn(w, 'archer', 12, 12);
    spawn(w, 'spearman', 11, 11, 1);
    spawn(w, 'archer', 20, 20);
    const r = normalizeRect({ x: 13, y: 13 }, { x: 9, y: 9 });
    expect(unitsInRect(w.units, r, 0).map((u) => u.id).sort()).toEqual([a.id, b.id]);
  });

  it('Doppelklick-Logik: alle Einheiten des Typs im Bereich', () => {
    const w = makeWorld();
    spawn(w, 'archer', 10, 10);
    spawn(w, 'archer', 12, 12);
    spawn(w, 'spearman', 11, 11);
    const r = { x0: 0, y0: 0, x1: 64, y1: 48 };
    expect(unitsOfTypeInRect(w.units, 'archer', r, 0).length).toBe(2);
  });

  it('Klick trifft die nächste Einheit, Shift wechselt den Zustand', () => {
    const w = makeWorld();
    const a = spawn(w, 'archer', 10, 10);
    const b = spawn(w, 'archer', 10.5, 10);
    expect(unitAtPoint(w.units, { x: 10.1, y: 10 })?.id).toBe(a.id);
    expect(unitAtPoint(w.units, { x: 10.45, y: 10 })?.id).toBe(b.id);
    expect(unitAtPoint(w.units, { x: 30, y: 30 })).toBeNull();
    expect(toggleSelection([a.id], [a.id, b.id]).sort()).toEqual([b.id]);
    expect(addToSelection([a.id], [a.id, b.id]).sort()).toEqual([a.id, b.id]);
  });

  it('tote Einheiten fallen aus der Auswahl', () => {
    const w = makeWorld();
    const a = spawn(w, 'archer', 10, 10);
    const b = spawn(w, 'archer', 12, 12);
    b.alive = false;
    expect(pruneSelection([a.id, b.id], w.units)).toEqual([a.id]);
  });
});

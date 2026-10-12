/**
 * Formationen für Gruppenbefehle, nach den Clips 8–10 (reference/videos):
 * - Linie (Z): Block in Reihen nach Klasse, Nahkampf-Infanterie vorn, Schützen/Belagerung dahinter,
 *   Kavallerie hinten (Clip 8: 15 Einheiten = 3 Reihen zu 5; Vorn = Bewegungsrichtung).
 * - Keil (X): Reihenbreiten 1, 3, 5, … von hinten (Spitze, Kavallerie) nach vorn, letzte Reihe
 *   nimmt den Rest (Clip 9: 1/3/5/6).
 * - Aufgelockert (C): gleiche Ordnung wie Linie mit etwa doppeltem Abstand (Clip 10).
 * Die Zuordnung Einheit -> Platz minimiert Überkreuzungen.
 */
import { add, angleOf, dot, normalize, perp, scale, sub, type Vec2 } from './math';
import type { Formation, UnitState, World } from './types';

export interface FormationSlot {
  unitId: number;
  target: Vec2;
}

/** Faktor für den Abstand der aufgelockerten Formation (Clip 10: Reiter 2,2 : 1,0, Infanterie 1,7 : 0,9 Tiles). */
export const SPREAD_FACTOR = 2;

/** Reihenfolge von vorn nach hinten: 0 Nahkampf-Infanterie, 1 Fernkampf, 2 Belagerung, 3 Kavallerie. */
function roleRank(world: World, u: UnitState): number {
  const def = world.defs.get(u.defId);
  if (def.kind === 'cavalry') return 3;
  if (def.kind === 'siege') return 2;
  const w = world.defs.ageStats(u.defId, u.age).weapon;
  return w.type === 'melee' ? 0 : 1;
}

/**
 * Anzahl Spalten der Linie für n Einheiten einer Klasse: breiter als tief (3 → 3, 10 → 5, 15 → 7).
 * Clip 8 (je 5 pro Klasse) zeigt Reihen zu 5, weil jede Klasse ihre eigene Reihe bildet; die
 * Breite einer einzelnen großen Klasse ist nicht belegt.
 */
export function formationColumns(n: number): number {
  if (n <= 1) return 1;
  return Math.max(1, Math.ceil(Math.sqrt(n * 2.5)));
}

/** Reihenbreiten des Keils von hinten (Spitze) nach vorn: 1, 3, 5, …, Rest in der letzten Reihe. */
export function wedgeRows(n: number): number[] {
  const rows: number[] = [];
  let left = n;
  let w = 1;
  while (left > 0) {
    const take = Math.min(w, left);
    rows.push(take);
    left -= take;
    w += 2;
  }
  return rows;
}

/** Mehrheitsformation der Gruppe (Linie = Standard). */
export function groupFormation(units: readonly UnitState[]): Formation {
  const votes: Record<string, number> = {};
  for (const u of units) votes[u.formation] = (votes[u.formation] ?? 0) + 1;
  return (Object.entries(votes).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'line') as Formation;
}

interface Entry {
  u: UnitState;
  role: number;
  fwd: number;
  lat: number;
}

/**
 * Berechnet für jede Einheit einen Zielplatz um `dest`, orientiert in Blickrichtung
 * `facing` (Richtung vom Gruppenschwerpunkt zum Ziel, falls nicht angegeben).
 */
export function computeFormation(world: World, units: UnitState[], dest: Vec2, facing?: Vec2): FormationSlot[] {
  const n = units.length;
  if (n === 0) return [];
  if (n === 1) return [{ unitId: units[0]!.id, target: { x: dest.x, y: dest.y } }];

  let cx = 0;
  let cy = 0;
  let maxR = 0;
  for (const u of units) {
    cx += u.pos.x;
    cy += u.pos.y;
    if (u.radius > maxR) maxR = u.radius;
  }
  const centroid = { x: cx / n, y: cy / n };
  const dir = facing ? normalize(facing) : normalize(sub(dest, centroid), { x: Math.cos(units[0]!.heading), y: Math.sin(units[0]!.heading) });
  const lat = perp(dir);
  const formation = groupFormation(units);
  const factor = formation === 'spread' ? SPREAD_FACTOR : 1;
  const gap = world.rules.formationGap;
  const rowPitch = (2 * maxR + gap) * factor;

  // Einheiten nach Rolle (vorn zuerst), dann nach Vorwärts-Projektion (vorderste zuerst) sortieren.
  const sorted: Entry[] = units
    .map((u) => ({ u, role: roleRank(world, u), fwd: dot(sub(u.pos, centroid), dir), lat: dot(sub(u.pos, centroid), lat) }))
    .sort((a, b) => a.role - b.role || b.fwd - a.fwd || a.u.id - b.u.id);

  // Reihen von vorn nach hinten
  const rows: Entry[][] = [];
  if (formation === 'wedge') {
    // Keil: von hinten (Kavallerie an der Spitze) nach vorn mit Breiten 1, 3, 5, …
    const fromBack = [...sorted].reverse();
    let i = 0;
    for (const w of wedgeRows(n)) {
      rows.unshift(fromBack.slice(i, i + w));
      i += w;
    }
  } else {
    const cols = formationColumns(n);
    let i = 0;
    while (i < sorted.length) {
      const role = sorted[i]!.role;
      let j = i;
      while (j < sorted.length && j - i < cols && sorted[j]!.role === role) j++;
      rows.push(sorted.slice(i, j));
      i = j;
    }
  }
  for (const row of rows) row.sort((a, b) => a.lat - b.lat || a.u.id - b.u.id);

  const rowCount = rows.length;
  const slots: FormationSlot[] = [];
  rows.forEach((row, r) => {
    const back = (r - (rowCount - 1) / 2) * rowPitch; // Block um dest zentrieren
    let rowR = 0;
    for (const e of row) if (e.u.radius > rowR) rowR = e.u.radius;
    const spacing = (2 * rowR + gap) * factor; // Spaltenabstand nach der größten Einheit der Reihe
    row.forEach((e, c) => {
      const side = (c - (row.length - 1) / 2) * spacing;
      const target = add(dest, add(scale(dir, -back), scale(lat, side)));
      slots.push({ unitId: e.u.id, target });
    });
  });
  return slots;
}

/** Blickrichtung (Radiant) einer Formation zum Ziel. */
export function formationHeading(units: UnitState[], dest: Vec2): number {
  let cx = 0;
  let cy = 0;
  for (const u of units) {
    cx += u.pos.x;
    cy += u.pos.y;
  }
  return angleOf(sub(dest, { x: cx / units.length, y: cy / units.length }));
}

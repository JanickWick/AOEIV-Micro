/**
 * Lockere Blockformation für Gruppenbefehle: Nahkämpfer vorn, Schützen dahinter,
 * Belagerung hinten. Die Zuordnung Einheit -> Platz minimiert Überkreuzungen.
 */
import { add, angleOf, dot, normalize, perp, scale, sub, type Vec2 } from './math';
import type { UnitState, World } from './types';

export interface FormationSlot {
  unitId: number;
  target: Vec2;
}

function roleRank(world: World, u: UnitState): number {
  const def = world.defs.get(u.defId);
  if (def.kind === 'siege') return 2;
  const w = world.defs.ageStats(u.defId, u.age).weapon;
  return w.type === 'melee' ? 0 : 1;
}

/** Anzahl Spalten für n Einheiten: breiter als tief, wie im Spiel. */
export function formationColumns(n: number): number {
  if (n <= 1) return 1;
  return Math.max(1, Math.ceil(Math.sqrt(n * 2.5)));
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
  const spacing = 2 * maxR + world.rules.formationGap;
  const cols = formationColumns(n);

  // Einheiten nach Rolle, dann nach Vorwärts-Projektion (vorderste zuerst) sortieren.
  const sorted = units
    .map((u) => ({ u, role: roleRank(world, u), fwd: dot(sub(u.pos, centroid), dir), lat: dot(sub(u.pos, centroid), lat) }))
    .sort((a, b) => a.role - b.role || b.fwd - a.fwd || a.u.id - b.u.id);

  // Je Rolle in Reihen zerlegen (Nahkämpfer bekommen eigene vordere Reihen);
  // innerhalb der Reihe nach seitlicher Lage sortieren.
  const rows: (typeof sorted)[] = [];
  let i = 0;
  while (i < sorted.length) {
    const role = sorted[i]!.role;
    let j = i;
    while (j < sorted.length && j - i < cols && sorted[j]!.role === role) j++;
    rows.push(sorted.slice(i, j).sort((a, b) => a.lat - b.lat || a.u.id - b.u.id));
    i = j;
  }
  const rowCount = rows.length;
  const slots: FormationSlot[] = [];
  rows.forEach((row, r) => {
    const back = (r - (rowCount - 1) / 2) * spacing; // Block um dest zentrieren
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

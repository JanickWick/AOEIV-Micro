/** Reine Auswahl-Logik (ohne DOM), damit sie testbar bleibt. */
import type { Vec2 } from '../sim/math';
import type { PlayerId, UnitId, UnitState } from '../sim/types';

export interface Rect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export function normalizeRect(a: Vec2, b: Vec2): Rect {
  return { x0: Math.min(a.x, b.x), y0: Math.min(a.y, b.y), x1: Math.max(a.x, b.x), y1: Math.max(a.y, b.y) };
}

/** Einheit unter dem Mauszeiger (Weltkoordinaten); bevorzugt eigene Einheiten und die nächste. */
export function unitAtPoint(units: readonly UnitState[], p: Vec2, pickRadius = 0.15): UnitState | null {
  let best: UnitState | null = null;
  let bestD = Infinity;
  for (const u of units) {
    if (!u.alive) continue;
    const d = Math.hypot(u.pos.x - p.x, u.pos.y - p.y) - u.radius - pickRadius;
    if (d <= 0 && d < bestD) {
      best = u;
      bestD = d;
    }
  }
  return best;
}

/** Eigene Einheiten im Rahmen (Mittelpunkt im Rechteck, wie im Spiel). */
export function unitsInRect(units: readonly UnitState[], r: Rect, player: PlayerId): UnitState[] {
  return units.filter((u) => u.alive && u.player === player && u.pos.x >= r.x0 && u.pos.x <= r.x1 && u.pos.y >= r.y0 && u.pos.y <= r.y1);
}

export function unitsOfTypeInRect(units: readonly UnitState[], defId: string, r: Rect, player: PlayerId): UnitState[] {
  return unitsInRect(units, r, player).filter((u) => u.defId === defId);
}

export function toggleSelection(current: readonly UnitId[], ids: readonly UnitId[]): UnitId[] {
  const set = new Set(current);
  for (const id of ids) {
    if (set.has(id)) set.delete(id);
    else set.add(id);
  }
  return [...set];
}

export function addToSelection(current: readonly UnitId[], ids: readonly UnitId[]): UnitId[] {
  const set = new Set(current);
  for (const id of ids) set.add(id);
  return [...set];
}

/** Entfernt tote Einheiten aus der Auswahl. */
export function pruneSelection(current: readonly UnitId[], units: readonly UnitState[]): UnitId[] {
  const alive = new Set(units.filter((u) => u.alive).map((u) => u.id));
  return current.filter((id) => alive.has(id));
}

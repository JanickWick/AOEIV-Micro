/**
 * Untergruppen der Auswahl (reine Logik, testbar): die Auswahl wird nach Einheitentyp in fester
 * Reihenfolge (wie die Typ-Karten des Spiels) gegliedert. Tab wechselt zyklisch "Alle" → erster
 * Typ → … → letzter Typ → "Alle"; Rasterbefehle gehen an die aktive Untergruppe.
 */
import type { UnitId, UnitState } from '../sim/types';

/**
 * Feste Reihenfolge der Typ-Karten: Kavallerie, Fernkampf, Infanterie, Belagerung.
 */
export const TYPE_ORDER = ['horseman', 'knight', 'archer', 'crossbowman', 'spearman', 'man-at-arms', 'mangonel', 'springald'];

/** Einheitenklasse für die Gruppenmarke (Hufeisen = Kavallerie, Zielscheibe = Fernkampf, Schwerter = Infanterie). */
export function unitClass(defId: string): 'cavalry' | 'ranged' | 'infantry' | 'siege' {
  if (defId === 'horseman' || defId === 'knight') return 'cavalry';
  if (defId === 'archer' || defId === 'crossbowman') return 'ranged';
  if (defId === 'mangonel' || defId === 'springald') return 'siege';
  return 'infantry';
}

export const UNIT_CODE: Record<string, string> = {
  spearman: 'S',
  archer: 'A',
  'man-at-arms': 'M',
  horseman: 'H',
  knight: 'K',
  crossbowman: 'X',
  mangonel: 'Mg',
  springald: 'Sp',
};

/** Deutsche Anzeigenamen (Gattungsbegriffe; das Referenzprofil trägt englische Namen). */
export const UNIT_NAME_DE: Record<string, string> = {
  spearman: 'Speerkämpfer',
  archer: 'Bogenschütze',
  'man-at-arms': 'Schwertkämpfer',
  horseman: 'Reiter',
  knight: 'Ritter',
  crossbowman: 'Armbrustschütze',
  mangonel: 'Mangonel',
  springald: 'Springald',
};

export function unitName(defId: string, fallback: string): string {
  return UNIT_NAME_DE[defId] ?? fallback;
}

export function typeRank(defId: string): number {
  const i = TYPE_ORDER.indexOf(defId);
  return i < 0 ? TYPE_ORDER.length + defId.charCodeAt(0) : i;
}

export function unitCode(defId: string): string {
  return UNIT_CODE[defId] ?? defId.slice(0, 2).toUpperCase();
}

export interface Subgroup {
  defId: string;
  ids: UnitId[];
}

/** Lebende Einheiten der Auswahl nach Typ gruppiert, in fester Reihenfolge. */
export function subgroupsOf(units: readonly UnitState[], selection: Iterable<UnitId>): Subgroup[] {
  const byType = new Map<string, UnitId[]>();
  for (const id of selection) {
    const u = units[id - 1];
    if (!u || u.id !== id || !u.alive) continue;
    const list = byType.get(u.defId) ?? [];
    list.push(id);
    byType.set(u.defId, list);
  }
  return [...byType]
    .sort((a, b) => typeRank(a[0]) - typeRank(b[0]))
    .map(([defId, ids]) => ({ defId, ids: ids.sort((a, b) => a - b) }));
}

/** Aktive Untergruppe prüfen: fällt auf "Alle" (null) zurück, wenn der Typ nicht mehr in der Auswahl ist. */
export function resolveActive(active: string | null, groups: readonly Subgroup[]): string | null {
  if (active === null) return null;
  return groups.some((g) => g.defId === active) ? active : null;
}

/** Nächste (dir = 1) bzw. vorige (dir = −1) Untergruppe; "Alle" (null) ist Teil des Zyklus. */
export function cycleSubgroup(active: string | null, groups: readonly Subgroup[], dir: 1 | -1): string | null {
  if (groups.length <= 1) return null; // nur ein Typ: Tab hat nichts zu wechseln
  const cur = resolveActive(active, groups);
  const order: (string | null)[] = [null, ...groups.map((g) => g.defId)];
  const i = order.indexOf(cur);
  return order[(i + dir + order.length) % order.length] ?? null;
}

/** Einheiten, an die Befehle gehen: aktive Untergruppe oder die ganze Auswahl. */
export function commandTargets(units: readonly UnitState[], selection: Iterable<UnitId>, active: string | null): UnitId[] {
  const groups = subgroupsOf(units, selection);
  const a = resolveActive(active, groups);
  if (a === null) return groups.flatMap((g) => g.ids);
  return groups.find((g) => g.defId === a)?.ids ?? [];
}

export function onlyType(units: readonly UnitState[], selection: Iterable<UnitId>, defId: string): UnitId[] {
  return subgroupsOf(units, selection).find((g) => g.defId === defId)?.ids ?? [];
}

export function removeType(units: readonly UnitState[], selection: Iterable<UnitId>, defId: string): UnitId[] {
  return subgroupsOf(units, selection)
    .filter((g) => g.defId !== defId)
    .flatMap((g) => g.ids);
}

/** Kontrollgruppen (reine Logik, ohne DOM). */
import type { UnitId, UnitState } from '../sim/types';

export class ControlGroups {
  private groups = new Map<number, UnitId[]>();

  set(n: number, ids: readonly UnitId[]): void {
    if (ids.length === 0) this.groups.delete(n);
    else this.groups.set(n, [...new Set(ids)]);
  }

  add(n: number, ids: readonly UnitId[]): void {
    const cur = this.groups.get(n) ?? [];
    this.set(n, [...cur, ...ids]);
  }

  /** Fügt die Einheiten zu n hinzu und entfernt sie aus allen anderen Gruppen. */
  addExclusive(n: number, ids: readonly UnitId[]): void {
    for (const k of [...this.groups.keys()]) if (k !== n) this.remove(k, ids);
    this.add(n, ids);
  }

  remove(n: number, ids: readonly UnitId[]): void {
    const cur = this.groups.get(n);
    if (!cur) return;
    const drop = new Set(ids);
    this.set(n, cur.filter((id) => !drop.has(id)));
  }

  removeFromAll(ids: readonly UnitId[]): void {
    for (const k of [...this.groups.keys()]) this.remove(k, ids);
  }

  get(n: number, units: readonly UnitState[]): UnitId[] {
    const alive = new Set(units.filter((u) => u.alive).map((u) => u.id));
    const ids = (this.groups.get(n) ?? []).filter((id) => alive.has(id));
    this.set(n, ids);
    return ids;
  }

  /** Nummern der Gruppen, in denen die Einheit ist (für die Anzeige). */
  groupsOf(id: UnitId): number[] {
    const out: number[] = [];
    for (const [n, ids] of this.groups) if (ids.includes(id)) out.push(n);
    return out.sort();
  }

  clear(): void {
    this.groups.clear();
  }
}

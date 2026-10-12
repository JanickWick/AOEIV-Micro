/**
 * Typen und Lader für die Einheitendaten unter src/data/units/*.json.
 * Werte, die in der Quelle (aoe4world) fehlen, stehen dort als
 * { value, verified: false, note } – `stat()` löst beide Schreibweisen auf.
 */
import { UNIT_JSON } from '../data/units/index';

export interface UnverifiedStat {
  value: number;
  verified: boolean;
  note?: string;
}
export type Stat = number | UnverifiedStat;

export const stat = (s: Stat): number => (typeof s === 'number' ? s : s.value);
export const isVerified = (s: Stat): boolean => typeof s === 'number' || s.verified === true;

export type WeaponType = 'melee' | 'ranged' | 'siege';
export type UnitKind = 'infantry' | 'cavalry' | 'siege';
export type UnitShape = 'circle' | 'diamond' | 'square';

export interface WeaponTiming {
  /** Ausholzeit in s; Bewegungsbefehl in dieser Phase bricht den Angriff ohne Schaden ab. */
  windup: number;
  /** Zeitpunkt (s ab Angriffsbeginn), an dem Schaden anfällt bzw. das Projektil startet. */
  hit: number;
  /** Nachlaufanimation nach dem Treffer; Bewegung ist sofort erlaubt. */
  recovery: number;
  /** Restzeit, bis der nächste Angriff beginnen darf. */
  cooldown: number;
  /** Gesamtzeit zwischen zwei Angriffen. */
  period: number;
  setup: number;
  teardown: number;
}

export interface WeaponBonus {
  /** Jede innere Liste ist eine UND-Verknüpfung von Tags; die äußere Liste ist ODER. */
  targetTags: string[][];
  damage: number;
}

export interface ProjectileDef {
  speed: Stat;
  homing: boolean;
  splashRadius?: Stat;
  splashFalloff?: Stat;
}

export interface WeaponDef {
  name: string;
  type: WeaponType;
  damage: number;
  range: { min: number; max: number };
  timing: WeaponTiming;
  bonus: WeaponBonus[];
  burst?: number;
  projectile?: ProjectileDef;
}

export interface AgeStats {
  name: string;
  hp: number;
  armor: { melee: number; ranged: number };
  /** Prozentuale Schadensminderung (0–100), z. B. Mangonel 85 gegen Fernkampf. */
  resistance: { melee: number; ranged: number };
  cost: { food: number; wood: number; gold: number; stone: number; total: number };
  weapon: WeaponDef;
}

export interface UnitDef {
  id: string;
  name: string;
  kind: UnitKind;
  shape: UnitShape;
  displayClass: string;
  tags: string[];
  movement: {
    speed: number;
    collisionRadius: Stat;
    acceleration: Stat;
    turnRate: Stat; // Grad/s
  };
  sight: { line: number; base: number };
  abilities: Record<string, Record<string, Stat | boolean>>;
  ages: Record<string, AgeStats>;
}

export class UnitDefLibrary {
  private readonly byId = new Map<string, UnitDef>();

  constructor(defs: readonly UnitDef[]) {
    for (const d of defs) {
      validateUnitDef(d);
      this.byId.set(d.id, d);
    }
  }

  ids(): string[] {
    return [...this.byId.keys()];
  }

  has(id: string): boolean {
    return this.byId.has(id);
  }

  get(id: string): UnitDef {
    const d = this.byId.get(id);
    if (!d) throw new Error(`Unbekannte Einheit: ${id}`);
    return d;
  }

  /** Liefert die Werte einer Einheit für ein Zeitalter; fällt auf das nächstniedrigere vorhandene zurück. */
  ageStats(id: string, age: number): AgeStats {
    const d = this.get(id);
    for (let a = age; a >= 1; a--) {
      const s = d.ages[String(a)];
      if (s) return s;
    }
    const first = Object.keys(d.ages).sort()[0];
    if (!first) throw new Error(`Einheit ${id} hat keine Zeitalter-Werte`);
    return d.ages[first]!;
  }

  availableAges(id: string): number[] {
    return Object.keys(this.get(id).ages).map(Number).sort();
  }
}

export function validateUnitDef(d: UnitDef): void {
  const must = (cond: boolean, msg: string) => {
    if (!cond) throw new Error(`Einheitendaten ${d.id ?? '?'}: ${msg}`);
  };
  must(typeof d.id === 'string' && d.id.length > 0, 'id fehlt');
  must(typeof d.movement?.speed === 'number' && d.movement.speed > 0, 'movement.speed fehlt');
  must(stat(d.movement.collisionRadius) > 0, 'collisionRadius fehlt');
  must(stat(d.movement.acceleration) > 0, 'acceleration fehlt');
  must(stat(d.movement.turnRate) > 0, 'turnRate fehlt');
  must(Array.isArray(d.tags), 'tags fehlen');
  must(d.ages && Object.keys(d.ages).length > 0, 'ages fehlen');
  for (const [age, s] of Object.entries(d.ages)) {
    must(s.hp > 0, `hp für Zeitalter ${age} fehlt`);
    must(typeof s.armor?.melee === 'number' && typeof s.armor?.ranged === 'number', `armor für Zeitalter ${age} fehlt`);
    must(typeof s.resistance?.melee === 'number' && typeof s.resistance?.ranged === 'number', `resistance für Zeitalter ${age} fehlt`);
    const w = s.weapon;
    must(!!w && typeof w.damage === 'number', `weapon für Zeitalter ${age} fehlt`);
    must(w.range.max >= w.range.min, `range für Zeitalter ${age} ungültig`);
    const t = w.timing;
    must(t.period > 0 && t.windup >= 0 && t.hit >= 0 && t.recovery >= 0 && t.cooldown >= 0, `timing für Zeitalter ${age} ungültig`);
    must(Math.abs(t.windup + t.recovery + t.cooldown - t.period) < 1e-6, `timing-Summe für Zeitalter ${age} ≠ period`);
    if (w.type !== 'melee') must(!!w.projectile, `projectile für Zeitalter ${age} fehlt`);
  }
}

/** Liefert alle Pfade mit verified:false (für Anzeige/Tests). */
export function listUnverified(d: UnitDef): { path: string; value: number; note: string }[] {
  const out: { path: string; value: number; note: string }[] = [];
  const walk = (node: unknown, path: string) => {
    if (!node || typeof node !== 'object') return;
    const o = node as Record<string, unknown>;
    if ('verified' in o && o.verified === false) {
      out.push({ path, value: o.value as number, note: String(o.note ?? '') });
      return;
    }
    for (const [k, v] of Object.entries(o)) walk(v, path ? `${path}.${k}` : k);
  };
  walk(d, '');
  return out;
}

/** Prüft, ob ein Bonus auf eine Einheit mit den gegebenen Tags wirkt. */
export function bonusApplies(bonus: WeaponBonus, targetTags: readonly string[]): boolean {
  const set = new Set(targetTags);
  return bonus.targetTags.some((andGroup) => andGroup.every((t) => set.has(t)));
}

let defaultLib: UnitDefLibrary | null = null;

/** Die mitgelieferten Einheitendaten (einmalig geladen). */
export function defaultUnitDefs(): UnitDefLibrary {
  if (!defaultLib) defaultLib = new UnitDefLibrary(UNIT_JSON as unknown as readonly UnitDef[]);
  return defaultLib;
}

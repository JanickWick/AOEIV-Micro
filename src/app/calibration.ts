/**
 * Kalibrierung: alle Werte mit "verified": false aus den Einheitendaten und ausgewählte
 * Simulationsregeln sind ohne Codeänderung einstellbar. Überschreibungen liegen in
 * localStorage und werden beim Bau der Einheitenbibliothek angewendet.
 */
import { UNIT_JSON } from '../data/units/index';
import { DEFAULT_RULES, type SimRules } from '../sim/types';
import { listUnverified, UnitDefLibrary, type UnitDef } from '../sim/unitDefs';

export interface CalibrationState {
  /** unitId -> Pfad (z. B. "movement.collisionRadius") -> Wert */
  units: Record<string, Record<string, number>>;
  rules: Partial<Pick<SimRules, RuleKey>>;
}

export type RuleKey = 'cooldownRunsWhileMoving' | 'autoAcquireRange' | 'leashRange' | 'meleeHitTolerance' | 'siegeIgnoresArmor' | 'attackFacingTolerance' | 'formationSpeedMatching' | 'formationGap';

export interface RuleEntry {
  key: RuleKey;
  label: string;
  type: 'number' | 'boolean';
  note: string;
  step?: number;
}

export const RULE_ENTRIES: readonly RuleEntry[] = [
  { key: 'cooldownRunsWhileMoving', label: 'Abklingzeit läuft beim Laufen weiter', type: 'boolean', note: 'Nicht nachgemessen. Aus = Abklingzeit pausiert, solange die Einheit läuft.' },
  { key: 'autoAcquireRange', label: 'Auto-Angriffsreichweite (Tiles)', type: 'number', step: 0.5, note: 'Untätige Einheiten erfassen Gegner bis zu diesem Abstand (mindestens Waffenreichweite).' },
  { key: 'leashRange', label: 'Verfolgungsgrenze (Tiles)', type: 'number', step: 0.5, note: 'Wie weit untätige Einheiten einem Gegner von ihrer Position aus nachlaufen.' },
  { key: 'meleeHitTolerance', label: 'Nahkampf-Treffertoleranz (Tiles)', type: 'number', step: 0.05, note: 'Zusätzlicher Abstand, bis zu dem ein Nahkampf-Treffer beim Schadenszeitpunkt noch zählt.' },
  { key: 'siegeIgnoresArmor', label: 'Belagerungsschaden ignoriert Rüstung', type: 'boolean', note: 'Annahme für Mangonel-Schaden.' },
  { key: 'attackFacingTolerance', label: 'Blickwinkel-Toleranz vor Angriff (Grad)', type: 'number', step: 1, note: 'Einheit muss sich bis auf diesen Winkel zum Ziel drehen, bevor der Angriff beginnt.' },
  { key: 'formationSpeedMatching', label: 'Gruppe läuft mit langsamster Einheit', type: 'boolean', note: 'Gilt nur für Bewegungsbefehle; bei Angriffen läuft jede Einheit mit eigenem Tempo.' },
  { key: 'formationGap', label: 'Formationsabstand (Tiles)', type: 'number', step: 0.1, note: 'Zusätzlicher Abstand zwischen Formationsplätzen.' },
];

export interface CalibrationEntry {
  unitId: string;
  unitName: string;
  path: string;
  defaultValue: number;
  note: string;
}

const STORAGE_KEY = 'aoe4micro.calibration.v1';

export function baseUnitDefs(): UnitDef[] {
  return structuredClone(UNIT_JSON as unknown as UnitDef[]);
}

export function listCalibrationEntries(defs: readonly UnitDef[] = baseUnitDefs()): CalibrationEntry[] {
  const out: CalibrationEntry[] = [];
  for (const d of defs) {
    for (const e of listUnverified(d)) out.push({ unitId: d.id, unitName: d.name, path: e.path, defaultValue: e.value, note: e.note });
  }
  return out;
}

export function emptyCalibration(): CalibrationState {
  return { units: {}, rules: {} };
}

export function loadCalibration(): CalibrationState {
  try {
    const raw = globalThis.localStorage?.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<CalibrationState>;
      return { units: parsed.units ?? {}, rules: parsed.rules ?? {} };
    }
  } catch {
    /* ignorieren */
  }
  return emptyCalibration();
}

export function saveCalibration(c: CalibrationState): void {
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(c));
  } catch {
    /* ignorieren */
  }
}

function setAtPath(obj: Record<string, unknown>, path: string, value: number): boolean {
  const parts = path.split('.');
  let node: unknown = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    if (!node || typeof node !== 'object') return false;
    node = (node as Record<string, unknown>)[parts[i]!];
  }
  if (!node || typeof node !== 'object') return false;
  const leaf = (node as Record<string, unknown>)[parts[parts.length - 1]!];
  if (leaf && typeof leaf === 'object' && 'value' in leaf) {
    (leaf as { value: number }).value = value;
    return true;
  }
  if (typeof leaf === 'number') {
    (node as Record<string, unknown>)[parts[parts.length - 1]!] = value;
    return true;
  }
  return false;
}

/** Baut die Einheitenbibliothek mit angewendeten Überschreibungen. */
export function buildUnitDefs(c: CalibrationState): UnitDefLibrary {
  const defs = baseUnitDefs();
  for (const d of defs) {
    const overrides = c.units[d.id];
    if (!overrides) continue;
    for (const [path, value] of Object.entries(overrides)) {
      if (typeof value === 'number' && Number.isFinite(value)) setAtPath(d as unknown as Record<string, unknown>, path, value);
    }
  }
  return new UnitDefLibrary(defs);
}

/** Regeln mit angewendeten Überschreibungen (für neue Welten). */
export function effectiveRules(c: CalibrationState): Partial<SimRules> {
  const out: Partial<SimRules> = {};
  for (const e of RULE_ENTRIES) {
    const v = c.rules[e.key];
    if (v !== undefined) (out as Record<string, unknown>)[e.key] = v;
  }
  return out;
}

export function ruleDefault(key: RuleKey): number | boolean {
  return DEFAULT_RULES[key];
}

/** Welche der kalibrierten Pfade aktuell noch auf Platzhaltern stehen (nicht vom Nutzer gesetzt). */
export function unverifiedPaths(c: CalibrationState, defs: readonly UnitDef[] = baseUnitDefs()): string[] {
  return listCalibrationEntries(defs)
    .filter((e) => c.units[e.unitId]?.[e.path] === undefined)
    .map((e) => `${e.unitId}.${e.path}`);
}

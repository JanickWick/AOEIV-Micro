/** Freier Editor: Einheiten, Anzahl, Ausbildungsstufe, Upgrades, KI-Stufe und Startabstand für beide Seiten. */
import type { AiLevel } from '../sim/ai';
import type { ScenarioDef, ScenarioGroup } from '../sim/scenario';
import type { Upgrades } from '../sim/types';
import type { UnitDefLibrary } from '../sim/unitDefs';

export const EDITOR_SCENARIO_ID = 'editor';
const STORAGE_KEY = 'kompanie.editor.v1';
const LEGACY_KEY = 'aoe4micro.editor.v1';

export interface EditorRow {
  unit: string;
  age: number;
  count: number;
}

export interface EditorState {
  name: string;
  mine: EditorRow[];
  theirs: EditorRow[];
  aiLevel: AiLevel;
  reactionMs: number;
  distance: number;
  upgradesMine: Upgrades;
  upgradesTheirs: Upgrades;
  randomStart: boolean;
}

export function defaultEditorState(): EditorState {
  return {
    name: 'Eigenes Szenario',
    mine: [{ unit: 'archer', age: 2, count: 10 }],
    theirs: [{ unit: 'spearman', age: 2, count: 6 }],
    aiLevel: 'medium',
    reactionMs: 500,
    distance: 12,
    upgradesMine: { rangedAttack: 0, meleeAttack: 0, meleeArmor: 0, rangedArmor: 0 },
    upgradesTheirs: { rangedAttack: 0, meleeAttack: 0, meleeArmor: 0, rangedArmor: 0 },
    randomStart: false,
  };
}

export function loadEditorState(): EditorState {
  try {
    const raw = globalThis.localStorage?.getItem(STORAGE_KEY) ?? globalThis.localStorage?.getItem(LEGACY_KEY);
    if (raw) return { ...defaultEditorState(), ...(JSON.parse(raw) as Partial<EditorState>) };
  } catch {
    /* ignorieren */
  }
  return defaultEditorState();
}

export function saveEditorState(s: EditorState): void {
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch {
    /* ignorieren */
  }
}

/** Baut das Szenario: Spieler links, Gegner rechts, Gruppen je Seite untereinander. */
export function scenarioFromEditor(s: EditorState, defs: UnitDefLibrary): ScenarioDef {
  const map = { width: 64, height: 48 };
  const cx = map.width / 2;
  const cy = map.height / 2;
  const groups: ScenarioGroup[] = [];
  const place = (rows: EditorRow[], player: 0 | 1) => {
    const valid = rows.filter((r) => r.count > 0 && defs.has(r.unit));
    const x = player === 0 ? cx - s.distance / 2 : cx + s.distance / 2;
    valid.forEach((r, i) => {
      const y = cy + (i - (valid.length - 1) / 2) * 5;
      groups.push({ player, unit: r.unit, age: r.age, count: Math.min(60, Math.max(1, Math.round(r.count))), center: { x, y }, facing: player === 0 ? 0 : 180 });
    });
  };
  place(s.mine, 0);
  place(s.theirs, 1);
  return {
    id: EDITOR_SCENARIO_ID,
    name: `Editor: ${s.name}`,
    description: 'Eigenes Szenario aus dem Editor.',
    goal: `${s.mine.map((r) => `${r.count}× ${r.unit}`).join(', ')} gegen ${s.theirs.map((r) => `${r.count}× ${r.unit}`).join(', ')} (KI ${s.aiLevel}).`,
    map,
    seed: 11,
    randomStart: s.randomStart,
    randomOffset: 4,
    victory: 'annihilation',
    ai: { level: s.aiLevel, reactionMs: Math.max(50, s.reactionMs) },
    upgrades: { '0': s.upgradesMine, '1': s.upgradesTheirs },
    groups,
  };
}

/** Szenario-Dateien (src/data/scenarios/*.json) in eine Welt übersetzen. */
import type { AiConfig } from './ai';
import { computeFormation } from './formation';
import { degToRad, fromAngle, type Vec2 } from './math';
import type { PlayerId, SimRules, World } from './types';
import type { UnitDefLibrary } from './unitDefs';
import { aliveUnits, createWorld, spawnUnit } from './world';

export interface ScenarioGroup {
  player: PlayerId;
  unit: string;
  age: number;
  count: number;
  center: Vec2;
  /** Blickrichtung in Grad (0 = +x / rechts, 90 = +y / unten). */
  facing?: number;
}

export interface ScenarioDef {
  id: string;
  name: string;
  description?: string;
  /** Trainingsziel, wird im HUD gezeigt. */
  goal?: string;
  map: { width: number; height: number };
  seed?: number;
  /** Zufällige Startpositionen: Gruppen werden um bis zu `randomOffset` Tiles verschoben. */
  randomStart?: boolean;
  randomOffset?: number;
  rules?: Partial<SimRules>;
  /** Kein Kampf (Sandbox) oder Vernichtung einer Seite. */
  victory?: 'none' | 'annihilation';
  ai?: AiConfig;
  /** Pfade unbestätigter Werte, von denen das Szenario abhängt (Hinweis im HUD). */
  dependsOnUnverified?: string[];
  groups: ScenarioGroup[];
}

export interface BuildOptions {
  seed?: number;
  randomStart?: boolean;
}

export function buildWorldFromScenario(defs: UnitDefLibrary, sc: ScenarioDef, opts: BuildOptions = {}): World {
  const world = createWorld({ map: sc.map, seed: opts.seed ?? sc.seed ?? 1, rules: sc.rules, defs });
  const random = opts.randomStart ?? sc.randomStart ?? false;
  const maxOff = sc.randomOffset ?? 6;
  for (const g of sc.groups) {
    let center = { x: g.center.x, y: g.center.y };
    if (random) {
      center = { x: center.x + world.rng.range(-maxOff, maxOff), y: center.y + world.rng.range(-maxOff, maxOff) };
    }
    const heading = degToRad(g.facing ?? 0);
    // Erst spawnen, dann über die Formationslogik auf Plätze um das Zentrum setzen.
    const units = [];
    for (let i = 0; i < g.count; i++) {
      units.push(spawnUnit(world, { player: g.player, defId: g.unit, age: g.age, pos: center, heading }));
    }
    for (const slot of computeFormation(world, units, center, fromAngle(heading))) {
      const u = units.find((x) => x.id === slot.unitId)!;
      u.pos = { x: slot.target.x, y: slot.target.y };
      u.prevPos = { x: slot.target.x, y: slot.target.y };
      u.attack.leashOrigin = { x: slot.target.x, y: slot.target.y };
    }
  }
  return world;
}

export type Outcome = 'running' | 'victory' | 'defeat' | 'draw';

export function evaluateOutcome(world: World, sc: ScenarioDef, player: PlayerId = 0): Outcome {
  if ((sc.victory ?? 'annihilation') === 'none') return 'running';
  const mine = aliveUnits(world, player).length;
  const theirs = aliveUnits(world, player === 0 ? 1 : 0).length;
  if (mine > 0 && theirs > 0) return 'running';
  if (mine === 0 && theirs === 0) return 'draw';
  return mine > 0 ? 'victory' : 'defeat';
}

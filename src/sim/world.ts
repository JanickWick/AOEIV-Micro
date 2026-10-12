import { clone, degToRad, type Vec2 } from './math';
import { createRng } from './rng';
import { DEFAULT_RULES, type PlayerId, type SimRules, type UnitId, type UnitState, type World } from './types';
import { stat, type UnitDefLibrary } from './unitDefs';

export interface WorldOptions {
  map: { width: number; height: number };
  seed?: number;
  rules?: Partial<SimRules>;
  defs: UnitDefLibrary;
}

export function createWorld(opts: WorldOptions): World {
  const rules = { ...DEFAULT_RULES, ...(opts.rules ?? {}) };
  const seed = opts.seed ?? 1;
  return {
    tick: 0,
    dt: 1 / rules.tickRate,
    rules,
    map: { ...opts.map },
    seed,
    rng: createRng(seed),
    defs: opts.defs,
    units: [],
    nextUnitId: 1,
    nextGroupId: 1,
    events: [],
  };
}

export interface SpawnOptions {
  player: PlayerId;
  defId: string;
  age: number;
  pos: Vec2;
  heading?: number; // Radiant
}

export function spawnUnit(world: World, o: SpawnOptions): UnitState {
  const def = world.defs.get(o.defId);
  const ages = world.defs.ageStats(o.defId, o.age);
  const unit: UnitState = {
    id: world.nextUnitId++,
    player: o.player,
    defId: o.defId,
    age: o.age,
    pos: clone(o.pos),
    prevPos: clone(o.pos),
    heading: o.heading ?? 0,
    prevHeading: o.heading ?? 0,
    speed: 0,
    maxSpeed: def.movement.speed,
    accel: stat(def.movement.acceleration),
    turnRate: degToRad(stat(def.movement.turnRate)),
    radius: stat(def.movement.collisionRadius),
    hp: ages.hp,
    maxHp: ages.hp,
    alive: true,
    orders: [],
    stuckTicks: 0,
    lastDist: Infinity,
    idleSince: world.tick,
  };
  world.units.push(unit);
  return unit;
}

export function getUnit(world: World, id: UnitId): UnitState | undefined {
  // Einheiten werden nie entfernt, nur als tot markiert; IDs sind fortlaufend ab 1.
  const u = world.units[id - 1];
  return u && u.id === id ? u : world.units.find((x) => x.id === id);
}

export function aliveUnits(world: World, player?: PlayerId): UnitState[] {
  return world.units.filter((u) => u.alive && (player === undefined || u.player === player));
}

export function isIdle(u: UnitState): boolean {
  return u.orders.length === 0;
}

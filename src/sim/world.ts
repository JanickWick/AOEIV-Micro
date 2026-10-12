import { clone, degToRad, type Vec2 } from './math';
import { createRng } from './rng';
import { DEFAULT_RULES, NO_UPGRADES, type PlayerId, type SimRules, type UnitId, type UnitState, type Upgrades, type World } from './types';
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
    projectiles: [],
    decor: [],
    obstacles: [],
    nextUnitId: 1,
    nextGroupId: 1,
    nextProjectileId: 1,
    events: [],
  };
}

export interface SpawnOptions {
  player: PlayerId;
  defId: string;
  age: number;
  pos: Vec2;
  heading?: number; // Radiant
  upgrades?: Upgrades;
  spawnGroup?: number;
}

/** Welche Upgrades auf eine Einheit wirken: Belagerung bekommt keine; Angriff nur passend zum Waffentyp. */
export function upgradeMods(def: { kind: string }, weaponType: string, up: Upgrades): UnitState['mods'] {
  if (def.kind === 'siege') return { damage: 0, meleeArmor: 0, rangedArmor: 0 };
  return {
    damage: weaponType === 'melee' ? up.meleeAttack : up.rangedAttack,
    meleeArmor: up.meleeArmor,
    rangedArmor: up.rangedArmor,
  };
}

export function spawnUnit(world: World, o: SpawnOptions): UnitState {
  const def = world.defs.get(o.defId);
  const ages = world.defs.ageStats(o.defId, o.age);
  const hasCharge = def.abilities.charge?.enabled === true;
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
    diedTick: -1,
    orders: [],
    stuckTicks: 0,
    lastDist: Infinity,
    idleSince: world.tick,
    attack: { targetId: null, auto: false, phase: 'idle', phaseEndsTick: 0, startTick: 0, cooldownLeft: 0, leashOrigin: null },
    charge: hasCharge ? { runUp: 0, charging: false, cooldownLeft: 0 } : null,
    braceUntilTick: -1,
    lastHitTick: -1000,
    mods: upgradeMods(def, ages.weapon.type, o.upgrades ?? NO_UPGRADES),
    spawnGroup: o.spawnGroup ?? 0,
    formation: 'line',
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

/** Abstand Rand zu Rand (negativ bei Überlappung). */
export function edgeDistance(a: UnitState, b: UnitState): number {
  return Math.hypot(a.pos.x - b.pos.x, a.pos.y - b.pos.y) - a.radius - b.radius;
}

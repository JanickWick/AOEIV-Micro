import { defaultUnitDefs } from '../src/sim/unitDefs';
import { createWorld, spawnUnit } from '../src/sim/world';
import type { PlayerId, World } from '../src/sim/types';

export const defs = defaultUnitDefs();

export function makeWorld(seed = 1, w = 64, h = 48): World {
  return createWorld({ map: { width: w, height: h }, seed, defs });
}

export function spawn(world: World, defId: string, x: number, y: number, player: PlayerId = 0, age = 2) {
  return spawnUnit(world, { player, defId, age, pos: { x, y } });
}

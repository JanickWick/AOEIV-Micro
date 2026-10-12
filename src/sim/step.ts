/** Ein Simulationstick: Befehle anwenden, Einheiten (Kampf + Bewegung), Projektile, Kollisionen. Deterministisch. */
import { updateUnit } from './combat';
import { applyCommand } from './commands';
import { resolveCollisions } from './movement';
import { updateProjectiles } from './projectiles';
import type { Command, World } from './types';

export function stepWorld(world: World, commands: readonly Command[] = []): void {
  world.events = [];
  for (const u of world.units) {
    u.prevPos.x = u.pos.x;
    u.prevPos.y = u.pos.y;
    u.prevHeading = u.heading;
  }
  for (const c of commands) applyCommand(world, c);
  for (const u of world.units) if (u.alive) updateUnit(world, u);
  updateProjectiles(world);
  resolveCollisions(world);
  world.tick++;
}

/** Führt n Ticks aus (Hilfsfunktion für Tests und Vergleichssimulationen). */
export function runTicks(world: World, n: number, commandsPerTick?: (tick: number) => readonly Command[]): void {
  for (let i = 0; i < n; i++) stepWorld(world, commandsPerTick ? commandsPerTick(world.tick) : []);
}

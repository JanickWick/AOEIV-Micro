/** Ein Simulationstick: Befehle anwenden, bewegen, Kollisionen auflösen. Deterministisch. */
import { applyCommand } from './commands';
import { resolveCollisions, updateMovement } from './movement';
import type { Command, World } from './types';

export function stepWorld(world: World, commands: readonly Command[] = []): void {
  world.events = [];
  for (const u of world.units) {
    u.prevPos.x = u.pos.x;
    u.prevPos.y = u.pos.y;
    u.prevHeading = u.heading;
  }
  for (const c of commands) applyCommand(world, c);
  for (const u of world.units) if (u.alive) updateMovement(world, u);
  resolveCollisions(world);
  world.tick++;
}

/** Führt n Ticks aus (Hilfsfunktion für Tests und Vergleichssimulationen). */
export function runTicks(world: World, n: number): void {
  for (let i = 0; i < n; i++) stepWorld(world);
}

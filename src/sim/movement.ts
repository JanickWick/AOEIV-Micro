/**
 * Bewegungsmodell: Beschleunigung, Drehrate, Ankunft mit Abbremsen, weiche Kollision
 * zwischen Einheiten (kein Ineinanderlaufen) und Blockade-Erkennung.
 */
import { angleOf, clamp, dist, turnTowards, wrapAngle } from './math';
import { SpatialGrid } from './spatial';
import type { UnitState, World } from './types';

const STUCK_PROGRESS = 0.003; // Tiles pro Tick, darunter gilt "kein Fortschritt"
const STUCK_TICKS_NEAR = 30; // nahe am Ziel: nach 0,5 s aufgeben
const STUCK_TICKS_FAR = 150; // weit weg: nach 2,5 s aufgeben
const STUCK_NEAR_DIST = 1.5;

export function updateMovement(world: World, u: UnitState): void {
  const order = u.orders[0];
  if (!order || order.kind !== 'move') {
    u.speed = 0;
    return;
  }
  const dt = world.dt;
  const dx = order.target.x - u.pos.x;
  const dy = order.target.y - u.pos.y;
  const d = Math.hypot(dx, dy);

  if (d <= world.rules.arriveTolerance) {
    arrive(world, u);
    return;
  }

  // Blockade-Erkennung: Fortschritt zum Ziel messen.
  if (u.lastDist - d < STUCK_PROGRESS) u.stuckTicks++;
  else u.stuckTicks = 0;
  u.lastDist = d;
  if ((d < STUCK_NEAR_DIST && u.stuckTicks >= STUCK_TICKS_NEAR) || u.stuckTicks >= STUCK_TICKS_FAR) {
    arrive(world, u);
    return;
  }

  // Drehen
  const desired = angleOf({ x: dx, y: dy });
  u.heading = turnTowards(u.heading, desired, u.turnRate * dt);
  const misalign = Math.abs(wrapAngle(desired - u.heading));

  // Tempo: beschleunigen, Tempo-Deckel der Gruppe, zum Ziel hin abbremsen.
  const cap = Math.min(u.maxSpeed, order.speedCap ?? Infinity);
  const arriveSpeed = Math.sqrt(2 * u.accel * d);
  let target = Math.min(cap, arriveSpeed);
  if (misalign > Math.PI / 2) target = Math.min(target, 0.25 * cap); // erst drehen, dann laufen
  u.speed = Math.min(u.speed + u.accel * dt, target);

  // Bewegen: bei kleiner Abweichung direkt aufs Ziel, sonst entlang der Blickrichtung.
  const step = Math.min(u.speed * dt, d);
  if (misalign < 0.02) {
    u.pos.x += (dx / d) * step;
    u.pos.y += (dy / d) * step;
  } else {
    u.pos.x += Math.cos(u.heading) * step;
    u.pos.y += Math.sin(u.heading) * step;
  }
}

function arrive(world: World, u: UnitState): void {
  u.orders.shift();
  u.speed = 0;
  u.stuckTicks = 0;
  u.lastDist = Infinity;
  if (u.orders.length === 0) u.idleSince = world.tick;
  world.events.push({ kind: 'arrived', unitId: u.id, tick: world.tick });
}

const grid = new SpatialGrid(2);
const scratch: UnitState[] = [];

/** Schiebt überlappende Einheiten auseinander; Reihenfolge ist deterministisch (nach ID). */
export function resolveCollisions(world: World): void {
  const units = world.units;
  for (let iter = 0; iter < world.rules.separationIterations; iter++) {
    grid.build(units);
    for (const a of units) {
      if (!a.alive) continue;
      scratch.length = 0;
      grid.query(a.pos.x, a.pos.y, a.radius + 1, scratch);
      for (const b of scratch) {
        if (b.id <= a.id || !b.alive) continue;
        const minDist = a.radius + b.radius;
        let dx = b.pos.x - a.pos.x;
        let dy = b.pos.y - a.pos.y;
        let d = Math.hypot(dx, dy);
        if (d >= minDist) continue;
        if (d < 1e-6) {
          // Exakt übereinander: deterministisch anhand der IDs trennen.
          const ang = ((a.id * 7 + b.id * 13) % 360) * (Math.PI / 180);
          dx = Math.cos(ang);
          dy = Math.sin(ang);
          d = 1;
        }
        const overlap = minDist - d;
        // Stehende Einheiten weichen weniger aus als laufende, damit Blöcke stabil bleiben.
        const aMoving = a.orders.length > 0;
        const bMoving = b.orders.length > 0;
        const wa = aMoving === bMoving ? 0.5 : aMoving ? 0.7 : 0.3;
        const nx = dx / d;
        const ny = dy / d;
        a.pos.x -= nx * overlap * wa;
        a.pos.y -= ny * overlap * wa;
        b.pos.x += nx * overlap * (1 - wa);
        b.pos.y += ny * overlap * (1 - wa);
      }
    }
  }
  for (const u of units) {
    if (!u.alive) continue;
    u.pos.x = clamp(u.pos.x, u.radius, world.map.width - u.radius);
    u.pos.y = clamp(u.pos.y, u.radius, world.map.height - u.radius);
  }
}

/** Hilfsfunktion für Tests: größte Überlappung zweier lebender Einheiten. */
export function maxOverlap(world: World): number {
  let worst = 0;
  const units = world.units.filter((u) => u.alive);
  for (let i = 0; i < units.length; i++) {
    for (let j = i + 1; j < units.length; j++) {
      const a = units[i]!;
      const b = units[j]!;
      const o = a.radius + b.radius - dist(a.pos, b.pos);
      if (o > worst) worst = o;
    }
  }
  return worst;
}

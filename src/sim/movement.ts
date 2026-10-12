/**
 * Bewegungsmodell: Beschleunigung, Drehrate, Ankunft mit Abbremsen, weiche Kollision
 * zwischen Einheiten (kein Ineinanderlaufen) und Blockade-Erkennung.
 */
import { angleOf, clamp, dist, turnTowards, wrapAngle, type Vec2 } from './math';
import { SpatialGrid } from './spatial';
import type { UnitState, World } from './types';

const STUCK_PROGRESS = 0.003; // Tiles pro Tick, darunter gilt "kein Fortschritt"
const STUCK_TICKS_NEAR = 30; // nahe am Ziel: nach 0,5 s aufgeben
const STUCK_TICKS_FAR = 150; // weit weg: nach 2,5 s aufgeben
const STUCK_NEAR_DIST = 1.5;

export type MoveResult = 'moving' | 'arrived' | 'blocked';

/**
 * Bewegt die Einheit einen Tick auf `target` zu. `arriveDist` ist der Abstand, ab dem das
 * Ziel als erreicht gilt. Liefert, ob die Einheit angekommen ist oder blockiert aufgibt.
 */
export function moveTowards(world: World, u: UnitState, target: Vec2, arriveDist: number, speedCap?: number, speedMul = 1): MoveResult {
  const dt = world.dt;
  const dx = target.x - u.pos.x;
  const dy = target.y - u.pos.y;
  const d = Math.hypot(dx, dy);
  const remaining = d - arriveDist;

  if (remaining <= world.rules.arriveTolerance) {
    u.speed = 0;
    u.stuckTicks = 0;
    u.lastDist = Infinity;
    return 'arrived';
  }

  // Blockade-Erkennung: Fortschritt zum Ziel messen.
  if (u.lastDist - d < STUCK_PROGRESS) u.stuckTicks++;
  else u.stuckTicks = 0;
  u.lastDist = d;
  if ((remaining < STUCK_NEAR_DIST && u.stuckTicks >= STUCK_TICKS_NEAR) || u.stuckTicks >= STUCK_TICKS_FAR) {
    u.speed = 0;
    u.stuckTicks = 0;
    u.lastDist = Infinity;
    return 'blocked';
  }

  // Drehen; Hindernisse auf dem Weg werden tangential umlaufen
  const desired = steerAroundObstacles(world, u, angleOf({ x: dx, y: dy }), d);
  u.heading = turnTowards(u.heading, desired, u.turnRate * dt);
  const misalign = Math.abs(wrapAngle(desired - u.heading));

  // Tempo: beschleunigen, Tempo-Deckel der Gruppe, zum Ziel hin abbremsen.
  const cap = Math.min(u.maxSpeed * speedMul, speedCap ?? Infinity);
  const arriveSpeed = Math.sqrt(2 * u.accel * Math.max(remaining, 0.001));
  let goal = Math.min(cap, arriveSpeed);
  if (misalign > Math.PI / 2) goal = Math.min(goal, 0.25 * cap); // erst drehen, dann laufen
  u.speed = Math.min(u.speed + u.accel * dt, goal);

  // Bewegen: bei kleiner Abweichung direkt aufs Ziel, sonst entlang der Blickrichtung.
  const step = Math.min(u.speed * dt, remaining);
  if (misalign < 0.02 && Math.abs(wrapAngle(desired - angleOf({ x: dx, y: dy }))) < 1e-6) {
    u.pos.x += (dx / d) * step;
    u.pos.y += (dy / d) * step;
  } else {
    u.pos.x += Math.cos(u.heading) * step;
    u.pos.y += Math.sin(u.heading) * step;
  }
  return 'moving';
}

const LOOKAHEAD = 2.5;

/** Liefert die Wunschrichtung; liegt ein Hindernis auf der Linie, die Tangentenrichtung daran vorbei. */
function steerAroundObstacles(world: World, u: UnitState, desired: number, distToTarget: number): number {
  if (world.obstacles.length === 0) return desired;
  const look = Math.min(LOOKAHEAD, distToTarget);
  const dx = Math.cos(desired);
  const dy = Math.sin(desired);
  let best: { along: number; lateral: number; r: number } | null = null;
  for (const o of world.obstacles) {
    const rx = o.pos.x - u.pos.x;
    const ry = o.pos.y - u.pos.y;
    const along = rx * dx + ry * dy;
    if (along < -0.2 || along > look + o.radius) continue;
    const lateral = -rx * dy + ry * dx;
    const r = o.radius + u.radius + 0.15;
    if (Math.abs(lateral) >= r) continue;
    // Hindernis, das das Ziel selbst enthält, nicht umlaufen (Einheit hält davor)
    if (along > distToTarget + o.radius) continue;
    if (!best || along < best.along) best = { along, lateral, r };
  }
  if (!best) return desired;
  const dist = Math.hypot(best.along, best.lateral);
  if (dist <= best.r) {
    // Bereits am Hindernis: seitlich weg
    return desired + (best.lateral >= 0 ? -1 : 1) * (Math.PI / 2);
  }
  // Tangente auf der Seite, die näher an der Wunschrichtung liegt
  const side = best.lateral >= 0 ? -1 : 1;
  const tangent = Math.asin(Math.min(1, best.r / dist));
  const toCenter = Math.atan2(best.lateral, best.along);
  return desired + toCenter + side * tangent;
}

/** Dreht die Einheit zum Punkt; liefert die verbleibende Abweichung in Radiant. */
export function faceTowards(world: World, u: UnitState, target: Vec2): number {
  const desired = angleOf({ x: target.x - u.pos.x, y: target.y - u.pos.y });
  u.heading = turnTowards(u.heading, desired, u.turnRate * world.dt);
  return Math.abs(wrapAngle(desired - u.heading));
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
        const aMoving = a.speed > 0;
        const bMoving = b.speed > 0;
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
    // Hindernisse sind unbeweglich
    for (const o of world.obstacles) {
      const dx = u.pos.x - o.pos.x;
      const dy = u.pos.y - o.pos.y;
      const d = Math.hypot(dx, dy);
      const min = o.radius + u.radius;
      if (d >= min) continue;
      if (d < 1e-6) {
        u.pos.x += min;
        continue;
      }
      u.pos.x += (dx / d) * (min - d);
      u.pos.y += (dy / d) * (min - d);
    }
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

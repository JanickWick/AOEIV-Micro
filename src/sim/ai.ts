/**
 * Gegner-KI. Benutzt ausschließlich normale Befehle (keine Cheats) und entscheidet nur alle
 * `reactionMs` Millisekunden.
 *
 *  leicht:  Attack-Move auf die Spielertruppe, kein Micro.
 *  mittel:  wählt sinnvolle Ziele (Konter zuerst, angeschlagene fokussieren), zieht nicht zurück.
 *  schwer:  zusätzlich kiten, angeschlagene Einheiten zurückziehen, Mangonel-Schüssen ausweichen,
 *           Kavallerie umgeht Speerkämpfer Richtung Schützen.
 */
import { bonusDamage } from './damage';
import { dist, normalize, perp, scale, sub, type Vec2 } from './math';
import type { Command, PlayerId, UnitId, UnitState, World } from './types';
import type { UnitDef, WeaponDef } from './unitDefs';
import { aliveUnits, edgeDistance } from './world';

export type AiLevel = 'none' | 'easy' | 'medium' | 'hard';

export interface AiConfig {
  level: AiLevel;
  /** Reaktionszeit in Millisekunden zwischen zwei Entscheidungen. */
  reactionMs: number;
}

export interface AiController {
  readonly player: PlayerId;
  readonly level: AiLevel;
  /** Liefert die Befehle für diesen Tick (meist leer). */
  think(world: World): Command[];
}

interface Tactics {
  kite: boolean;
  retreat: boolean;
  dodge: boolean;
  flank: boolean;
}

const MEDIUM: Tactics = { kite: false, retreat: false, dodge: false, flank: false };
const HARD: Tactics = { kite: true, retreat: true, dodge: true, flank: true };

export function createAi(player: PlayerId, cfg: AiConfig): AiController {
  let nextThink = 0;
  return {
    player,
    level: cfg.level,
    think(world) {
      if (cfg.level === 'none') return [];
      if (world.tick < nextThink) return [];
      nextThink = world.tick + Math.max(1, Math.round((cfg.reactionMs / 1000) * world.rules.tickRate));
      const mine = aliveUnits(world, player);
      const enemies = aliveUnits(world, player === 0 ? 1 : 0);
      if (mine.length === 0 || enemies.length === 0) return [];
      if (cfg.level === 'easy') return easyThink(mine, enemies);
      return tacticalThink(world, player, mine, enemies, cfg.level === 'hard' ? HARD : MEDIUM);
    },
  };
}

function centroid(units: readonly UnitState[]): Vec2 {
  let x = 0;
  let y = 0;
  for (const u of units) {
    x += u.pos.x;
    y += u.pos.y;
  }
  return { x: x / units.length, y: y / units.length };
}

function easyThink(mine: UnitState[], enemies: UnitState[]): Command[] {
  const idle = mine.filter((u) => u.orders.length === 0 && u.attack.targetId === null);
  if (idle.length === 0) return [];
  return [{ kind: 'attackMove', unitIds: idle.map((u) => u.id), target: centroid(enemies), queue: false }];
}

interface Ctx {
  world: World;
  player: PlayerId;
  mine: UnitState[];
  enemies: UnitState[];
  enemyCentroid: Vec2;
  ownCentroid: Vec2;
  /** Wie viele eigene Einheiten eine Gegner-Einheit bereits anvisieren (Fokus). */
  focus: Map<UnitId, number>;
  t: Tactics;
}

function tacticalThink(world: World, player: PlayerId, mine: UnitState[], enemies: UnitState[], t: Tactics): Command[] {
  const focus = new Map<UnitId, number>();
  for (const u of mine) if (u.attack.targetId !== null) focus.set(u.attack.targetId, (focus.get(u.attack.targetId) ?? 0) + 1);
  const ctx: Ctx = { world, player, mine, enemies, enemyCentroid: centroid(enemies), ownCentroid: centroid(mine), focus, t };
  const cmds: Command[] = [];
  const idleForAttackMove: UnitId[] = [];
  for (const u of mine) {
    const c = decideUnit(ctx, u);
    if (c === 'attackMove') idleForAttackMove.push(u.id);
    else if (c) cmds.push(...c);
  }
  if (idleForAttackMove.length) cmds.push({ kind: 'attackMove', unitIds: idleForAttackMove, target: ctx.enemyCentroid, queue: false });
  return cmds;
}

function unitInfo(world: World, u: UnitState): { def: UnitDef; weapon: WeaponDef; ranged: boolean; siege: boolean; cav: boolean } {
  const def = world.defs.get(u.defId);
  const weapon = world.defs.ageStats(u.defId, u.age).weapon;
  return { def, weapon, ranged: weapon.type !== 'melee', siege: def.kind === 'siege', cav: def.kind === 'cavalry' };
}

function isMelee(world: World, u: UnitState): boolean {
  return world.defs.ageStats(u.defId, u.age).weapon.type === 'melee';
}

function nearest(units: readonly UnitState[], from: UnitState, filter: (u: UnitState) => boolean): { u: UnitState; d: number } | null {
  let best: UnitState | null = null;
  let bestD = Infinity;
  for (const x of units) {
    if (!filter(x)) continue;
    const d = edgeDistance(from, x);
    if (d < bestD) {
      best = x;
      bestD = d;
    }
  }
  return best ? { u: best, d: bestD } : null;
}

function awayFrom(u: UnitState, threat: Vec2, distance: number, fallback: Vec2): Vec2 {
  let dir = sub(u.pos, threat);
  if (dir.x === 0 && dir.y === 0) dir = sub(u.pos, fallback);
  dir = normalize(dir, { x: 1, y: 0 });
  return { x: u.pos.x + dir.x * distance, y: u.pos.y + dir.y * distance };
}

/** Liefert Befehle für die Einheit, 'attackMove' (sammeln) oder null (nichts ändern). */
function decideUnit(ctx: Ctx, u: UnitState): Command[] | 'attackMove' | null {
  const { world, t } = ctx;
  const info = unitInfo(world, u);
  const w = info.weapon;

  // 1. Mangonel-Schüssen ausweichen (hat Vorrang vor allem anderen)
  if (t.dodge && !info.siege) {
    // Alle bedrohlichen Geschosse (auch gestreute Bursts) gemeinsam betrachten.
    let n = 0;
    let cx = 0;
    let cy = 0;
    let maxSplash = 0;
    let flight: Vec2 = { x: 1, y: 0 };
    for (const p of world.projectiles) {
      if (p.player === ctx.player || p.splashRadius <= 0) continue;
      const d = dist(u.pos, p.targetPos) - u.radius;
      if (d < p.splashRadius + 1.0) {
        n++;
        cx += p.targetPos.x;
        cy += p.targetPos.y;
        maxSplash = Math.max(maxSplash, p.splashRadius);
        flight = sub(p.targetPos, p.origin);
      }
    }
    if (n > 0) {
      const impact = { x: cx / n, y: cy / n };
      const flightDir = normalize(flight);
      let dir = normalize(sub(u.pos, impact), perp(flightDir));
      if (dist(u.pos, impact) < 0.2) dir = perp(flightDir);
      const reach = maxSplash + 1.5;
      const target = { x: u.pos.x + dir.x * reach, y: u.pos.y + dir.y * reach };
      const cur = u.orders[0];
      if (cur?.kind === 'move' && dist(cur.target, target) < 1) return null;
      return [{ kind: 'move', unitIds: [u.id], target, queue: false }];
    }
  }

  // 2. Angeschlagene Einheiten zurückziehen
  if (t.retreat && !info.siege && u.hp / u.maxHp < 0.35) {
    const threat = nearest(ctx.enemies, u, (e) => isMelee(world, e) || edgeDistance(u, e) < 3);
    if (threat && threat.d < 4.5) {
      const target = awayFrom(u, threat.u.pos, 7, ctx.enemyCentroid);
      if (u.orders[0]?.kind === 'move' && dist(u.orders[0].target, target) < 2) return null;
      return [{ kind: 'move', unitIds: [u.id], target, queue: false }];
    }
  }

  // 3. Ziel wählen
  const best = info.siege && w.projectile?.splashRadius ? bestSplashTarget(ctx, u, w) : bestTarget(ctx, u, info.def, w);
  if (!best) {
    return u.orders.length === 0 && u.attack.targetId === null ? 'attackMove' : null;
  }

  // 4. Kiten: Schützen weichen heranrückenden Nahkämpfern aus, solange die Abklingzeit läuft
  if (t.kite && info.ranged && !info.siege) {
    const threat = nearest(ctx.enemies, u, (e) => isMelee(world, e));
    if (threat && threat.d < w.range.max * 0.6 + 1.0 && u.attack.phase !== 'windup') {
      const readyTicks = Math.round(0.3 * world.rules.tickRate);
      if (u.attack.cooldownLeft > readyTicks || u.attack.phase === 'recovery') {
        const target = awayFrom(u, threat.u.pos, 2.5, ctx.enemyCentroid);
        return [{ kind: 'move', unitIds: [u.id], target, queue: false }];
      }
    }
  }

  // 5. Kavallerie umgeht Speerkämpfer auf dem Weg zu Schützen
  if (t.flank && info.cav) {
    const targetInfo = unitInfo(world, best);
    if (targetInfo.ranged) {
      const waypoint = flankWaypoint(ctx, u, best);
      if (waypoint) {
        const cur = u.orders[0];
        if (cur?.kind === 'move' && dist(cur.target, waypoint) < 1.5) return null;
        return [
          { kind: 'move', unitIds: [u.id], target: waypoint, queue: false },
          { kind: 'attack', unitIds: [u.id], targetId: best.id, queue: true },
        ];
      }
    }
  }

  if (u.attack.targetId === best.id && u.orders[0]?.kind === 'attack') return null;
  return [{ kind: 'attack', unitIds: [u.id], targetId: best.id, queue: false }];
}

/** Bestes Ziel: Konter-Bonus zuerst, dann angeschlagene und bereits fokussierte, dann Nähe. */
function bestTarget(ctx: Ctx, u: UnitState, def: UnitDef, w: WeaponDef): UnitState | null {
  const { world } = ctx;
  const reach = Math.max(w.range.max, world.rules.autoAcquireRange) + 6;
  let best: UnitState | null = null;
  let bestScore = -Infinity;
  for (const e of ctx.enemies) {
    const d = edgeDistance(u, e);
    if (d > reach) continue;
    const eDef = world.defs.get(e.defId);
    let score = bonusDamage(w.bonus, eDef) * 2.5;
    score += (1 - e.hp / e.maxHp) * 20;
    score += Math.min(ctx.focus.get(e.id) ?? 0, 3) * 2;
    if (def.kind === 'cavalry' && world.defs.ageStats(e.defId, e.age).weapon.type !== 'melee') score += 8;
    if (def.kind === 'cavalry' && eDef.id === 'spearman') score -= 12;
    score -= d * 1.2;
    if (d <= w.range.max) score += 6;
    if (score > bestScore || (score === bestScore && best && e.id < best.id)) {
      best = e;
      bestScore = score;
    }
  }
  return best;
}

/** Mangonel: die Gegner-Einheit, um die herum die meisten Gegner im Flächenradius stehen. */
function bestSplashTarget(ctx: Ctx, u: UnitState, w: WeaponDef): UnitState | null {
  const splash = w.projectile?.splashRadius ? (typeof w.projectile.splashRadius === 'number' ? w.projectile.splashRadius : w.projectile.splashRadius.value) : 1;
  let best: UnitState | null = null;
  let bestScore = -Infinity;
  for (const e of ctx.enemies) {
    const d = edgeDistance(u, e);
    if (d > w.range.max + 4) continue;
    let count = 0;
    for (const o of ctx.enemies) if (dist(o.pos, e.pos) <= splash) count++;
    let score = count * 10 - d * 0.5;
    if (d < w.range.min) score -= 50;
    if (d <= w.range.max) score += 5;
    if (score > bestScore || (score === bestScore && best && e.id < best.id)) {
      best = e;
      bestScore = score;
    }
  }
  return best;
}

/** Wegpunkt seitlich an Speerkämpfern vorbei, falls welche nahe der direkten Linie stehen. */
function flankWaypoint(ctx: Ctx, u: UnitState, target: UnitState): Vec2 | null {
  const toTarget = sub(target.pos, u.pos);
  const len = Math.hypot(toTarget.x, toTarget.y);
  if (len < 3) return null;
  const dir = scale(toTarget, 1 / len);
  const side = perp(dir);
  let blocker: UnitState | null = null;
  let blockerSide = 0;
  let blockerAlong = 0;
  for (const e of ctx.enemies) {
    if (ctx.world.defs.get(e.defId).id !== 'spearman') continue;
    const rel = sub(e.pos, u.pos);
    const along = rel.x * dir.x + rel.y * dir.y;
    const lateral = rel.x * side.x + rel.y * side.y;
    if (along > 0.5 && along < len - 0.5 && Math.abs(lateral) < 2.5) {
      if (!blocker || along < blockerAlong) {
        blocker = e;
        blockerSide = lateral;
        blockerAlong = along;
      }
    }
  }
  if (!blocker) return null;
  const sign = blockerSide >= 0 ? -1 : 1; // auf die vom Speer abgewandte Seite ausweichen
  const offset = 4.5;
  return { x: u.pos.x + dir.x * blockerAlong + side.x * sign * offset, y: u.pos.y + dir.y * blockerAlong + side.y * sign * offset };
}

/**
 * Verhalten einer Einheit pro Tick: Befehle abarbeiten, Ziele erfassen, Angriffsablauf
 * (in Reichweite kommen -> Windup -> Schaden/Projektil -> Recovery -> Cooldown).
 *
 * Regeln (siehe ASSUMPTIONS.md):
 *  - Ein Bewegungsbefehl während des Windups bricht den Angriff ab (kein Schaden).
 *  - Nach dem Schadenszeitpunkt darf die Einheit sofort laufen; die Abklingzeit läuft
 *    weiter (Regel cooldownRunsWhileMoving).
 *  - Nahkampf verfehlt, wenn das Ziel beim Schadenszeitpunkt außer Reichweite ist.
 */
import { applyDamage, computeDamage } from './damage';
import { degToRad, dist, type Vec2 } from './math';
import { faceTowards, moveTowards } from './movement';
import { launchProjectile } from './projectiles';
import type { Order, SimEvent, UnitState, World } from './types';
import { stat, type UnitDef, type WeaponDef } from './unitDefs';
import { edgeDistance, getUnit } from './world';

const SCAN_INTERVAL = 6; // Ticks zwischen zwei Zielsuchen (gestaffelt nach ID)

export function ticks(world: World, seconds: number): number {
  return Math.max(1, Math.round(seconds * world.rules.tickRate));
}

function weaponOf(world: World, u: UnitState): WeaponDef {
  return world.defs.ageStats(u.defId, u.age).weapon;
}

/** Bricht einen laufenden Angriff ab (Windup -> kein Schaden; Recovery -> sofort frei). */
export function cancelAttack(world: World, u: UnitState, reason: 'move' | 'retarget' | 'stop' | 'targetDied'): void {
  if (u.attack.phase === 'windup') {
    world.events.push({ kind: 'windupCancelled', unitId: u.id, tick: world.tick, reason });
  }
  u.attack.phase = 'idle';
  u.attack.phaseEndsTick = 0;
}

export function clearTarget(world: World, u: UnitState, reason: 'move' | 'retarget' | 'stop' | 'targetDied'): void {
  cancelAttack(world, u, reason);
  u.attack.targetId = null;
  u.attack.auto = false;
}

/** Wird von Befehlen aufgerufen, die die Warteschlange ersetzen. */
export function onNewOrder(world: World, u: UnitState, order: Order): void {
  if (order.kind === 'move' || order.kind === 'attackMove' || order.kind === 'patrol' || order.kind === 'hold') clearTarget(world, u, 'move');
  else if (order.kind === 'attack') {
    if (u.attack.targetId !== order.targetId) clearTarget(world, u, 'retarget');
    u.attack.targetId = order.targetId;
    u.attack.auto = false;
  }
  u.attack.leashOrigin = null;
  if (u.charge) u.charge.runUp = 0;
}

// ------------------------------------------------------------------ Zielsuche

function isEnemyAlive(world: World, u: UnitState, id: number | null): UnitState | null {
  if (id === null) return null;
  const t = getUnit(world, id);
  return t && t.alive && t.player !== u.player ? t : null;
}

/** Nächster lebender Gegner innerhalb `range` (Rand zu Rand), oder null. */
export function findNearestEnemy(world: World, u: UnitState, range: number): UnitState | null {
  let best: UnitState | null = null;
  let bestD = Infinity;
  for (const t of world.units) {
    if (!t.alive || t.player === u.player) continue;
    const d = edgeDistance(u, t);
    if (d <= range && (d < bestD || (d === bestD && best && t.id < best.id))) {
      best = t;
      bestD = d;
    }
  }
  return best;
}

function acquireRange(world: World, u: UnitState): number {
  const w = weaponOf(world, u);
  return Math.max(w.range.max, world.rules.autoAcquireRange);
}

// ------------------------------------------------------------------ Angriff

interface FightOptions {
  /** Darf die Einheit dem Ziel nachlaufen? */
  chase: boolean;
  /** Begrenzung der Verfolgung ab leashOrigin (nur automatische Ziele). */
  leash: boolean;
}

/** Liefert true, solange das Ziel weiter verfolgt/angegriffen wird. */
function fight(world: World, u: UnitState, target: UnitState, opts: FightOptions): boolean {
  const a = u.attack;
  const w = weaponOf(world, u);
  const def = world.defs.get(u.defId);

  if (a.phase === 'windup') {
    u.speed = 0;
    if (world.tick >= a.phaseEndsTick) performHit(world, u, target, w, def);
    return true;
  }
  if (a.phase === 'recovery') {
    u.speed = 0;
    if (world.tick >= a.phaseEndsTick) a.phase = 'idle';
    return true;
  }

  const d = edgeDistance(u, target);
  if (d > w.range.max) {
    if (!opts.chase) {
      u.speed = 0;
      return false;
    }
    if (opts.leash && a.leashOrigin && dist(u.pos, a.leashOrigin) > world.rules.leashRange) {
      u.speed = 0;
      return false;
    }
    const speedMul = updateCharge(world, u, target, def, true);
    // Etwas tiefer als die Reichweite anlaufen, damit die Ankunftstoleranz nie knapp außerhalb endet.
    moveTowards(world, u, target.pos, u.radius + target.radius + Math.max(0, w.range.max - 0.2), undefined, speedMul);
    return true;
  }
  if (d < w.range.min) {
    // Innerhalb der Mindestreichweite (Mangonel): kein Schuss möglich, stehen bleiben.
    u.speed = 0;
    return true;
  }

  u.speed = 0;
  const misalign = faceTowards(world, u, target.pos);
  if (misalign > degToRad(world.rules.attackFacingTolerance)) return true;
  if (a.cooldownLeft > 0) return true;

  a.phase = 'windup';
  a.startTick = world.tick;
  a.phaseEndsTick = world.tick + ticks(world, w.timing.windup);
  world.events.push({ kind: 'attackStarted', unitId: u.id, targetId: target.id, tick: world.tick });
  return true;
}

function performHit(world: World, u: UnitState, target: UnitState, w: WeaponDef, def: UnitDef): void {
  const a = u.attack;
  let extra = 0;
  let charged = false;
  if (u.charge?.charging) {
    extra = stat(def.abilities.charge!.bonusDamage as number | { value: number; verified: boolean });
    charged = true;
    u.charge.charging = false;
    u.charge.runUp = 0;
    u.charge.cooldownLeft = ticks(world, stat(def.abilities.charge!.cooldown as number | { value: number; verified: boolean }));
  }
  if (w.type === 'melee') {
    const d = edgeDistance(u, target);
    if (d <= w.range.max + world.rules.meleeHitTolerance) {
      const tDef = world.defs.get(target.defId);
      const dmg = computeDamage({ weaponType: 'melee', damage: w.damage, bonus: w.bonus, extra, attackerIsSiege: def.tags.includes('siege') }, tDef, world.defs.ageStats(target.defId, target.age), world.rules);
      applyDamage(world, target, dmg, u.id, charged);
    } else {
      world.events.push({ kind: 'miss', attackerId: u.id, targetId: target.id, tick: world.tick });
    }
  } else {
    const count = w.burst ?? 1;
    const scatter = count > 1 && w.projectile?.splashRadius ? stat(w.projectile.splashRadius) * 0.8 : 0;
    for (let i = 0; i < count; i++) launchProjectile(world, u, w, target, i === 0 ? extra : 0, i === 0 ? 0 : scatter);
  }
  a.phase = 'recovery';
  a.phaseEndsTick = world.tick + ticks(world, w.timing.recovery);
  // Abklingzeit so, dass der nächste Angriff frühestens nach `period` beginnt.
  a.cooldownLeft = Math.max(0, ticks(world, w.timing.period) - (world.tick - a.startTick));
}

/** Ansturm: Anlaufstrecke zählen, Tempo-Multiplikator liefern. */
function updateCharge(world: World, u: UnitState, target: UnitState, def: UnitDef, moving: boolean): number {
  const c = u.charge;
  if (!c) return 1;
  const ab = def.abilities.charge!;
  const S = (k: string) => stat(ab[k] as number | { value: number; verified: boolean });
  if (!moving) {
    c.runUp = 0;
    c.charging = false;
    return 1;
  }
  if (c.cooldownLeft > 0) return 1;
  c.runUp += u.speed * world.dt;
  if (!c.charging && c.runUp >= S('minRunUp')) {
    c.charging = true;
    world.events.push({ kind: 'charge', unitId: u.id, tick: world.tick });
  }
  return c.charging ? S('speedMultiplier') : 1;
}

/** Speerkämpfer-Abwehrstellung: anstürmende Kavallerie, die eine stehende Einheit erreicht, erleidet Zusatzschaden. */
function updateBrace(world: World, u: UnitState, def: UnitDef): void {
  const ab = def.abilities.brace;
  if (!ab || ab.enabled !== true || u.speed > 0) return;
  const S = (k: string) => stat(ab[k] as number | { value: number; verified: boolean });
  for (const t of world.units) {
    if (!t.alive || t.player === u.player || !t.charge?.charging) continue;
    const d = edgeDistance(u, t);
    if (d <= S('triggerRange') && u.braceUntilTick < world.tick) {
      u.braceUntilTick = world.tick + ticks(world, S('duration'));
      world.events.push({ kind: 'brace', unitId: u.id, againstId: t.id, tick: world.tick });
    }
    if (u.braceUntilTick >= world.tick && d <= 0.3) {
      t.charge.charging = false;
      t.charge.runUp = 0;
      t.charge.cooldownLeft = ticks(world, 10);
      applyDamage(world, t, S('bonusDamage'), u.id);
    }
  }
}

// ------------------------------------------------------------------ pro Tick

export function updateUnit(world: World, u: UnitState): void {
  const a = u.attack;
  if (u.charge && u.charge.cooldownLeft > 0) u.charge.cooldownLeft--;
  const def = world.defs.get(u.defId);
  updateBrace(world, u, def);
  runOrders(world, u);
  // Abklingzeit: läuft je nach Regel auch während der Bewegung weiter.
  if (a.cooldownLeft > 0 && (world.rules.cooldownRunsWhileMoving || u.speed === 0)) a.cooldownLeft--;
}

function runOrders(world: World, u: UnitState): void {
  const a = u.attack;
  const order = u.orders[0];
  if (!order) {
    updateIdle(world, u);
    return;
  }
  switch (order.kind) {
    case 'move': {
      const r = moveTowards(world, u, order.target, 0, order.speedCap);
      if (r !== 'moving') finishOrder(world, u);
      return;
    }
    case 'attack': {
      const target = isEnemyAlive(world, u, order.targetId);
      if (!target) {
        clearTarget(world, u, 'targetDied');
        finishOrder(world, u);
        return;
      }
      a.targetId = target.id;
      a.auto = false;
      fight(world, u, target, { chase: true, leash: false });
      return;
    }
    case 'patrol':
    case 'attackMove': {
      let target = isEnemyAlive(world, u, a.targetId);
      if (!target && (world.tick + u.id) % SCAN_INTERVAL === 0) {
        target = findNearestEnemy(world, u, acquireRange(world, u));
        if (target) {
          a.targetId = target.id;
          a.auto = true;
        }
      }
      if (target) {
        if (!fight(world, u, target, { chase: true, leash: false })) clearTarget(world, u, 'targetDied');
        return;
      }
      if (a.targetId !== null) clearTarget(world, u, 'targetDied');
      if (order.kind === 'patrol') {
        const r = moveTowards(world, u, order.leg === 1 ? order.to : order.from, 0);
        if (r !== 'moving') order.leg = order.leg === 1 ? 0 : 1;
        return;
      }
      const r = moveTowards(world, u, order.target, 0);
      if (r !== 'moving') finishOrder(world, u);
      return;
    }
    case 'hold': {
      u.speed = 0;
      let target = isEnemyAlive(world, u, a.targetId);
      if (!target && (world.tick + u.id) % SCAN_INTERVAL === 0) {
        target = findNearestEnemy(world, u, weaponOf(world, u).range.max);
        if (target) {
          a.targetId = target.id;
          a.auto = true;
        }
      }
      if (target && !fight(world, u, target, { chase: false, leash: false })) clearTarget(world, u, 'targetDied');
      return;
    }
  }
}

/** Untätige Einheiten greifen Gegner in Erfassungsreichweite an und verfolgen begrenzt. */
function updateIdle(world: World, u: UnitState): void {
  const a = u.attack;
  if (!a.leashOrigin) a.leashOrigin = { x: u.pos.x, y: u.pos.y };
  let target = isEnemyAlive(world, u, a.targetId);
  if (!target) {
    if (a.targetId !== null) clearTarget(world, u, 'targetDied');
    if ((world.tick + u.id) % SCAN_INTERVAL !== 0) {
      u.speed = 0;
      return;
    }
    target = findNearestEnemy(world, u, acquireRange(world, u));
    if (!target) {
      u.speed = 0;
      return;
    }
    a.targetId = target.id;
    a.auto = true;
  }
  if (!fight(world, u, target, { chase: true, leash: true })) {
    clearTarget(world, u, 'targetDied');
  }
}

function finishOrder(world: World, u: UnitState): void {
  u.orders.shift();
  u.speed = 0;
  world.events.push({ kind: 'arrived', unitId: u.id, tick: world.tick });
  if (u.orders.length === 0) {
    u.idleSince = world.tick;
    u.attack.leashOrigin = { x: u.pos.x, y: u.pos.y };
  }
}

export function countEvents(events: readonly SimEvent[], kind: SimEvent['kind']): number {
  let n = 0;
  for (const e of events) if (e.kind === kind) n++;
  return n;
}

export function unitTargetPos(world: World, u: UnitState): Vec2 | null {
  const t = isEnemyAlive(world, u, u.attack.targetId);
  return t ? t.pos : null;
}

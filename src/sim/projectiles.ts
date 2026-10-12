/** Projektile: Pfeile/Bolzen folgen dem Ziel und treffen immer; Mangonel-Geschosse fliegen auf einen Bodenpunkt. */
import { applyDamage, computeDamage } from './damage';
import type { Projectile, UnitState, World } from './types';
import { stat, type WeaponDef } from './unitDefs';
import { getUnit } from './world';

export function launchProjectile(
  world: World,
  shooter: UnitState,
  weapon: WeaponDef,
  target: UnitState,
  extraDamage = 0,
  scatter = 0,
): Projectile {
  const p = weapon.projectile!;
  const homing = p.homing;
  let targetPos = { x: target.pos.x, y: target.pos.y };
  if (scatter > 0) {
    const ang = world.rng.range(0, Math.PI * 2);
    const r = world.rng.range(0, scatter);
    targetPos = { x: targetPos.x + Math.cos(ang) * r, y: targetPos.y + Math.sin(ang) * r };
  }
  const proj: Projectile = {
    id: world.nextProjectileId++,
    ownerId: shooter.id,
    player: shooter.player,
    weaponType: weapon.type,
    damage: weapon.damage + shooter.mods.damage,
    bonus: weapon.bonus,
    pos: { x: shooter.pos.x, y: shooter.pos.y },
    prevPos: { x: shooter.pos.x, y: shooter.pos.y },
    origin: { x: shooter.pos.x, y: shooter.pos.y },
    speed: stat(p.speed),
    targetId: homing ? target.id : null,
    targetPos,
    splashRadius: p.splashRadius ? stat(p.splashRadius) : 0,
    splashFalloff: p.splashFalloff ? stat(p.splashFalloff) : 0,
    launchTick: world.tick,
    extraDamage,
    attackerIsSiege: world.defs.get(shooter.defId).tags.includes('siege'),
  };
  world.projectiles.push(proj);
  world.events.push({ kind: 'projectileLaunched', projectileId: proj.id, attackerId: shooter.id, tick: world.tick });
  return proj;
}

export function updateProjectiles(world: World): void {
  const remaining: Projectile[] = [];
  for (const p of world.projectiles) {
    p.prevPos.x = p.pos.x;
    p.prevPos.y = p.pos.y;
    let dest = p.targetPos;
    let target: UnitState | undefined;
    if (p.targetId !== null) {
      target = getUnit(world, p.targetId);
      if (target && target.alive) {
        dest = target.pos;
        p.targetPos = { x: dest.x, y: dest.y };
      } else {
        // Ziel gestorben: Pfeil fliegt zur letzten Position und verpufft (Overkill durch Projektile in der Luft).
        const wasted = target
          ? computeDamage({ weaponType: p.weaponType, damage: p.damage, bonus: p.bonus, extra: p.extraDamage, attackerIsSiege: p.attackerIsSiege }, world.defs.get(target.defId), world.defs.ageStats(target.defId, target.age), world.rules, target.mods)
          : p.damage;
        world.events.push({ kind: 'projectileWasted', attackerId: p.ownerId, damage: wasted, tick: world.tick });
        p.targetId = null;
        target = undefined;
      }
    }
    const dx = dest.x - p.pos.x;
    const dy = dest.y - p.pos.y;
    const d = Math.hypot(dx, dy);
    const step = p.speed * world.dt;
    if (d <= step) {
      p.pos.x = dest.x;
      p.pos.y = dest.y;
      impact(world, p, target);
      continue;
    }
    p.pos.x += (dx / d) * step;
    p.pos.y += (dy / d) * step;
    remaining.push(p);
  }
  world.projectiles = remaining;
}

function impact(world: World, p: Projectile, target: UnitState | undefined): void {
  if (p.splashRadius > 0) {
    for (const u of world.units) {
      if (!u.alive || u.player === p.player) continue;
      const dist = Math.hypot(u.pos.x - p.pos.x, u.pos.y - p.pos.y) - u.radius;
      if (dist > p.splashRadius) continue;
      const frac = p.splashFalloff > 0 ? 1 - Math.max(0, dist) / p.splashRadius * p.splashFalloff : 1;
      const def = world.defs.get(u.defId);
      const dmg = computeDamage({ weaponType: p.weaponType, damage: p.damage * frac, bonus: p.bonus, attackerIsSiege: p.attackerIsSiege }, def, world.defs.ageStats(u.defId, u.age), world.rules, u.mods);
      applyDamage(world, u, dmg, p.ownerId, false, p.weaponType);
    }
    return;
  }
  if (!target || !target.alive) return;
  const def = world.defs.get(target.defId);
  const dmg = computeDamage({ weaponType: p.weaponType, damage: p.damage, bonus: p.bonus, extra: p.extraDamage, attackerIsSiege: p.attackerIsSiege }, def, world.defs.ageStats(target.defId, target.age), world.rules, target.mods);
  applyDamage(world, target, dmg, p.ownerId, false, p.weaponType);
}

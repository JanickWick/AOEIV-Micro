/** Schadensformel: Angriff + Bonus gegen Klasse - passende Rüstung, dann prozentuale Resistenz, mindestens 1. */
import type { SimRules, UnitState, World } from './types';
import { bonusApplies, type AgeStats, type UnitDef, type WeaponBonus, type WeaponType } from './unitDefs';

export interface DamageSpec {
  weaponType: WeaponType;
  damage: number;
  bonus: readonly WeaponBonus[];
  extra?: number;
  /** Belagerungseinheiten (Springald) umgehen die prozentuale Resistenz. */
  attackerIsSiege?: boolean;
}

export function bonusDamage(bonus: readonly WeaponBonus[], targetDef: UnitDef): number {
  let total = 0;
  for (const b of bonus) if (bonusApplies(b, targetDef.tags)) total += b.damage;
  return total;
}

const NO_MODS = { meleeArmor: 0, rangedArmor: 0 };

export function computeDamage(
  spec: DamageSpec,
  targetDef: UnitDef,
  targetStats: AgeStats,
  rules: SimRules,
  targetMods: { meleeArmor: number; rangedArmor: number } = NO_MODS,
): number {
  let dmg = spec.damage + bonusDamage(spec.bonus, targetDef) + (spec.extra ?? 0);
  if (spec.weaponType === 'melee') dmg -= targetStats.armor.melee + targetMods.meleeArmor;
  else if (spec.weaponType === 'ranged') dmg -= targetStats.armor.ranged + targetMods.rangedArmor;
  else if (!rules.siegeIgnoresArmor) dmg -= targetStats.armor.ranged + targetMods.rangedArmor;
  const resist = spec.weaponType === 'melee' ? targetStats.resistance.melee : targetStats.resistance.ranged;
  if (resist > 0 && !spec.attackerIsSiege) dmg *= 1 - resist / 100;
  return Math.max(1, Math.round(dmg));
}

/** Wendet Schaden an, erzeugt Ereignisse, markiert Tote. Liefert tatsächlichen Schaden. */
export function applyDamage(world: World, target: UnitState, amount: number, attackerId: number | null, charge = false, weaponType: WeaponType = 'melee'): number {
  if (!target.alive) return 0;
  const before = target.hp;
  target.hp = Math.max(0, target.hp - amount);
  target.lastHitTick = world.tick;
  const overkill = Math.max(0, amount - before);
  if (attackerId !== null) {
    world.events.push({ kind: 'hit', attackerId, targetId: target.id, damage: amount, overkill, tick: world.tick, charge, weaponType });
  }
  if (target.hp <= 0) {
    target.alive = false;
    target.diedTick = world.tick;
    target.orders = [];
    target.speed = 0;
    world.events.push({ kind: 'died', unitId: target.id, killerId: attackerId, tick: world.tick });
  }
  return amount;
}

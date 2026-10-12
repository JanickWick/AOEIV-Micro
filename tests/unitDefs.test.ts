import { describe, expect, it } from 'vitest';
import { bonusApplies, listUnverified, stat } from '../src/sim/unitDefs';
import { defs } from './helpers';

const EXPECTED = ['spearman', 'archer', 'man-at-arms', 'horseman', 'knight', 'crossbowman', 'mangonel', 'springald'];

describe('Einheitendaten', () => {
  it('enthält alle Einheiten des Start-Umfangs', () => {
    for (const id of EXPECTED) expect(defs.has(id), id).toBe(true);
  });

  it('hat Zeitalter II oder III für jede Einheit', () => {
    for (const id of EXPECTED) {
      const ages = defs.availableAges(id);
      expect(ages.some((a) => a === 2 || a === 3), `${id}: ${ages}`).toBe(true);
    }
  });

  it('Timing-Felder summieren sich zur Angriffsperiode', () => {
    for (const id of EXPECTED) {
      for (const age of defs.availableAges(id)) {
        const t = defs.ageStats(id, age).weapon.timing;
        expect(t.windup + t.recovery + t.cooldown).toBeCloseTo(t.period, 6);
        expect(t.hit).toBeLessThanOrEqual(t.windup);
      }
    }
  });

  it('bekannte Werte stimmen mit aoe4world überein (Stichprobe)', () => {
    const spear = defs.ageStats('spearman', 2);
    expect(spear.hp).toBe(90);
    expect(spear.weapon.damage).toBe(8);
    expect(spear.weapon.timing.windup).toBeCloseTo(0.25);
    expect(spear.weapon.timing.period).toBeCloseTo(1.875);
    const archer = defs.ageStats('archer', 2);
    expect(archer.weapon.range.max).toBe(5);
    expect(archer.weapon.timing.windup).toBeCloseTo(0.25); // aim
    expect(archer.weapon.timing.period).toBeCloseTo(1.625);
    expect(defs.get('horseman').movement.speed).toBeCloseTo(1.875);
    expect(defs.get('knight').movement.speed).toBeCloseTo(1.625);
    expect(defs.ageStats('man-at-arms', 2).armor).toEqual({ melee: 3, ranged: 3 });
  });

  it('Bonus-Zuordnung über Tags', () => {
    const spearBonus = defs.ageStats('spearman', 2).weapon.bonus;
    expect(spearBonus.some((b) => bonusApplies(b, defs.get('horseman').tags) && b.damage === 20)).toBe(true);
    expect(spearBonus.some((b) => bonusApplies(b, defs.get('knight').tags))).toBe(true);
    expect(spearBonus.some((b) => bonusApplies(b, defs.get('archer').tags))).toBe(false);

    const archerBonus = defs.ageStats('archer', 2).weapon.bonus;
    expect(archerBonus.some((b) => bonusApplies(b, defs.get('spearman').tags))).toBe(true);
    expect(archerBonus.some((b) => bonusApplies(b, defs.get('man-at-arms').tags))).toBe(false);
    expect(archerBonus.some((b) => bonusApplies(b, defs.get('crossbowman').tags))).toBe(false);

    const xbow = defs.ageStats('crossbowman', 3).weapon.bonus;
    expect(xbow.some((b) => bonusApplies(b, defs.get('man-at-arms').tags))).toBe(true);
    expect(xbow.some((b) => bonusApplies(b, defs.get('knight').tags))).toBe(true);
    expect(xbow.some((b) => bonusApplies(b, defs.get('horseman').tags))).toBe(false);

    const horse = defs.ageStats('horseman', 2).weapon.bonus;
    expect(horse.some((b) => bonusApplies(b, defs.get('archer').tags))).toBe(true);
    expect(horse.some((b) => bonusApplies(b, defs.get('mangonel').tags))).toBe(true);
    expect(horse.some((b) => bonusApplies(b, defs.get('spearman').tags))).toBe(false);

    const spring = defs.ageStats('springald', 3).weapon.bonus;
    expect(spring.some((b) => bonusApplies(b, defs.get('spearman').tags))).toBe(true);
    expect(spring.some((b) => bonusApplies(b, defs.get('horseman').tags))).toBe(false);
  });

  it('unbestätigte Werte sind markiert und auflösbar', () => {
    const list = listUnverified(defs.get('archer'));
    expect(list.some((e) => e.path === 'movement.collisionRadius')).toBe(true);
    expect(stat(defs.get('archer').movement.collisionRadius)).toBeGreaterThan(0);
  });
});

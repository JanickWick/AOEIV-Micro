import { describe, expect, it } from 'vitest';
import { bonusApplies, listUnverified, profileUnitDefs, stat } from '../src/sim/unitDefs';
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

  it('eigenes Werteprofil (Standard): Stichprobe', () => {
    const spear = defs.ageStats('spearman', 2);
    expect(spear.hp).toBe(96);
    expect(spear.weapon.damage).toBe(9);
    expect(spear.weapon.timing.windup).toBeCloseTo(0.25);
    expect(spear.weapon.timing.period).toBeCloseTo(1.9);
    const archer = defs.ageStats('archer', 2);
    expect(archer.weapon.range.max).toBe(5.5);
    expect(archer.weapon.timing.windup).toBeCloseTo(0.25);
    expect(archer.weapon.timing.period).toBeCloseTo(1.6);
    expect(defs.get('horseman').movement.speed).toBeCloseTo(1.95);
    expect(defs.get('knight').movement.speed).toBeCloseTo(1.7);
    expect(defs.ageStats('man-at-arms', 2).armor).toEqual({ melee: 3, ranged: 4 });
    // Eigene Namen, keine Platzhalter, keine Spieldaten-Herkunft
    expect(defs.get('archer').name).toBe('Bogenschütze');
    expect(listUnverified(defs.get('archer')).length).toBe(0);
  });

  it('eigenes Profil weicht vom Referenzprofil ab, behält aber Konter und Prinzip', () => {
    const ref = profileUnitDefs('referenz');
    let changed = 0;
    let total = 0;
    for (const id of EXPECTED) {
      for (const age of defs.availableAges(id)) {
        const a = defs.ageStats(id, age);
        const b = ref.ageStats(id, age);
        for (const [x, y] of [[a.hp, b.hp], [a.weapon.damage, b.weapon.damage], [a.weapon.range.max, b.weapon.range.max], [a.weapon.timing.period, b.weapon.timing.period]]) {
          total++;
          if (Math.abs(x! - y!) > 1e-9) changed++;
          // leicht verschoben: höchstens 25 % Abweichung
          expect(Math.abs(x! - y!) / Math.max(y!, 1e-9), `${id} ${age}`).toBeLessThanOrEqual(0.25);
        }
        // Konter bleiben: gleiche Zieltypen der Boni
        expect(a.weapon.bonus.filter((bo) => !bo.targetTags.some((t) => t.includes('building') || t.includes('naval') || t.includes('elephant'))).length).toBeGreaterThanOrEqual(0);
      }
      expect(defs.get(id).movement.speed).not.toBe(ref.get(id).movement.speed);
    }
    expect(changed / total).toBeGreaterThan(0.5);
  });

  it('Referenzprofil: importierte Werte bleiben erhalten (Kalibrierprofil)', () => {
    const ref = profileUnitDefs('referenz');
    expect(ref.ageStats('spearman', 2).hp).toBe(90);
    expect(ref.ageStats('archer', 2).weapon.range.max).toBe(5);
    expect(ref.get('horseman').movement.speed).toBeCloseTo(1.875);
  });

  it('Bonus-Zuordnung über Tags', () => {
    const spearBonus = defs.ageStats('spearman', 2).weapon.bonus;
    expect(spearBonus.some((b) => bonusApplies(b, defs.get('horseman').tags) && b.damage === 22)).toBe(true);
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

  it('unbestätigte Werte des Referenzprofils sind markiert und auflösbar', () => {
    const ref = profileUnitDefs('referenz');
    const list = listUnverified(ref.get('archer'));
    expect(list.some((e) => e.path === 'movement.collisionRadius')).toBe(true);
    expect(stat(ref.get('archer').movement.collisionRadius)).toBeGreaterThan(0);
  });
});

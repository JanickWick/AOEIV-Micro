#!/usr/bin/env node
/**
 * Schreibt das eigene Werteprofil (Auslieferungsstandard) nach src/data/units/<id>.json.
 *
 * Die Werte sind eigene Spielwerte der Freien Kompanie: gerundet und gegenüber dem
 * Referenzprofil (src/data/units/reference/, importiert) leicht verschoben. Erhalten bleiben
 * die Schadensformel und das Prinzip aus Reichweite, Ausholzeit (windup), Abklingzeit
 * (cooldown) und Kontern. Die Tabelle unten ist die einzige Quelle; die JSON-Dateien werden
 * daraus erzeugt, damit das Schema (Timing-Summen, Zeitalter) stimmt.
 *
 * Aufruf: node scripts/write-own-units.mjs
 */
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'data', 'units');

/** Ausbildungsstufen der Kompanie (statt Zeitalter). */
const STAGE = { 1: 'Rekrut', 2: 'Söldner', 3: 'Veteran', 4: 'Garde' };

const ranged = (speed = 13) => ({ speed, homing: true });
const timing = (windup, recovery, cooldown, extra = {}) => ({ windup, hit: windup, recovery, cooldown, period: +(windup + recovery + cooldown).toFixed(4), setup: 0, teardown: 0, ...extra });
const cost = (food, wood, gold) => ({ food, wood, gold, stone: 0, total: food + wood + gold });

const UNITS = [
  {
    id: 'spearman', name: 'Speerkämpfer', kind: 'infantry', shape: 'circle', displayClass: 'Leichte Nahkampf-Infanterie',
    tags: ['infantry', 'light', 'melee', 'military'], movement: { speed: 1.3, collisionRadius: 0.22, acceleration: 10, turnRate: 720 }, sight: { line: 36, base: 21 },
    abilities: { brace: { enabled: true, bonusDamage: 22, triggerRange: 2, duration: 1.5 } },
    weapon: { name: 'Speer', type: 'melee', range: { min: 0, max: 0.3 }, timing: timing(0.25, 0.9, 0.75) },
    cost: cost(55, 30, 0),
    ages: { 1: { hp: 84, dmg: 8, bonus: 18 }, 2: { hp: 96, dmg: 9, bonus: 22 }, 3: { hp: 116, dmg: 10, bonus: 25 }, 4: { hp: 144, dmg: 12, bonus: 30 } },
    armor: () => ({ melee: 0, ranged: 0 }),
    bonus: (b) => [{ targetTags: [['cavalry']], damage: b }],
  },
  {
    id: 'archer', name: 'Bogenschütze', kind: 'infantry', shape: 'circle', displayClass: 'Leichte Fernkampf-Infanterie',
    tags: ['infantry', 'light', 'ranged', 'military'], movement: { speed: 1.3, collisionRadius: 0.22, acceleration: 10, turnRate: 720 }, sight: { line: 36, base: 21 },
    abilities: {},
    weapon: { name: 'Bogen', type: 'ranged', range: { min: 0, max: 5.5 }, timing: timing(0.25, 0.6, 0.75), projectile: ranged() },
    cost: cost(35, 50, 0),
    ages: { 2: { hp: 75, dmg: 6, bonus: 6 }, 3: { hp: 85, dmg: 7, bonus: 7 }, 4: { hp: 100, dmg: 9, bonus: 9 } },
    armor: () => ({ melee: 0, ranged: 0 }),
    bonus: (b) => [{ targetTags: [['light', 'melee', 'infantry']], damage: b }],
  },
  {
    id: 'crossbowman', name: 'Armbrustschütze', kind: 'infantry', shape: 'circle', displayClass: 'Leichte Fernkampf-Infanterie',
    tags: ['infantry', 'light', 'ranged', 'military'], movement: { speed: 1.15, collisionRadius: 0.22, acceleration: 10, turnRate: 720 }, sight: { line: 36, base: 21 },
    abilities: {},
    weapon: { name: 'Armbrust', type: 'ranged', range: { min: 0, max: 5.5 }, timing: timing(0.3, 0.1, 1.6), projectile: ranged() },
    cost: cost(40, 40, 45),
    ages: { 3: { hp: 85, dmg: 12, bonus: 11 }, 4: { hp: 100, dmg: 15, bonus: 13 } },
    armor: () => ({ melee: 0, ranged: 0 }),
    bonus: (b) => [{ targetTags: [['heavy']], damage: b }],
  },
  {
    id: 'man-at-arms', name: 'Schwertkämpfer', kind: 'infantry', shape: 'circle', displayClass: 'Schwere Nahkampf-Infanterie',
    tags: ['infantry', 'heavy', 'melee', 'military'], movement: { speed: 1.15, collisionRadius: 0.22, acceleration: 10, turnRate: 720 }, sight: { line: 36, base: 21 },
    abilities: {},
    weapon: { name: 'Schwert', type: 'melee', range: { min: 0, max: 0.3 }, timing: timing(0.5, 0.9, 0) },
    cost: cost(65, 0, 50),
    ages: { 1: { hp: 105, dmg: 9, am: 2, ar: 3 }, 2: { hp: 125, dmg: 11, am: 3, ar: 4 }, 3: { hp: 160, dmg: 13, am: 4, ar: 5 }, 4: { hp: 190, dmg: 15, am: 5, ar: 6 } },
    armor: (a) => ({ melee: a.am, ranged: a.ar }),
    bonus: () => [],
  },
  {
    id: 'horseman', name: 'Reiter', kind: 'cavalry', shape: 'diamond', displayClass: 'Leichte Kavallerie',
    tags: ['cavalry', 'light', 'melee', 'military'], movement: { speed: 1.95, collisionRadius: 0.4, acceleration: 5, turnRate: 360 }, sight: { line: 40, base: 24 },
    abilities: {},
    weapon: { name: 'Säbel', type: 'melee', range: { min: 0, max: 0.4 }, timing: timing(0.25, 0.4, 1.05) },
    cost: cost(85, 40, 0),
    ages: { 1: { hp: 115, dmg: 9, ar: 2 }, 2: { hp: 130, dmg: 10, ar: 3 }, 3: { hp: 160, dmg: 12, ar: 4 }, 4: { hp: 190, dmg: 14, ar: 5 } },
    armor: (a) => ({ melee: 0, ranged: a.ar }),
    bonus: (_b, a) => [{ targetTags: [['ranged']], damage: a.dmg }, { targetTags: [['siege']], damage: a.dmg }],
  },
  {
    id: 'knight', name: 'Ritter', kind: 'cavalry', shape: 'diamond', displayClass: 'Schwere Kavallerie',
    tags: ['cavalry', 'heavy', 'melee', 'military'], movement: { speed: 1.7, collisionRadius: 0.4, acceleration: 5, turnRate: 360 }, sight: { line: 40, base: 24 },
    abilities: { charge: { enabled: true, bonusDamage: 12, minRunUp: 3, speedMultiplier: 1.4, cooldown: 9 } },
    weapon: { name: 'Lanze', type: 'melee', range: { min: 0, max: 0.3 }, timing: timing(0.5, 0.15, 0.95) },
    cost: cost(140, 0, 110),
    ages: { 2: { hp: 200, dmg: 20, am: 3, ar: 4 }, 3: { hp: 240, dmg: 25, am: 4, ar: 5 }, 4: { hp: 280, dmg: 30, am: 5, ar: 6 } },
    armor: (a) => ({ melee: a.am, ranged: a.ar }),
    bonus: () => [],
  },
  {
    id: 'mangonel', name: 'Mangonel', kind: 'siege', shape: 'square', displayClass: 'Belagerung',
    tags: ['siege', 'military'], movement: { speed: 0.8, collisionRadius: 0.6, acceleration: 2, turnRate: 120 }, sight: { line: 40, base: 24 },
    abilities: {},
    weapon: { name: 'Steinwurf', type: 'siege', range: { min: 3, max: 8.5 }, timing: timing(0.25, 2.5, 3.75, { teardown: 1 }), burst: 3, projectile: { speed: 6.5, homing: false, splashRadius: 1.1, splashFalloff: 0 } },
    cost: cost(0, 350, 200),
    ages: { 3: { hp: 140, dmg: 12, bonus: 12 } },
    armor: () => ({ melee: 0, ranged: 0 }),
    resistance: () => ({ melee: 0, ranged: 80 }),
    bonus: (b) => [{ targetTags: [['ranged']], damage: b }],
  },
  {
    id: 'springald', name: 'Springald', kind: 'siege', shape: 'square', displayClass: 'Belagerung',
    tags: ['siege', 'military'], movement: { speed: 0.9, collisionRadius: 0.6, acceleration: 2, turnRate: 120 }, sight: { line: 40, base: 24 },
    abilities: {},
    weapon: { name: 'Bolzen', type: 'siege', range: { min: 0, max: 8 }, timing: timing(0.4, 0.6, 2.0, { teardown: 0.25 }), projectile: ranged() },
    cost: cost(0, 160, 100),
    ages: { 3: { hp: 90, dmg: 16, bonus: 13 } },
    armor: () => ({ melee: 3, ranged: 0 }),
    resistance: () => ({ melee: 0, ranged: 50 }),
    bonus: (b) => [{ targetTags: [['melee', 'infantry']], damage: b }],
  },
];

for (const u of UNITS) {
  const ages = {};
  for (const [age, a] of Object.entries(u.ages)) {
    const weapon = { ...u.weapon, damage: a.dmg, bonus: u.bonus(a.bonus, a) };
    ages[age] = {
      name: `${u.name} (${STAGE[age]})`,
      hp: a.hp,
      armor: u.armor(a),
      resistance: u.resistance ? u.resistance(a) : { melee: 0, ranged: 0 },
      cost: u.cost,
      weapon,
    };
  }
  const out = {
    id: u.id,
    name: u.name,
    kind: u.kind,
    shape: u.shape,
    displayClass: u.displayClass,
    tags: u.tags,
    source: { provider: 'eigen', note: 'Eigenes Werteprofil der Freien Kompanie, erzeugt von scripts/write-own-units.mjs. Keine Spieldaten.' },
    movement: u.movement,
    sight: u.sight,
    abilities: u.abilities,
    ages,
  };
  writeFileSync(join(OUT_DIR, `${u.id}.json`), JSON.stringify(out, null, 2) + '\n');
  console.log(`ok ${u.id}: Stufen ${Object.keys(ages).join(',')}`);
}

#!/usr/bin/env node
/**
 * Importiert Einheitendaten von aoe4world (https://data.aoe4world.com/units/all.json)
 * und schreibt sie als Referenzprofil nach src/data/units/reference/<id>.json.
 * Der Auslieferungsstandard ist das eigene Werteprofil in src/data/units/<id>.json
 * (scripts/write-own-units.mjs); das Referenzprofil ist nur als Kalibrierprofil wählbar.
 *
 * Aufruf:
 *   node scripts/import-units.mjs                # lädt aus dem Netz
 *   node scripts/import-units.mjs path/all.json  # nutzt eine lokale Kopie
 *
 * Regeln:
 *  - Pro Einheit und Zeitalter wird die Variante gewählt, die von den meisten
 *    Zivilisationen geteilt wird (= Standardwerte ohne Zivilisations-Boni).
 *  - Werte, die in der Quelle fehlen (Kollisionsradius, Beschleunigung, Drehrate,
 *    Projektilgeschwindigkeit, Flächenschaden-Radius, Charge/Brace), werden als
 *    { value, verified: false, note } geschrieben. Bereits vorhandene Werte in
 *    der Zieldatei werden für diese Felder NICHT überschrieben, damit nachgemessene
 *    Werte erhalten bleiben.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SOURCE_URL = 'https://data.aoe4world.com/units/all.json';
const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'data', 'units', 'reference');

/** Einheiten des Start-Umfangs (aoe4world baseId -> Anzeige/Form). */
const WANTED = {
  spearman: { shape: 'circle', kind: 'infantry' },
  archer: { shape: 'circle', kind: 'infantry' },
  'man-at-arms': { shape: 'circle', kind: 'infantry' },
  horseman: { shape: 'diamond', kind: 'cavalry' },
  knight: { shape: 'diamond', kind: 'cavalry' },
  crossbowman: { shape: 'circle', kind: 'infantry' },
  mangonel: { shape: 'square', kind: 'siege' },
  springald: { shape: 'square', kind: 'siege' },
};

/** Platzhalter für Werte, die aoe4world nicht liefert (verified:false). */
const MOVEMENT_DEFAULTS = {
  infantry: { collisionRadius: 0.22, acceleration: 10, turnRate: 720 }, // Radius aus Video (docs/G0-INVENTUR.md)
  cavalry: { collisionRadius: 0.4, acceleration: 5, turnRate: 360 },
  siege: { collisionRadius: 0.6, acceleration: 2, turnRate: 120 },
};

const unverified = (value, note) => ({ value, verified: false, note });

async function loadSource(arg) {
  if (arg) return JSON.parse(readFileSync(arg, 'utf8'));
  const res = await fetch(SOURCE_URL);
  if (!res.ok) throw new Error(`Download fehlgeschlagen: ${res.status} ${res.statusText}`);
  return res.json();
}

function primaryWeapon(variant) {
  return variant.weapons.find((w) => w.type !== 'fire');
}

/** Signatur der "echten" Kampfwerte, um identische Varianten zu gruppieren. */
function statSignature(v) {
  const w = primaryWeapon(v);
  return JSON.stringify([
    v.hitpoints,
    v.armor,
    v.movement?.speed,
    w && [w.damage, w.speed, w.range, w.durations, w.burst, w.modifiers.map((m) => [m.target?.class, m.value, m.effect])],
  ]);
}

function pickStandardVariant(variants) {
  const groups = new Map();
  for (const v of variants) {
    const sig = statSignature(v);
    if (!groups.has(sig)) groups.set(sig, []);
    groups.get(sig).push(v);
  }
  const ranked = [...groups.values()]
    .map((g) => ({ civs: [...new Set(g.flatMap((v) => v.civs))].sort(), rep: g.slice().sort((a, b) => a.civs.join().localeCompare(b.civs.join()))[0] }))
    .sort((a, b) => b.civs.length - a.civs.length || a.civs.join().localeCompare(b.civs.join()));
  return { chosen: ranked[0], alternatives: ranked.slice(1) };
}

function tagsOf(v) {
  const tags = new Set(v.classes);
  for (const dc of v.displayClasses ?? []) for (const t of dc.toLowerCase().split(/\s+/)) if (t) tags.add(t);
  return [...tags].sort();
}

function convertWeapon(w, kind) {
  const d = w.durations;
  const windup = d.aim + d.windup;
  const recovery = d.attack + d.winddown;
  const cooldown = d.reload + d.cooldown;
  const out = {
    name: w.name,
    type: w.type, // melee | ranged | siege
    damage: w.damage,
    range: { min: w.range.min, max: w.range.max },
    // Angriffs-Timing (Sekunden ab Beginn des Angriffs):
    timing: {
      windup, // Ausholzeit; ein Bewegungsbefehl in dieser Phase bricht ab (kein Schaden)
      hit: windup, // Zeitpunkt des Schadens bzw. Projektilabschusses
      recovery, // Nachlaufanimation nach dem Treffer (Bewegung sofort erlaubt)
      cooldown, // Restzeit bis der nächste Angriff beginnen darf
      period: w.speed, // Gesamtzeit zwischen zwei Angriffen (= windup+recovery+cooldown)
      setup: d.setup,
      teardown: d.teardown,
    },
    sourceDurations: { ...d },
    bonus: w.modifiers
      .filter((m) => m.effect === 'change' && m.type === 'passive' && m.target?.class)
      .map((m) => ({ targetTags: m.target.class.map((c) => c.slice()), damage: m.value })),
  };
  if (w.burst) out.burst = w.burst.count;
  if (w.type === 'ranged') {
    out.projectile = {
      speed: unverified(12, 'Pfeil-/Bolzen-Fluggeschwindigkeit in Tiles/s – nicht in der Quelle; nachmessen.'),
      homing: true,
    };
  } else if (w.type === 'siege') {
    out.projectile = {
      speed: unverified(6, 'Geschoss-Fluggeschwindigkeit in Tiles/s (Bogenflug) – nicht in der Quelle; nachmessen.'),
      homing: false,
      splashRadius: unverified(1.0, 'Flächenschaden-Radius in Tiles – nicht in der Quelle; nachmessen.'),
      splashFalloff: unverified(0, 'Schadensabnahme zum Rand (0 = voller Schaden im ganzen Radius).'),
    };
  }
  return out;
}

function convertAge(v, kind) {
  const w = primaryWeapon(v);
  const armor = { melee: 0, ranged: 0 };
  for (const a of v.armor ?? []) if (a.type in armor) armor[a.type] = a.value;
  // Prozentuale Schadensminderung (z. B. Mangonel 85 % gegen Fernkampf).
  const resistance = { melee: 0, ranged: 0 };
  for (const r of v.resistance ?? []) if (r.type in resistance) resistance[r.type] = r.value;
  return {
    name: v.name,
    hp: v.hitpoints,
    armor,
    resistance,
    cost: { food: v.costs.food, wood: v.costs.wood, gold: v.costs.gold, stone: v.costs.stone, total: v.costs.total },
    weapon: convertWeapon(w, kind),
    otherWeapons: v.weapons.filter((x) => x !== w).map((x) => x.name),
  };
}

function abilitiesFor(baseId) {
  if (baseId === 'knight') {
    return {
      charge: {
        enabled: true,
        bonusDamage: unverified(10, 'Zusatzschaden beim Ansturm-Treffer – nicht in der Quelle; nachmessen.'),
        minRunUp: unverified(3, 'Mindest-Anlaufstrecke in Tiles, bevor der Ansturm zählt.'),
        speedMultiplier: unverified(1.4, 'Tempo-Multiplikator während des Ansturms.'),
        cooldown: unverified(10, 'Abklingzeit des Ansturms in Sekunden.'),
      },
    };
  }
  if (baseId === 'spearman') {
    return {
      brace: {
        enabled: true,
        bonusDamage: unverified(20, 'Zusatzschaden der Abwehrstellung gegen anstürmende Kavallerie – nachmessen.'),
        triggerRange: unverified(2, 'Abstand in Tiles, ab dem sich der Speer gegen anstürmende Kavallerie aufstellt.'),
        duration: unverified(1.5, 'Dauer der Abwehrstellung in Sekunden.'),
      },
    };
  }
  return {};
}

function keepExistingUnverified(existing, generated) {
  // Behalte für alle {value, verified:false}-Platzhalter vorhandene Werte aus der Zieldatei.
  if (!existing || typeof existing !== 'object' || typeof generated !== 'object' || generated === null) return generated;
  if ('verified' in generated && 'value' in generated) {
    return existing && typeof existing === 'object' && 'value' in existing ? existing : generated;
  }
  const out = Array.isArray(generated) ? [...generated] : { ...generated };
  for (const key of Object.keys(generated)) {
    out[key] = keepExistingUnverified(existing[key], generated[key]);
  }
  return out;
}

async function main() {
  const src = await loadSource(process.argv[2]);
  mkdirSync(OUT_DIR, { recursive: true });
  const report = [];
  for (const [baseId, meta] of Object.entries(WANTED)) {
    const variants = src.data.filter((u) => u.baseId === baseId && u.type === 'unit');
    if (variants.length === 0) {
      report.push(`!! ${baseId}: nicht in der Quelle gefunden`);
      continue;
    }
    const byAge = new Map();
    for (const v of variants) {
      if (!byAge.has(v.age)) byAge.set(v.age, []);
      byAge.get(v.age).push(v);
    }
    const ages = {};
    const sourceVariants = {};
    let ref = null;
    for (const age of [...byAge.keys()].sort()) {
      const { chosen, alternatives } = pickStandardVariant(byAge.get(age));
      ages[age] = convertAge(chosen.rep, meta.kind);
      sourceVariants[age] = { id: chosen.rep.id, attribName: chosen.rep.attribName, pbgid: chosen.rep.pbgid, civs: chosen.civs };
      if (alternatives.length) {
        report.push(`   ${baseId} Zeitalter ${age}: Standard = ${chosen.civs.join(',')}; abweichende Varianten: ${alternatives.map((a) => a.civs.join(',')).join(' | ')}`);
      }
      if (!ref || age === 2 || (age === 3 && ref.age !== 2)) ref = chosen.rep;
      report.push(`   ${baseId} Zeitalter ${age}: Variante ${sourceVariants[age].id} (${sourceVariants[age].civs.join(',')})`);
    }
    const mv = MOVEMENT_DEFAULTS[meta.kind];
    const generated = {
      id: baseId,
      name: variants[0].name.replace(/^(Hardened|Veteran|Elite) /, ''),
      kind: meta.kind,
      shape: meta.shape,
      displayClass: ref.displayClasses?.[0] ?? '',
      tags: tagsOf(ref),
      // Herkunft nur knapp (Quelle und Varianten stehen in CREDITS.md bzw. im Importbericht), damit
      // keine Quellen-URLs im ausgelieferten Bündel landen.
      source: {
        provider: 'Referenzprofil, importiert mit scripts/import-units.mjs (Quelle in CREDITS.md)',
        version: src.__version__,
        importedAt: new Date().toISOString().slice(0, 10),
      },
      movement: {
        speed: ref.movement.speed,
        collisionRadius: unverified(mv.collisionRadius, 'Kollisionsradius in Tiles – nicht in der Quelle; Schätzung nach Klasse.'),
        acceleration: unverified(mv.acceleration, 'Beschleunigung in Tiles/s² – nicht in der Quelle; Schätzung.'),
        turnRate: unverified(mv.turnRate, 'Drehrate in Grad/s – nicht in der Quelle; Schätzung.'),
      },
      sight: { line: ref.sight?.line ?? 0, base: ref.sight?.base ?? 0 },
      abilities: abilitiesFor(baseId),
      ages,
    };
    const outPath = join(OUT_DIR, `${baseId}.json`);
    const existing = existsSync(outPath) ? JSON.parse(readFileSync(outPath, 'utf8')) : null;
    const merged = keepExistingUnverified(existing, generated);
    writeFileSync(outPath, JSON.stringify(merged, null, 2) + '\n');
    report.push(`ok ${baseId}: Zeitalter ${Object.keys(ages).join(',')}`);
  }
  // Index für die Simulation (läuft ohne import.meta.glob auch in Vitest).
  const files = readdirSync(OUT_DIR).filter((f) => f.endsWith('.json')).sort();
  const index =
    '// Automatisch erzeugt von scripts/import-units.mjs – nicht von Hand bearbeiten.\n' +
    files.map((f, i) => `import u${i} from './${f}';`).join('\n') +
    `\n\nexport const UNIT_JSON = [${files.map((_, i) => `u${i}`).join(', ')}] as const;\n`;
  writeFileSync(join(OUT_DIR, 'index.ts'), index);
  console.log(report.join('\n'));
  console.log(`\n${files.length} Einheitendateien in ${OUT_DIR}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

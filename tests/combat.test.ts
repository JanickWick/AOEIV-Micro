import { describe, expect, it } from 'vitest';
import { createAi } from '../src/sim/ai';
import { computeDamage } from '../src/sim/damage';
import { hashWorld } from '../src/sim/hash';
import { dist } from '../src/sim/math';
import { buildWorldFromScenario, evaluateOutcome, type ScenarioDef } from '../src/sim/scenario';
import { runTicks, stepWorld } from '../src/sim/step';
import type { SimEvent, UnitState, World } from '../src/sim/types';
import { defs, makeWorld, spawn } from './helpers';

/** Einheit, die nie selbst angreift (Abklingzeit läuft nie ab). */
function passive(u: UnitState): UnitState {
  u.attack.cooldownLeft = 1e9;
  return u;
}

function collect(w: World, n: number, cmds?: (tick: number) => Parameters<typeof stepWorld>[1]): SimEvent[] {
  const out: SimEvent[] = [];
  for (let i = 0; i < n; i++) {
    stepWorld(w, cmds ? cmds(w.tick) : []);
    out.push(...w.events);
  }
  return out;
}

const hitsBy = (ev: SimEvent[], id: number) => ev.filter((e): e is Extract<SimEvent, { kind: 'hit' }> => e.kind === 'hit' && e.attackerId === id);

/** Führt `first` im ersten Tick aus und steppt dann, bis `pred` auf die Ereignisse eines Ticks zutrifft. */
function stepUntil(w: World, first: Parameters<typeof stepWorld>[1], pred: (e: SimEvent) => boolean, max = 600): SimEvent[] {
  const all: SimEvent[] = [];
  stepWorld(w, first);
  all.push(...w.events);
  if (w.events.some(pred)) return all;
  for (let i = 0; i < max; i++) {
    stepWorld(w);
    all.push(...w.events);
    if (w.events.some(pred)) return all;
  }
  throw new Error('Ereignis nicht eingetreten');
}

describe('Angriffsablauf', () => {
  it('Bewegungsbefehl im Windup verursacht keinen Schaden', () => {
    const w = makeWorld();
    const spear = spawn(w, 'spearman', 10, 10);
    const archer = passive(spawn(w, 'archer', 10.6, 10, 1));
    stepUntil(w, [{ kind: 'attack', unitIds: [spear.id], targetId: archer.id, queue: false }], (e) => e.kind === 'attackStarted');
    expect(spear.attack.phase).toBe('windup');
    runTicks(w, 5); // mitten im Windup (0,25 s = 15 Ticks)
    const ev = collect(w, 1, () => [{ kind: 'move', unitIds: [spear.id], target: { x: 30, y: 10 }, queue: false }]);
    expect(ev.some((e) => e.kind === 'windupCancelled')).toBe(true);
    runTicks(w, 30);
    expect(archer.hp).toBe(archer.maxHp);
    expect(spear.attack.phase).toBe('idle');
  });

  it('Schaden fällt am Ende der Ausholzeit an; danach darf die Einheit sofort laufen', () => {
    const w = makeWorld();
    const spear = spawn(w, 'spearman', 10, 10);
    const archer = passive(spawn(w, 'archer', 10.6, 10, 1));
    const ev = stepUntil(w, [{ kind: 'attack', unitIds: [spear.id], targetId: archer.id, queue: false }], (e) => e.kind === 'hit');
    const startTick = ev.find((e) => e.kind === 'attackStarted')!.tick;
    const hitTick = ev.find((e) => e.kind === 'hit')!.tick;
    expect(hitTick - startTick).toBe(15); // 0,25 s Windup bei 60 Ticks/s
    expect(archer.hp).toBe(archer.maxHp - 8);
    // Direkt nach dem Treffer: Bewegungsbefehl, Einheit läuft sofort los, Schaden bleibt.
    stepWorld(w, [{ kind: 'move', unitIds: [spear.id], target: { x: 30, y: 10 }, queue: false }]);
    runTicks(w, 3);
    expect(spear.speed).toBeGreaterThan(0);
    expect(archer.hp).toBe(archer.maxHp - 8);
  });

  it('Angriffsperiode: zwei Angriffe eines Speerkämpfers liegen 1,875 s auseinander', () => {
    const w = makeWorld();
    const spear = spawn(w, 'spearman', 10, 10);
    const maa = passive(spawn(w, 'man-at-arms', 10.6, 10, 1));
    const starts = collect(w, 400, (t) => (t === 0 ? [{ kind: 'attack', unitIds: [spear.id], targetId: maa.id, queue: false }] : []))
      .filter((e) => e.kind === 'attackStarted')
      .map((e) => e.tick);
    expect(starts.length).toBeGreaterThanOrEqual(3);
    expect(starts[1]! - starts[0]!).toBe(Math.round(1.875 * 60));
    expect(starts[2]! - starts[1]!).toBe(Math.round(1.875 * 60));
  });

  it('Nahkampf verfehlt, wenn das Ziel während des Windups entkommt', () => {
    const w = makeWorld();
    const spear = spawn(w, 'spearman', 10, 10);
    const horse = passive(spawn(w, 'horseman', 10.7, 10, 1));
    horse.accel = 50; // sofort auf Tempo, damit der Reiter im Windup sicher aus der Reichweite kommt
    stepUntil(w, [{ kind: 'attack', unitIds: [spear.id], targetId: horse.id, queue: false }], (e) => e.kind === 'attackStarted');
    const t0 = w.tick;
    const ev = collect(w, 40, (t) => (t === t0 ? [{ kind: 'move', unitIds: [horse.id], target: { x: 40, y: 10 }, queue: false }] : []));
    expect(ev.some((e) => e.kind === 'miss' && e.attackerId === spear.id)).toBe(true);
    expect(horse.hp).toBe(horse.maxHp);
  });
});

describe('Schadensformel', () => {
  const rules = makeWorld().rules;
  const dmg = (attacker: string, aAge: number, target: string, tAge: number) => {
    const w = defs.ageStats(attacker, aAge).weapon;
    return computeDamage(
      { weaponType: w.type, damage: w.damage, bonus: w.bonus, attackerIsSiege: defs.get(attacker).tags.includes('siege') },
      defs.get(target),
      defs.ageStats(target, tAge),
      rules,
    );
  };
  it('Speer gegen Reiter erhält Bonus', () => {
    expect(dmg('spearman', 2, 'horseman', 2)).toBe(28); // 8 + 20
    expect(dmg('spearman', 2, 'knight', 2)).toBe(25); // 8 + 20 - 3
    expect(dmg('spearman', 2, 'archer', 2)).toBe(8);
  });
  it('Rüstung senkt Schaden, mindestens 1', () => {
    expect(dmg('archer', 2, 'man-at-arms', 2)).toBe(2); // 5 - 3
    expect(dmg('archer', 2, 'knight', 2)).toBe(2);
    expect(dmg('archer', 2, 'spearman', 2)).toBe(10); // 5 + 5 Bonus
    expect(dmg('horseman', 2, 'archer', 2)).toBe(18); // 9 + 9
  });
  it('Resistenz: Pfeile machen gegen Mangonel nur 1 Schaden', () => {
    expect(dmg('archer', 3, 'mangonel', 3)).toBe(1); // 7 * 0,15 = 1,05 -> 1
    expect(dmg('crossbowman', 3, 'mangonel', 3)).toBe(2); // 11 * 0,15 = 1,65 -> 2
    expect(dmg('springald', 3, 'mangonel', 3)).toBe(15); // Belagerung umgeht die Resistenz
    expect(dmg('horseman', 3, 'mangonel', 3)).toBe(22); // 11 + 11 (Bonus gegen Belagerung, Zeitalter III)
  });
  it('Integration: Speer-Treffer auf Reiter nimmt 28 HP', () => {
    const w = makeWorld();
    const spear = spawn(w, 'spearman', 10, 10);
    const horse = passive(spawn(w, 'horseman', 10.7, 10, 1));
    const hits = hitsBy(collect(w, 200, (t) => (t === 0 ? [{ kind: 'attack', unitIds: [spear.id], targetId: horse.id, queue: false }] : [])), spear.id);
    expect(hits[0]?.damage).toBe(28);
    expect(horse.hp).toBe(horse.maxHp - 28 * hits.length);
  });
});

describe('Projektile', () => {
  it('Pfeil braucht Flugzeit (5 Tiles bei 12 Tiles/s ≈ 25 Ticks) und trifft dann', () => {
    const w = makeWorld();
    const archer = spawn(w, 'archer', 10, 10);
    const spear = passive(spawn(w, 'spearman', 10 + 5 + archer.radius + 0.25, 10, 1));
    const ev = stepUntil(w, [{ kind: 'attack', unitIds: [archer.id], targetId: spear.id, queue: false }], (e) => e.kind === 'hit');
    const launch = ev.find((e) => e.kind === 'projectileLaunched')!.tick;
    const hit = ev.find((e) => e.kind === 'hit')!.tick;
    expect(hit - launch).toBeGreaterThanOrEqual(23);
    expect(hit - launch).toBeLessThanOrEqual(27);
    expect(spear.hp).toBe(spear.maxHp - 10);
  });

  it('Pfeil folgt einem laufenden Ziel und trifft trotzdem', () => {
    const w = makeWorld();
    const archer = spawn(w, 'archer', 10, 10);
    const horse = passive(spawn(w, 'horseman', 14, 10, 1));
    stepWorld(w, [{ kind: 'attack', unitIds: [archer.id], targetId: horse.id, queue: false }]);
    const ev = collect(w, 120, (t) => (t === 20 ? [{ kind: 'move', unitIds: [horse.id], target: { x: 14, y: 40 }, queue: false }] : []));
    expect(hitsBy(ev, archer.id).length).toBeGreaterThanOrEqual(1);
  });

  it('Mangonel: Flächenschaden trifft mehrere, ein ausgewichenes Ziel nicht', () => {
    const w = makeWorld();
    const mang = spawn(w, 'mangonel', 10, 10, 0, 3);
    const a = passive(spawn(w, 'archer', 16, 10, 1));
    const b = passive(spawn(w, 'archer', 16, 10.6, 1));
    const dodger = passive(spawn(w, 'archer', 16, 9.4, 1));
    stepUntil(w, [{ kind: 'attack', unitIds: [mang.id], targetId: a.id, queue: false }], (e) => e.kind === 'projectileLaunched');
    expect(w.projectiles.length).toBe(3); // Burst
    stepWorld(w, [{ kind: 'move', unitIds: [dodger.id], target: { x: 16, y: 2 }, queue: false }]);
    runTicks(w, 90); // Flug ca. 6 Tiles / 6 Tiles/s = 1 s
    expect(a.hp).toBeLessThan(a.maxHp);
    expect(b.hp).toBeLessThan(b.maxHp);
    expect(dodger.hp).toBe(dodger.maxHp);
    expect(mang.hp).toBe(mang.maxHp); // kein Eigenbeschuss
  });
});

describe('Abklingzeit und Bewegung', () => {
  function cooldownAfterMoving(runs: boolean): number {
    const w = makeWorld(1, 64, 48);
    w.rules.cooldownRunsWhileMoving = runs;
    const archer = spawn(w, 'archer', 10, 10);
    archer.attack.cooldownLeft = 60;
    stepWorld(w, [{ kind: 'move', unitIds: [archer.id], target: { x: 30, y: 10 }, queue: false }]);
    runTicks(w, 30);
    expect(archer.speed).toBeGreaterThan(0);
    return archer.attack.cooldownLeft;
  }
  it('läuft während der Bewegung weiter (Standard)', () => {
    expect(cooldownAfterMoving(true)).toBeLessThanOrEqual(30);
  });
  it('kann wahlweise beim Laufen pausieren', () => {
    expect(cooldownAfterMoving(false)).toBe(60);
  });
});

describe('Automatisches Angreifen', () => {
  it('untätige Einheit greift Gegner in Erfassungsreichweite an, weit entfernte nicht', () => {
    const w = makeWorld();
    const archer = spawn(w, 'archer', 10, 10);
    passive(spawn(w, 'spearman', 17, 10, 1)); // ~6,5 Tiles Rand zu Rand
    const ev = collect(w, 240);
    expect(ev.some((e) => e.kind === 'attackStarted' && e.unitId === archer.id)).toBe(true);

    const w2 = makeWorld();
    const archer2 = spawn(w2, 'archer', 10, 10);
    passive(spawn(w2, 'spearman', 30, 10, 1));
    const ev2 = collect(w2, 240);
    expect(ev2.some((e) => e.kind === 'attackStarted' && e.unitId === archer2.id)).toBe(false);
  });

  it('Verfolgung ist begrenzt (Leash)', () => {
    const w = makeWorld(1, 80, 48);
    const spear = spawn(w, 'spearman', 10, 10);
    const archer = passive(spawn(w, 'archer', 16, 10, 1));
    const origin = { ...spear.pos };
    stepWorld(w, [{ kind: 'move', unitIds: [archer.id], target: { x: 75, y: 10 }, queue: false }]);
    let maxD = 0;
    for (let i = 0; i < 60 * 30; i++) {
      stepWorld(w);
      maxD = Math.max(maxD, dist(spear.pos, origin));
    }
    expect(maxD).toBeGreaterThan(3); // hat verfolgt
    expect(maxD).toBeLessThan(w.rules.leashRange + 1); // und aufgegeben
    expect(spear.speed).toBe(0);
  });

  it('Attack-Move: kämpft unterwegs und läuft danach weiter', () => {
    const w = makeWorld(1, 80, 48);
    const spear = spawn(w, 'spearman', 5, 10);
    const archer = passive(spawn(w, 'archer', 15, 12, 1));
    stepWorld(w, [{ kind: 'attackMove', unitIds: [spear.id], target: { x: 40, y: 10 }, queue: false }]);
    runTicks(w, 60 * 50);
    expect(archer.alive).toBe(false);
    expect(spear.orders.length).toBe(0);
    expect(dist(spear.pos, { x: 40, y: 10 })).toBeLessThan(0.5);
  });

  it('Position halten: kein Verfolgen, aber Angriff in Reichweite', () => {
    const w = makeWorld();
    const archer = spawn(w, 'archer', 10, 10);
    const far = passive(spawn(w, 'spearman', 18, 10, 1)); // außerhalb von 5 Tiles
    stepWorld(w, [{ kind: 'hold', unitIds: [archer.id], queue: false }]);
    const ev = collect(w, 120);
    expect(ev.some((e) => e.kind === 'attackStarted')).toBe(false);
    expect(dist(archer.pos, { x: 10, y: 10 })).toBeLessThan(0.01);
    stepWorld(w, [{ kind: 'move', unitIds: [far.id], target: { x: 13, y: 10 }, queue: false }]);
    const ev2 = collect(w, 300);
    expect(ev2.some((e) => e.kind === 'attackStarted' && e.unitId === archer.id)).toBe(true);
    expect(dist(archer.pos, { x: 10, y: 10 })).toBeLessThan(0.01);
  });

  it('tote Einheiten werden nicht mehr angegriffen und verlieren ihre Befehle', () => {
    const w = makeWorld();
    const s1 = spawn(w, 'spearman', 10, 10);
    const s2 = spawn(w, 'spearman', 10, 11);
    const archer = passive(spawn(w, 'archer', 12, 10, 1));
    archer.hp = 5;
    stepWorld(w, [
      { kind: 'attack', unitIds: [s1.id, s2.id], targetId: archer.id, queue: false },
      { kind: 'move', unitIds: [archer.id], target: { x: 20, y: 10 }, queue: false },
    ]);
    runTicks(w, 900);
    expect(archer.alive).toBe(false);
    expect(archer.orders.length).toBe(0);
    expect(s1.attack.targetId).toBeNull();
    expect(s1.orders.length).toBe(0);
  });
});

describe('Ansturm und Abwehrstellung', () => {
  it('Ritter trifft nach Anlauf mit Zusatzschaden, danach normal', () => {
    const w = makeWorld();
    const knight = spawn(w, 'knight', 5, 10);
    const archer = passive(spawn(w, 'archer', 15, 10, 1));
    const ev = collect(w, 60 * 8, (t) => (t === 0 ? [{ kind: 'attack', unitIds: [knight.id], targetId: archer.id, queue: false }] : []));
    expect(ev.some((e) => e.kind === 'charge' && e.unitId === knight.id)).toBe(true);
    const hits = hitsBy(ev, knight.id);
    expect(hits[0]?.damage).toBe(19 + 10);
    expect(hits[0]?.charge).toBe(true);
    expect(hits[1]?.damage).toBe(19);
  });

  it('Speerkämpfer stellt sich gegen anstürmende Kavallerie und bestraft den Ansturm', () => {
    const w = makeWorld();
    const spear = passive(spawn(w, 'spearman', 15, 10));
    const knight = spawn(w, 'knight', 5, 10, 1);
    const ev = collect(w, 60 * 8, (t) => (t === 0 ? [{ kind: 'attack', unitIds: [knight.id], targetId: spear.id, queue: false }] : []));
    expect(ev.some((e) => e.kind === 'brace' && e.unitId === spear.id)).toBe(true);
    const braceHits = hitsBy(ev, spear.id).filter((h) => h.damage === 20);
    expect(braceHits.length).toBe(1);
    expect(knight.charge?.charging).toBe(false);
    const knightHits = hitsBy(ev, knight.id);
    expect(knightHits[0]?.charge).toBe(false); // Ansturm wurde gebrochen
  });
});

describe('Szenario 1 mit leichter KI', () => {
  const sc1 = (): ScenarioDef => ({
    id: 't1',
    name: 'Test',
    map: { width: 64, height: 48 },
    seed: 3,
    victory: 'annihilation',
    ai: { level: 'easy', reactionMs: 500 },
    groups: [
      { player: 0, unit: 'archer', age: 2, count: 10, center: { x: 20, y: 24 }, facing: 0 },
      { player: 1, unit: 'spearman', age: 2, count: 6, center: { x: 44, y: 24 }, facing: 180 },
    ],
  });

  function play(): { outcome: string; hash: string; ticks: number } {
    const sc = sc1();
    const w = buildWorldFromScenario(defs, sc);
    const ai = createAi(1, sc.ai!);
    let outcome = 'running';
    let t = 0;
    for (; t < 60 * 120 && outcome === 'running'; t++) {
      stepWorld(w, ai.think(w));
      outcome = evaluateOutcome(w, sc);
    }
    return { outcome, hash: hashWorld(w), ticks: t };
  }

  it('die KI greift an, das Gefecht endet und ist deterministisch', () => {
    const a = play();
    const b = play();
    expect(a.outcome).not.toBe('running');
    expect(a.hash).toBe(b.hash);
    expect(a.ticks).toBe(b.ticks);
  });
});

import { describe, expect, it } from 'vitest';
import { Drill } from '../src/app/drill';
import { defaultEditorState, scenarioFromEditor } from '../src/app/editor';
import { bestAttempt, isBetter, type Attempt } from '../src/app/history';
import { SCENARIOS } from '../src/data/scenarios/index';
import { simulateBaseline } from '../src/sim/baseline';
import { createRng } from '../src/sim/rng';
import { buildWorldFromScenario, type ScenarioDef } from '../src/sim/scenario';
import { RoundStats } from '../src/sim/stats';
import { runTicks, stepWorld } from '../src/sim/step';
import { createWorld, spawnUnit } from '../src/sim/world';
import { defs, makeWorld, spawn } from './helpers';

const passive = (u: ReturnType<typeof spawn>) => ((u.attack.cooldownLeft = 1e9), u);

describe('Schmiede-Upgrades', () => {
  it('+1 Fernkampfangriff und +1 Fernkampfrüstung wirken, Belagerung bekommt nichts', () => {
    const w = createWorld({ map: { width: 64, height: 48 }, seed: 1, defs });
    const archer = spawnUnit(w, { player: 0, defId: 'archer', age: 2, pos: { x: 10, y: 10 }, upgrades: { rangedAttack: 2, meleeAttack: 1, meleeArmor: 1, rangedArmor: 0 } });
    const maa = spawnUnit(w, { player: 1, defId: 'man-at-arms', age: 2, pos: { x: 14, y: 10 }, upgrades: { rangedAttack: 0, meleeAttack: 0, meleeArmor: 0, rangedArmor: 1 } });
    const mang = spawnUnit(w, { player: 1, defId: 'mangonel', age: 3, pos: { x: 30, y: 30 }, upgrades: { rangedAttack: 3, meleeAttack: 3, meleeArmor: 3, rangedArmor: 3 } });
    expect(archer.mods).toEqual({ damage: 2, meleeArmor: 1, rangedArmor: 0 });
    expect(mang.mods).toEqual({ damage: 0, meleeArmor: 0, rangedArmor: 0 });
    passive(maa);
    stepWorld(w, [{ kind: 'attack', unitIds: [archer.id], targetId: maa.id, queue: false }]);
    let dmg = 0;
    for (let i = 0; i < 200 && dmg === 0; i++) {
      stepWorld(w);
      for (const e of w.events) if (e.kind === 'hit') dmg = e.damage;
    }
    // (5 + 2) - (3 + 1) = 3
    expect(dmg).toBe(3);
  });

  it('Szenario-Upgrades gelten pro Seite', () => {
    const sc: ScenarioDef = {
      id: 'u',
      name: 'u',
      map: { width: 64, height: 48 },
      upgrades: { '0': { meleeAttack: 1 }, '1': { meleeArmor: 2 } },
      groups: [
        { player: 0, unit: 'spearman', age: 2, count: 1, center: { x: 10, y: 10 } },
        { player: 1, unit: 'spearman', age: 2, count: 1, center: { x: 20, y: 10 } },
      ],
    };
    const w = buildWorldFromScenario(defs, sc);
    expect(w.units[0]!.mods.damage).toBe(1);
    expect(w.units[1]!.mods.meleeArmor).toBe(2);
  });
});

describe('Rundenauswertung', () => {
  it('zählt Eingaben, APM, wirksame Befehle und Befehle pro Typ', () => {
    const w = makeWorld();
    const a = spawn(w, 'archer', 10, 10);
    const st = new RoundStats(0);
    st.recordInput({ kind: 'select' }, 0);
    st.recordInput({ kind: 'command', command: { kind: 'move', unitIds: [a.id], target: { x: 20, y: 10 }, queue: false } }, 1);
    st.recordInput({ kind: 'command', command: { kind: 'move', unitIds: [a.id], target: { x: 20, y: 10 }, queue: false } }, 5); // Wiederholung
    st.recordInput({ kind: 'command', command: { kind: 'stop', unitIds: [a.id] } }, 10);
    runTicks(w, 60 * 60); // 1 Minute
    const s = st.finish(w, 'running');
    expect(s.inputActions).toBe(4);
    expect(s.effectiveCommands).toBe(2);
    expect(s.apm).toBeCloseTo(4, 5);
    expect(s.eapm).toBeCloseTo(2, 5);
    expect(s.commandsByType).toEqual({ move: 2, stop: 1 });
  });

  it('Kite-Effizienz: stehender Schütze in Reichweite erreicht ~100 %, laufender weniger', () => {
    const run = (kite: boolean) => {
      const w = makeWorld();
      const archer = spawn(w, 'archer', 10, 10);
      const spear = passive(spawn(w, 'spearman', 15, 10, 1));
      spear.hp = 100000;
      spear.maxHp = 100000;
      const st = new RoundStats(0);
      for (let t = 0; t < 60 * 20; t++) {
        const cmds = kite && t % 120 === 60 ? [{ kind: 'move' as const, unitIds: [archer.id], target: { x: archer.pos.x - 1, y: 10 }, queue: false }] : [];
        stepWorld(w, cmds);
        st.consume(w, w.events);
        st.sample(w);
      }
      return st.finish(w, 'running');
    };
    const still = run(false);
    const kiting = run(true);
    expect(still.kiteEfficiency).not.toBeNull();
    expect(still.kiteEfficiency!).toBeGreaterThan(0.85);
    expect(kiting.kiteEfficiency!).toBeLessThan(still.kiteEfficiency!);
  });

  it('Overkill zählt verschwendete Projektile und Idle-Zeit beginnt mit dem Kampf', () => {
    const w = makeWorld();
    const a1 = spawn(w, 'archer', 10, 10);
    const a2 = spawn(w, 'archer', 10, 11);
    const victim = passive(spawn(w, 'spearman', 14, 10, 1));
    victim.hp = 10; // ein Pfeil (10 Schaden) reicht
    const st = new RoundStats(0);
    stepWorld(w, [{ kind: 'attack', unitIds: [a1.id, a2.id], targetId: victim.id, queue: false }]);
    st.consume(w, w.events);
    st.sample(w);
    for (let t = 0; t < 60 * 5; t++) {
      stepWorld(w);
      st.consume(w, w.events);
      st.sample(w);
    }
    const s = st.finish(w, 'victory');
    expect(victim.alive).toBe(false);
    expect(s.wastedProjectiles).toBe(1);
    expect(s.overkill).toBeGreaterThanOrEqual(10);
    expect(s.avgSimultaneousTargets).toBeGreaterThan(0);
    expect(s.idleSeconds).toBeGreaterThan(0); // nach dem Kampf stehen beide untätig
  });
});

describe('Vergleichslauf nur Attack-Move', () => {
  it('liefert ein Ergebnis für Szenario 1 und ist deterministisch', () => {
    const sc = SCENARIOS.find((s) => s.id === 'kiten-grundlagen')!;
    const a = simulateBaseline(defs, sc, { seed: 1 });
    const b = simulateBaseline(defs, sc, { seed: 1 });
    expect(a.outcome).not.toBe('running');
    expect(a).toEqual(b);
  });
});

describe('Hotkey-Drill', () => {
  it('erzeugt Aufgaben, misst Zeit und zählt Fehlgriffe', () => {
    const rng = createRng(5);
    const d = new Drill(rng, 3, [1, 2, 3], { center: { x: 30, y: 24 }, radius: 8 }, 0);
    expect(d.tasks.length).toBe(3);
    const ctx = { selection: new Set<number>(), groupIds: (n: number) => [n * 10, n * 10 + 1], allMilitary: () => [10, 11, 20, 21, 30, 31] };
    d.update(2000);
    expect(d.phase).toBe('prompt');
    const task = d.current!;
    let now = 2000;
    let errorsExpected = 0;
    for (const step of task.steps) {
      // erst ein Fehlgriff (Angriffsbefehl erfüllt nie einen Drill-Schritt), dann der richtige Schritt
      expect(d.onInput({ kind: 'command', command: { kind: 'attack', unitIds: [1], targetId: 99, queue: false } }, ctx, now + 100)).toBe(false);
      errorsExpected++;
      now += 300;
      if (step.kind === 'selectGroup') {
        ctx.selection = new Set(ctx.groupIds(step.n));
        expect(d.onInput({ kind: 'select' }, ctx, now)).toBe(true);
      } else if (step.kind === 'selectAll') {
        ctx.selection = new Set(ctx.allMilitary());
        expect(d.onInput({ kind: 'select' }, ctx, now)).toBe(true);
      } else if (step.kind === 'command') {
        expect(d.onInput({ kind: 'command', command: { kind: step.command, unitIds: [1], target: { x: step.marker.x + 1, y: step.marker.y }, queue: false } }, ctx, now)).toBe(true);
      } else if (step.kind === 'stop') {
        expect(d.onInput({ kind: 'command', command: { kind: 'stop', unitIds: [1] } }, ctx, now)).toBe(true);
      } else if (step.kind === 'hold') {
        // hold wurde oben schon als "Fehlgriff" gesendet und hätte gezählt; hier regulär
        expect(d.onInput({ kind: 'command', command: { kind: 'hold', unitIds: [1], queue: false } }, ctx, now)).toBe(true);
      }
    }
    expect(d.phase).toBe('waiting');
    expect(d.results.length).toBe(1);
    expect(d.results[0]!.ms).toBe(now - 2000);
    expect(d.results[0]!.errors).toBe(errorsExpected);
  });

  it('Drill-Szenario weist Gruppen zu und endet nach allen Aufgaben', () => {
    const sc = SCENARIOS.find((s) => s.id === 'hotkey-drill')!;
    const w = buildWorldFromScenario(defs, sc);
    expect(new Set(w.units.map((u) => u.spawnGroup)).size).toBe(3);
    const d = new Drill(w.rng, sc.drill!.tasks, [1, 2, 3], { center: { x: 30, y: 24 }, radius: 8 }, 0);
    expect(d.tasks.length).toBe(20);
    for (const t of d.tasks) for (const s of t.steps) if (s.kind === 'command') expect(Math.abs(s.marker.x - 30)).toBeLessThanOrEqual(8);
  });
});

describe('Verlauf und Editor', () => {
  const att = (o: Partial<Attempt>): Attempt => ({ at: '', outcome: 'victory', seconds: 30, lostMine: 0, survivorsMine: 10, valueLostMine: 0, valueKilled: 100, kiteEfficiency: null, apm: 0, eapm: 0, overkill: 0, idleSeconds: 0, windupCancelled: 0, ...o });
  it('Bestwert: Sieg vor Niederlage, geringster Verlust, dann kürzeste Dauer', () => {
    const a = att({ outcome: 'defeat', valueLostMine: 0 });
    const b = att({ outcome: 'victory', valueLostMine: 200, seconds: 50 });
    const c = att({ outcome: 'victory', valueLostMine: 200, seconds: 40 });
    expect(bestAttempt([a, b, c])).toBe(c);
    expect(isBetter(att({ valueLostMine: 100 }), c)).toBe(true);
    expect(isBetter(att({ valueLostMine: 300 }), c)).toBe(false);
    const d1 = att({ reactionMs: 800, errors: 0 });
    const d2 = att({ reactionMs: 600, errors: 1 });
    expect(bestAttempt([d1, d2])).toBe(d1); // Fehlgriffe kosten 500 ms
  });

  it('Editor erzeugt ein spielbares Szenario mit Upgrades und KI', () => {
    const s = defaultEditorState();
    s.mine = [{ unit: 'archer', age: 2, count: 5 }, { unit: 'knight', age: 3, count: 2 }];
    s.theirs = [{ unit: 'spearman', age: 2, count: 4 }];
    s.upgradesMine.rangedAttack = 2;
    s.distance = 10;
    const sc = scenarioFromEditor(s, defs);
    expect(sc.groups.length).toBe(3);
    const w = buildWorldFromScenario(defs, sc);
    expect(w.units.length).toBe(11);
    expect(w.units.find((u) => u.defId === 'archer')!.mods.damage).toBe(2);
    const xs = sc.groups.map((g) => g.center.x);
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(10);
    const r = simulateBaseline(defs, sc, {}, 60);
    expect(['victory', 'defeat', 'draw', 'running']).toContain(r.outcome);
  });
});

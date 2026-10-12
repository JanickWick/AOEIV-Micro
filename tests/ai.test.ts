import { describe, expect, it } from 'vitest';
import { SCENARIOS } from '../src/data/scenarios/index';
import { createAi } from '../src/sim/ai';
import { hashWorld } from '../src/sim/hash';
import { dist } from '../src/sim/math';
import { buildWorldFromScenario, evaluateOutcome } from '../src/sim/scenario';
import { stepWorld } from '../src/sim/step';
import type { Command } from '../src/sim/types';
import { defs, makeWorld, spawn } from './helpers';

const passive = (u: ReturnType<typeof spawn>) => ((u.attack.cooldownLeft = 1e9), u);

describe('KI mittel', () => {
  it('wählt Konter-Ziele zuerst (Speer greift Reiter statt Bogenschützen an)', () => {
    const w = makeWorld();
    const spear = spawn(w, 'spearman', 10, 10, 1);
    const archer = passive(spawn(w, 'archer', 14, 10, 0));
    const horse = passive(spawn(w, 'horseman', 14, 12, 0));
    const ai = createAi(1, { level: 'medium', reactionMs: 100 });
    let cmds: Command[] = [];
    for (let i = 0; i < 20 && cmds.length === 0; i++) {
      cmds = ai.think(w);
      stepWorld(w, cmds);
    }
    const atk = cmds.find((c) => c.kind === 'attack');
    expect(atk && atk.kind === 'attack' ? atk.targetId : null).toBe(horse.id);
    void spear;
    void archer;
  });

  it('fokussiert angeschlagene Ziele', () => {
    const w = makeWorld();
    spawn(w, 'archer', 10, 10, 1);
    const healthy = passive(spawn(w, 'archer', 14, 10, 0));
    const hurt = passive(spawn(w, 'archer', 14, 12, 0));
    hurt.hp = 20;
    const ai = createAi(1, { level: 'medium', reactionMs: 100 });
    let cmds: Command[] = [];
    for (let i = 0; i < 20 && cmds.length === 0; i++) {
      cmds = ai.think(w);
      stepWorld(w, cmds);
    }
    const atk = cmds.find((c) => c.kind === 'attack');
    expect(atk && atk.kind === 'attack' ? atk.targetId : null).toBe(hurt.id);
    void healthy;
  });

  it('zieht sich nie zurück', () => {
    const w = makeWorld();
    const maa = spawn(w, 'man-at-arms', 10, 10, 1);
    maa.hp = 10;
    passive(spawn(w, 'man-at-arms', 11, 10, 0));
    const ai = createAi(1, { level: 'medium', reactionMs: 100 });
    for (let i = 0; i < 60; i++) stepWorld(w, ai.think(w));
    expect(maa.orders.every((o) => o.kind !== 'move')).toBe(true);
  });
});

describe('KI schwer', () => {
  it('kitet: Schütze weicht einem Speerkämpfer während der Abklingzeit aus', () => {
    const w = makeWorld();
    const archer = spawn(w, 'archer', 10, 10, 1);
    archer.attack.cooldownLeft = 60;
    passive(spawn(w, 'spearman', 12.5, 10, 0));
    const ai = createAi(1, { level: 'hard', reactionMs: 100 });
    const cmds = ai.think(w);
    const mv = cmds.find((c) => c.kind === 'move');
    expect(mv).toBeDefined();
    if (mv && mv.kind === 'move') expect(mv.target.x).toBeLessThan(10); // weg vom Speer
  });

  it('zieht angeschlagene Einheiten zurück', () => {
    const w = makeWorld();
    const maa = spawn(w, 'man-at-arms', 10, 10, 1);
    maa.hp = 20;
    passive(spawn(w, 'man-at-arms', 11, 10, 0));
    const ai = createAi(1, { level: 'hard', reactionMs: 100 });
    const cmds = ai.think(w);
    const mv = cmds.find((c) => c.kind === 'move');
    expect(mv).toBeDefined();
    if (mv && mv.kind === 'move') expect(mv.target.x).toBeLessThan(10);
  });

  it('weicht Mangonel-Geschossen aus', () => {
    const w = makeWorld();
    const mang = spawn(w, 'mangonel', 10, 10, 0, 3);
    const victim = spawn(w, 'horseman', 17, 10, 1); // 7 Tiles Flug ≈ 1,2 s bei Platzhalter 6 Tiles/s
    const ai = createAi(1, { level: 'hard', reactionMs: 50 });
    // Mangonel schießt; die KI-Einheit darf nicht zurückschießen (Abklingzeit), aber ausweichen
    victim.attack.cooldownLeft = 1e9;
    let launched = false;
    stepWorld(w, [{ kind: 'attack', unitIds: [mang.id], targetId: victim.id, queue: false }]);
    for (let i = 0; i < 120 && !launched; i++) {
      stepWorld(w);
      launched = w.projectiles.length > 0;
    }
    expect(launched).toBe(true);
    const cmds = ai.think(w);
    const mv = cmds.find((c) => c.kind === 'move');
    expect(mv).toBeDefined();
    const before = { ...victim.pos };
    for (let i = 0; i < 90; i++) stepWorld(w, ai.think(w));
    expect(dist(victim.pos, before)).toBeGreaterThan(1);
    expect(victim.hp).toBe(victim.maxHp);
  });

  it('Kavallerie umgeht Speerkämpfer auf dem Weg zu Schützen', () => {
    const w = makeWorld();
    const horse = spawn(w, 'horseman', 10, 10, 1);
    passive(spawn(w, 'spearman', 15, 10, 0));
    passive(spawn(w, 'archer', 20, 10, 0));
    const ai = createAi(1, { level: 'hard', reactionMs: 100 });
    const cmds = ai.think(w);
    expect(cmds[0]?.kind).toBe('move');
    expect(cmds[1]?.kind).toBe('attack');
    if (cmds[0]?.kind === 'move') expect(Math.abs(cmds[0].target.y - 10)).toBeGreaterThan(3);
    void horse;
  });
});

describe('Szenarien 2 bis 8', () => {
  it('laufen mit ihrer KI ohne Spielereingriff bis zum Ende und sind deterministisch', () => {
    for (const sc of SCENARIOS) {
      if (!sc.ai || sc.ai.level === 'none') continue;
      const run = () => {
        const w = buildWorldFromScenario(defs, sc);
        const ai = createAi(1, sc.ai!);
        let outcome = 'running';
        let t = 0;
        for (; t < 60 * 180 && outcome === 'running'; t++) {
          stepWorld(w, ai.think(w));
          outcome = evaluateOutcome(w, sc);
        }
        return { outcome, hash: hashWorld(w), t };
      };
      const a = run();
      const b = run();
      expect(a.outcome, sc.id).not.toBe('running');
      expect(a.hash, sc.id).toBe(b.hash);
    }
  }, 60000);

  it('Szenario-IDs sind eindeutig und Einheiten existieren', () => {
    const ids = new Set<string>();
    for (const sc of SCENARIOS) {
      expect(ids.has(sc.id)).toBe(false);
      ids.add(sc.id);
      for (const g of sc.groups) expect(defs.has(g.unit), `${sc.id}: ${g.unit}`).toBe(true);
    }
  });
});

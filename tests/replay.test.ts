import { describe, expect, it } from 'vitest';
import { createAi } from '../src/sim/ai';
import { hashWorld } from '../src/sim/hash';
import { parseReplay, ReplayPlayer, ReplayRecorder, runReplay, serializeReplay, type Replay } from '../src/sim/replay';
import { buildWorldFromScenario, evaluateOutcome, type ScenarioDef } from '../src/sim/scenario';
import { stepWorld } from '../src/sim/step';
import { aliveUnits } from '../src/sim/world';
import type { Command } from '../src/sim/types';
import { defs } from './helpers';

const scenario: ScenarioDef = {
  id: 'replay-test',
  name: 'Replay-Test',
  map: { width: 64, height: 48 },
  seed: 7,
  victory: 'annihilation',
  ai: { level: 'medium', reactionMs: 400 },
  groups: [
    { player: 0, unit: 'archer', age: 2, count: 8, center: { x: 22, y: 24 }, facing: 0 },
    { player: 1, unit: 'spearman', age: 2, count: 5, center: { x: 36, y: 24 }, facing: 180 },
  ],
};

/** Ein "Spieler", der kitet: alle 45 Ticks zurück, dazwischen Angriffsbewegung. */
function scriptedCommands(world: ReturnType<typeof buildWorldFromScenario>, tick: number): Command[] {
  const mine = aliveUnits(world, 0).map((u) => u.id);
  if (mine.length === 0) return [];
  if (tick % 90 === 0) return [{ kind: 'move', unitIds: mine, target: { x: 10 + (tick % 7), y: 24 + (tick % 5) }, queue: false }];
  if (tick % 90 === 45) return [{ kind: 'attackMove', unitIds: mine, target: { x: 40, y: 24 }, queue: false }];
  return [];
}

function recordRun(randomStart = false, seed = 7): { replay: Replay; hash: string } {
  const world = buildWorldFromScenario(defs, scenario, { seed, randomStart, decor: false });
  const ai = createAi(1, scenario.ai!);
  const rec = new ReplayRecorder();
  let outcome = evaluateOutcome(world, scenario, 0);
  while (outcome === 'running' && world.tick < 60 * 120) {
    const mine = scriptedCommands(world, world.tick);
    rec.record(world.tick, mine);
    stepWorld(world, [...mine, ...ai.think(world)]);
    outcome = evaluateOutcome(world, scenario, 0);
  }
  expect(outcome).not.toBe('running');
  const replay = rec.finish(world, outcome, { app: 'test', scenario, seed, randomStart, profile: 'eigen', rules: {} });
  return { replay, hash: hashWorld(world) };
}

describe('Replay und Determinismus', () => {
  it('aufgezeichneter Lauf ergibt beim Abspielen denselben Zustands-Hash', () => {
    const { replay, hash } = recordRun();
    expect(replay.commands.length).toBeGreaterThan(5);
    const run = runReplay(defs, replay);
    expect(run.ticks).toBe(replay.ticks);
    expect(run.hash).toBe(hash);
    expect(run.matches).toBe(true);
    expect(run.outcome).toBe(replay.outcome);
  });

  it('übersteht JSON-Export und -Import unverändert', () => {
    const { replay } = recordRun(true, 11);
    const back = parseReplay(serializeReplay(replay));
    expect(back).toEqual(replay);
    expect(runReplay(defs, back).matches).toBe(true);
  });

  it('ein anderer Zufallsstart oder ein geänderter Befehl ergibt einen anderen Hash', () => {
    const { replay } = recordRun();
    const otherSeed = runReplay(defs, { ...replay, seed: replay.seed + 1, randomStart: true });
    expect(otherSeed.hash).not.toBe(replay.hash);
    const changed = structuredClone(replay);
    const first = changed.commands.find((c) => c.command.kind === 'move')!;
    (first.command as Extract<Command, { kind: 'move' }>).target.x += 3;
    expect(runReplay(defs, changed).matches).toBe(false);
  });

  it('ReplayPlayer liefert Befehle genau an ihrem Tick', () => {
    const { replay } = recordRun();
    const p = new ReplayPlayer(replay);
    const byTick = new Map<number, number>();
    for (const c of replay.commands) byTick.set(c.tick, (byTick.get(c.tick) ?? 0) + 1);
    for (let t = 0; t <= replay.ticks; t++) expect(p.next(t).length).toBe(byTick.get(t) ?? 0);
    expect(p.finished).toBe(true);
  });

  it('weist fremde oder kaputte Dateien ab', () => {
    expect(() => parseReplay('{"format":"x"}')).toThrow();
    expect(() => parseReplay('{"format":"kompanie-replay","version":1}')).toThrow();
    expect(() => parseReplay(JSON.stringify({ format: 'kompanie-replay', version: 1, scenario, seed: 1, commands: [{ tick: 'a' }], ticks: 10 }))).toThrow();
  });
});

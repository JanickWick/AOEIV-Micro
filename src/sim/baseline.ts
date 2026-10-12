/** Vergleichslauf "nur Attack-Move": dieselbe Ausgangslage, Spieler durch die leichte KI ersetzt. */
import { createAi } from './ai';
import { buildWorldFromScenario, evaluateOutcome, type BuildOptions, type Outcome, type ScenarioDef } from './scenario';
import { stepWorld } from './step';
import { RoundStats } from './stats';
import type { UnitDefLibrary } from './unitDefs';

export interface BaselineResult {
  outcome: Outcome;
  seconds: number;
  lostMine: number;
  lostTheirs: number;
  valueLostMine: number;
  valueKilled: number;
  timedOut: boolean;
}

export function simulateBaseline(defs: UnitDefLibrary, sc: ScenarioDef, opts: BuildOptions = {}, maxSeconds = 180): BaselineResult {
  const world = buildWorldFromScenario(defs, sc, opts);
  const me = createAi(0, { level: 'easy', reactionMs: 500 });
  const enemy = sc.ai && sc.ai.level !== 'none' ? createAi(1, sc.ai) : null;
  const stats = new RoundStats(0);
  let outcome: Outcome = 'running';
  const maxTicks = Math.round(maxSeconds * world.rules.tickRate);
  while (outcome === 'running' && world.tick < maxTicks) {
    const cmds = [...me.think(world), ...(enemy ? enemy.think(world) : [])];
    stepWorld(world, cmds);
    outcome = evaluateOutcome(world, sc, 0);
  }
  const s = stats.finish(world, outcome);
  return { outcome, seconds: s.seconds, lostMine: s.lostMine, lostTheirs: s.lostTheirs, valueLostMine: s.valueLostMine, valueKilled: s.valueKilled, timedOut: outcome === 'running' };
}

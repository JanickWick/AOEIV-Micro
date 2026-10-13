import { describe, expect, it } from 'vitest';
import { SCENARIOS } from '../src/data/scenarios/index';
import { defs } from './helpers';
import { buildWorldFromScenario } from '../src/sim/scenario';
import { stepWorld } from '../src/sim/step';

describe('Simulationskosten (Lasttest, 200 Einheiten)', () => {
  it('braucht im Mittel unter 3 ms je Tick', () => {
    const sc = SCENARIOS.find((s) => s.id === 'leistungstest')!;
    const world = buildWorldFromScenario(defs, sc, { seed: 1 });
    // Alle gegeneinander: Angriffsbewegung beider Seiten zur Mitte
    const t0 = performance.now();
    const ticks = 600;
    for (let i = 0; i < ticks; i++) stepWorld(world, []);
    const msPerTick = (performance.now() - t0) / ticks;
    console.info(`SIM ms/Tick (200 Einheiten, ${ticks} Ticks): ${msPerTick.toFixed(3)}`);
    expect(msPerTick).toBeLessThan(3);
  });
});

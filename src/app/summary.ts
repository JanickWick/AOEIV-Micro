/** Kurzauswertung einer Runde (M2); die vollständige Statistik folgt in M5. */
import type { Outcome } from '../sim/scenario';
import type { SimEvent, World } from '../sim/types';

export interface RoundSummary {
  outcome: Outcome;
  seconds: number;
  lostMine: number;
  lostTheirs: number;
  valueLostMine: number;
  valueKilled: number;
  windupCancelled: number;
  attacksStarted: number;
  hitsDealt: number;
  damageDealt: number;
  damageTaken: number;
  misses: number;
}

export class SummaryTracker {
  windupCancelled = 0;
  attacksStarted = 0;
  hitsDealt = 0;
  damageDealt = 0;
  damageTaken = 0;
  misses = 0;

  consume(world: World, events: readonly SimEvent[]): void {
    for (const e of events) {
      switch (e.kind) {
        case 'windupCancelled':
          if (world.units[e.unitId - 1]?.player === 0) this.windupCancelled++;
          break;
        case 'attackStarted':
          if (world.units[e.unitId - 1]?.player === 0) this.attacksStarted++;
          break;
        case 'hit': {
          const att = world.units[e.attackerId - 1];
          if (att?.player === 0) {
            this.hitsDealt++;
            this.damageDealt += e.damage;
          } else this.damageTaken += e.damage;
          break;
        }
        case 'miss':
          if (world.units[e.attackerId - 1]?.player === 0) this.misses++;
          break;
        default:
          break;
      }
    }
  }

  finish(world: World, outcome: Outcome): RoundSummary {
    let lostMine = 0;
    let lostTheirs = 0;
    let valueLostMine = 0;
    let valueKilled = 0;
    for (const u of world.units) {
      if (u.alive) continue;
      const cost = world.defs.ageStats(u.defId, u.age).cost.total;
      if (u.player === 0) {
        lostMine++;
        valueLostMine += cost;
      } else {
        lostTheirs++;
        valueKilled += cost;
      }
    }
    return {
      outcome,
      seconds: world.tick * world.dt,
      lostMine,
      lostTheirs,
      valueLostMine,
      valueKilled,
      windupCancelled: this.windupCancelled,
      attacksStarted: this.attacksStarted,
      hitsDealt: this.hitsDealt,
      damageDealt: this.damageDealt,
      damageTaken: this.damageTaken,
      misses: this.misses,
    };
  }
}

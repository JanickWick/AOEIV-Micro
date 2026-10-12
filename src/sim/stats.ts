/**
 * Rundenauswertung: zählt Ereignisse und Eingaben, misst pro Tick Kite-Gelegenheiten,
 * gleichzeitig beschossene Ziele und Idle-Zeit. Reine Logik ohne Browser.
 */
import type { Outcome } from './scenario';
import type { Command, PlayerId, SimEvent, UnitState, World } from './types';
import { edgeDistance } from './world';

export type InputAction = { kind: 'command'; command: Command } | { kind: 'select' } | { kind: 'group'; n: number };

export interface RoundSummary {
  outcome: Outcome;
  seconds: number;
  lostMine: number;
  lostTheirs: number;
  survivorsMine: number;
  valueLostMine: number;
  valueKilled: number;
  /** Eingaben pro Minute (Befehle, Auswahl, Kontrollgruppen). */
  apm: number;
  /** Wirksame Befehle pro Minute (ohne Auswahl, ohne unmittelbare Wiederholungen). */
  eapm: number;
  commandsByType: Record<string, number>;
  inputActions: number;
  effectiveCommands: number;
  windupCancelled: number;
  attacksStarted: number;
  /** Fernkampfangriffe, die tatsächlich abgegeben wurden. */
  rangedAttacksCompleted: number;
  /** Mögliche Fernkampfangriffe (Zeit in Reichweite / Angriffsperiode). */
  rangedAttacksPossible: number;
  /** Anteil der möglichen Fernkampfangriffe, die abgegeben wurden (null ohne Fernkämpfer). */
  kiteEfficiency: number | null;
  meleeDamageTaken: number;
  damageDealt: number;
  damageTaken: number;
  hitsDealt: number;
  misses: number;
  /** Overkill-Schaden: Schaden über den Tod hinaus plus verschwendete Projektile. */
  overkill: number;
  wastedProjectiles: number;
  /** Durchschnittliche Zahl gleichzeitig beschossener Ziele (Ticks mit mindestens einem Angriff). */
  avgSimultaneousTargets: number;
  /** Idle-Zeit eigener Einheiten während des Kampfes (Sekunden, Summe über Einheiten). */
  idleSeconds: number;
  /** Anteil der Einheiten-Zeit im Kampf, die untätig war. */
  idleFraction: number;
}

export class RoundStats {
  readonly player: PlayerId;
  private commandsByType: Record<string, number> = {};
  private inputActions = 0;
  private effectiveCommands = 0;
  private lastCommandKey = '';
  private lastCommandTick = -1000;
  private windupCancelled = 0;
  private attacksStarted = 0;
  private rangedCompleted = 0;
  private hitsDealt = 0;
  private damageDealt = 0;
  private damageTaken = 0;
  private meleeDamageTaken = 0;
  private misses = 0;
  private overkill = 0;
  private wastedProjectiles = 0;
  private inRangePeriods = 0; // Summe über Einheiten: Ticks in Reichweite / Periodenticks
  private targetSamples = 0;
  private targetSampleTicks = 0;
  private combatStarted = false;
  private idleUnitTicks = 0;
  private aliveUnitTicks = 0;
  private rangedUnitsSeen = false;

  constructor(player: PlayerId = 0) {
    this.player = player;
  }

  recordInput(a: InputAction, tick: number): void {
    this.inputActions++;
    if (a.kind !== 'command') return;
    const c = a.command;
    this.commandsByType[c.kind] = (this.commandsByType[c.kind] ?? 0) + 1;
    const key = commandKey(c);
    if (key !== this.lastCommandKey || tick - this.lastCommandTick > 30) this.effectiveCommands++;
    this.lastCommandKey = key;
    this.lastCommandTick = tick;
  }

  private isMine(world: World, id: number): boolean {
    return world.units[id - 1]?.player === this.player;
  }

  consume(world: World, events: readonly SimEvent[]): void {
    for (const e of events) {
      switch (e.kind) {
        case 'windupCancelled':
          if (this.isMine(world, e.unitId)) this.windupCancelled++;
          break;
        case 'attackStarted':
          if (this.isMine(world, e.unitId)) this.attacksStarted++;
          break;
        case 'projectileLaunched':
          if (this.isMine(world, e.attackerId)) this.rangedCompleted++;
          break;
        case 'hit': {
          if (this.isMine(world, e.attackerId)) {
            this.hitsDealt++;
            this.damageDealt += e.damage;
            this.overkill += e.overkill;
          } else if (this.isMine(world, e.targetId)) {
            this.damageTaken += e.damage;
            if (e.weaponType === 'melee') this.meleeDamageTaken += e.damage;
          }
          this.combatStarted = true;
          break;
        }
        case 'projectileWasted':
          if (this.isMine(world, e.attackerId)) {
            this.wastedProjectiles++;
            this.overkill += e.damage;
          }
          break;
        case 'miss':
          if (this.isMine(world, e.attackerId)) this.misses++;
          break;
        default:
          break;
      }
    }
  }

  /** Einmal pro Tick nach dem Schritt aufrufen. */
  sample(world: World): void {
    const mine: UnitState[] = [];
    const enemies: UnitState[] = [];
    for (const u of world.units) {
      if (!u.alive) continue;
      (u.player === this.player ? mine : enemies).push(u);
    }
    const targets = new Set<number>();
    for (const u of mine) {
      const w = world.defs.ageStats(u.defId, u.age).weapon;
      if (w.type !== 'melee') {
        this.rangedUnitsSeen = true;
        let inRange = false;
        for (const e of enemies) {
          const d = edgeDistance(u, e);
          if (d <= w.range.max && d >= w.range.min) {
            inRange = true;
            break;
          }
        }
        if (inRange) this.inRangePeriods += 1 / Math.max(1, Math.round(w.timing.period * world.rules.tickRate));
      }
      if (u.attack.phase === 'windup' && u.attack.targetId !== null) targets.add(u.attack.targetId);
      if (this.combatStarted) {
        this.aliveUnitTicks++;
        if (u.orders.length === 0 && u.attack.targetId === null) this.idleUnitTicks++;
      }
    }
    for (const p of world.projectiles) if (p.player === this.player && p.targetId !== null) targets.add(p.targetId);
    if (targets.size > 0) {
      this.targetSamples += targets.size;
      this.targetSampleTicks++;
    }
  }

  finish(world: World, outcome: Outcome): RoundSummary {
    let lostMine = 0;
    let lostTheirs = 0;
    let survivorsMine = 0;
    let valueLostMine = 0;
    let valueKilled = 0;
    for (const u of world.units) {
      const cost = world.defs.ageStats(u.defId, u.age).cost.total;
      if (u.alive) {
        if (u.player === this.player) survivorsMine++;
        continue;
      }
      if (u.player === this.player) {
        lostMine++;
        valueLostMine += cost;
      } else {
        lostTheirs++;
        valueKilled += cost;
      }
    }
    const seconds = world.tick * world.dt;
    const minutes = Math.max(seconds, 1) / 60;
    const possible = Math.max(this.inRangePeriods, this.rangedCompleted);
    return {
      outcome,
      seconds,
      lostMine,
      lostTheirs,
      survivorsMine,
      valueLostMine,
      valueKilled,
      apm: this.inputActions / minutes,
      eapm: this.effectiveCommands / minutes,
      commandsByType: { ...this.commandsByType },
      inputActions: this.inputActions,
      effectiveCommands: this.effectiveCommands,
      windupCancelled: this.windupCancelled,
      attacksStarted: this.attacksStarted,
      rangedAttacksCompleted: this.rangedCompleted,
      rangedAttacksPossible: possible,
      kiteEfficiency: this.rangedUnitsSeen && possible > 0 ? Math.min(1, this.rangedCompleted / possible) : null,
      meleeDamageTaken: this.meleeDamageTaken,
      damageDealt: this.damageDealt,
      damageTaken: this.damageTaken,
      hitsDealt: this.hitsDealt,
      misses: this.misses,
      overkill: this.overkill,
      wastedProjectiles: this.wastedProjectiles,
      avgSimultaneousTargets: this.targetSampleTicks ? this.targetSamples / this.targetSampleTicks : 0,
      idleSeconds: this.idleUnitTicks * world.dt,
      idleFraction: this.aliveUnitTicks ? this.idleUnitTicks / this.aliveUnitTicks : 0,
    };
  }
}

function commandKey(c: Command): string {
  const ids = [...c.unitIds].sort((a, b) => a - b).join(',');
  switch (c.kind) {
    case 'move':
    case 'attackMove':
    case 'patrol':
      return `${c.kind}|${ids}|${Math.round(c.target.x * 2)}|${Math.round(c.target.y * 2)}|${c.queue ? 1 : 0}`;
    case 'attack':
      return `attack|${ids}|${c.targetId}|${c.queue ? 1 : 0}`;
    default:
      return `${c.kind}|${ids}`;
  }
}

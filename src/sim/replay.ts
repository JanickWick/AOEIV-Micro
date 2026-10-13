/**
 * Replays und Geisterläufe: Weil die Simulation deterministisch ist (fester Takt, Seed-Zufall,
 * kein Math.random), reicht die Liste der Spielerbefehle mit Tick-Nummern, um einen Lauf exakt
 * nachzuspielen. Die Gegner-KI rechnet beim Abspielen selbst wieder dieselben Entscheidungen.
 * Reine Logik ohne Browser; die Aufzeichnung im Spiel liegt in src/app/game.ts.
 */
import { createAi } from './ai';
import { hashWorld } from './hash';
import { buildWorldFromScenario, evaluateOutcome, type Outcome, type ScenarioDef } from './scenario';
import { stepWorld } from './step';
import type { Command, SimRules, World } from './types';
import type { UnitDefLibrary, ValueProfile } from './unitDefs';

export const REPLAY_FORMAT = 'kompanie-replay';

export interface ReplayCommand {
  tick: number;
  command: Command;
}

export interface Replay {
  format: typeof REPLAY_FORMAT;
  version: 1;
  /** Version der Anwendung, mit der aufgezeichnet wurde. */
  app: string;
  recordedAt: string;
  scenarioId: string;
  /** Vollständige Szenario-Definition, damit auch Editor-Szenarien abspielbar sind. */
  scenario: ScenarioDef;
  seed: number;
  randomStart: boolean;
  /** Werteprofil und Regel-Überschreibungen, mit denen der Lauf entstand. */
  profile: ValueProfile;
  rules: Partial<SimRules>;
  commands: ReplayCommand[];
  /** Anzahl der simulierten Ticks (Ende des Laufs). */
  ticks: number;
  /** Zustands-Hash am Ende (src/sim/hash.ts) zur Prüfung beim Abspielen. */
  hash: string;
  outcome: Outcome;
}

export interface ReplayMeta {
  app: string;
  scenario: ScenarioDef;
  seed: number;
  randomStart: boolean;
  profile: ValueProfile;
  rules: Partial<SimRules>;
}

/** Sammelt die Spielerbefehle je Tick während eines Laufs. */
export class ReplayRecorder {
  readonly commands: ReplayCommand[] = [];

  record(tick: number, commands: readonly Command[]): void {
    for (const c of commands) this.commands.push({ tick, command: structuredClone(c) });
  }

  finish(world: World, outcome: Outcome, meta: ReplayMeta, now = new Date()): Replay {
    return {
      format: REPLAY_FORMAT,
      version: 1,
      app: meta.app,
      recordedAt: now.toISOString(),
      scenarioId: meta.scenario.id,
      scenario: structuredClone(meta.scenario),
      seed: meta.seed,
      randomStart: meta.randomStart,
      profile: meta.profile,
      rules: { ...meta.rules },
      commands: this.commands.map((c) => ({ tick: c.tick, command: structuredClone(c.command) })),
      ticks: world.tick,
      hash: hashWorld(world),
      outcome,
    };
  }
}

/** Liefert die Befehle eines Replays Tick für Tick (aufsteigend abgefragt). */
export class ReplayPlayer {
  private index = 0;

  constructor(readonly replay: Replay) {}

  /** Befehle für diesen Tick; Ticks vor dem aktuellen Zeiger werden übersprungen. */
  next(tick: number): Command[] {
    const out: Command[] = [];
    const cmds = this.replay.commands;
    while (this.index < cmds.length && cmds[this.index]!.tick < tick) this.index++;
    while (this.index < cmds.length && cmds[this.index]!.tick === tick) out.push(structuredClone(cmds[this.index++]!.command));
    return out;
  }

  get finished(): boolean {
    return this.index >= this.replay.commands.length;
  }

  reset(): void {
    this.index = 0;
  }
}

/** Szenario mit den Regel-Überschreibungen des Replays. */
export function replayScenario(replay: Replay): ScenarioDef {
  return { ...replay.scenario, rules: { ...(replay.scenario.rules ?? {}), ...replay.rules } };
}

/** Welt für ein Replay anlegen (gleicher Seed und Zufallsstart). */
export function buildReplayWorld(defs: UnitDefLibrary, replay: Replay, decor = true): World {
  return buildWorldFromScenario(defs, replayScenario(replay), { seed: replay.seed, randomStart: replay.randomStart, decor });
}

export interface ReplayRun {
  world: World;
  outcome: Outcome;
  ticks: number;
  hash: string;
  /** true, wenn der Hash am Ende mit dem aufgezeichneten übereinstimmt. */
  matches: boolean;
}

/** Spielt ein Replay ohne Darstellung bis zu seinem Ende ab und prüft den Zustands-Hash. */
export function runReplay(defs: UnitDefLibrary, replay: Replay): ReplayRun {
  const sc = replayScenario(replay);
  const world = buildReplayWorld(defs, replay, false);
  const ai = sc.ai && sc.ai.level !== 'none' ? createAi(1, sc.ai) : null;
  const player = new ReplayPlayer(replay);
  let outcome: Outcome = 'running';
  while (world.tick < replay.ticks) {
    const cmds = player.next(world.tick);
    stepWorld(world, ai ? [...cmds, ...ai.think(world)] : cmds);
    outcome = evaluateOutcome(world, sc, 0);
  }
  const hash = hashWorld(world);
  return { world, outcome, ticks: world.tick, hash, matches: hash === replay.hash };
}

/** Liest ein Replay aus JSON und prüft die Pflichtfelder; wirft bei ungültigem Inhalt. */
export function parseReplay(json: string): Replay {
  const r = JSON.parse(json) as Partial<Replay>;
  if (r.format !== REPLAY_FORMAT) throw new Error('Keine Replay-Datei dieses Spiels.');
  if (r.version !== 1) throw new Error(`Unbekannte Replay-Version ${String(r.version)}.`);
  if (!r.scenario || typeof r.scenario !== 'object' || !Array.isArray(r.scenario.groups)) throw new Error('Replay ohne Szenario.');
  if (typeof r.seed !== 'number' || !Array.isArray(r.commands) || typeof r.ticks !== 'number') throw new Error('Replay unvollständig.');
  for (const c of r.commands) {
    if (typeof c?.tick !== 'number' || !c.command || typeof c.command.kind !== 'string') throw new Error('Replay enthält ungültige Befehle.');
  }
  return {
    format: REPLAY_FORMAT,
    version: 1,
    app: typeof r.app === 'string' ? r.app : '?',
    recordedAt: typeof r.recordedAt === 'string' ? r.recordedAt : '',
    scenarioId: typeof r.scenarioId === 'string' ? r.scenarioId : r.scenario.id,
    scenario: r.scenario,
    seed: r.seed,
    randomStart: r.randomStart === true,
    profile: r.profile === 'referenz' ? 'referenz' : 'eigen',
    rules: r.rules && typeof r.rules === 'object' ? r.rules : {},
    commands: r.commands,
    ticks: r.ticks,
    hash: typeof r.hash === 'string' ? r.hash : '',
    outcome: r.outcome ?? 'running',
  };
}

/** Replay als JSON-Text (für Datei-Export). */
export function serializeReplay(replay: Replay): string {
  return JSON.stringify(replay);
}

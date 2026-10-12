import type { Vec2 } from './math';
import type { Rng } from './rng';
import type { UnitDefLibrary } from './unitDefs';

export type PlayerId = 0 | 1;
export type UnitId = number;

/** Ein Befehl in der Warteschlange einer Einheit (orders[0] ist aktiv). */
export type Order =
  | {
      kind: 'move';
      target: Vec2;
      /** Tempo-Deckel beim Gruppenmarsch (langsamste Einheit der Gruppe). */
      speedCap?: number;
      /** Gemeinsame Gruppen-ID eines Formationsbefehls (für Anzeige/Statistik). */
      groupId?: number;
    }
  | { kind: 'hold' };

export interface UnitState {
  id: UnitId;
  player: PlayerId;
  defId: string;
  age: number;
  pos: Vec2;
  prevPos: Vec2;
  heading: number; // Radiant, 0 = +x
  prevHeading: number;
  speed: number; // aktuelles Tempo in Tiles/s
  maxSpeed: number;
  accel: number;
  turnRate: number; // Radiant/s
  radius: number;
  hp: number;
  maxHp: number;
  alive: boolean;
  orders: Order[];
  /** Ticks ohne nennenswerten Fortschritt zum Ziel (Blockade-Erkennung). */
  stuckTicks: number;
  lastDist: number;
  /** Tick, seit dem die Einheit ohne Befehl ist. */
  idleSince: number;
}

/** Spieler-/KI-Befehle, die zu Beginn eines Ticks angewendet werden. */
export type Command =
  | { kind: 'move'; unitIds: UnitId[]; target: Vec2; queue: boolean }
  | { kind: 'stop'; unitIds: UnitId[] };

export interface SimRules {
  /** Ticks pro Sekunde. */
  tickRate: number;
  /** Gruppenmarsch: alle Einheiten laufen mit dem Tempo der langsamsten. */
  formationSpeedMatching: boolean;
  /** Abstand (Tiles), ab dem ein Bewegungsziel als erreicht gilt. */
  arriveTolerance: number;
  /** Zusätzlicher Abstand zwischen Formationsplätzen (Tiles). */
  formationGap: number;
  /** Iterationen der Kollisionsauflösung pro Tick. */
  separationIterations: number;
}

export const DEFAULT_RULES: SimRules = {
  tickRate: 60,
  formationSpeedMatching: true,
  arriveTolerance: 0.06,
  formationGap: 0.5,
  separationIterations: 2,
};

export type SimEvent =
  | { kind: 'arrived'; unitId: UnitId; tick: number }
  | { kind: 'orderAccepted'; unitId: UnitId; tick: number; order: Order['kind'] };

export interface World {
  tick: number;
  dt: number;
  rules: SimRules;
  map: { width: number; height: number };
  seed: number;
  rng: Rng;
  defs: UnitDefLibrary;
  units: UnitState[];
  nextUnitId: number;
  nextGroupId: number;
  /** Ereignisse des letzten Ticks (wird zu Beginn jedes Ticks geleert). */
  events: SimEvent[];
}

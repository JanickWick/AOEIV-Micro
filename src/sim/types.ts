import type { Decor, Obstacle } from './decor';
import type { Vec2 } from './math';
import type { Rng } from './rng';
import type { UnitDefLibrary, WeaponType } from './unitDefs';

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
  | { kind: 'attack'; targetId: UnitId }
  | { kind: 'attackMove'; target: Vec2 }
  /** Patrouille zwischen `from` und `to`; greift unterwegs an und läuft dann weiter. Endet nie von selbst. */
  | { kind: 'patrol'; from: Vec2; to: Vec2; leg: 0 | 1 }
  | { kind: 'hold' };

export type AttackPhase = 'idle' | 'windup' | 'recovery';

export interface AttackState {
  /** Aktuelles Ziel (Befehl oder automatisch erfasst). */
  targetId: UnitId | null;
  /** true, wenn das Ziel automatisch erfasst wurde (kein Befehl). */
  auto: boolean;
  phase: AttackPhase;
  /** Tick, an dem die aktuelle Phase endet. */
  phaseEndsTick: number;
  /** Tick, an dem der laufende Angriff begonnen hat. */
  startTick: number;
  /** Restliche Abklingzeit in Ticks, bis ein neuer Angriff beginnen darf. */
  cooldownLeft: number;
  /** Position, an der die Einheit untätig wurde (Begrenzung der Verfolgung). */
  leashOrigin: Vec2 | null;
}

export interface ChargeState {
  /** Strecke, die die Einheit zusammenhängend auf ihr Ziel zugelaufen ist. */
  runUp: number;
  charging: boolean;
  cooldownLeft: number;
}

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
  /** Tick des Todes (für Ausblenden und Statistik). */
  diedTick: number;
  orders: Order[];
  /** Ticks ohne nennenswerten Fortschritt zum Ziel (Blockade-Erkennung). */
  stuckTicks: number;
  lastDist: number;
  /** Tick, seit dem die Einheit ohne Befehl ist. */
  idleSince: number;
  attack: AttackState;
  charge: ChargeState | null;
  /** Speerkämpfer: Abwehrstellung aktiv bis zu diesem Tick. */
  braceUntilTick: number;
  /** Zuletzt erlittener Schaden (Tick), für die Darstellung. */
  lastHitTick: number;
  /** Schmiede-Upgrades: Zusatzschaden der Waffe und Zusatzrüstung. */
  mods: { damage: number; meleeArmor: number; rangedArmor: number };
  /** Index der Szenario-Gruppe, aus der die Einheit stammt (für Drill-Kontrollgruppen). */
  spawnGroup: number;
}

/** Schmiede-Upgrades pro Seite (Stufen 0–3, je +1). */
export interface Upgrades {
  rangedAttack: number;
  meleeAttack: number;
  meleeArmor: number;
  rangedArmor: number;
}

export const NO_UPGRADES: Upgrades = { rangedAttack: 0, meleeAttack: 0, meleeArmor: 0, rangedArmor: 0 };

export interface Projectile {
  id: number;
  ownerId: UnitId;
  player: PlayerId;
  weaponType: WeaponType;
  damage: number;
  bonus: { targetTags: string[][]; damage: number }[];
  pos: Vec2;
  prevPos: Vec2;
  origin: Vec2;
  speed: number;
  /** Zielsuchend: folgt der Einheit; sonst fester Bodenpunkt. */
  targetId: UnitId | null;
  targetPos: Vec2;
  splashRadius: number;
  splashFalloff: number;
  launchTick: number;
  /** Zusatzschaden (z. B. Ansturm), nur für den ersten Treffer. */
  extraDamage: number;
  attackerIsSiege: boolean;
}

/** Spieler-/KI-Befehle, die zu Beginn eines Ticks angewendet werden. */
export type Command =
  /** `facing`: Blickrichtung der Formation (Rechtsklick-Ziehen); sonst Richtung zum Ziel. */
  | { kind: 'move'; unitIds: UnitId[]; target: Vec2; queue: boolean; facing?: Vec2 }
  | { kind: 'attack'; unitIds: UnitId[]; targetId: UnitId; queue: boolean }
  | { kind: 'attackMove'; unitIds: UnitId[]; target: Vec2; queue: boolean; facing?: Vec2 }
  | { kind: 'patrol'; unitIds: UnitId[]; target: Vec2; queue: boolean }
  | { kind: 'stop'; unitIds: UnitId[] }
  | { kind: 'hold'; unitIds: UnitId[]; queue: boolean };

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
  /** Abklingzeit läuft weiter, während die Einheit läuft. */
  cooldownRunsWhileMoving: boolean;
  /** Untätige Einheiten erfassen Gegner bis zu diesem Abstand (Tiles, Rand zu Rand). */
  autoAcquireRange: number;
  /** Maximale Entfernung von der Ausgangsposition bei automatischer Verfolgung (Tiles). */
  leashRange: number;
  /** Nahkampf-Treffer verfehlt, wenn das Ziel beim Schadenszeitpunkt weiter als range + Toleranz entfernt ist. */
  meleeHitTolerance: number;
  /** Belagerungsschaden ignoriert Rüstung. */
  siegeIgnoresArmor: boolean;
  /** Maximale Winkelabweichung (Grad), bevor ein Angriff beginnt. */
  attackFacingTolerance: number;
}

export const DEFAULT_RULES: SimRules = {
  tickRate: 60,
  formationSpeedMatching: true,
  arriveTolerance: 0.06,
  formationGap: 0.2, // aus Video: Abstand Mitte zu Mitte ≈ 2·Radius + 0,2 Tiles
  separationIterations: 2,
  cooldownRunsWhileMoving: true,
  autoAcquireRange: 8,
  leashRange: 12,
  meleeHitTolerance: 0.15,
  siegeIgnoresArmor: true,
  attackFacingTolerance: 15,
};

export type SimEvent =
  | { kind: 'arrived'; unitId: UnitId; tick: number }
  | { kind: 'orderAccepted'; unitId: UnitId; tick: number; order: Order['kind'] }
  | { kind: 'attackStarted'; unitId: UnitId; targetId: UnitId; tick: number }
  | { kind: 'windupCancelled'; unitId: UnitId; tick: number; reason: 'move' | 'retarget' | 'stop' | 'targetDied' }
  | { kind: 'hit'; attackerId: UnitId; targetId: UnitId; damage: number; overkill: number; tick: number; charge: boolean; weaponType: WeaponType }
  /** Zielsuchendes Projektil, dessen Ziel vor dem Einschlag starb (verschwendeter Schuss). */
  | { kind: 'projectileWasted'; attackerId: UnitId; damage: number; tick: number }
  | { kind: 'miss'; attackerId: UnitId; targetId: UnitId; tick: number }
  | { kind: 'projectileLaunched'; projectileId: number; attackerId: UnitId; tick: number }
  | { kind: 'died'; unitId: UnitId; killerId: UnitId | null; tick: number }
  | { kind: 'brace'; unitId: UnitId; againstId: UnitId; tick: number }
  | { kind: 'charge'; unitId: UnitId; tick: number };

export interface World {
  tick: number;
  dt: number;
  rules: SimRules;
  map: { width: number; height: number };
  seed: number;
  rng: Rng;
  defs: UnitDefLibrary;
  units: UnitState[];
  projectiles: Projectile[];
  /** Deko (Darstellung) und daraus abgeleitete Hindernisse (Kollision). */
  decor: Decor[];
  obstacles: Obstacle[];
  nextUnitId: number;
  nextGroupId: number;
  nextProjectileId: number;
  /** Ereignisse des letzten Ticks (wird zu Beginn jedes Ticks geleert). */
  events: SimEvent[];
}

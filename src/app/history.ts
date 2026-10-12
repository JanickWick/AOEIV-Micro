/** Verlauf der letzten Versuche pro Szenario (localStorage) mit Bestwert. */
import type { RoundSummary } from '../sim/stats';

export interface Attempt {
  at: string;
  outcome: string;
  seconds: number;
  lostMine: number;
  survivorsMine: number;
  valueLostMine: number;
  valueKilled: number;
  kiteEfficiency: number | null;
  apm: number;
  eapm: number;
  overkill: number;
  idleSeconds: number;
  windupCancelled: number;
  /** Hotkey-Drill: mittlere Reaktionszeit in ms. */
  reactionMs?: number;
  errors?: number;
}

const STORAGE_KEY = 'aoe4micro.history.v1';
export const HISTORY_LIMIT = 20;

type Store = Record<string, Attempt[]>;

function load(): Store {
  try {
    const raw = globalThis.localStorage?.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as Store;
  } catch {
    /* ignorieren */
  }
  return {};
}

function save(store: Store): void {
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {
    /* ignorieren */
  }
}

export function attemptFromSummary(s: RoundSummary): Attempt {
  return {
    at: new Date().toISOString(),
    outcome: s.outcome,
    seconds: s.seconds,
    lostMine: s.lostMine,
    survivorsMine: s.survivorsMine,
    valueLostMine: s.valueLostMine,
    valueKilled: s.valueKilled,
    kiteEfficiency: s.kiteEfficiency,
    apm: s.apm,
    eapm: s.eapm,
    overkill: s.overkill,
    idleSeconds: s.idleSeconds,
    windupCancelled: s.windupCancelled,
  };
}

export function recordAttempt(scenarioId: string, a: Attempt): Attempt[] {
  const store = load();
  const list = store[scenarioId] ?? [];
  list.push(a);
  while (list.length > HISTORY_LIMIT) list.shift();
  store[scenarioId] = list;
  save(store);
  return list;
}

export function getAttempts(scenarioId: string): Attempt[] {
  return load()[scenarioId] ?? [];
}

export function clearHistory(scenarioId?: string): void {
  if (!scenarioId) {
    save({});
    return;
  }
  const store = load();
  delete store[scenarioId];
  save(store);
}

/** Bestwert: Sieg mit geringstem Verlustwert, dann kürzeste Dauer; ohne Sieg der geringste Verlust. */
export function bestAttempt(list: readonly Attempt[]): Attempt | null {
  if (list.length === 0) return null;
  const score = (a: Attempt) => (a.reactionMs !== undefined ? a.reactionMs + (a.errors ?? 0) * 500 : (a.outcome === 'victory' ? 0 : 100000) + a.valueLostMine * 10 + a.seconds / 100);
  return list.reduce((best, a) => (score(a) < score(best) ? a : best));
}

export function isBetter(a: Attempt, than: Attempt | null): boolean {
  if (!than) return true;
  return bestAttempt([a, than]) === a;
}

export function exportHistory(): Store {
  return load();
}

export function importHistory(store: Store): void {
  save(store);
}

/**
 * Geisterläufe: der beste Lauf je Szenario (und je Daily-Tag) als Replay in localStorage. Beim
 * nächsten Versuch mit gleichem Seed läuft er halbtransparent mit (src/app/game.ts).
 */
import type { Replay } from '../sim/replay';
import { isBetter, type Attempt } from './history';

export interface GhostEntry {
  attempt: Attempt;
  replay: Replay;
}

export type GhostStore = Record<string, GhostEntry>;

const STORAGE_KEY = 'kompanie.ghosts.v1';

function load(): GhostStore {
  try {
    const raw = globalThis.localStorage?.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as GhostStore;
  } catch {
    /* ignorieren */
  }
  return {};
}

function save(store: GhostStore): void {
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {
    /* z. B. Speicher voll: Geist bleibt dann der alte */
  }
}

/** Schlüssel: Szenario, bei Daily zusätzlich der Tag. */
export function ghostKey(scenarioId: string, dailyKey: string | null = null): string {
  return dailyKey ? `daily:${dailyKey}:${scenarioId}` : scenarioId;
}

export function getGhost(key: string): GhostEntry | null {
  return load()[key] ?? null;
}

/** Speichert den Lauf, wenn er besser ist als der bisherige Geist. Liefert true, wenn ersetzt. */
export function offerGhost(key: string, attempt: Attempt, replay: Replay): boolean {
  const store = load();
  const current = store[key];
  if (current && !isBetter(attempt, current.attempt)) return false;
  store[key] = { attempt, replay };
  save(store);
  return true;
}

export function clearGhost(key: string): void {
  const store = load();
  delete store[key];
  save(store);
}

export function exportGhosts(): GhostStore {
  return load();
}

export function importGhosts(store: GhostStore): void {
  save(store);
}

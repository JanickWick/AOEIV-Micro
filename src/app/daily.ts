/**
 * Daily Challenge: ein Szenario pro Tag mit festem Seed aus dem Datum, drei Versuche, der beste
 * zählt. Rangliste nur lokal (localStorage). Die Auswahl und der Seed sind reine Funktionen des
 * Datums, damit alle Spieler an einem Tag dieselbe Aufgabe sehen.
 */
import type { ScenarioDef } from '../sim/scenario';
import type { StarCount } from '../sim/stars';
import { bestAttempt, type Attempt } from './history';

export const DAILY_ATTEMPTS = 3;

export interface DailyAttempt extends Attempt {
  stars: StarCount;
  score: number;
}

export interface DailyDay {
  scenarioId: string;
  seed: number;
  attempts: DailyAttempt[];
}

export type DailyStore = Record<string, DailyDay>;

const STORAGE_KEY = 'kompanie.daily.v1';

/** Tagesschlüssel in Ortszeit, z. B. "2026-10-13". */
export function dailyKey(date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Deterministischer 32-Bit-Hash eines Textes (FNV-1a). */
export function hashKey(key: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h;
}

/** Szenarien, die für das Daily in Frage kommen: Gefechte mit Sternen, keine Drills, kein Lasttest. */
export function dailyCandidates(scenarios: readonly ScenarioDef[]): ScenarioDef[] {
  return scenarios.filter((s) => (s.victory ?? 'annihilation') === 'annihilation' && s.kind !== 'drill' && !!s.stars && s.id !== 'leistungstest');
}

/** Aufgabe des Tages: Szenario aus der Liste und Seed, beides aus dem Datum. */
export function dailyPick(key: string, scenarios: readonly ScenarioDef[]): { scenario: ScenarioDef; seed: number } | null {
  const list = dailyCandidates(scenarios);
  if (list.length === 0) return null;
  const h = hashKey(`daily:${key}`);
  const scenario = list[h % list.length]!;
  // Seed getrennt gemischt, damit Szenario und Aufstellung nicht gekoppelt sind
  const seed = (hashKey(`seed:${key}`) % 1_000_000) + 1;
  return { scenario, seed };
}

/** Punkte eines Versuchs: Sieg zählt, dann wenig Verlustwert, dann kurze Dauer. Niederlage = 0. */
export function dailyScore(a: Attempt): number {
  if (a.outcome !== 'victory') return 0;
  return Math.max(1, Math.round(10000 - a.valueLostMine * 5 - a.seconds * 2));
}

function load(): DailyStore {
  try {
    const raw = globalThis.localStorage?.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as DailyStore;
  } catch {
    /* ignorieren */
  }
  return {};
}

function save(store: DailyStore): void {
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {
    /* ignorieren */
  }
}

export function getDaily(key: string): DailyDay | null {
  return load()[key] ?? null;
}

export function attemptsLeft(key: string): number {
  return Math.max(0, DAILY_ATTEMPTS - (getDaily(key)?.attempts.length ?? 0));
}

/** Versuch eintragen (nur solange Versuche übrig sind). Liefert den Tag nach dem Eintrag. */
export function recordDailyAttempt(key: string, scenarioId: string, seed: number, a: DailyAttempt): DailyDay {
  const store = load();
  const day = store[key] ?? { scenarioId, seed, attempts: [] };
  if (day.attempts.length < DAILY_ATTEMPTS) day.attempts.push(a);
  store[key] = day;
  save(store);
  return day;
}

export function bestDailyAttempt(day: DailyDay | null): DailyAttempt | null {
  if (!day || day.attempts.length === 0) return null;
  return day.attempts.reduce((best, a) => (a.score > best.score || (a.score === best.score && bestAttempt([a, best]) === a) ? a : best));
}

export interface LeaderboardRow {
  key: string;
  scenarioId: string;
  best: DailyAttempt;
  attempts: number;
}

/** Lokale Rangliste: beste Punkte je Tag, höchste zuerst. */
export function dailyLeaderboard(store: DailyStore = load()): LeaderboardRow[] {
  const rows: LeaderboardRow[] = [];
  for (const [key, day] of Object.entries(store)) {
    const best = bestDailyAttempt(day);
    if (best) rows.push({ key, scenarioId: day.scenarioId, best, attempts: day.attempts.length });
  }
  return rows.sort((a, b) => b.best.score - a.best.score || b.key.localeCompare(a.key));
}

export function exportDaily(): DailyStore {
  return load();
}

export function importDaily(store: DailyStore): void {
  save(store);
}

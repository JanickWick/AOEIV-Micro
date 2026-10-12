/** Deterministischer Zufallsgenerator (mulberry32). Die Simulation benutzt NIE Math.random. */
export interface Rng {
  /** Gleichverteilt in [0, 1). */
  next(): number;
  /** Gleichverteilt in [lo, hi). */
  range(lo: number, hi: number): number;
  /** Ganzzahl in [lo, hi]. */
  int(lo: number, hi: number): number;
  /** Interner Zustand, um den Generator exakt zu reproduzieren. */
  state(): number;
}

export function createRng(seed: number): Rng {
  let a = seed >>> 0;
  const next = (): number => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    range: (lo, hi) => lo + (hi - lo) * next(),
    int: (lo, hi) => lo + Math.floor(next() * (hi - lo + 1)),
    state: () => a,
  };
}

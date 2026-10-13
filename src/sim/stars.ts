/**
 * Sterne pro Szenario (Bronze, Silber, Gold) aus den Kennzahlen eines Laufs. Die Schwellen stehen
 * in der Szenario-Datei (`stars`); jede Stufe ist erreicht, wenn alle ihre Bedingungen gelten.
 * Gefechte brauchen für jeden Stern einen Sieg, Drills werten Reaktionszeit und Fehlgriffe.
 * Reine Logik ohne Browser.
 */

export interface StarThresholds {
  /** Höchstens so viele eigene Einheiten verloren. */
  maxLost?: number;
  /** Höchstens so viel Ressourcenwert verloren. */
  maxValueLost?: number;
  /** Mindestens diese Kite-Effizienz (0..1). */
  minKite?: number;
  /** Höchstens so viel Overkill-Schaden. */
  maxOverkill?: number;
  /** Höchstens so lange gedauert (Sekunden). */
  maxSeconds?: number;
  /** Drill: höchstens diese mittlere Reaktionszeit (ms). */
  maxReactionMs?: number;
  /** Drill: höchstens so viele Fehlgriffe. */
  maxErrors?: number;
}

export interface StarSpec {
  bronze: StarThresholds;
  silver: StarThresholds;
  gold: StarThresholds;
}

/** Kennzahlen eines Laufs, wie sie auch im Verlauf gespeichert sind. */
export interface StarInput {
  outcome: string;
  lostMine: number;
  valueLostMine: number;
  kiteEfficiency: number | null;
  overkill: number;
  seconds: number;
  reactionMs?: number;
  errors?: number;
}

export type StarCount = 0 | 1 | 2 | 3;
export const STAR_NAMES: readonly string[] = ['keine', 'Bronze', 'Silber', 'Gold'];

export interface StarResult {
  stars: StarCount;
  /** Erste nicht erfüllte Bedingung der nächsten Stufe (für die Anzeige), null bei Gold. */
  missed: string | null;
}

/** Prüft eine Stufe; liefert null, wenn alles erfüllt ist, sonst die erste verfehlte Bedingung. */
export function checkThresholds(a: StarInput, t: StarThresholds): string | null {
  const isDrill = a.reactionMs !== undefined;
  if (!isDrill && a.outcome !== 'victory') return 'Sieg';
  if (t.maxLost !== undefined && a.lostMine > t.maxLost) return `höchstens ${t.maxLost} Verlust${t.maxLost === 1 ? '' : 'e'}`;
  if (t.maxValueLost !== undefined && a.valueLostMine > t.maxValueLost) return `Verlustwert höchstens ${t.maxValueLost}`;
  if (t.minKite !== undefined && (a.kiteEfficiency === null || a.kiteEfficiency < t.minKite)) return `Kite-Effizienz mindestens ${Math.round(t.minKite * 100)} %`;
  if (t.maxOverkill !== undefined && a.overkill > t.maxOverkill) return `Overkill höchstens ${t.maxOverkill}`;
  if (t.maxSeconds !== undefined && a.seconds > t.maxSeconds) return `höchstens ${t.maxSeconds} s`;
  if (t.maxReactionMs !== undefined && (a.reactionMs === undefined || a.reactionMs > t.maxReactionMs)) return `Reaktion höchstens ${t.maxReactionMs} ms`;
  if (t.maxErrors !== undefined && (a.errors ?? 0) > t.maxErrors) return `höchstens ${t.maxErrors} Fehlgriff${t.maxErrors === 1 ? '' : 'e'}`;
  return null;
}

export function starsFor(a: StarInput, spec: StarSpec | undefined): StarResult {
  if (!spec) return { stars: 0, missed: null };
  const tiers: StarThresholds[] = [spec.bronze, spec.silver, spec.gold];
  let stars: StarCount = 0;
  for (let i = 0; i < tiers.length; i++) {
    const missed = checkThresholds(a, tiers[i]!);
    if (missed) return { stars, missed: `${STAR_NAMES[i + 1]}: ${missed}` };
    stars = (i + 1) as StarCount;
  }
  return { stars, missed: null };
}

/** Bester Sternestand aus einer Liste von Läufen. */
export function bestStars(list: readonly StarInput[], spec: StarSpec | undefined): StarCount {
  let best: StarCount = 0;
  for (const a of list) {
    const s = starsFor(a, spec).stars;
    if (s > best) best = s;
  }
  return best;
}

/** Textdarstellung, z. B. "★★☆". */
export function starText(n: StarCount, max = 3): string {
  return '★'.repeat(n) + '☆'.repeat(Math.max(0, max - n));
}

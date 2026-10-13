import { describe, expect, it } from 'vitest';
import { SCENARIOS } from '../src/data/scenarios/index';
import { bestStars, checkThresholds, starsFor, starText } from '../src/sim/stars';
import { dailyCandidates, dailyKey, dailyPick, dailyScore, hashKey } from '../src/app/daily';
import type { StarInput } from '../src/sim/stars';

const win = (over: Partial<StarInput> = {}): StarInput => ({ outcome: 'victory', lostMine: 0, valueLostMine: 0, kiteEfficiency: 1, overkill: 10, seconds: 12, ...over });

describe('Sterne', () => {
  const sc1 = SCENARIOS.find((s) => s.id === 'kiten-grundlagen')!;
  it('Gefecht: ohne Sieg keine Sterne, mit perfektem Lauf Gold', () => {
    expect(starsFor(win({ outcome: 'defeat' }), sc1.stars).stars).toBe(0);
    expect(starsFor(win({ outcome: 'defeat' }), sc1.stars).missed).toContain('Sieg');
    expect(starsFor(win(), sc1.stars)).toEqual({ stars: 3, missed: null });
  });
  it('Stufen bauen aufeinander auf und nennen die verfehlte Bedingung', () => {
    const r = starsFor(win({ lostMine: 1, valueLostMine: 85, seconds: 40 }), sc1.stars);
    expect(r.stars).toBe(1);
    expect(r.missed).toContain('Silber');
    const r2 = starsFor(win({ overkill: 200 }), sc1.stars);
    expect(r2.stars).toBe(2);
    expect(r2.missed).toContain('Overkill');
  });
  it('Drill: Reaktionszeit und Fehlgriffe statt Sieg', () => {
    const drill = SCENARIOS.find((s) => s.id === 'hotkey-drill')!;
    expect(starsFor({ ...win({ outcome: 'defeat' }), reactionMs: 800, errors: 0 }, drill.stars).stars).toBe(3);
    expect(starsFor({ ...win(), reactionMs: 1200, errors: 1 }, drill.stars).stars).toBe(2);
    expect(starsFor({ ...win(), reactionMs: 2500, errors: 5 }, drill.stars).stars).toBe(0);
  });
  it('ohne Schwellen keine Sterne; Bestwert über Läufe; Text', () => {
    expect(starsFor(win(), undefined).stars).toBe(0);
    expect(bestStars([win({ lostMine: 3, valueLostMine: 255 }), win()], sc1.stars)).toBe(3);
    expect(starText(2)).toBe('★★☆');
    expect(checkThresholds(win(), { maxSeconds: 10 })).toContain('10 s');
  });
  it('jedes Gefechts-Szenario außer Lasttest und Sandbox hat Schwellen', () => {
    for (const s of SCENARIOS) {
      const expected = s.id !== 'leistungstest' && s.id !== 'sandbox';
      expect(!!s.stars, s.id).toBe(expected);
    }
  });
});

describe('Daily Challenge', () => {
  it('Tagesschlüssel und Hash sind stabil', () => {
    expect(dailyKey(new Date(2026, 9, 13, 23, 59))).toBe('2026-10-13');
    expect(hashKey('a')).toBe(hashKey('a'));
    expect(hashKey('a')).not.toBe(hashKey('b'));
  });
  it('wählt pro Tag dasselbe Szenario und denselben Seed, verschiedene Tage verschieden', () => {
    const a = dailyPick('2026-10-13', SCENARIOS)!;
    const b = dailyPick('2026-10-13', SCENARIOS)!;
    expect(a.scenario.id).toBe(b.scenario.id);
    expect(a.seed).toBe(b.seed);
    const ids = new Set<string>();
    for (let d = 1; d <= 30; d++) ids.add(dailyPick(`2026-11-${String(d).padStart(2, '0')}`, SCENARIOS)!.scenario.id);
    expect(ids.size).toBeGreaterThan(3);
    for (const sc of dailyCandidates(SCENARIOS)) {
      expect(sc.kind).not.toBe('drill');
      expect(sc.stars).toBeDefined();
    }
  });
  it('Punkte: Sieg zählt, weniger Verlust und kürzere Dauer sind mehr wert', () => {
    const base = { at: '', outcome: 'victory', seconds: 30, lostMine: 0, survivorsMine: 10, valueLostMine: 0, valueKilled: 0, kiteEfficiency: 1, apm: 0, eapm: 0, overkill: 0, idleSeconds: 0, windupCancelled: 0 };
    expect(dailyScore({ ...base, outcome: 'defeat' })).toBe(0);
    expect(dailyScore(base)).toBeGreaterThan(dailyScore({ ...base, valueLostMine: 160 }));
    expect(dailyScore(base)).toBeGreaterThan(dailyScore({ ...base, seconds: 60 }));
  });
});

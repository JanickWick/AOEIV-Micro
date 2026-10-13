/**
 * Phase 0: keine Markennamen in Quellcode, Oberfläche, README und package.json, und nichts im
 * ausgelieferten Code verweist auf das Referenzmaterial unter reference/.
 * CREDITS.md und das Referenzprofil (src/data/units/reference/) dürfen Quellen nennen.
 */
import { describe, expect, it } from 'vitest';

const sources = import.meta.glob(['../src/**/*.{ts,json,css}', '../*.html', '../package.json', '../README.md', '../docs/WELT.md'], { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
const publicReference = import.meta.glob('../public/reference/**', { eager: true });

/** Marken und Quellen, die im Spiel nicht vorkommen dürfen. */
const FORBIDDEN = /age of empires|\baoe\s?(?:iv|4|2)\b|aoe4world|relic entertainment|microsoft/i;
/** Alte Speicherschlüssel und Dateiformat-Kennungen bleiben lesbar (Abwärtskompatibilität). */
const LEGACY_OK = /aoe4(?:micro)?[.-]/gi;

describe('Markenfreiheit (Phase 0)', () => {
  it('Quellen, Oberfläche, README und package.json enthalten keine Markennamen', () => {
    const hits: string[] = [];
    for (const [path, text] of Object.entries(sources)) {
      if (path.includes('/src/data/units/reference/')) continue;
      const cleaned = text.replace(LEGACY_OK, '');
      const m = FORBIDDEN.exec(cleaned);
      if (m) hits.push(`${path}: "${m[0]}"`);
    }
    expect(hits, hits.join('\n')).toEqual([]);
  });

  it('kein ausgelieferter Code verweist auf reference/', () => {
    const hits: string[] = [];
    for (const [path, text] of Object.entries(sources)) {
      if (path.endsWith('README.md') || path.endsWith('WELT.md')) continue;
      if (/(?<![\w./])reference\//.test(text)) hits.push(path);
    }
    expect(hits, hits.join('\n')).toEqual([]);
    expect(Object.keys(publicReference)).toEqual([]);
  });

  it('Einheitennamen sind Gattungsbegriffe', () => {
    const names = Object.entries(sources)
      .filter(([p]) => /\/src\/data\/units\/[a-z-]+\.json$/.test(p))
      .map(([, t]) => (JSON.parse(t) as { name: string }).name);
    expect(names.sort()).toEqual(['Armbrustschütze', 'Bogenschütze', 'Mangonel', 'Reiter', 'Ritter', 'Schwertkämpfer', 'Speerkämpfer', 'Springald']);
  });
});

#!/usr/bin/env node
/** Listet alle Werte mit "verified": false in src/data/units/*.json auf. */
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'data', 'units');

function walk(node, path, out) {
  if (!node || typeof node !== 'object') return;
  if ('verified' in node && node.verified === false) {
    out.push({ path, value: node.value, note: node.note ?? '' });
    return;
  }
  for (const [k, v] of Object.entries(node)) walk(v, path ? `${path}.${k}` : k, out);
}

let total = 0;
for (const f of readdirSync(DIR).filter((f) => f.endsWith('.json')).sort()) {
  const json = JSON.parse(readFileSync(join(DIR, f), 'utf8'));
  const out = [];
  walk(json, '', out);
  if (out.length === 0) continue;
  console.log(`\n${f}`);
  for (const e of out) {
    total++;
    console.log(`  ${e.path} = ${JSON.stringify(e.value)}  // ${e.note}`);
  }
}
console.log(`\n${total} unbestätigte Werte.`);

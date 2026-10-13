#!/usr/bin/env node
// Sammelt alle Prompt-Spezifikationen unter assets/prompts/**/*.json zu assets/manifest.json
// (Quelle für die Vorschauseite assets-preview.html).
import { readdir, readFile, writeFile, stat } from 'node:fs/promises';
import { join, relative } from 'node:path';

async function walk(dir) {
  const out = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...(await walk(p)));
    else if (e.name.endsWith('.json')) out.push(p);
  }
  return out;
}

async function exists(p) { try { await stat(p); return true; } catch { return false; } }

const entries = [];
for (const file of (await walk('assets/prompts')).sort()) {
  const spec = JSON.parse(await readFile(file, 'utf8'));
  const category = relative('assets/prompts', file).split('/')[0];
  const name = file.split('/').pop().replace(/\.json$/, '');
  const processed = spec.out?.replace('assets/raw/', 'assets/processed/');
  entries.push({
    name, category, spec: file, model: spec.model, aspect_ratio: spec.aspect_ratio ?? null,
    resolution: spec.resolution ?? null, refs: spec.refs ?? [], prompt: spec.prompt,
    raw: spec.out, processed: processed && (await exists(processed)) ? processed : null,
    generated: spec.result?.at ?? null,
  });
}
await writeFile('assets/manifest.json', JSON.stringify({ generated: new Date().toISOString(), entries }, null, 2) + '\n');
console.log(`${entries.length} Einträge → assets/manifest.json`);

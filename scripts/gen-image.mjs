#!/usr/bin/env node
// Erzeugt Bilder mit Nano Banana über die FAL-Warteschlange.
//
//   node scripts/gen-image.mjs assets/prompts/<name>.json [weitere Spezifikationen…]
//
// Eine Spezifikation (JSON) beschreibt genau ein Bild und ist die reproduzierbare
// Quelle dafür:
//   {
//     "model": "fal-ai/nano-banana-pro",        // oder fal-ai/nano-banana; mit "/edit" bei Referenzen
//     "prompt": "…",
//     "aspect_ratio": "1:1",                    // 1:1, 16:9, 9:16, 4:3, 3:4, 3:2, 2:3, 21:9 …
//     "resolution": "2K",                       // nur Pro: 1K, 2K, 4K
//     "output_format": "png",
//     "refs": ["assets/style/ref-1.png"],       // optionale Referenzbilder (lokale Pfade oder URLs)
//     "out": "assets/raw/ui/portrait-archer.png"
//   }
// Der API-Schlüssel wird vom Proxy injiziert; FAL_KEY wird nur gesetzt, wenn er
// in der Umgebung vorhanden ist. Nie einen Schlüssel in Dateien ablegen.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, extname, resolve } from 'node:path';

const QUEUE = 'https://queue.fal.run';

function headers() {
  const h = { 'Content-Type': 'application/json' };
  if (process.env.FAL_KEY) h.Authorization = `Key ${process.env.FAL_KEY}`;
  return h;
}

async function toImageUrl(ref) {
  if (/^https?:\/\//.test(ref) || ref.startsWith('data:')) return ref;
  const buf = await readFile(resolve(ref));
  const ext = extname(ref).slice(1).toLowerCase();
  const mime = ext === 'jpg' ? 'image/jpeg' : `image/${ext || 'png'}`;
  return `data:${mime};base64,${buf.toString('base64')}`;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function generate(spec) {
  const model = spec.model ?? 'fal-ai/nano-banana-pro';
  const refs = spec.refs ?? [];
  const endpoint = refs.length && !model.endsWith('/edit') ? `${model}/edit` : model;
  const body = {
    prompt: spec.prompt,
    num_images: spec.num_images ?? 1,
    output_format: spec.output_format ?? 'png',
  };
  if (spec.aspect_ratio) body.aspect_ratio = spec.aspect_ratio;
  if (spec.resolution && model.includes('pro')) body.resolution = spec.resolution;
  if (refs.length) body.image_urls = await Promise.all(refs.map(toImageUrl));
  for (const k of ['seed', 'safety_tolerance']) if (spec[k] !== undefined) body[k] = spec[k];

  const submit = await fetch(`${QUEUE}/${endpoint}`, { method: 'POST', headers: headers(), body: JSON.stringify(body) });
  if (!submit.ok) throw new Error(`Submit ${submit.status}: ${await submit.text()}`);
  const { response_url, status_url, request_id } = await submit.json();

  const started = Date.now();
  for (;;) {
    await sleep(2500);
    const st = await (await fetch(status_url, { headers: headers() })).json();
    if (st.status === 'COMPLETED') break;
    if (st.status === 'FAILED' || Date.now() - started > 300_000) throw new Error(`Status ${JSON.stringify(st)}`);
  }
  const res = await fetch(response_url, { headers: headers() });
  const data = await res.json();
  if (!data.images?.length) throw new Error(`Keine Bilder: ${JSON.stringify(data).slice(0, 500)}`);
  return { request_id, endpoint, data };
}

async function main() {
  const files = process.argv.slice(2);
  if (!files.length) { console.error('Nutzung: node scripts/gen-image.mjs <spec.json>…'); process.exit(1); }
  for (const file of files) {
    const spec = JSON.parse(await readFile(file, 'utf8'));
    process.stdout.write(`→ ${file} … `);
    const { request_id, endpoint, data } = await generate(spec);
    const outs = [];
    for (let i = 0; i < data.images.length; i++) {
      const img = data.images[i];
      const out = data.images.length === 1 ? spec.out : spec.out.replace(/(\.\w+)$/, `-${i + 1}$1`);
      const buf = Buffer.from(await (await fetch(img.url)).arrayBuffer());
      await mkdir(dirname(out), { recursive: true });
      await writeFile(out, buf);
      outs.push(out);
    }
    const log = { ...spec, result: { request_id, endpoint, at: new Date().toISOString(), files: outs,
      remote: data.images.map((i) => i.url), description: data.description ?? '' } };
    await writeFile(file, JSON.stringify(log, null, 2) + '\n');
    console.log(`${outs.join(', ')}`);
  }
}

main().catch((e) => { console.error(e.message); process.exit(1); });

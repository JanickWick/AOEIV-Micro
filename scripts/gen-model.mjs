#!/usr/bin/env node
// Erzeugt 3D-Modelle (Bild → Mesh) über die FAL-Warteschlange.
//   node scripts/gen-model.mjs assets/prompts/models/<name>.json
// Spezifikation: { "model": "fal-ai/hunyuan3d/v2/multi-view", "input": {…},
//   "refs": { "front_image_url": "pfad.png", … },   // lokale Bilder werden als Data-URI eingesetzt
//   "out": "assets/raw/models/<name>.glb" }
// Alle URLs auf .glb/.obj/.png in der Antwort werden neben `out` gespeichert.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, extname, resolve } from 'node:path';

const QUEUE = 'https://queue.fal.run';
const headers = () => ({ 'Content-Type': 'application/json', ...(process.env.FAL_KEY ? { Authorization: `Key ${process.env.FAL_KEY}` } : {}) });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function dataUri(p) {
  if (/^https?:/.test(p)) return p;
  const ext = extname(p).slice(1).toLowerCase();
  return `data:image/${ext === 'jpg' ? 'jpeg' : ext};base64,${(await readFile(resolve(p))).toString('base64')}`;
}

function collectUrls(obj, out = []) {
  if (typeof obj === 'string') { if (/^https?:\/\/.*\.(glb|gltf|obj|fbx|png|jpg|mp4)(\?|$)/i.test(obj)) out.push(obj); }
  else if (Array.isArray(obj)) obj.forEach((x) => collectUrls(x, out));
  else if (obj && typeof obj === 'object') Object.values(obj).forEach((x) => collectUrls(x, out));
  return out;
}

for (const file of process.argv.slice(2)) {
  const spec = JSON.parse(await readFile(file, 'utf8'));
  const body = { ...(spec.input ?? {}) };
  for (const [k, v] of Object.entries(spec.refs ?? {})) body[k] = Array.isArray(v) ? await Promise.all(v.map(dataUri)) : await dataUri(v);
  process.stdout.write(`→ ${file} … `);
  const t0 = Date.now();
  const submit = await fetch(`${QUEUE}/${spec.model}`, { method: 'POST', headers: headers(), body: JSON.stringify(body) });
  if (!submit.ok) { console.error(`Submit ${submit.status}: ${await submit.text()}`); process.exit(1); }
  const { status_url, response_url, request_id } = await submit.json();
  for (;;) {
    await sleep(5000);
    const st = await (await fetch(status_url, { headers: headers() })).json();
    if (st.status === 'COMPLETED') break;
    if (st.status === 'FAILED' || Date.now() - t0 > 1200_000) { console.error(JSON.stringify(st)); process.exit(1); }
  }
  const data = await (await fetch(response_url, { headers: headers() })).json();
  const urls = collectUrls(data);
  const files = [];
  await mkdir(dirname(spec.out), { recursive: true });
  for (const u of urls) {
    const ext = u.match(/\.(\w+)(\?|$)/)[1].toLowerCase();
    const base = spec.out.replace(/\.\w+$/, '');
    const out = files.some((f) => f.endsWith('.' + ext)) ? `${base}-${files.length}.${ext}` : `${base}.${ext}`;
    await writeFile(out, Buffer.from(await (await fetch(u)).arrayBuffer()));
    files.push(out);
  }
  const log = { ...spec, result: { request_id, at: new Date().toISOString(), seconds: Math.round((Date.now() - t0) / 1000), files, remote: urls, raw: data } };
  await writeFile(file, JSON.stringify(log, null, 2) + '\n');
  console.log(`${Math.round((Date.now() - t0) / 1000)} s → ${files.join(', ')}`);
}

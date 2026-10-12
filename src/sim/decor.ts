/**
 * Deterministische Deko und Hindernisse: Bäume und Felsen (mit Kollision), Büsche (ohne) und
 * Gebäude-Kulissen am Kartenrand. Die Kampfzone in der Kartenmitte bleibt frei.
 */
import type { Vec2 } from './math';
import type { Rng } from './rng';

export type DecorKind = 'tree' | 'rock' | 'bush' | 'building';

export interface Decor {
  kind: DecorKind;
  pos: Vec2;
  /** Kollisionsradius in Tiles (0 = keine Kollision). */
  radius: number;
  /** Darstellungsgröße (Skalierung) und Drehung. */
  scale: number;
  rotation: number;
  /** Gebäude: Grundfläche in Tiles. */
  size?: { w: number; h: number };
}

export interface Obstacle {
  pos: Vec2;
  radius: number;
}

export interface DecorOptions {
  /** Breite des Randstreifens, in dem Deko liegt (Tiles). */
  margin?: number;
  /** Bereiche, die frei bleiben. */
  keepClear?: { center: Vec2; radius: number }[];
  /** Dichte-Faktor (1 = Standard). */
  density?: number;
}

function clear(p: Vec2, zones: { center: Vec2; radius: number }[]): boolean {
  for (const z of zones) if (Math.hypot(p.x - z.center.x, p.y - z.center.y) < z.radius) return false;
  return true;
}

export function generateDecor(rng: Rng, map: { width: number; height: number }, opts: DecorOptions = {}): Decor[] {
  const margin = opts.margin ?? 10;
  const zones = opts.keepClear ?? [];
  const density = opts.density ?? 1;
  const out: Decor[] = [];
  const inBand = (p: Vec2) => p.x < margin || p.x > map.width - margin || p.y < margin || p.y > map.height - margin;
  const tooClose = (p: Vec2, r: number) => out.some((d) => Math.hypot(d.pos.x - p.x, d.pos.y - p.y) < d.radius + r + 0.4);
  const place = (kind: DecorKind, count: number, radius: number, scaleRange: [number, number], clustered = false) => {
    let attempts = 0;
    let placed = 0;
    let cluster: Vec2 | null = null;
    while (placed < count && attempts < count * 40) {
      attempts++;
      let p: Vec2;
      if (clustered && cluster && rng.next() < 0.7) {
        p = { x: cluster.x + rng.range(-3, 3), y: cluster.y + rng.range(-3, 3) };
      } else {
        p = { x: rng.range(1, map.width - 1), y: rng.range(1, map.height - 1) };
        cluster = p;
      }
      if (p.x < 1 || p.y < 1 || p.x > map.width - 1 || p.y > map.height - 1) continue;
      if (!inBand(p) || !clear(p, zones) || tooClose(p, radius)) continue;
      out.push({ kind, pos: p, radius, scale: rng.range(scaleRange[0], scaleRange[1]), rotation: rng.range(0, Math.PI * 2) });
      placed++;
    }
  };
  const area = map.width * map.height;
  place('tree', Math.round((area / 3072) * 40 * density), 0.6, [0.8, 1.3], true);
  place('rock', Math.round((area / 3072) * 10 * density), 0.9, [0.7, 1.4]);
  place('bush', Math.round((area / 3072) * 30 * density), 0, [0.6, 1.2], true);
  // Gebäude-Kulisse: zwei bis vier Häuser am oberen und rechten Rand
  const houses = 3;
  for (let i = 0; i < houses; i++) {
    const w = rng.range(3, 4.5);
    const h = rng.range(3, 4.5);
    const alongTop = i % 2 === 0;
    const p = alongTop ? { x: rng.range(margin, map.width - margin), y: rng.range(2.5, margin - 3) } : { x: rng.range(map.width - margin + 3, map.width - 2.5), y: rng.range(margin, map.height - margin) };
    if (!clear(p, zones) || tooClose(p, Math.max(w, h) / 2)) continue;
    out.push({ kind: 'building', pos: p, radius: Math.max(w, h) / 2, scale: 1, rotation: 0, size: { w, h } });
  }
  return out;
}

export function obstaclesOf(decor: readonly Decor[]): Obstacle[] {
  return decor.filter((d) => d.radius > 0).map((d) => ({ pos: d.pos, radius: d.radius }));
}

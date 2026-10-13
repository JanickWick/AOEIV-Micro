/**
 * Kleiner Baukasten für geskinnte Low-Poly-Figuren: Röhren entlang von Gelenkketten mit weichen
 * Gelenkgewichten, Kugeln, Kappen. Erzeugt eine BufferGeometry mit position, normal, uv,
 * skinIndex, skinWeight und upper (Gewicht für die Oberkörperdrehung).
 */
import * as THREE from 'three';
import { boneIndexOf, type Rig } from './rig';

export type Vec3 = [number, number, number];
/** Bis zu vier Knochen-Einflüsse [Index, Gewicht]. */
export type Weights = [number, number][];

export interface AtlasRegion {
  rect: [number, number, number, number];
  team?: boolean;
}
export interface AtlasLayout {
  size: number;
  regions: Record<string, AtlasRegion>;
}

export interface Ring {
  c: Vec3;
  /** Radialrichtungen (Einheitsvektoren) für cos und sin. */
  u: Vec3;
  v: Vec3;
  ru: number;
  rv: number;
  w: Weights;
  /** Position entlang der Röhre (0..1) für die Textur. */
  t: number;
}

function add(a: Vec3, b: Vec3, s = 1): Vec3 {
  return [a[0] + b[0] * s, a[1] + b[1] * s, a[2] + b[2] * s];
}
function sub(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}
function norm(a: Vec3): Vec3 {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
}
function cross(a: Vec3, b: Vec3): Vec3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}
export function mixv(a: Vec3, b: Vec3, t: number): Vec3 {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

/** Orthonormale Radialbasis zu einer Achse; `hint` legt die Richtung von u fest (für die Textur-Naht). */
export function basis(axis: Vec3, hint: Vec3 = [1, 0, 0]): { u: Vec3; v: Vec3 } {
  const a = norm(axis);
  let u = cross(hint, a);
  if (Math.hypot(u[0], u[1], u[2]) < 1e-4) u = cross([0, 0, 1], a);
  u = norm(u);
  const v = norm(cross(a, u));
  return { u, v };
}

/** Gewichtsfunktion für ein Rig: W(['hips', 1], ['spine', 0.5]) → normierte Einflüsse. */
export function weightsFor(rig: Rig): (...pairs: [string, number][]) => Weights {
  return (...pairs) => {
    const total = pairs.reduce((s, p) => s + p[1], 0) || 1;
    return pairs.map(([n, w]) => [boneIndexOf(rig, n), w / total]);
  };
}

export function mixW(a: Weights, b: Weights, t: number): Weights {
  const m = new Map<number, number>();
  for (const [i, w] of a) m.set(i, (m.get(i) ?? 0) + w * (1 - t));
  for (const [i, w] of b) m.set(i, (m.get(i) ?? 0) + w * t);
  return [...m.entries()].sort((x, y) => y[1] - x[1]).slice(0, 4);
}

export class GeometryBuilder {
  private pos: number[] = [];
  private nrm: number[] = [];
  private uv: number[] = [];
  private si: number[] = [];
  private sw: number[] = [];
  private up: number[] = [];
  private idx: number[] = [];
  private vcount = 0;

  readonly W: (...pairs: [string, number][]) => Weights;

  constructor(private atlas: AtlasLayout, readonly rig: Rig) {
    this.W = weightsFor(rig);
  }

  private region(name: string): [number, number, number, number] {
    const r = this.atlas.regions[name];
    if (!r) throw new Error(`Atlas-Region fehlt: ${name}`);
    const s = this.atlas.size;
    // Bild-y nach unten, Textur-v nach oben
    return [r.rect[0] / s, 1 - r.rect[3] / s, r.rect[2] / s, 1 - r.rect[1] / s];
  }

  private vertex(p: Vec3, n: Vec3, u: number, v: number, w: Weights): number {
    this.pos.push(p[0], p[1], p[2]);
    this.nrm.push(n[0], n[1], n[2]);
    this.uv.push(u, v);
    const ww = w.slice(0, 4);
    while (ww.length < 4) ww.push([0, 0]);
    let upper = 0;
    for (const [i, wt] of ww) upper += this.rig.bones[i]!.upper * wt;
    for (const [i] of ww) this.si.push(i);
    for (const [, wt] of ww) this.sw.push(wt);
    this.up.push(upper);
    return this.vcount++;
  }

  /**
   * Röhre durch eine Folge von Ringen. `regionName` bestimmt den Atlas-Bereich; u läuft um die
   * Röhre (mit Naht bei Winkel 0, also Richtung ring.u), v entlang der Röhre nach ring.t.
   */
  tube(rings: Ring[], sides: number, regionName: string, opts: { closeStart?: boolean; closeEnd?: boolean; uRepeat?: number } = {}): void {
    const [u0, v0, u1, v1] = this.region(regionName);
    const uRep = opts.uRepeat ?? 1;
    const rows: number[][] = [];
    for (let r = 0; r < rings.length; r++) {
      const ring = rings[r]!;
      // Tangente entlang der Röhre für die Normale (Kegelstumpf-Korrektur)
      const prev = rings[Math.max(0, r - 1)]!;
      const next = rings[Math.min(rings.length - 1, r + 1)]!;
      const axis = norm(sub(next.c, prev.c));
      const dr = ((next.ru + next.rv) / 2 - (prev.ru + prev.rv) / 2) / Math.max(1e-4, Math.hypot(...sub(next.c, prev.c)));
      const row: number[] = [];
      for (let k = 0; k <= sides; k++) {
        const a = (k / sides) * Math.PI * 2;
        const ca = Math.cos(a), sa = Math.sin(a);
        const radial: Vec3 = norm([ring.u[0] * ca * ring.rv + ring.v[0] * sa * ring.ru, ring.u[1] * ca * ring.rv + ring.v[1] * sa * ring.ru, ring.u[2] * ca * ring.rv + ring.v[2] * sa * ring.ru]);
        const p: Vec3 = [ring.c[0] + ring.u[0] * ca * ring.ru + ring.v[0] * sa * ring.rv, ring.c[1] + ring.u[1] * ca * ring.ru + ring.v[1] * sa * ring.rv, ring.c[2] + ring.u[2] * ca * ring.ru + ring.v[2] * sa * ring.rv];
        const n = norm(add(radial, axis, -dr));
        const tu = u0 + (u1 - u0) * Math.min(1, (k / sides) * uRep);
        row.push(this.vertex(p, n, tu, v0 + (v1 - v0) * ring.t, ring.w));
      }
      rows.push(row);
    }
    for (let r = 0; r < rings.length - 1; r++) {
      for (let k = 0; k < sides; k++) {
        const a = rows[r]![k]!, b = rows[r]![k + 1]!, c = rows[r + 1]![k]!, d = rows[r + 1]![k + 1]!;
        this.idx.push(a, c, b, b, c, d);
      }
    }
    if (opts.closeStart) this.cap(rings[0]!, rings[1]!, sides, regionName, true);
    if (opts.closeEnd) this.cap(rings[rings.length - 1]!, rings[rings.length - 2]!, sides, regionName, false);
  }

  private cap(ring: Ring, inner: Ring, sides: number, regionName: string, start: boolean): void {
    const [u0, v0, u1, v1] = this.region(regionName);
    const n = norm(sub(ring.c, inner.c));
    const cu = (u0 + u1) / 2, cv = (v0 + v1) / 2;
    const center = this.vertex(ring.c, n, cu, cv, ring.w);
    const rim: number[] = [];
    for (let k = 0; k < sides; k++) {
      const a = (k / sides) * Math.PI * 2;
      const p: Vec3 = [ring.c[0] + ring.u[0] * Math.cos(a) * ring.ru + ring.v[0] * Math.sin(a) * ring.rv, ring.c[1] + ring.u[1] * Math.cos(a) * ring.ru + ring.v[1] * Math.sin(a) * ring.rv, ring.c[2] + ring.u[2] * Math.cos(a) * ring.ru + ring.v[2] * Math.sin(a) * ring.rv];
      rim.push(this.vertex(p, n, cu + Math.cos(a) * (u1 - u0) * 0.4, cv + Math.sin(a) * (v1 - v0) * 0.4, ring.w));
    }
    for (let k = 0; k < sides; k++) {
      const a = rim[k]!, b = rim[(k + 1) % sides]!;
      if (start) this.idx.push(center, b, a);
      else this.idx.push(center, a, b);
    }
  }

  /**
   * Gelenkkette: Knoten mit Position, Knochen und Radius. Der Abschnitt zwischen Knoten i und i+1
   * gehört zum Knochen von Knoten i; am Gelenk werden Gewichte 50/50 gemischt, daneben 85/15.
   * `regions[i]` ist der Atlas-Bereich des Abschnitts i (Standard: regions[0]).
   */
  chain(nodes: { p: Vec3; bone: string; r: number; rv?: number }[], sides: number, regions: string[], opts: { closeStart?: boolean; closeEnd?: boolean; hint?: Vec3; taperEnd?: number } = {}): void {
    const hint = opts.hint ?? [1, 0, 0];
    for (let i = 0; i < nodes.length - 1; i++) {
      const a = nodes[i]!, b = nodes[i + 1]!;
      const axis = sub(b.p, a.p);
      const { u, v } = basis(axis, hint);
      const wa = this.W([a.bone, 1]);
      const wb = this.W([b.bone, 1]);
      const prevBone = i > 0 ? nodes[i - 1]!.bone : a.bone;
      const nextIsLast = i + 1 === nodes.length - 1;
      const wStart = i === 0 ? wa : mixW(this.W([prevBone, 1]), wa, 0.5);
      const wEnd = nextIsLast && b.bone === a.bone ? wa : mixW(wa, wb, 0.5);
      const ru = (n: typeof a) => n.r;
      const rv = (n: typeof a) => n.rv ?? n.r;
      const taper = nextIsLast ? (opts.taperEnd ?? 1) : 1;
      const ring = (t: number, w: Weights, scale = 1): Ring => ({
        c: mixv(a.p, b.p, t),
        u, v,
        ru: (ru(a) + (ru(b) - ru(a)) * t) * scale,
        rv: (rv(a) + (rv(b) - rv(a)) * t) * scale,
        w,
        t,
      });
      const rings: Ring[] = [
        ring(0, wStart),
        ring(0.18, mixW(wStart, wa, 0.8)),
        ring(0.5, wa),
        ring(0.82, mixW(wa, wEnd, 0.4)),
        ring(1, wEnd, taper),
      ];
      this.tube(rings, sides, regions[i] ?? regions[0]!, { closeStart: opts.closeStart && i === 0, closeEnd: opts.closeEnd && i === nodes.length - 2 });
    }
  }

  /** Kugel (Breiten-/Längengrade); u = 0,5 zeigt nach +z (Gesicht vorn). */
  sphere(c: Vec3, r: Vec3, lat: number, lon: number, regionName: string, w: Weights, opts: { topLat?: number; bottomLat?: number; bottomLatFront?: number } = {}): void {
    const [u0, v0, u1, v1] = this.region(regionName);
    const top = opts.topLat ?? 0, bottom = opts.bottomLat ?? 1;
    const rows: number[][] = [];
    for (let i = 0; i <= lat; i++) {
      const row: number[] = [];
      for (let k = 0; k <= lon; k++) {
        const th = (k / lon) * Math.PI * 2 + Math.PI; // u=0,5 → +z
        // Unterer Rand darf vorn höher liegen (Kappe lässt das Gesicht frei)
        const frontness = (1 + Math.cos(th)) / 2;
        const bot = opts.bottomLatFront === undefined ? bottom : bottom + (opts.bottomLatFront - bottom) * frontness;
        const f = top + (bot - top) * (i / lat);
        const phi = f * Math.PI; // 0 oben
        const nx = Math.sin(phi) * Math.sin(th), ny = Math.cos(phi), nz = Math.sin(phi) * Math.cos(th);
        const p: Vec3 = [c[0] + nx * r[0], c[1] + ny * r[1], c[2] + nz * r[2]];
        row.push(this.vertex(p, norm([nx / r[0], ny / r[1], nz / r[2]]), u0 + (u1 - u0) * (k / lon), v1 - (v1 - v0) * f, w));
      }
      rows.push(row);
    }
    for (let i = 0; i < lat; i++) {
      for (let k = 0; k < lon; k++) {
        const a = rows[i]![k]!, b = rows[i]![k + 1]!, cc = rows[i + 1]![k]!, d = rows[i + 1]![k + 1]!;
        this.idx.push(a, cc, b, b, cc, d);
      }
    }
  }

  /** Quader mit Mittelpunkt c und Halbgrößen h, texturiert aus einer Region (alle Seiten gleich). */
  box(c: Vec3, h: Vec3, regionName: string, w: Weights): void {
    const [u0, v0, u1, v1] = this.region(regionName);
    const faces: { n: Vec3; a: Vec3; b: Vec3 }[] = [
      { n: [1, 0, 0], a: [0, 0, -1], b: [0, 1, 0] }, { n: [-1, 0, 0], a: [0, 0, 1], b: [0, 1, 0] },
      { n: [0, 1, 0], a: [1, 0, 0], b: [0, 0, -1] }, { n: [0, -1, 0], a: [1, 0, 0], b: [0, 0, 1] },
      { n: [0, 0, 1], a: [1, 0, 0], b: [0, 1, 0] }, { n: [0, 0, -1], a: [-1, 0, 0], b: [0, 1, 0] },
    ];
    for (const f of faces) {
      const ids: number[] = [];
      for (const [sa, sb] of [[-1, -1], [1, -1], [1, 1], [-1, 1]] as [number, number][]) {
        const p: Vec3 = [c[0] + f.n[0] * h[0] + f.a[0] * h[0] * sa + f.b[0] * h[0] * sb, c[1] + f.n[1] * h[1] + f.a[1] * h[1] * sa + f.b[1] * h[1] * sb, c[2] + f.n[2] * h[2] + f.a[2] * h[2] * sa + f.b[2] * h[2] * sb];
        ids.push(this.vertex(p, f.n, sa < 0 ? u0 : u1, sb < 0 ? v0 : v1, w));
      }
      this.idx.push(ids[0]!, ids[1]!, ids[2]!, ids[0]!, ids[2]!, ids[3]!);
    }
  }

  build(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nrm, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('aSkinIndex', new THREE.Float32BufferAttribute(this.si, 4));
    g.setAttribute('aSkinWeight', new THREE.Float32BufferAttribute(this.sw, 4));
    g.setAttribute('aUpper', new THREE.Float32BufferAttribute(this.up, 1));
    g.setIndex(this.idx);
    g.computeBoundingSphere();
    return g;
  }

  get vertexCount(): number {
    return this.vcount;
  }
  get triangleCount(): number {
    return this.idx.length / 3;
  }
}

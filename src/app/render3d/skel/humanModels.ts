/**
 * Geskinnte Figurmodelle auf dem gemeinsamen Skelett. Maße im Modellraum (Höhe 1).
 * Pilot: Bogenschütze (Lederkappe, Gambeson, Wappenrock in Teamfarbe, Köcher, Langbogen).
 */
import type * as THREE from 'three';
import { HUMAN_BONES, HUMAN_RIG, boneIndex } from './humanRig';
import { GeometryBuilder, basis, mixv, weightsFor, type AtlasLayout, type Ring, type Vec3 } from './meshBuilder';

const W = weightsFor(HUMAN_RIG);

function pos(bone: string): Vec3 {
  return [...HUMAN_BONES[boneIndex(bone)]!.pos] as Vec3;
}

export interface HumanModel {
  geometry: THREE.BufferGeometry;
  vertices: number;
  triangles: number;
}

export function buildArcher(atlas: AtlasLayout): HumanModel {
  const g = new GeometryBuilder(atlas, HUMAN_RIG);
  buildBody(g, { cap: true });
  buildQuiver(g);
  buildBow(g);
  buildArrow(g);
  return { geometry: g.build(), vertices: g.vertexCount, triangles: g.triangleCount };
}

/** Nur der Körper (mit Köcher): Rückfall, solange das erzeugte Modell nicht geladen ist. */
export function buildArcherBody(atlas: AtlasLayout): HumanModel {
  const g = new GeometryBuilder(atlas, HUMAN_RIG);
  buildBody(g, { cap: true });
  buildQuiver(g);
  return { geometry: g.build(), vertices: g.vertexCount, triangles: g.triangleCount };
}

/** Requisiten des Bogenschützen (Bogen, Sehne, Pfeil), getrennt vom Körper gerendert. */
export function buildArcherProps(atlas: AtlasLayout): HumanModel {
  const g = new GeometryBuilder(atlas, HUMAN_RIG);
  buildBow(g);
  buildArrow(g);
  return { geometry: g.build(), vertices: g.vertexCount, triangles: g.triangleCount };
}

/** Grundkörper: Beine, Rumpf mit Wappenrock, Arme, Hals, Kopf, optional Lederkappe. */
function buildBody(g: GeometryBuilder, opts: { cap: boolean }): void {
  // Beine (Hüfte → Knie → Knöchel), Hose oben, Stiefel ab dem Schienbein
  for (const side of ['L', 'R'] as const) {
    const hip = pos(`thigh${side}`), knee = pos(`shin${side}`), ankle = pos(`foot${side}`);
    const bootTop: Vec3 = [knee[0], 0.17, knee[2]];
    g.chain(
      [
        { p: hip, bone: `thigh${side}`, r: 0.062 },
        { p: knee, bone: `shin${side}`, r: 0.05 },
        { p: bootTop, bone: `shin${side}`, r: 0.047 },
        { p: ankle, bone: `foot${side}`, r: 0.04 },
      ],
      8,
      ['trousers', 'trousers', 'boot'],
    );
    // Fuß nach vorn, geschlossen
    const toe: Vec3 = [ankle[0], 0.015, ankle[2] + 0.13];
    const heel: Vec3 = [ankle[0], 0.02, ankle[2] - 0.03];
    g.chain(
      [
        { p: heel, bone: `foot${side}`, r: 0.035, rv: 0.025 },
        { p: toe, bone: `foot${side}`, r: 0.038, rv: 0.02 },
      ],
      8,
      ['boot'],
      { closeStart: true, closeEnd: true, hint: [0, 1, 0], taperEnd: 0.6 },
    );
  }

  // Rumpf: Ringe von der Hüfte bis zum Hals; Gewichte nach Höhe auf Hüfte/Wirbel/Brust/Hals
  const ladder: [string, number][] = [['hips', 0.5], ['spine', 0.6], ['chest', 0.72], ['neck', 0.86]];
  const weightsAt = (y: number) => {
    for (let i = 0; i < ladder.length - 1; i++) {
      const [na, ya] = ladder[i]!, [nb, yb] = ladder[i + 1]!;
      if (y <= ya) return W([na, 1]);
      if (y < yb) {
        const t = (y - ya) / (yb - ya);
        return W([na, 1 - t], [nb, t]);
      }
    }
    return W([ladder[ladder.length - 1]![0], 1]);
  };
  const { u, v } = basis([0, 1, 0], [0, 0, 1]); // Naht hinten
  const torsoRing = (y: number, ru: number, rv: number, t: number): Ring => ({ c: [0, y, 0], u, v, ru, rv, w: weightsAt(y), t });
  g.tube(
    [
      torsoRing(0.47, 0.128, 0.084, 0),
      torsoRing(0.57, 0.118, 0.08, 0.18),
      torsoRing(0.65, 0.125, 0.085, 0.4),
      torsoRing(0.75, 0.14, 0.09, 0.68),
      torsoRing(0.83, 0.135, 0.088, 0.9),
      torsoRing(0.87, 0.06, 0.05, 1),
    ],
    10,
    'tabard',
  );
  // Wappenrock-Schurz: von der Hüfte nach unten ausgestellt, offen
  g.tube(
    [
      { c: [0, 0.49, 0], u, v, ru: 0.14, rv: 0.094, w: W(['hips', 1]), t: 1 },
      { c: [0, 0.42, 0], u, v, ru: 0.15, rv: 0.1, w: W(['hips', 0.8], ['thighL', 0.1], ['thighR', 0.1]), t: 0.5 },
      { c: [0, 0.33, 0], u, v, ru: 0.165, rv: 0.11, w: W(['hips', 0.55], ['thighL', 0.225], ['thighR', 0.225]), t: 0 },
    ],
    10,
    'tabard',
  );
  // Gürtel
  g.tube(
    [
      { c: [0, 0.48, 0], u, v, ru: 0.146, rv: 0.1, w: W(['hips', 1]), t: 0.2 },
      { c: [0, 0.525, 0], u, v, ru: 0.146, rv: 0.1, w: W(['hips', 1]), t: 0.35 },
    ],
    10,
    'leather',
  );
  // Schultern: Gambeson-Kugeln über den Schultergelenken
  for (const side of ['L', 'R'] as const) {
    const s = pos(`upperArm${side}`);
    g.sphere([s[0] * 0.98, s[1] + 0.005, s[2]], [0.047, 0.046, 0.046], 4, 8, 'gambeson', W(['chest', 0.6], [`upperArm${side}`, 0.4]), { bottomLat: 0.6 });
  }
  // Arme: Schulter → Ellbogen → Handgelenk → Fingerspitzen
  for (const side of ['L', 'R'] as const) {
    const sh = pos(`upperArm${side}`), el = pos(`forearm${side}`), wr = pos(`hand${side}`);
    const tip: Vec3 = [wr[0], wr[1] - 0.075, wr[2]];
    g.chain(
      [
        { p: sh, bone: `upperArm${side}`, r: 0.042 },
        { p: el, bone: `forearm${side}`, r: 0.036 },
        { p: wr, bone: `hand${side}`, r: 0.027 },
        { p: tip, bone: `hand${side}`, r: 0.026 },
      ],
      8,
      ['gambeson', 'gambeson', 'skin'],
      { closeEnd: true, taperEnd: 0.5 },
    );
    // Lederschoner am Unterarm
    const b0 = mixv(el, wr, 0.3), b1 = mixv(el, wr, 0.95);
    g.chain([{ p: b0, bone: `forearm${side}`, r: 0.039 }, { p: b1, bone: `forearm${side}`, r: 0.032 }], 8, ['leather']);
  }
  // Hals
  g.chain([{ p: [0, 0.845, 0.005], bone: 'neck', r: 0.038 }, { p: [0, 0.905, 0.005], bone: 'head', r: 0.04 }], 8, ['skin']);
  // Kopf
  const hc: Vec3 = [0, 0.935, 0.01];
  g.sphere(hc, [0.07, 0.078, 0.075], 8, 12, 'face', W(['head', 1]));
  if (opts.cap) {
    // Lederkappe: etwas größere Kugelschale von oben bis über die Ohren, hinten tiefer
    g.sphere([hc[0], hc[1] + 0.004, hc[2] - 0.006], [0.078, 0.084, 0.084], 5, 12, 'cap', W(['head', 1]), { bottomLat: 0.62, bottomLatFront: 0.3 });
  }
}

/** Köcher hinter der rechten Schulter mit vier Pfeilen. */
function buildQuiver(g: GeometryBuilder): void {
  const a: Vec3 = [0.11, 0.5, -0.12], b: Vec3 = [0.05, 0.82, -0.13];
  g.chain([{ p: a, bone: 'chest', r: 0.034 }, { p: b, bone: 'chest', r: 0.036 }], 8, ['leather'], { closeStart: true, closeEnd: true });
  const dir = mixv(b, a, -0.35);
  const offs: Vec3[] = [[0.012, 0, 0.012], [-0.012, 0, 0.01], [0.004, 0, -0.014], [-0.006, 0, -0.002]];
  for (const o of offs) {
    const s: Vec3 = [b[0] + o[0], b[1] + o[1], b[2] + o[2]];
    const e: Vec3 = [dir[0] + o[0], dir[1] + o[1] + 0.02, dir[2] + o[2]];
    const f = mixv(s, e, 0.6);
    g.chain([{ p: s, bone: 'chest', r: 0.005 }, { p: f, bone: 'chest', r: 0.005 }, { p: e, bone: 'chest', r: 0.011 }], 4, ['wood', 'feather'], { closeEnd: true, taperEnd: 0.3 });
  }
}

/**
 * Langbogen in der linken Hand (Knochen propL). In der Ruhelage liegt der Bogen entlang z und ist
 * zu +y gebogen; hebt der Arm nach vorn, steht er senkrecht mit dem Bauch zum Schützen.
 */
function buildBow(g: GeometryBuilder): void {
  const h = pos('propL');
  const half = 0.38;
  const rings: Ring[] = [];
  const n = 12;
  const pts: Vec3[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const z = -half + 2 * half * t;
    const bend = 0.09 * (1 - Math.pow(z / half, 2)); // Mitte nach −y (vom Schützen weg), Spitzen zum Schützen
    pts.push([h[0] - 0.012, h[1] + 0.06 - bend, h[2] + z]);
  }
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const prev = pts[Math.max(0, i - 1)]!, next = pts[Math.min(n, i + 1)]!;
    const { u, v } = basis([next[0] - prev[0], next[1] - prev[1], next[2] - prev[2]], [0, 1, 0]);
    const thick = 0.006 + 0.01 * (1 - Math.pow(2 * t - 1, 2));
    rings.push({ c: pts[i]!, u, v, ru: thick, rv: thick * 1.6, w: W(['propL', 1]), t });
  }
  g.tube(rings, 5, 'wood', { closeStart: true, closeEnd: true });
  // Griffwicklung
  const grip = rings.slice(5, 8).map((r, i) => ({ ...r, ru: r.ru + 0.004, rv: r.rv + 0.004, t: i / 2 }));
  g.tube(grip, 5, 'leather');
  // Sehne: zwei gerade Stücke von den Spitzen zum Nockpunkt. Der Nockpunkt liegt in der Ruhelage
  // auf der Sehne (Abstand STRING_DRAW von der Mitte, Knochen 'nock' sitzt in der Sehnenmitte);
  // dreht der Knochen um −90° um x, wandert der Punkt um STRING_DRAW zum Schützen (+y im Ruheraum).
  const s0 = pts[0]!, s1 = pts[n]!;
  const nockPivot = pos('nock');
  const mid: Vec3 = [nockPivot[0], nockPivot[1], nockPivot[2] + STRING_DRAW];
  const strRing = (c: Vec3, w: ReturnType<typeof W>, t: number): Ring => {
    const { u, v } = basis([0, 0, 1], [0, 1, 0]);
    return { c, u, v, ru: 0.0035, rv: 0.0035, w, t };
  };
  g.tube([strRing(s0, W(['propL', 1]), 0), strRing(mid, W(['nock', 1]), 1)], 3, 'string');
  g.tube([strRing(mid, W(['nock', 1]), 0), strRing(s1, W(['propL', 1]), 1)], 3, 'string');
}

/** Auszugslänge der Sehne (Modellraum, Höhe 1): bis etwa zur Wange. */
export const STRING_DRAW = 0.3;

/**
 * Pfeil auf der Bogenhand (Knochen arrow, gleiche Lage wie propL), nur beim Spannen sichtbar
 * (Skalierung sonst 0). In der Ruhelage zeigt er entlang −y: bei gehobenem Arm (Drehung −π/2 um x)
 * wird daraus die Blickrichtung +z.
 */
function buildArrow(g: GeometryBuilder): void {
  const h = pos('arrow');
  const x = h[0] + 0.012, z = h[2] + 0.015;
  const s: Vec3 = [x, h[1] + 0.33, z];
  const m: Vec3 = [x, h[1] - 0.36, z];
  const e: Vec3 = [x, h[1] - 0.42, z];
  g.chain([{ p: s, bone: 'arrow', r: 0.009 }, { p: mixv(s, m, 0.2), bone: 'arrow', r: 0.005 }, { p: m, bone: 'arrow', r: 0.005 }, { p: e, bone: 'arrow', r: 0.007 }], 4, ['feather', 'wood', 'steel'], { closeStart: true, closeEnd: true, taperEnd: 0.2, hint: [1, 0, 0] });
}

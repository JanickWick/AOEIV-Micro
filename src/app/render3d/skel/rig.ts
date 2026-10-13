/**
 * Allgemeines Skelett (Rig): Knochen mit Eltern und Ruheposition, Posen aus lokalen Rotationen,
 * Vorwärtskinematik zu Skinning-Matrizen. Modellraum: y nach oben, Blick +z.
 * Alle Knochen haben in der Ruhepose die Orientierung der Modellachsen (keine Ruhe-Rotation);
 * dadurch ist die inverse Bind-Matrix eines Knochens nur die Verschiebung um −Ruheposition.
 */

export interface BoneDef {
  name: string;
  parent: string | null;
  /** Ruheposition des Gelenks im Modellraum. */
  pos: [number, number, number];
  /** Gewicht für die Oberkörper-Drehung (Zielen): 0 unbeteiligt, 1 dreht voll mit. */
  upper: number;
}

export interface Rig {
  name: string;
  bones: readonly BoneDef[];
  index: Readonly<Record<string, number>>;
  count: number;
}

export function makeRig(name: string, bones: readonly BoneDef[]): Rig {
  const index = Object.fromEntries(bones.map((b, i) => [b.name, i]));
  for (const b of bones) if (b.parent !== null && !(b.parent in index)) throw new Error(`Rig ${name}: Eltern-Knochen ${b.parent} fehlt`);
  return { name, bones, index, count: bones.length };
}

export function boneIndexOf(rig: Rig, name: string): number {
  const i = rig.index[name];
  if (i === undefined) throw new Error(`Unbekannter Knochen in ${rig.name}: ${name}`);
  return i;
}

/** Lokale Pose eines Knochens. */
export interface BonePose {
  rx: number;
  ry: number;
  rz: number;
  /** Skalierung (1 normal, 0 blendet Requisiten aus). */
  s: number;
}

export interface Pose {
  bones: BonePose[];
  /** Verschiebung der Wurzel gegenüber der Ruhelage (Modellraum). */
  hipOffset: [number, number, number];
}

export function emptyPoseFor(rig: Rig): Pose {
  return { bones: rig.bones.map(() => ({ rx: 0, ry: 0, rz: 0, s: 1 })), hipOffset: [0, 0, 0] };
}

export function resetPose(p: Pose): Pose {
  for (const b of p.bones) {
    b.rx = 0;
    b.ry = 0;
    b.rz = 0;
    b.s = 1;
  }
  p.hipOffset[0] = 0;
  p.hipOffset[1] = 0;
  p.hipOffset[2] = 0;
  return p;
}

/** Zwischen zwei Posen überblenden (lineare Winkel; nur für kleine Unterschiede gedacht). */
export function mixPose(a: Pose, b: Pose, t: number, out: Pose): Pose {
  for (let i = 0; i < a.bones.length; i++) {
    const x = a.bones[i]!;
    const y = b.bones[i]!;
    const o = out.bones[i]!;
    o.rx = x.rx + (y.rx - x.rx) * t;
    o.ry = x.ry + (y.ry - x.ry) * t;
    o.rz = x.rz + (y.rz - x.rz) * t;
    o.s = x.s + (y.s - x.s) * t;
  }
  for (let k = 0; k < 3; k++) out.hipOffset[k] = a.hipOffset[k]! + (b.hipOffset[k]! - a.hipOffset[k]!) * t;
  return out;
}

type Mat4 = Float64Array;

function mat4Mul(a: Mat4, b: Mat4, out: Mat4): Mat4 {
  for (let c = 0; c < 4; c++) {
    for (let r = 0; r < 4; r++) {
      out[c * 4 + r] = a[r]! * b[c * 4]! + a[4 + r]! * b[c * 4 + 1]! + a[8 + r]! * b[c * 4 + 2]! + a[12 + r]! * b[c * 4 + 3]!;
    }
  }
  return out;
}

/** T(t) · R(xyz-Euler wie THREE.Euler 'XYZ') · S(s), spaltenweise. */
function composeTRS(tx: number, ty: number, tz: number, rx: number, ry: number, rz: number, s: number, out: Mat4): Mat4 {
  const cx = Math.cos(rx), sx = Math.sin(rx);
  const cy = Math.cos(ry), sy = Math.sin(ry);
  const cz = Math.cos(rz), sz = Math.sin(rz);
  out[0] = cy * cz * s;
  out[1] = (cx * sz + sx * sy * cz) * s;
  out[2] = (sx * sz - cx * sy * cz) * s;
  out[3] = 0;
  out[4] = -cy * sz * s;
  out[5] = (cx * cz - sx * sy * sz) * s;
  out[6] = (sx * cz + cx * sy * sz) * s;
  out[7] = 0;
  out[8] = sy * s;
  out[9] = -sx * cy * s;
  out[10] = cx * cy * s;
  out[11] = 0;
  out[12] = tx;
  out[13] = ty;
  out[14] = tz;
  out[15] = 1;
  return out;
}

/**
 * Vorwärtskinematik: liefert je Knochen die Skinning-Matrix (Welt · inverseBind) als 3×4 in
 * Zeilenform (12 Werte) in `out`, Offset bone·12.
 */
export function solvePoseFor(rig: Rig, pose: Pose, out: Float32Array): void {
  const n = rig.count;
  const world: Mat4[] = new Array(n);
  const local = new Float64Array(16);
  for (let i = 0; i < n; i++) {
    const b = rig.bones[i]!;
    const bp = pose.bones[i]!;
    const parentIdx = b.parent === null ? -1 : rig.index[b.parent]!;
    const parent = parentIdx < 0 ? null : world[parentIdx]!;
    let tx = b.pos[0], ty = b.pos[1], tz = b.pos[2];
    if (parent) {
      const pb = rig.bones[parentIdx]!;
      tx -= pb.pos[0];
      ty -= pb.pos[1];
      tz -= pb.pos[2];
    } else {
      tx += pose.hipOffset[0];
      ty += pose.hipOffset[1];
      tz += pose.hipOffset[2];
    }
    composeTRS(tx, ty, tz, bp.rx, bp.ry, bp.rz, bp.s, local);
    const w = new Float64Array(16);
    if (parent) mat4Mul(parent, local, w);
    else w.set(local);
    world[i] = w;
    const rx = b.pos[0], ry = b.pos[1], rz = b.pos[2];
    const o = i * 12;
    out[o + 0] = w[0]!; out[o + 1] = w[4]!; out[o + 2] = w[8]!; out[o + 3] = w[12]! - (w[0]! * rx + w[4]! * ry + w[8]! * rz);
    out[o + 4] = w[1]!; out[o + 5] = w[5]!; out[o + 6] = w[9]!; out[o + 7] = w[13]! - (w[1]! * rx + w[5]! * ry + w[9]! * rz);
    out[o + 8] = w[2]!; out[o + 9] = w[6]!; out[o + 10] = w[10]!; out[o + 11] = w[14]! - (w[2]! * rx + w[6]! * ry + w[10]! * rz);
  }
}

/** Gelenkposition eines Knochens in einer Pose (für Tests und Requisiten). */
export function jointPositionFor(rig: Rig, pose: Pose, bone: string, out: [number, number, number]): [number, number, number] {
  const skins = new Float32Array(rig.count * 12);
  solvePoseFor(rig, pose, skins);
  const i = boneIndexOf(rig, bone);
  const p = rig.bones[i]!.pos;
  const o = i * 12;
  out[0] = skins[o]! * p[0] + skins[o + 1]! * p[1] + skins[o + 2]! * p[2] + skins[o + 3]!;
  out[1] = skins[o + 4]! * p[0] + skins[o + 5]! * p[1] + skins[o + 6]! * p[2] + skins[o + 7]!;
  out[2] = skins[o + 8]! * p[0] + skins[o + 9]! * p[1] + skins[o + 10]! * p[2] + skins[o + 11]!;
  return out;
}

/** Einheitlicher Satz von Clipnamen, den die Darstellung aus dem Simulationszustand wählt. */
export type ClipName = 'idle' | 'ready' | 'walk' | 'run' | 'windup' | 'strike' | 'recover' | 'hit' | 'brace' | 'charge' | 'die1' | 'die2' | 'die3';

export interface ClipDef {
  name: ClipName;
  /** Nominale Dauer in Sekunden (Bildrate 30/s beim Backen). */
  duration: number;
  loop: boolean;
  pose: (t: number, p: Pose) => void;
}

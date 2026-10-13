/**
 * Gemeinsames Skelett für alle menschlichen Figuren (Stufe 3, Schritt C).
 *
 * Modellraum: y nach oben, Blickrichtung +z, Fußsohle bei y = 0, Scheitel bei y = 1.
 * Alle Knochen haben in der Ruhepose die Orientierung der Modellachsen (keine Ruhe-Rotation);
 * dadurch ist die inverse Bind-Matrix eines Knochens nur die Verschiebung um −Ruheposition.
 * Eine Pose besteht aus lokalen Euler-Rotationen (XYZ, Radiant) je Knochen, einer Verschiebung
 * der Hüfte und optionalen Skalierungen (Requisiten wie der Pfeil werden mit Skalierung 0
 * ausgeblendet).
 */

export interface BoneDef {
  name: string;
  parent: string | null;
  /** Ruheposition des Gelenks im Modellraum. */
  pos: [number, number, number];
  /** Gewicht für die Oberkörper-Drehung (Zielen): 0 Beine, 1 Brust und darüber. */
  upper: number;
}

export const HUMAN_BONES: readonly BoneDef[] = [
  { name: 'hips', parent: null, pos: [0, 0.52, 0], upper: 0 },
  { name: 'spine', parent: 'hips', pos: [0, 0.6, 0], upper: 0.5 },
  { name: 'chest', parent: 'spine', pos: [0, 0.72, 0], upper: 1 },
  { name: 'neck', parent: 'chest', pos: [0, 0.86, 0], upper: 1 },
  { name: 'head', parent: 'neck', pos: [0, 0.9, 0], upper: 1 },
  { name: 'upperArmL', parent: 'chest', pos: [-0.14, 0.84, 0], upper: 1 },
  { name: 'forearmL', parent: 'upperArmL', pos: [-0.14, 0.64, 0], upper: 1 },
  { name: 'handL', parent: 'forearmL', pos: [-0.14, 0.46, 0], upper: 1 },
  { name: 'upperArmR', parent: 'chest', pos: [0.14, 0.84, 0], upper: 1 },
  { name: 'forearmR', parent: 'upperArmR', pos: [0.14, 0.64, 0], upper: 1 },
  { name: 'handR', parent: 'forearmR', pos: [0.14, 0.46, 0], upper: 1 },
  { name: 'thighL', parent: 'hips', pos: [-0.075, 0.5, 0], upper: 0 },
  { name: 'shinL', parent: 'thighL', pos: [-0.075, 0.26, 0], upper: 0 },
  { name: 'footL', parent: 'shinL', pos: [-0.075, 0.04, 0], upper: 0 },
  { name: 'thighR', parent: 'hips', pos: [0.075, 0.5, 0], upper: 0 },
  { name: 'shinR', parent: 'thighR', pos: [0.075, 0.26, 0], upper: 0 },
  { name: 'footR', parent: 'shinR', pos: [0.075, 0.04, 0], upper: 0 },
  /** Requisiten: Bogen in der linken Hand; Pfeil liegt auf der Bogenhand (nur beim Spannen sichtbar). */
  { name: 'propL', parent: 'handL', pos: [-0.14, 0.43, 0], upper: 1 },
  { name: 'arrow', parent: 'handL', pos: [-0.14, 0.43, 0], upper: 1 },
  /** Sehnenmitte: Drehung um −90° zieht die Sehne zum Schützen (siehe buildBow). */
  { name: 'nock', parent: 'propL', pos: [-0.152, 0.49, 0], upper: 1 },
  /** Requisite in der rechten Hand (Schwert, Speer; für spätere Einheiten). */
  { name: 'propR', parent: 'handR', pos: [0.14, 0.43, 0], upper: 1 },
];

export const BONE_COUNT = HUMAN_BONES.length;
export const BONE_INDEX: Readonly<Record<string, number>> = Object.fromEntries(HUMAN_BONES.map((b, i) => [b.name, i]));

export function boneIndex(name: string): number {
  const i = BONE_INDEX[name];
  if (i === undefined) throw new Error(`Unbekannter Knochen: ${name}`);
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
  /** Verschiebung der Hüfte gegenüber der Ruhelage (Modellraum). */
  hipOffset: [number, number, number];
}

export function emptyPose(): Pose {
  return { bones: HUMAN_BONES.map(() => ({ rx: 0, ry: 0, rz: 0, s: 1 })), hipOffset: [0, 0, 0] };
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

/** 4×4-Matrix als Float64Array(16), spaltenweise (wie Three.js). */
export type Mat4 = Float64Array;

function mat4Identity(): Mat4 {
  const m = new Float64Array(16);
  m[0] = m[5] = m[10] = m[15] = 1;
  return m;
}

function mat4Mul(a: Mat4, b: Mat4, out: Mat4): Mat4 {
  for (let c = 0; c < 4; c++) {
    for (let r = 0; r < 4; r++) {
      out[c * 4 + r] = a[r]! * b[c * 4]! + a[4 + r]! * b[c * 4 + 1]! + a[8 + r]! * b[c * 4 + 2]! + a[12 + r]! * b[c * 4 + 3]!;
    }
  }
  return out;
}

/** T(t) · R(xyz-Euler) · S(s), spaltenweise. */
function composeTRS(tx: number, ty: number, tz: number, rx: number, ry: number, rz: number, s: number, out: Mat4): Mat4 {
  const cx = Math.cos(rx), sx = Math.sin(rx);
  const cy = Math.cos(ry), sy = Math.sin(ry);
  const cz = Math.cos(rz), sz = Math.sin(rz);
  // Rotation XYZ wie THREE.Euler 'XYZ': R = Rx · Ry · Rz
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
 * Zeilenform (12 Werte: Zeile 0: m00 m01 m02 m03, Zeile 1, Zeile 2) in `out`, Offset bone·12.
 */
export function solvePose(pose: Pose, out: Float32Array): void {
  const n = HUMAN_BONES.length;
  const world: Mat4[] = new Array(n);
  const local = new Float64Array(16);
  for (let i = 0; i < n; i++) {
    const b = HUMAN_BONES[i]!;
    const bp = pose.bones[i]!;
    const parent = b.parent === null ? null : world[BONE_INDEX[b.parent]!]!;
    let tx = b.pos[0], ty = b.pos[1], tz = b.pos[2];
    if (parent) {
      const pb = HUMAN_BONES[BONE_INDEX[b.parent!]!]!;
      tx -= pb.pos[0];
      ty -= pb.pos[1];
      tz -= pb.pos[2];
    } else {
      tx += pose.hipOffset[0];
      ty += pose.hipOffset[1];
      tz += pose.hipOffset[2];
    }
    composeTRS(tx, ty, tz, bp.rx, bp.ry, bp.rz, bp.s, local);
    const w = mat4Identity();
    if (parent) mat4Mul(parent, local, w);
    else w.set(local);
    world[i] = w;
    // Skin = W · T(−rest): nur die Translationsspalte ändert sich
    const rx = b.pos[0], ry = b.pos[1], rz = b.pos[2];
    const o = i * 12;
    out[o + 0] = w[0]!; out[o + 1] = w[4]!; out[o + 2] = w[8]!; out[o + 3] = w[12]! - (w[0]! * rx + w[4]! * ry + w[8]! * rz);
    out[o + 4] = w[1]!; out[o + 5] = w[5]!; out[o + 6] = w[9]!; out[o + 7] = w[13]! - (w[1]! * rx + w[5]! * ry + w[9]! * rz);
    out[o + 8] = w[2]!; out[o + 9] = w[6]!; out[o + 10] = w[10]!; out[o + 11] = w[14]! - (w[2]! * rx + w[6]! * ry + w[10]! * rz);
  }
}

/** Gelenkposition eines Knochens in einer Pose (für Tests und Requisiten). */
export function jointPosition(pose: Pose, bone: string, out: [number, number, number]): [number, number, number] {
  const skins = new Float32Array(HUMAN_BONES.length * 12);
  solvePose(pose, skins);
  const i = boneIndex(bone);
  const p = HUMAN_BONES[i]!.pos;
  const o = i * 12;
  out[0] = skins[o]! * p[0] + skins[o + 1]! * p[1] + skins[o + 2]! * p[2] + skins[o + 3]!;
  out[1] = skins[o + 4]! * p[0] + skins[o + 5]! * p[1] + skins[o + 6]! * p[2] + skins[o + 7]!;
  out[2] = skins[o + 8]! * p[0] + skins[o + 9]! * p[1] + skins[o + 10]! * p[2] + skins[o + 11]!;
  return out;
}

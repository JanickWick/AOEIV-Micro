/**
 * Automatisches Skinning erzeugter Netze (Bild → 3D) auf ein Rig: Gewichte aus dem Abstand zu den
 * Knochensegmenten in einer Anpass-Pose (z. B. A-Pose des Modells), danach wird das Netz in die
 * Ruhepose des Rigs zurückgerechnet, damit die gebackenen Clips unverändert passen.
 */
import * as THREE from 'three';
import { boneIndexOf, emptyPoseFor, resetPose, solvePoseFor, type Pose, type Rig } from './rig';

export interface SkinFitOptions {
  /** Lokale Drehungen je Knochen, mit denen das Rig die Haltung des Modells trifft. */
  fit: Readonly<Record<string, { rx?: number; ry?: number; rz?: number }>>;
  /** Einflussradius je Knochen (Modellraum); fehlende Knochen beeinflussen nichts (Requisiten). */
  radius: Readonly<Record<string, number>>;
  /** Verlängerung der Blattknochen über das Gelenk hinaus (Richtung = Elternsegment). */
  tip?: Readonly<Record<string, [number, number, number]>>;
  /** Glättungsdurchgänge der Gewichte über das Netz. */
  smooth?: number;
}

type V3 = [number, number, number];

function segDist(p: V3, a: V3, b: V3): number {
  const abx = b[0] - a[0], aby = b[1] - a[1], abz = b[2] - a[2];
  const apx = p[0] - a[0], apy = p[1] - a[1], apz = p[2] - a[2];
  const l2 = abx * abx + aby * aby + abz * abz;
  let t = l2 > 1e-12 ? (apx * abx + apy * aby + apz * abz) / l2 : 0;
  t = Math.max(0, Math.min(1, t));
  const dx = apx - abx * t, dy = apy - aby * t, dz = apz - abz * t;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

export function fitPoseFor(rig: Rig, fit: SkinFitOptions['fit']): Pose {
  const pose = resetPose(emptyPoseFor(rig));
  for (const [name, r] of Object.entries(fit)) {
    const b = pose.bones[boneIndexOf(rig, name)]!;
    b.rx = r.rx ?? 0;
    b.ry = r.ry ?? 0;
    b.rz = r.rz ?? 0;
  }
  return pose;
}

/** Gelenkpositionen aller Knochen in einer Pose. */
function jointsFor(rig: Rig, skins: Float32Array): V3[] {
  const out: V3[] = [];
  for (let i = 0; i < rig.count; i++) {
    const p = rig.bones[i]!.pos;
    const o = i * 12;
    out.push([
      skins[o]! * p[0] + skins[o + 1]! * p[1] + skins[o + 2]! * p[2] + skins[o + 3]!,
      skins[o + 4]! * p[0] + skins[o + 5]! * p[1] + skins[o + 6]! * p[2] + skins[o + 7]!,
      skins[o + 8]! * p[0] + skins[o + 9]! * p[1] + skins[o + 10]! * p[2] + skins[o + 11]!,
    ]);
  }
  return out;
}

/**
 * Fügt aSkinIndex/aSkinWeight/aUpper hinzu und bringt position/normal in die Ruhepose.
 * Erwartet indizierte Geometrie mit position und normal.
 */
export function autoSkin(geometry: THREE.BufferGeometry, rig: Rig, opts: SkinFitOptions): void {
  const pose = fitPoseFor(rig, opts.fit);
  const skins = new Float32Array(rig.count * 12);
  solvePoseFor(rig, pose, skins);
  const joints = jointsFor(rig, skins);

  // Segmente: Gelenk → Kind (Mittel der Kinder mit Radius) bzw. Gelenk → Spitze
  const segs: { bone: number; a: V3; b: V3; r: number }[] = [];
  for (let i = 0; i < rig.count; i++) {
    const b = rig.bones[i]!;
    const r = opts.radius[b.name];
    if (r === undefined) continue;
    const kids = rig.bones.filter((c) => c.parent === b.name && opts.radius[c.name] !== undefined);
    let end: V3;
    const tip = opts.tip?.[b.name];
    if (tip) end = [joints[i]![0] + tip[0], joints[i]![1] + tip[1], joints[i]![2] + tip[2]];
    else if (kids.length > 0) {
      end = [0, 0, 0];
      for (const k of kids) {
        const j = joints[boneIndexOf(rig, k.name)]!;
        end[0] += j[0] / kids.length; end[1] += j[1] / kids.length; end[2] += j[2] / kids.length;
      }
    } else end = joints[i]!;
    segs.push({ bone: i, a: joints[i]!, b: end, r });
  }

  const posAttr = geometry.getAttribute('position') as THREE.BufferAttribute;
  const nrmAttr = geometry.getAttribute('normal') as THREE.BufferAttribute;
  const n = posAttr.count;
  const wFull = new Float32Array(n * rig.count);
  const p: V3 = [0, 0, 0];
  for (let v = 0; v < n; v++) {
    p[0] = posAttr.getX(v); p[1] = posAttr.getY(v); p[2] = posAttr.getZ(v);
    let best = Infinity, bestBone = 0, sum = 0;
    for (const s of segs) {
      const d = segDist(p, s.a, s.b);
      const q = d / s.r;
      if (q < best) { best = q; bestBone = s.bone; }
      if (q < 1) {
        const w = (1 - q) * (1 - q);
        wFull[v * rig.count + s.bone] = w;
        sum += w;
      }
    }
    if (sum <= 1e-9) wFull[v * rig.count + bestBone] = 1; // außerhalb aller Radien: nächster Knochen
  }

  // Glätten über Kanten (reduziert Flackerkanten zwischen Einflussbereichen)
  const index = geometry.getIndex();
  const smooth = opts.smooth ?? 2;
  if (index && smooth > 0) {
    const adj: number[][] = Array.from({ length: n }, () => []);
    const idx = index.array;
    for (let t = 0; t < idx.length; t += 3) {
      const a = idx[t]!, b = idx[t + 1]!, c = idx[t + 2]!;
      adj[a]!.push(b, c); adj[b]!.push(a, c); adj[c]!.push(a, b);
    }
    let cur = wFull;
    for (let it = 0; it < smooth; it++) {
      const next = new Float32Array(n * rig.count);
      for (let v = 0; v < n; v++) {
        const nb = adj[v]!;
        const k = nb.length;
        for (let b = 0; b < rig.count; b++) {
          let acc = cur[v * rig.count + b]! * 0.5;
          if (k > 0) {
            let s = 0;
            for (const u of nb) s += cur[u * rig.count + b]!;
            acc += (0.5 * s) / k;
          } else acc *= 2;
          next[v * rig.count + b] = acc;
        }
      }
      cur = next;
    }
    wFull.set(cur);
  }

  // Auf vier stärkste Gewichte begrenzen, normieren, Oberkörperanteil
  const si = new Float32Array(n * 4);
  const sw = new Float32Array(n * 4);
  const up = new Float32Array(n);
  const order = new Array<number>(rig.count);
  for (let v = 0; v < n; v++) {
    for (let b = 0; b < rig.count; b++) order[b] = b;
    const base = v * rig.count;
    order.sort((x, y) => wFull[base + y]! - wFull[base + x]!);
    let sum = 0;
    for (let k = 0; k < 4; k++) sum += wFull[base + order[k]!]!;
    let upper = 0;
    for (let k = 0; k < 4; k++) {
      const b = order[k]!;
      const w = sum > 0 ? wFull[base + b]! / sum : k === 0 ? 1 : 0;
      si[v * 4 + k] = b;
      sw[v * 4 + k] = w;
      upper += w * rig.bones[b]!.upper;
    }
    up[v] = upper;
  }

  // Netz aus der Anpass-Pose in die Ruhepose: v_rest = Σ w · M⁻¹ · v (M = Skinning-Matrix der Anpass-Pose)
  const inv = new Float32Array(rig.count * 12);
  for (let b = 0; b < rig.count; b++) {
    const o = b * 12;
    const m = skins;
    // Rotation transponieren, Verschiebung t' = −Rᵀ t
    const r00 = m[o]!, r01 = m[o + 1]!, r02 = m[o + 2]!, t0 = m[o + 3]!;
    const r10 = m[o + 4]!, r11 = m[o + 5]!, r12 = m[o + 6]!, t1 = m[o + 7]!;
    const r20 = m[o + 8]!, r21 = m[o + 9]!, r22 = m[o + 10]!, t2 = m[o + 11]!;
    inv[o] = r00; inv[o + 1] = r10; inv[o + 2] = r20; inv[o + 3] = -(r00 * t0 + r10 * t1 + r20 * t2);
    inv[o + 4] = r01; inv[o + 5] = r11; inv[o + 6] = r21; inv[o + 7] = -(r01 * t0 + r11 * t1 + r21 * t2);
    inv[o + 8] = r02; inv[o + 9] = r12; inv[o + 10] = r22; inv[o + 11] = -(r02 * t0 + r12 * t1 + r22 * t2);
  }
  const newPos = new Float32Array(n * 3);
  const newNrm = new Float32Array(n * 3);
  for (let v = 0; v < n; v++) {
    const x = posAttr.getX(v), y = posAttr.getY(v), z = posAttr.getZ(v);
    const nx = nrmAttr.getX(v), ny = nrmAttr.getY(v), nz = nrmAttr.getZ(v);
    let px = 0, py = 0, pz = 0, qx = 0, qy = 0, qz = 0;
    for (let k = 0; k < 4; k++) {
      const w = sw[v * 4 + k]!;
      if (w === 0) continue;
      const o = si[v * 4 + k]! * 12;
      px += w * (inv[o]! * x + inv[o + 1]! * y + inv[o + 2]! * z + inv[o + 3]!);
      py += w * (inv[o + 4]! * x + inv[o + 5]! * y + inv[o + 6]! * z + inv[o + 7]!);
      pz += w * (inv[o + 8]! * x + inv[o + 9]! * y + inv[o + 10]! * z + inv[o + 11]!);
      qx += w * (inv[o]! * nx + inv[o + 1]! * ny + inv[o + 2]! * nz);
      qy += w * (inv[o + 4]! * nx + inv[o + 5]! * ny + inv[o + 6]! * nz);
      qz += w * (inv[o + 8]! * nx + inv[o + 9]! * ny + inv[o + 10]! * nz);
    }
    const l = Math.hypot(qx, qy, qz) || 1;
    newPos[v * 3] = px; newPos[v * 3 + 1] = py; newPos[v * 3 + 2] = pz;
    newNrm[v * 3] = qx / l; newNrm[v * 3 + 1] = qy / l; newNrm[v * 3 + 2] = qz / l;
  }
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(newPos, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(newNrm, 3));
  geometry.setAttribute('aSkinIndex', new THREE.Float32BufferAttribute(si, 4));
  geometry.setAttribute('aSkinWeight', new THREE.Float32BufferAttribute(sw, 4));
  geometry.setAttribute('aUpper', new THREE.Float32BufferAttribute(up, 1));
  geometry.computeBoundingSphere();
}

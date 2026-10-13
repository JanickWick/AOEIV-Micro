/**
 * Backt alle Clips in eine Knochen-Matrix-Tabelle: je Bild (Zeile) und Knochen drei Texel
 * (RGBA32F) mit den Zeilen der 3×4-Skinning-Matrix. Der Vertex-Shader liest zwei benachbarte
 * Bilder und interpoliert; Schleifen-Clips bekommen ein zusätzliches Bild, das dem ersten gleicht.
 */
import { HUMAN_CLIPS } from './animClips';
import { HUMAN_RIG } from './humanRig';
import { emptyPoseFor, resetPose, solvePoseFor, type ClipDef, type ClipName, type Rig } from './rig';

export const BAKE_FPS = 30;

export interface BakedClip {
  name: ClipName;
  /** Erste Zeile in der Tabelle. */
  start: number;
  /** Anzahl Bilder ohne das Wiederholungsbild; der Zeitparameter 0..1 bildet auf start..start+span ab. */
  span: number;
  loop: boolean;
  duration: number;
}

export interface BakedAnimation {
  /** Texelbreite: BONE_COUNT·3 auf eine Zweierpotenz aufgerundet. */
  width: number;
  height: number;
  data: Float32Array;
  clips: BakedClip[];
  byName: Partial<Record<ClipName, BakedClip>>;
  /** Clip nach Namen, mit Rückfall auf 'idle'. */
  get(name: ClipName): BakedClip;
}

export function bakeHumanClips(): BakedAnimation {
  return bakeClips(HUMAN_RIG, HUMAN_CLIPS);
}

export function bakeClips(rig: Rig, clipDefs: readonly ClipDef[]): BakedAnimation {
  const BONE_COUNT = rig.count;
  const texelsPerRow = BONE_COUNT * 3;
  let width = 1;
  while (width < texelsPerRow) width *= 2;
  const clips: BakedClip[] = [];
  let rows = 0;
  for (const c of clipDefs) {
    const span = Math.max(1, Math.round(c.duration * BAKE_FPS));
    clips.push({ name: c.name, start: rows, span, loop: c.loop, duration: c.duration });
    rows += span + 1; // Schlussbild (t = 1 bzw. Wiederholung von t = 0)
  }
  const height = rows + 1; // Schutzzeile
  const data = new Float32Array(width * height * 4);
  const pose = emptyPoseFor(rig);
  const skins = new Float32Array(BONE_COUNT * 12);
  for (let ci = 0; ci < clipDefs.length; ci++) {
    const def = clipDefs[ci]!;
    const bc = clips[ci]!;
    for (let f = 0; f <= bc.span; f++) {
      const t = bc.loop ? (f % bc.span) / bc.span : f / bc.span;
      resetPose(pose);
      def.pose(t, pose);
      solvePoseFor(rig, pose, skins);
      const row = bc.start + f;
      for (let bI = 0; bI < BONE_COUNT; bI++) {
        for (let r = 0; r < 3; r++) {
          const o = (row * width + bI * 3 + r) * 4;
          data[o] = skins[bI * 12 + r * 4]!;
          data[o + 1] = skins[bI * 12 + r * 4 + 1]!;
          data[o + 2] = skins[bI * 12 + r * 4 + 2]!;
          data[o + 3] = skins[bI * 12 + r * 4 + 3]!;
        }
      }
    }
  }
  // Schutzzeile = Ruhepose
  resetPose(pose);
  solvePoseFor(rig, pose, skins);
  for (let bI = 0; bI < BONE_COUNT; bI++) {
    for (let r = 0; r < 3; r++) {
      const o = ((height - 1) * width + bI * 3 + r) * 4;
      data.set(skins.subarray(bI * 12 + r * 4, bI * 12 + r * 4 + 4), o);
    }
  }
  const byName = Object.fromEntries(clips.map((c) => [c.name, c])) as Partial<Record<ClipName, BakedClip>>;
  const idle = byName.idle ?? clips[0]!;
  return { width, height, data, clips, byName, get: (name) => byName[name] ?? idle };
}

/** Zeile (mit Nachkommateil) für Clip und Zeitparameter t ∈ [0,1]. */
export function clipRow(c: BakedClip, t: number): number {
  const tt = c.loop ? t - Math.floor(t) : Math.min(1, Math.max(0, t));
  return c.start + tt * c.span;
}

/**
 * Gemeinsames Skelett für alle menschlichen Figuren (Stufe 3, Schritt C).
 * Fußsohle bei y = 0, Scheitel bei y = 1, Blick +z. Siehe rig.ts für Posen und Kinematik.
 */
import { boneIndexOf, emptyPoseFor, jointPositionFor, makeRig, solvePoseFor, type BoneDef, type Pose } from './rig';

export { mixPose, resetPose } from './rig';
export type { BonePose, Pose } from './rig';

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
  /** Requisiten: Bogen/Armbrust/Schild in der linken Hand; Pfeil liegt auf der Bogenhand. */
  { name: 'propL', parent: 'handL', pos: [-0.14, 0.43, 0], upper: 1 },
  { name: 'arrow', parent: 'handL', pos: [-0.14, 0.43, 0], upper: 1 },
  /** Sehnenmitte: Drehung um −90° zieht die Sehne zum Schützen (siehe buildBow). */
  { name: 'nock', parent: 'propL', pos: [-0.152, 0.49, 0], upper: 1 },
  /** Requisite in der rechten Hand (Schwert, Speer, Lanze). */
  { name: 'propR', parent: 'handR', pos: [0.14, 0.43, 0], upper: 1 },
];

export const HUMAN_RIG = makeRig('human', HUMAN_BONES);
export const BONE_COUNT = HUMAN_RIG.count;
export const BONE_INDEX = HUMAN_RIG.index;

export function boneIndex(name: string): number {
  return boneIndexOf(HUMAN_RIG, name);
}

export function emptyPose(): Pose {
  return emptyPoseFor(HUMAN_RIG);
}

export function solvePose(pose: Pose, out: Float32Array): void {
  solvePoseFor(HUMAN_RIG, pose, out);
}

export function jointPosition(pose: Pose, bone: string, out: [number, number, number]): [number, number, number] {
  return jointPositionFor(HUMAN_RIG, pose, bone, out);
}

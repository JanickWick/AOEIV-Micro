/**
 * Verzeichnis der erzeugten Figurmodelle (Bild → 3D, siehe scripts/gen-model.mjs und
 * scripts/mesh/process.py) mit den Angaben, wie das gemeinsame Skelett darauf passt.
 * Dateien liegen unter public/models/<name>.glb (Geometrie + Albedo) und <name>-mask.png.
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { autoSkin, type SkinFitOptions } from './autoSkin';
import { HUMAN_RIG } from './humanRig';
import type { Rig } from './rig';

export interface GeneratedModelDef {
  file: string;
  mask: string;
  rig: Rig;
  skin: SkinFitOptions;
}

/** Einflussradien des menschlichen Skeletts (Modellraum, Höhe 1). Requisitenknochen fehlen bewusst. */
export const HUMAN_RADII: Readonly<Record<string, number>> = {
  hips: 0.2, spine: 0.2, chest: 0.2, neck: 0.09, head: 0.16,
  upperArmL: 0.085, forearmL: 0.075, handL: 0.075,
  upperArmR: 0.085, forearmR: 0.075, handR: 0.075,
  thighL: 0.12, shinL: 0.09, footL: 0.09,
  thighR: 0.12, shinR: 0.09, footR: 0.09,
};

export const HUMAN_TIPS: Readonly<Record<string, [number, number, number]>> = {
  head: [0, 0.12, 0],
  handL: [-0.04, -0.07, 0.02],
  handR: [0.04, -0.07, 0.02],
  footL: [0, 0, 0.1],
  footR: [0, 0, 0.1],
};

/** A-Pose des erzeugten Bogenschützen: Arme etwa 27° vom Körper weg, Hände leicht nach vorn. */
const A_POSE: SkinFitOptions['fit'] = {
  upperArmL: { rz: -0.47, rx: -0.2 },
  upperArmR: { rz: 0.47, rx: -0.2 },
};

export const GENERATED_MODELS: Readonly<Record<string, GeneratedModelDef>> = {
  archer: { file: 'models/archer.glb', mask: 'models/archer-mask.png', rig: HUMAN_RIG, skin: { fit: A_POSE, radius: HUMAN_RADII, tip: HUMAN_TIPS, smooth: 2 } },
};

export interface LoadedGeneratedModel {
  geometry: THREE.BufferGeometry;
  albedo: THREE.Texture;
  mask: THREE.Texture;
  vertices: number;
  triangles: number;
}

/** Lädt ein erzeugtes Modell, skinnt es automatisch und liefert Geometrie samt Texturen. */
export async function loadGeneratedModel(def: GeneratedModelDef, base = ''): Promise<LoadedGeneratedModel> {
  const gltf = await new GLTFLoader().loadAsync(base + def.file);
  let mesh: THREE.Mesh | null = null;
  gltf.scene.updateMatrixWorld(true);
  gltf.scene.traverse((o) => {
    if ((o as THREE.Mesh).isMesh && !mesh) mesh = o as THREE.Mesh;
  });
  if (!mesh) throw new Error(`Kein Netz in ${def.file}`);
  const m = mesh as THREE.Mesh;
  const geometry = m.geometry.clone();
  geometry.applyMatrix4(m.matrixWorld);
  if (!geometry.getAttribute('normal')) geometry.computeVertexNormals();
  autoSkin(geometry, def.rig, def.skin);
  const mat = m.material as THREE.MeshStandardMaterial;
  const albedo = mat.map ?? new THREE.Texture();
  albedo.colorSpace = THREE.SRGBColorSpace;
  albedo.anisotropy = 4;
  const mask = new THREE.TextureLoader().load(base + def.mask);
  mask.colorSpace = THREE.NoColorSpace;
  mask.flipY = false; // glTF-Texturkoordinaten
  return {
    geometry, albedo, mask,
    vertices: geometry.getAttribute('position').count,
    triangles: (geometry.getIndex()?.count ?? geometry.getAttribute('position').count) / 3,
  };
}

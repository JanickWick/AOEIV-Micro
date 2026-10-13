/**
 * Verzeichnis der erzeugten Figurmodelle (Bild → 3D, siehe scripts/gen-model.mjs und
 * scripts/mesh/process.py) mit den Angaben, wie das gemeinsame Skelett darauf passt.
 * Dateien liegen unter public/models/<name>.glb (Geometrie + Albedo) und <name>-mask.png.
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { autoSkin, type SkinFitOptions } from './autoSkin';
import { HUMAN_RIG } from './humanRig';
import { HORSE_RADII, HORSE_RIG, HORSE_TIPS } from './horseRig';
import { MANGONEL_RADII, MANGONEL_TIPS, SIEGE_RIG, SPRINGALD_RADII, SPRINGALD_TIPS } from './siegeRig';
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

/** A-Pose der erzeugten Menschenmodelle: Arme etwa 27° vom Körper weg, Hände leicht nach vorn
 * (gemessen mit scripts/mesh/measure.py, bei allen Blättern gleich). */
const A_POSE: SkinFitOptions['fit'] = {
  upperArmL: { rz: -0.47, rx: -0.2 },
  upperArmR: { rz: 0.47, rx: -0.2 },
};
const HUMAN_SKIN: SkinFitOptions = { fit: A_POSE, radius: HUMAN_RADII, tip: HUMAN_TIPS, smooth: 2 };
const human = (name: string): GeneratedModelDef => ({ file: `models/${name}.glb`, mask: `models/${name}-mask.png`, rig: HUMAN_RIG, skin: HUMAN_SKIN });

export const GENERATED_MODELS: Readonly<Record<string, GeneratedModelDef>> = {
  archer: human('archer'),
  spearman: human('spearman'),
  'man-at-arms': human('man-at-arms'),
  crossbowman: human('crossbowman'),
  'knight-rider': human('knight-rider'),
  horse: { file: 'models/horse.glb', mask: 'models/horse-mask.png', rig: HORSE_RIG, skin: { fit: {}, radius: HORSE_RADII, tip: HORSE_TIPS, smooth: 2 } },
  mangonel: { file: 'models/mangonel.glb', mask: 'models/mangonel-mask.png', rig: SIEGE_RIG, skin: { fit: {}, radius: MANGONEL_RADII, tip: MANGONEL_TIPS, smooth: 1 } },
  springald: { file: 'models/springald.glb', mask: 'models/springald-mask.png', rig: SIEGE_RIG, skin: { fit: {}, radius: SPRINGALD_RADII, tip: SPRINGALD_TIPS, smooth: 1 } },
};

export interface LoadedGeneratedModel {
  geometry: THREE.BufferGeometry;
  albedo: THREE.Texture;
  mask: THREE.Texture;
  vertices: number;
  triangles: number;
}

const gltfCache = new Map<string, Promise<Awaited<ReturnType<GLTFLoader['loadAsync']>>>>();

/** Lädt ein erzeugtes Modell, skinnt es automatisch und liefert Geometrie samt Texturen. */
export async function loadGeneratedModel(def: GeneratedModelDef, base = ''): Promise<LoadedGeneratedModel> {
  const url = base + def.file;
  let pending = gltfCache.get(url);
  if (!pending) {
    pending = loadGltf(def, base);
    gltfCache.set(url, pending);
  }
  const gltf = await pending;
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

function loadGltf(def: GeneratedModelDef, base: string): Promise<Awaited<ReturnType<GLTFLoader['loadAsync']>>> {
  return loadGltfFile(base + def.file, base);
}

/** Lädt eine .glb-Datei; fällt auf <datei>.b64.json zurück, wenn der Hoster keine .glb ausliefert. */
export async function loadGltfFile(url: string, base = ''): Promise<Awaited<ReturnType<GLTFLoader['loadAsync']>>> {
  const loader = new GLTFLoader();
  let gltf: Awaited<ReturnType<GLTFLoader['loadAsync']>>;
  try {
    gltf = await loader.loadAsync(url);
  } catch (e) {
    // Rückfall für Hoster ohne .glb: dieselben Bytes Base64-kodiert in <datei>.b64.json ({"glb": "..."})
    const res = await fetch(url + '.b64.json');
    if (!res.ok) throw e;
    const { glb } = (await res.json()) as { glb: string };
    const bin = Uint8Array.from(atob(glb), (c) => c.charCodeAt(0));
    gltf = await loader.parseAsync(bin.buffer, base);
  }
  return gltf;
}

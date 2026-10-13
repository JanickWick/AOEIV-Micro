/**
 * Landschaft (Stufe 3, H4): Bäume, Felsen, Büsche und Häuser als erzeugte 3D-Modelle (Bild → 3D,
 * siehe scripts/mesh/process.py), gezeichnet als Instanzen je Modell. Bäume wiegen leicht im Wind
 * (reine Vertex-Verschiebung im Shader, unabhängig von der Simulation).
 */
import * as THREE from 'three';
import type { Decor, DecorKind } from '../../sim/decor';
import type { World } from '../../sim/types';
import { loadGltfFile } from './skel/generatedModels';

interface SceneryModelDef {
  file: string;
  /** Höhe in Tiles bei Deko-Skalierung 1 (Modelle sind auf Höhe 1 normiert). */
  height: number;
  /** Wiegt im Wind (Bäume, Büsche). */
  sway: number;
}

/** Modelle je Deko-Art; mehrere Einträge = Varianten, Wahl aus der Position. */
export const SCENERY_MODELS: Readonly<Record<DecorKind, readonly SceneryModelDef[]>> = {
  tree: [
    { file: 'models/oak.glb', height: 3.4, sway: 0.035 },
    { file: 'models/oak.glb', height: 3.0, sway: 0.035 },
    { file: 'models/pine.glb', height: 4.2, sway: 0.025 },
  ],
  rock: [{ file: 'models/boulder.glb', height: 1.0, sway: 0 }],
  bush: [{ file: 'models/bush.glb', height: 0.8, sway: 0.05 }],
  building: [{ file: 'models/house.glb', height: 1, sway: 0 }],
};

interface LoadedScenery {
  geometry: THREE.BufferGeometry;
  material: THREE.MeshStandardMaterial;
  /** Maße des normierten Modells (Breite, Höhe, Tiefe). */
  size: THREE.Vector3;
}

const cache = new Map<string, Promise<LoadedScenery>>();

function loadScenery(file: string, base: string, sway: number, time: { value: number }): Promise<LoadedScenery> {
  const key = `${base}${file}|${sway}`;
  let p = cache.get(key);
  if (!p) {
    p = loadGltfFile(base + file, base).then((gltf) => {
      let mesh: THREE.Mesh | null = null;
      gltf.scene.updateMatrixWorld(true);
      gltf.scene.traverse((o) => {
        if ((o as THREE.Mesh).isMesh && !mesh) mesh = o as THREE.Mesh;
      });
      if (!mesh) throw new Error(`Kein Netz in ${file}`);
      const m = mesh as THREE.Mesh;
      const geometry = m.geometry.clone();
      geometry.applyMatrix4(m.matrixWorld);
      if (!geometry.getAttribute('normal')) geometry.computeVertexNormals();
      geometry.computeBoundingBox();
      const size = new THREE.Vector3();
      geometry.boundingBox!.getSize(size);
      const src = m.material as THREE.MeshStandardMaterial;
      const material = new THREE.MeshStandardMaterial({ map: src.map, roughness: 0.95, metalness: 0 });
      if (material.map) {
        material.map.colorSpace = THREE.SRGBColorSpace;
        material.map.anisotropy = 4;
      }
      if (sway > 0) withSway(material, sway, time);
      return { geometry, material, size };
    });
    cache.set(key, p);
  }
  return p;
}

/** Windbewegung: Verschiebung wächst quadratisch mit der Höhe, Phase aus der Instanzposition. */
function withSway(mat: THREE.MeshStandardMaterial, amount: number, time: { value: number }): void {
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = time;
    shader.uniforms.uSway = { value: amount };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;\nuniform float uSway;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        {
          vec2 ip = vec2(instanceMatrix[3].x, instanceMatrix[3].z);
          float ph = ip.x * 0.7 + ip.y * 1.3;
          float hh = max(0.0, position.y);
          float w = sin(uTime * 1.1 + ph) * 0.7 + sin(uTime * 2.3 + ph * 1.7) * 0.3;
          transformed.x += w * uSway * hh * hh;
          transformed.z += cos(uTime * 0.9 + ph) * uSway * 0.4 * hh * hh;
        }`);
  };
  mat.customProgramCacheKey = () => `sway-${amount}`;
}

export class SceneryRenderer {
  readonly group = new THREE.Group();
  private readonly time = { value: 0 };
  private world: World | null = null;
  private build = 0;
  private dummy = new THREE.Object3D();
  private color = new THREE.Color();

  constructor(private readonly base = '') {}

  /** Deko einer neuen Welt aufbauen (asynchron, sobald die Modelle geladen sind). */
  setWorld(world: World): void {
    if (this.world === world) return;
    this.world = world;
    const id = ++this.build;
    this.group.clear();
    const groups = new Map<string, { def: SceneryModelDef; items: Decor[] }>();
    for (const d of world.decor) {
      const variants = SCENERY_MODELS[d.kind];
      const vi = Math.floor(hash(d.pos.x, d.pos.y) * variants.length);
      const def = variants[vi]!;
      const key = `${def.file}|${def.height}|${def.sway}`;
      let g = groups.get(key);
      if (!g) groups.set(key, (g = { def, items: [] }));
      g.items.push(d);
    }
    for (const g of groups.values()) {
      loadScenery(g.def.file, this.base, g.def.sway, this.time)
        .then((loaded) => {
          if (this.build !== id) return;
          this.group.add(this.makeInstances(loaded, g.def, g.items));
        })
        .catch((e: unknown) => console.warn('Landschaftsmodell fehlt:', g.def.file, e));
    }
  }

  private makeInstances(loaded: LoadedScenery, def: SceneryModelDef, items: readonly Decor[]): THREE.InstancedMesh {
    const mesh = new THREE.InstancedMesh(loaded.geometry, loaded.material, items.length);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    items.forEach((d, i) => {
      this.dummy.position.set(d.pos.x, 0, d.pos.y);
      this.dummy.rotation.set(0, d.rotation, 0);
      if (d.kind === 'building') {
        // Haus: Grundfläche aus den Daten, Höhe proportional zur Breite
        const w = d.size?.w ?? 3;
        const h = d.size?.h ?? 3;
        this.dummy.scale.set(w / Math.max(0.2, loaded.size.x), Math.min(w, h) * 0.95, h / Math.max(0.2, loaded.size.z));
      } else {
        this.dummy.scale.setScalar(def.height * d.scale);
      }
      this.dummy.updateMatrix();
      mesh.setMatrixAt(i, this.dummy.matrix);
      // Leichte Farbvariation je Instanz gegen Gleichförmigkeit
      const k = hash(d.pos.y, d.pos.x) - 0.5;
      this.color.setHSL(0, 0, 0.5).offsetHSL(k * 0.02, 0, k * 0.08).multiplyScalar(2);
      mesh.setColorAt(i, this.color);
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    return mesh;
  }

  update(nowMs: number): void {
    this.time.value = nowMs / 1000;
  }

  dispose(): void {
    this.build++;
    this.group.clear();
  }
}

function hash(x: number, y: number): number {
  const v = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
  return v - Math.floor(v);
}

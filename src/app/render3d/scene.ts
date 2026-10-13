/**
 * Three.js-Szene: Gelände aus erzeugten Bodentexturen (Splat-Mischung, terrain.ts), Deko (Bäume, Felsen, Büsche, Gebäude-
 * Kulisse) als Instanzen, Einheiten als Platzhalter-Instanzen mit Teamfarbe, Auswahlringe,
 * warmes Tageslicht mit weichen Schatten. Alle Grafiken sind hier erzeugt (keine Fremdassets).
 */
import * as THREE from 'three';
import { lerp, type Vec2 } from '../../sim/math';
import type { SimEvent, UnitId, World } from '../../sim/types';
import type { Camera3D } from '../camera3d';
import { EffectsRenderer } from './effects';
import { SkinnedUnitRenderer } from './skel/skinnedUnits';
import { SceneryRenderer } from './scenery';
import { loadTerrainTextures, makeTerrainMaterial, type TerrainTextures } from './terrain';
import type { QualityLevel } from '../settings';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

const MAX_UNITS = 512;

export interface SceneOptions {
  quality: QualityLevel;
}

/** Was die drei Qualitätsstufen einstellen. */
export const QUALITY_PRESETS: Record<QualityLevel, { shadows: boolean; shadowMap: number; soft: boolean; pixelRatio: number; msaa: number; ao: boolean }> = {
  low: { shadows: false, shadowMap: 1024, soft: false, pixelRatio: 1, msaa: 0, ao: false },
  medium: { shadows: true, shadowMap: 2048, soft: false, pixelRatio: 1.5, msaa: 4, ao: false },
  high: { shadows: true, shadowMap: 4096, soft: true, pixelRatio: 2, msaa: 4, ao: true },
};

export class Scene3D {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  private sun: THREE.DirectionalLight;
  private ground: THREE.Mesh | null = null;
  private outer: THREE.Mesh;
  private scenery = new SceneryRenderer();
  private terrainTex: TerrainTextures | null = null;
  readonly skinned = new SkinnedUnitRenderer();
  readonly effects = new EffectsRenderer();
  private quality: QualityLevel;
  private rings: THREE.InstancedMesh;
  private hoverRing: THREE.Mesh;
  private dummy = new THREE.Object3D();
  private color = new THREE.Color();
  private worldRef: World | null = null;
  private lastDecorWorld: World | null = null;
  /** Nachbearbeitung (Kantenglättung per MSAA-Ziel, Umgebungsverdunklung auf »Hoch«); null = direkt zeichnen. */
  private composer: EffectComposer | null = null;
  private composerCam: THREE.Camera | null = null;
  private aoPass: GTAOPass | null = null;
  private size = { w: 1, h: 1 };

  constructor(canvas: HTMLCanvasElement, opts: SceneOptions) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.quality = opts.quality;
    const q = QUALITY_PRESETS[opts.quality];
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, q.pixelRatio));
    this.renderer.shadowMap.enabled = q.shadows;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.scene.background = new THREE.Color(0x0b0f0a);
    this.scene.fog = new THREE.Fog(0xcdd6c2, 140, 320);

    const hemi = new THREE.HemisphereLight(0xdfe9ff, 0x6b5a3a, 0.75);
    this.scene.add(hemi);
    this.sun = new THREE.DirectionalLight(0xfff1d6, 2.4);
    this.sun.castShadow = q.shadows;
    this.sun.shadow.mapSize.set(q.shadowMap, q.shadowMap);
    this.sun.shadow.camera.near = 1;
    this.sun.shadow.camera.far = 200;
    this.sun.shadow.bias = -0.0005;
    this.sun.shadow.normalBias = 0.02;
    this.sun.shadow.radius = q.soft ? 3 : 1;
    this.scene.add(this.sun);
    this.scene.add(this.sun.target);

    // Boden außerhalb der Karte
    this.terrainTex ??= loadTerrainTextures();
    const outerTex = new THREE.TextureLoader().load('textures/terrain/grass.jpg');
    outerTex.colorSpace = THREE.SRGBColorSpace;
    outerTex.wrapS = outerTex.wrapT = THREE.RepeatWrapping;
    outerTex.repeat.set(200, 200);
    this.outer = new THREE.Mesh(new THREE.PlaneGeometry(1000, 1000), new THREE.MeshStandardMaterial({ map: outerTex, color: 0xd8dcc8, roughness: 1 }));
    this.outer.rotation.x = -Math.PI / 2;
    this.outer.position.y = -0.05;
    this.outer.receiveShadow = true;
    this.scene.add(this.outer);
    this.scene.add(this.scenery.group);

    this.scene.add(this.skinned.group);
    this.scene.add(this.effects.group);

    const ringGeo = new THREE.RingGeometry(0.44, 0.52, 28);
    ringGeo.rotateX(-Math.PI / 2);
    this.rings = new THREE.InstancedMesh(ringGeo, new THREE.MeshBasicMaterial({ color: 0x86efac, transparent: true, opacity: 0.9 }), MAX_UNITS);
    this.rings.count = 0;
    this.rings.position.y = 0.02;
    this.scene.add(this.rings);
    this.hoverRing = new THREE.Mesh(ringGeo.clone(), new THREE.MeshBasicMaterial({ color: 0xfca5a5, transparent: true, opacity: 0.9 }));
    this.hoverRing.visible = false;
    this.hoverRing.position.y = 0.02;
    this.scene.add(this.hoverRing);
  }

  setQuality(level: QualityLevel): void {
    if (level === this.quality) return;
    this.quality = level;
    const q = QUALITY_PRESETS[level];
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, q.pixelRatio));
    this.sun.shadow.radius = q.soft ? 3 : 1;
    this.sun.shadow.mapSize.set(q.shadowMap, q.shadowMap);
    this.disposeComposer();
    if (this.sun.shadow.map) {
      this.sun.shadow.map.dispose();
      this.sun.shadow.map = null;
    }
    this.setShadows(q.shadows);
  }

  get qualityLevel(): QualityLevel {
    return this.quality;
  }

  setShadows(on: boolean): void {
    this.renderer.shadowMap.enabled = on;
    this.sun.castShadow = on;
    this.skinned.setShadows(on);
    this.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.material) (Array.isArray(m.material) ? m.material : [m.material]).forEach((x) => (x.needsUpdate = true));
    });
  }

  resize(w: number, h: number): void {
    this.size = { w, h };
    this.renderer.setSize(w, h, false);
    this.composer?.setSize(w, h);
  }

  /** Nachbearbeitungskette für die aktuelle Qualität und Kamera (bei Bedarf neu). */
  private ensureComposer(cam: THREE.Camera): EffectComposer | null {
    const q = QUALITY_PRESETS[this.quality];
    if (q.msaa === 0 && !q.ao) return null;
    if (this.composer && this.composerCam === cam) return this.composer;
    this.disposeComposer();
    const pr = this.renderer.getPixelRatio();
    const target = new THREE.WebGLRenderTarget(Math.max(1, Math.round(this.size.w * pr)), Math.max(1, Math.round(this.size.h * pr)), { type: THREE.HalfFloatType, samples: q.msaa });
    const composer = new EffectComposer(this.renderer, target);
    composer.addPass(new RenderPass(this.scene, cam));
    if (q.ao) {
      const ao = new GTAOPass(this.scene, cam, this.size.w, this.size.h);
      ao.output = GTAOPass.OUTPUT.Default;
      ao.updateGtaoMaterial({ radius: 0.6, distanceExponent: 1, thickness: 1, distanceFallOff: 1, scale: 1, samples: 12, screenSpaceRadius: false });
      ao.blendIntensity = 0.7;
      composer.addPass(ao);
      this.aoPass = ao;
    }
    composer.addPass(new OutputPass());
    this.composer = composer;
    this.composerCam = cam;
    return composer;
  }

  private disposeComposer(): void {
    this.composer?.dispose();
    this.aoPass?.dispose();
    this.composer = null;
    this.aoPass = null;
    this.composerCam = null;
  }

  /** Gelände und Deko für eine neue Welt aufbauen. */
  setWorld(world: World): void {
    this.worldRef = world;
    if (this.lastDecorWorld === world) return;
    this.lastDecorWorld = world;
    if (this.ground) {
      this.scene.remove(this.ground);
      (this.ground.material as THREE.Material).dispose();
      this.ground.geometry.dispose();
    }
    this.terrainTex ??= loadTerrainTextures();
    const geo = new THREE.PlaneGeometry(world.map.width, world.map.height, 1, 1);
    geo.rotateX(-Math.PI / 2);
    geo.translate(world.map.width / 2, 0, world.map.height / 2);
    this.ground = new THREE.Mesh(geo, makeTerrainMaterial(world, this.terrainTex));
    this.ground.receiveShadow = true;
    this.scene.add(this.ground);
    this.scenery.setWorld(world);
  }

  /** Spielereignisse des Frames (Partikel) und Bodenmarker annehmen. */
  consumeEvents(world: World, events: readonly SimEvent[]): void {
    this.effects.consume(world, events);
  }

  noteImpacts(world: World, before: readonly { id: number; targetPos: Vec2; splashRadius: number }[]): void {
    this.effects.noteImpacts(world, before);
  }

  addMarker(pos: Vec2, kind: 'move' | 'attack' | 'queue', nowMs: number): void {
    this.effects.addMarker(pos, kind, nowMs);
  }

  render(world: World, cam: Camera3D, alpha: number, selection: ReadonlySet<UnitId>, hoverId: UnitId | null, nowMs: number): void {
    if (this.worldRef !== world) this.setWorld(world);
    // Sonne folgt der Kamera, damit die Schattenkarte den sichtbaren Bereich abdeckt
    const c = cam.center;
    this.sun.position.set(c.x - 30, 60, c.y - 20);
    this.sun.target.position.set(c.x, 0, c.y);
    this.sun.target.updateMatrixWorld();
    const sc = this.sun.shadow.camera;
    const half = Math.max(30, cam.distance * 0.9);
    sc.left = -half;
    sc.right = half;
    sc.top = half;
    sc.bottom = -half;
    sc.updateProjectionMatrix();
    this.outer.position.set(c.x, -0.05, c.y);

    this.skinned.update(world, alpha, nowMs);
    this.scenery.update(nowMs);
    this.effects.update(world, alpha, nowMs, cam.three.quaternion);
    let ringCount = 0;
    this.hoverRing.visible = false;
    for (const u of world.units) {
      const dead = !u.alive;
      if (dead) continue;
      const p = lerp(u.prevPos, u.pos, alpha);
      if (ringCount >= MAX_UNITS) break;
      if (selection.has(u.id)) {
        this.dummy.rotation.set(0, 0, 0);
        this.dummy.scale.setScalar(Math.max(0.3, u.radius * 2.1));
        this.dummy.position.y = 0;
        this.dummy.updateMatrix();
        this.rings.setMatrixAt(ringCount++, this.dummy.matrix);
      }
      if (!dead && hoverId === u.id) {
        this.hoverRing.visible = true;
        this.hoverRing.position.set(p.x, 0.02, p.y);
        this.hoverRing.scale.setScalar(Math.max(0.3, u.radius * 2.1));
      }
    }
    this.rings.count = ringCount;
    this.rings.instanceMatrix.needsUpdate = true;
    // Zähler je Bild (nicht je Durchgang) zurücksetzen, damit renderInfo die ganze Kette umfasst
    this.renderer.info.autoReset = false;
    this.renderer.info.reset();
    const composer = this.ensureComposer(cam.three);
    if (composer) composer.render();
    else this.renderer.render(this.scene, cam.three);
  }

  /** Zeichenaufrufe und Dreiecke des letzten Bildes (renderer.info, hardwareunabhängig). */
  get renderInfo(): { calls: number; triangles: number } {
    const r = this.renderer.info.render;
    return { calls: r.calls, triangles: r.triangles };
  }

  dispose(): void {
    this.disposeComposer();
    this.renderer.dispose();
  }
}

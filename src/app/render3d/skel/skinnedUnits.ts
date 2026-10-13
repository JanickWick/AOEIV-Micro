/**
 * Geskinnte Einheiten (Stufe 3): je Modell ein InstancedMesh, Skinning im Vertex-Shader aus einer
 * gebackenen Knochen-Textur, Überblenden zwischen zwei Clips, Oberkörperdrehung zum Ziel und
 * Teamfarbe über eine Maskentextur. Eine Einheit besteht aus einem oder mehreren Teilen (Reiter auf
 * Pferd), die denselben Animationszustand teilen. Alle Animationszustände kommen aus der Simulation:
 * Laufphase aus der Strecke, Spannen/Lösen/Nachlauf aus den Angriffs-Ticks, Treffer aus
 * lastHitTick, Tod aus diedTick. Nichts hier verändert die Simulation.
 */
import * as THREE from 'three';
import { lerp, lerpAngle } from '../../../sim/math';
import type { UnitId, UnitState, World } from '../../../sim/types';
import { PLAYER_COLORS_HEX, unitHeight } from '../../unitVisual';
import type { ClipDef, ClipName, Rig } from './rig';
import { bakeClips, clipRow, type BakedAnimation } from './animBake';
import { buildArcherBody, buildArcherProps, buildCrossbowProps, buildSpearProps, buildSwordProps, type HumanModel } from './humanModels';
import { GENERATED_MODELS, loadGeneratedModel, type GeneratedModelDef } from './generatedModels';
import { makeHumanClips } from './humanClipSets';
import { HUMAN_RIG } from './humanRig';
import { HORSE_RIG, SADDLE } from './horseRig';
import { HORSE_CLIPS } from './horseClips';
import { MANGONEL_CLIPS, SIEGE_RIG, SPRINGALD_CLIPS } from './siegeRig';
import atlasJson from '../../../data/atlas/archer.json';
import type { AtlasLayout } from './meshBuilder';

const MAX = 512;
/** Übergangszeit zwischen Clips (s). */
const BLEND_S = 0.14;
const RUN_SPEED = 1.6; // Tiles/s, darüber Rennen

interface Visual {
  clip: ClipName;
  /** Zeitparameter des aktiven Clips (0..1, bei Schleifen fortlaufend). */
  t: number;
  prevClip: ClipName;
  prevT: number;
  /** Zeitpunkt des letzten Clipwechsels (ms), für das Überblenden. */
  switchedMs: number;
  walkPhase: number;
  lastX: number;
  lastY: number;
  yaw: number;
  twist: number;
  prevPhase: 'idle' | 'windup' | 'recovery';
  cancelAtMs: number;
  cancelT: number;
  /** Pro Einheit feste Variation: Größe, Phasenversatz, Todesvariante. */
  scale: number;
  phase: number;
  dieVariant: ClipName;
}

/** Ein Teil einer Einheit: Modell (Rig + Clips + Geometriequelle) und optional Aufsitzpunkt. */
export interface PartSpec {
  /** Schlüssel des Modells; gleiche Schlüssel teilen sich ein InstancedMesh. */
  key: string;
  rig: Rig;
  clips: readonly ClipDef[];
  generated?: GeneratedModelDef;
  /** Prozeduraler Körper, solange das erzeugte Modell lädt (oder fehlt). */
  fallback?: (atlas: AtlasLayout) => HumanModel;
  /** Handgebaute Requisiten aus dem Atlas (eigenes InstancedMesh, gleiche Instanzdaten). */
  props?: (atlas: AtlasLayout) => HumanModel;
  /** Aufsitzen auf Teil 0: Punkt im Modellraum des Trägers, Hüfthöhe und Größe des Reiters. */
  mount?: { at: [number, number, number]; hip: number; scale: number };
}

export interface UnitSpec {
  parts: PartSpec[];
  /** Gehzyklus in Körperhöhen (Schritt, Rennen). */
  cycle: [number, number];
  /** Rennen mit Ziel wird als Sturmangriff gezeigt. */
  canCharge?: boolean;
}

const horsePart: PartSpec = { key: 'horse', rig: HORSE_RIG, clips: HORSE_CLIPS, generated: GENERATED_MODELS.horse };
const RIDER_MOUNT = { at: SADDLE, hip: 0.52, scale: 0.75 };

/** Zuordnung Einheitentyp → Teile. */
export const UNIT_SPECS: Readonly<Record<string, UnitSpec>> = {
  archer: { parts: [{ key: 'archer', rig: HUMAN_RIG, clips: makeHumanClips('bow'), generated: GENERATED_MODELS.archer, fallback: buildArcherBody, props: buildArcherProps }], cycle: [0.7, 1.1] },
  spearman: { parts: [{ key: 'spearman', rig: HUMAN_RIG, clips: makeHumanClips('spear'), generated: GENERATED_MODELS.spearman, fallback: buildArcherBody, props: buildSpearProps }], cycle: [0.7, 1.1] },
  'man-at-arms': { parts: [{ key: 'man-at-arms', rig: HUMAN_RIG, clips: makeHumanClips('sword'), generated: GENERATED_MODELS['man-at-arms'], fallback: buildArcherBody, props: buildSwordProps }], cycle: [0.7, 1.1] },
  crossbowman: { parts: [{ key: 'crossbowman', rig: HUMAN_RIG, clips: makeHumanClips('crossbow'), generated: GENERATED_MODELS.crossbowman, fallback: buildArcherBody, props: buildCrossbowProps }], cycle: [0.7, 1.1] },
  horseman: {
    parts: [horsePart, { key: 'horseman-rider', rig: HUMAN_RIG, clips: makeHumanClips('riderSpear'), generated: GENERATED_MODELS.spearman, fallback: buildArcherBody, props: buildSpearProps, mount: RIDER_MOUNT }],
    cycle: [1.3, 2.2], canCharge: true,
  },
  knight: {
    parts: [horsePart, { key: 'knight-rider', rig: HUMAN_RIG, clips: makeHumanClips('riderSword'), generated: GENERATED_MODELS['knight-rider'], fallback: buildArcherBody, props: buildSwordProps, mount: RIDER_MOUNT }],
    cycle: [1.3, 2.2], canCharge: true,
  },
  mangonel: { parts: [{ key: 'mangonel', rig: SIEGE_RIG, clips: MANGONEL_CLIPS, generated: GENERATED_MODELS.mangonel }], cycle: [0.6, 0.6] },
  springald: { parts: [{ key: 'springald', rig: SIEGE_RIG, clips: SPRINGALD_CLIPS, generated: GENERATED_MODELS.springald }], cycle: [0.6, 0.6] },
};

export interface SkinnedRenderStats {
  units: number;
  vertices: number;
  triangles: number;
}

/** Geskinntes Modell: Körper und Requisiten als getrennte InstancedMeshes mit gemeinsamen Instanzdaten. */
export interface SkinnedModel {
  /** Alles zusammen in die Szene hängen. */
  group: THREE.Group;
  /** Körper (Rückfall: prozedural; nach dem Laden das erzeugte Modell). */
  mesh: THREE.InstancedMesh;
  /** Requisiten (Bogen, Sehne, Pfeil) aus dem handgebauten Atlas. */
  props: THREE.InstancedMesh;
  anim: BakedAnimation;
  iAnim: THREE.InstancedBufferAttribute;
  material: THREE.MeshStandardMaterial;
  boneTex: THREE.DataTexture;
  vertices: number;
  triangles: number;
  /** Erfüllt, sobald das erzeugte Modell eingesetzt ist (oder der Rückfall bleibt). */
  ready: Promise<void>;
  setCount(n: number): void;
  setShadows(on: boolean): void;
  dispose(): void;
}

export interface SkinnedModelOptions {
  /** Erzeugtes Modell (Bild → 3D) laden; sonst bleibt der prozedurale Körper. */
  generated?: boolean;
  capacity?: number;
}

function makeSkinMaterial(albedo: THREE.Texture, mask: THREE.Texture, uniforms: Record<string, THREE.IUniform>, key: string): THREE.MeshStandardMaterial {
  const material = new THREE.MeshStandardMaterial({ map: albedo, roughness: 0.85, metalness: 0.0 });
  const u = { ...uniforms, uMask: { value: mask } };
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, u);
    patchVertex(shader);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform sampler2D uMask;')
      .replace(
        '#include <map_fragment>',
        `vec4 texel = texture2D(map, vMapUv);
         float teamMask = texture2D(uMask, vMapUv).r;
         float lum = dot(texel.rgb, vec3(0.299, 0.587, 0.114));
         vec3 teamCol = vColor.rgb * (0.25 + 1.3 * lum);
         diffuseColor.rgb *= mix(texel.rgb, teamCol, teamMask);`,
      )
      .replace('#include <color_fragment>', '');
  };
  material.customProgramCacheKey = () => key;
  return material;
}

/** Leere Platzhalter-Geometrie mit allen Attributen (bis ein erzeugtes Modell geladen ist). */
function emptySkinnedGeometry(): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(9), 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(new Float32Array([0, 1, 0, 0, 1, 0, 0, 1, 0]), 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(6), 2));
  g.setAttribute('aSkinIndex', new THREE.Float32BufferAttribute(new Float32Array(12), 4));
  g.setAttribute('aSkinWeight', new THREE.Float32BufferAttribute(new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0]), 4));
  g.setAttribute('aUpper', new THREE.Float32BufferAttribute(new Float32Array(3), 1));
  g.setIndex([0, 1, 2]);
  return g;
}

/** Baut ein geskinntes Modell aus einer Teilbeschreibung: Geometrie, Skinning-Material, Tiefenmaterial. */
export function createSkinnedModel(part: PartSpec, textureBase = 'textures/units/', opts: SkinnedModelOptions = {}): SkinnedModel {
  const capacity = opts.capacity ?? MAX;
  const anim = bakeClips(part.rig, part.clips);
  const boneTex = new THREE.DataTexture(anim.data, anim.width, anim.height, THREE.RGBAFormat, THREE.FloatType);
  boneTex.minFilter = THREE.NearestFilter;
  boneTex.magFilter = THREE.NearestFilter;
  boneTex.generateMipmaps = false;
  boneTex.needsUpdate = true;

  const atlas = atlasJson as unknown as AtlasLayout;
  const body = part.fallback ? part.fallback(atlas) : { geometry: emptySkinnedGeometry(), vertices: 0, triangles: 0 };
  const props = part.props ? part.props(atlas) : { geometry: emptySkinnedGeometry(), vertices: 0, triangles: 0 };
  const iAnim = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 4), 4);
  iAnim.setUsage(THREE.DynamicDrawUsage);
  body.geometry.setAttribute('iAnim', iAnim);
  props.geometry.setAttribute('iAnim', iAnim);

  const loader = new THREE.TextureLoader();
  const albedo = loader.load(`${textureBase}archer.png`);
  albedo.colorSpace = THREE.SRGBColorSpace;
  albedo.anisotropy = 4;
  const mask = loader.load(`${textureBase}archer-mask.png`);
  mask.colorSpace = THREE.NoColorSpace;

  const uniforms = { uBones: { value: boneTex }, uBonesSize: { value: new THREE.Vector2(anim.width, anim.height) } };
  const atlasMaterial = makeSkinMaterial(albedo, mask, uniforms, 'skinned-units-v2');
  const depth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
  depth.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    patchVertex(shader);
  };
  depth.customProgramCacheKey = () => 'skinned-units-depth-v2';

  const mesh = new THREE.InstancedMesh(body.geometry, atlasMaterial, capacity);
  mesh.count = 0;
  mesh.frustumCulled = false;
  mesh.castShadow = true;
  mesh.receiveShadow = false;
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.setColorAt(0, new THREE.Color(0xffffff)); // legt instanceColor an
  mesh.customDepthMaterial = depth;
  const propMesh = new THREE.InstancedMesh(props.geometry, atlasMaterial, capacity);
  propMesh.count = 0;
  propMesh.frustumCulled = false;
  propMesh.castShadow = true;
  propMesh.receiveShadow = false;
  propMesh.instanceMatrix = mesh.instanceMatrix;
  propMesh.instanceColor = mesh.instanceColor;
  propMesh.customDepthMaterial = depth;
  propMesh.visible = part.props !== undefined;
  const group = new THREE.Group();
  group.add(mesh, propMesh);

  const model: SkinnedModel = {
    group, mesh, props: propMesh, anim, iAnim, material: atlasMaterial, boneTex,
    vertices: body.vertices + props.vertices, triangles: body.triangles + props.triangles,
    ready: Promise.resolve(),
    setCount(n) {
      mesh.count = n;
      propMesh.count = n;
    },
    setShadows(on) {
      mesh.castShadow = on;
      propMesh.castShadow = on;
    },
    dispose() {
      mesh.geometry.dispose();
      propMesh.geometry.dispose();
      atlasMaterial.dispose();
      mesh.material !== atlasMaterial && (mesh.material as THREE.Material).dispose();
      boneTex.dispose();
    },
  };
  if (opts.generated !== false && part.generated) {
    const base = textureBase.replace(/textures\/units\/$/, '');
    model.ready = loadGeneratedModel(part.generated, base)
      .then((gen) => {
        gen.geometry.setAttribute('iAnim', iAnim);
        const old = mesh.geometry;
        mesh.geometry = gen.geometry;
        mesh.material = makeSkinMaterial(gen.albedo, gen.mask, uniforms, 'skinned-units-gen-v2');
        old.deleteAttribute('iAnim'); // geteilter Puffer mit den Requisiten darf nicht mit entsorgt werden
        old.dispose();
        model.vertices = gen.vertices + props.vertices;
        model.triangles = gen.triangles + props.triangles;
      })
      .catch((e: unknown) => {
        console.warn(`Erzeugtes Modell ${part.key} nicht geladen, Rückfall bleibt:`, e);
      });
  }
  return model;
}

/** Bogenschützen-Modell (Vorschau, Tests). */
export function createArcherModel(textureBase = 'textures/units/', opts: SkinnedModelOptions = {}): SkinnedModel {
  return createSkinnedModel(UNIT_SPECS.archer!.parts[0]!, textureBase, opts);
}

interface ModelSlot {
  model: SkinnedModel;
  n: number;
}

export class SkinnedUnitRenderer {
  readonly group = new THREE.Group();
  private models = new Map<string, ModelSlot>();
  private visuals = new Map<UnitId, Visual>();
  private dummy = new THREE.Object3D();
  private mount = new THREE.Matrix4();
  private tmp = new THREE.Matrix4();
  private color = new THREE.Color();
  private stats: SkinnedRenderStats = { units: 0, vertices: 0, triangles: 0 };
  private readyAll: Promise<void>;
  /** Welche Einheitentypen dieser Renderer übernimmt. */
  readonly handles: ReadonlySet<string> = new Set(Object.keys(UNIT_SPECS));

  constructor(textureBase = 'textures/units/') {
    const pending: Promise<void>[] = [];
    for (const spec of Object.values(UNIT_SPECS)) {
      for (const part of spec.parts) {
        if (this.models.has(part.key)) continue;
        const model = createSkinnedModel(part, textureBase);
        this.models.set(part.key, { model, n: 0 });
        this.group.add(model.group);
        pending.push(model.ready);
      }
    }
    this.readyAll = Promise.all(pending).then(() => this.refreshStats());
    this.refreshStats();
  }

  private refreshStats(): void {
    let v = 0, t = 0;
    for (const { model } of this.models.values()) { v += model.vertices; t += model.triangles; }
    this.stats.vertices = v;
    this.stats.triangles = t;
  }

  /** Erfüllt, sobald alle erzeugten Modelle eingesetzt sind. */
  get ready(): Promise<void> {
    return this.readyAll;
  }

  get renderStats(): SkinnedRenderStats {
    return this.stats;
  }

  setShadows(on: boolean): void {
    for (const { model } of this.models.values()) model.setShadows(on);
  }

  /** Einheit im Darstellungsraum: Position, Blickrichtung, Höhe (Tiles) und Animationszustand. */
  update(world: World, alpha: number, nowMs: number): void {
    const dtS = 1 / 60;
    const now = world.tick + alpha;
    const seen = new Set<UnitId>();
    for (const slot of this.models.values()) slot.n = 0;
    let units = 0;
    for (const u of world.units) {
      const spec = UNIT_SPECS[u.defId];
      if (!spec) continue;
      const dead = !u.alive;
      const deadT = dead ? (now - u.diedTick) / world.rules.tickRate : 0;
      if (dead && deadT > 3.2) continue;
      seen.add(u.id);
      const def = world.defs.get(u.defId);
      const p = dead ? u.pos : lerp(u.prevPos, u.pos, alpha);
      const heading = lerpAngle(u.prevHeading, u.heading, alpha);
      let vis = this.visuals.get(u.id);
      if (!vis) {
        const h = hash(u.id);
        vis = {
          clip: 'idle', t: 0, prevClip: 'idle', prevT: 0, switchedMs: -1e9,
          walkPhase: 0, lastX: p.x, lastY: p.y, yaw: heading, twist: 0,
          prevPhase: 'idle', cancelAtMs: -1e9, cancelT: 0,
          scale: 0.97 + 0.06 * h, phase: h * 7.1, dieVariant: (['die1', 'die2', 'die3'] as const)[Math.floor(hash(u.id + 101) * 3)]!,
        };
        this.visuals.set(u.id, vis);
      }
      const H = unitHeight(def.kind) * vis.scale;
      const moved = Math.hypot(p.x - vis.lastX, p.y - vis.lastY);
      vis.lastX = p.x;
      vis.lastY = p.y;
      const running = u.speed > RUN_SPEED;
      const cycle = H * (running ? spec.cycle[1] : spec.cycle[0]);
      if (!dead && u.speed > 0.01) vis.walkPhase += moved / cycle;

      // Zielclip und Zeit aus dem Simulationszustand
      const w = world.defs.ageStats(u.defId, u.age).weapon;
      const anim0 = spec.parts[0]!;
      const slot0 = this.models.get(anim0.key)!.model.anim;
      const { clip, t } = chooseClip(u, {
        now, tickRate: world.rules.tickRate, recoveryS: w.timing.recovery, deadT, running,
        charge: !!spec.canCharge && running && u.attack.targetId !== null,
        walkPhase: vis.walkPhase + vis.phase * 0.05, nowS: nowMs / 1000 + vis.phase, dieVariant: vis.dieVariant,
        idleDuration: slot0.get('idle').duration, readyDuration: slot0.get('ready').duration, dieDuration: slot0.get(vis.dieVariant).duration,
      });
      if (!dead) {
        if (u.attack.phase === 'windup') vis.cancelT = t;
        // Sichtbarer Abbruch: aus dem Spannen ohne Schuss zurück (Überblenden ab der erreichten Spannung)
        if (vis.prevPhase === 'windup' && u.attack.phase === 'idle') {
          vis.prevClip = 'windup';
          vis.prevT = vis.cancelT;
          vis.clip = clip;
          vis.t = t;
          vis.switchedMs = nowMs;
        }
        vis.prevPhase = u.attack.phase;
      }
      if (clip !== vis.clip) {
        vis.prevClip = vis.clip;
        vis.prevT = vis.t;
        vis.clip = clip;
        vis.switchedMs = nowMs;
      }
      vis.t = t;
      const blend = Math.min(1, (nowMs - vis.switchedMs) / (BLEND_S * 1000));

      // Sanftes Drehen: Darstellung folgt der Blickrichtung mit kurzer Verzögerung
      const yawTarget = dead ? vis.yaw : heading;
      vis.yaw = lerpAngle(vis.yaw, yawTarget, 1 - Math.exp(-dtS * 18));
      // Oberkörper dreht zum Ziel, während die Beine weiterlaufen (begrenzt auf ±60°)
      let twistTarget = 0;
      if (!dead && u.attack.targetId !== null) {
        const target = world.units.find((x) => x.id === u.attack.targetId);
        if (target && target.alive) {
          const a = Math.atan2(target.pos.y - p.y, target.pos.x - p.x);
          let d = a - vis.yaw;
          d = Math.atan2(Math.sin(d), Math.cos(d));
          twistTarget = Math.max(-1.05, Math.min(1.05, d));
        }
      }
      vis.twist += (twistTarget - vis.twist) * (1 - Math.exp(-dtS * 10));

      // Instanzen aller Teile: Matrix, Farbe, Animationsdaten
      const sink = dead ? Math.max(0, deadT - 2.5) * 0.6 : 0;
      this.dummy.position.set(p.x, -sink, p.y);
      this.dummy.rotation.set(0, Math.PI / 2 - vis.yaw, 0);
      this.dummy.scale.setScalar(H);
      this.dummy.updateMatrix();
      const teamHex = dead ? 0x6b7280 : PLAYER_COLORS_HEX[u.player];
      for (const part of spec.parts) {
        const slot = this.models.get(part.key)!;
        if (slot.n >= MAX) continue;
        const n = slot.n++;
        let m = this.dummy.matrix;
        if (part.mount) {
          const mt = part.mount;
          this.mount.makeTranslation(mt.at[0], mt.at[1] - mt.hip * mt.scale, mt.at[2]);
          this.tmp.makeScale(mt.scale, mt.scale, mt.scale);
          this.mount.multiply(this.tmp);
          m = this.tmp.multiplyMatrices(this.dummy.matrix, this.mount);
        }
        slot.model.mesh.setMatrixAt(n, m);
        slot.model.mesh.setColorAt(n, this.color.setHex(teamHex));
        const anim = slot.model.anim;
        const rowA = clipRow(anim.get(vis.clip), vis.t);
        const rowB = clipRow(anim.get(vis.prevClip), vis.prevT);
        slot.model.iAnim.setXYZW(n, rowA, rowB, blend, vis.twist);
      }
      units++;
    }
    for (const id of [...this.visuals.keys()]) if (!seen.has(id)) this.visuals.delete(id);
    for (const slot of this.models.values()) {
      slot.model.setCount(slot.n);
      slot.model.mesh.instanceMatrix.needsUpdate = true;
      if (slot.model.mesh.instanceColor) slot.model.mesh.instanceColor.needsUpdate = true;
      slot.model.iAnim.needsUpdate = true;
    }
    this.stats.units = units;
  }

  dispose(): void {
    for (const { model } of this.models.values()) model.dispose();
  }
}

export interface ClipChoiceInput {
  now: number;
  tickRate: number;
  recoveryS: number;
  deadT: number;
  running: boolean;
  /** Rennen mit Ziel als Sturmangriff (nur Kavallerie). */
  charge?: boolean;
  walkPhase: number;
  nowS: number;
  dieVariant: ClipName;
  idleDuration: number;
  readyDuration: number;
  dieDuration: number;
}

/**
 * Clip und Zeitparameter aus dem Simulationszustand (reine Funktion, testbar):
 * Spannen = Windup-Fortschritt, Lösen = erstes Viertel des Nachlaufs, Nachlauf = Rest,
 * Treffer 0,3 s nach lastHitTick, Gehen/Rennen nach Strecke, Bereitschaft mit Ziel, sonst Stehen.
 */
export function chooseClip(u: UnitState, c: ClipChoiceInput): { clip: ClipName; t: number } {
  if (!u.alive) return { clip: c.dieVariant, t: c.deadT / c.dieDuration };
  if (u.attack.phase === 'windup') {
    const total = Math.max(1, u.attack.phaseEndsTick - u.attack.startTick);
    return { clip: 'windup', t: Math.min(1, Math.max(0, (c.now - u.attack.startTick) / total)) };
  }
  if (u.attack.phase === 'recovery') {
    const total = Math.max(1, Math.round(c.recoveryS * c.tickRate));
    const prog = Math.min(1, Math.max(0, 1 - (u.attack.phaseEndsTick - c.now) / total));
    return prog < 0.25 ? { clip: 'strike', t: prog / 0.25 } : { clip: 'recover', t: (prog - 0.25) / 0.75 };
  }
  const hitAge = (c.now - u.lastHitTick) / c.tickRate;
  if (u.lastHitTick > 0 && hitAge >= 0 && hitAge < 0.3) return { clip: 'hit', t: hitAge / 0.3 };
  if (u.speed > 0.01) return { clip: c.charge ? 'charge' : c.running ? 'run' : 'walk', t: c.walkPhase };
  if (u.attack.targetId !== null) return { clip: 'ready', t: c.nowS / c.readyDuration };
  return { clip: 'idle', t: c.nowS / c.idleDuration };
}

/** Deterministischer Pseudozufall 0..1 aus einer Ganzzahl. */
function hash(i: number): number {
  let x = (i + 1) * 2654435761;
  x = ((x ^ (x >>> 15)) * 2246822519) >>> 0;
  x = ((x ^ (x >>> 13)) * 3266489917) >>> 0;
  return ((x ^ (x >>> 16)) >>> 0) / 4294967296;
}

/** Vertex-Shader: Skinning aus der Knochen-Textur, Überblenden, Oberkörperdrehung. */
function patchVertex(shader: { vertexShader: string }): void {
  shader.vertexShader = shader.vertexShader
    .replace(
      '#include <common>',
      `#include <common>
       attribute vec4 aSkinIndex;
       attribute vec4 aSkinWeight;
       attribute float aUpper;
       attribute vec4 iAnim;
       uniform sampler2D uBones;
       uniform vec2 uBonesSize;
       mat4 boneRow(float bone, float row) {
         float y = (row + 0.5) / uBonesSize.y;
         float x0 = (bone * 3.0 + 0.5) / uBonesSize.x;
         float dx = 1.0 / uBonesSize.x;
         vec4 r0 = texture2D(uBones, vec2(x0, y));
         vec4 r1 = texture2D(uBones, vec2(x0 + dx, y));
         vec4 r2 = texture2D(uBones, vec2(x0 + 2.0 * dx, y));
         return mat4(vec4(r0.x, r1.x, r2.x, 0.0), vec4(r0.y, r1.y, r2.y, 0.0), vec4(r0.z, r1.z, r2.z, 0.0), vec4(r0.w, r1.w, r2.w, 1.0));
       }
       mat4 boneAt(float bone, float row) {
         float f = floor(row);
         return boneRow(bone, f) * (1.0 - (row - f)) + boneRow(bone, f + 1.0) * (row - f);
       }
       mat4 skinAt(float row) {
         return boneAt(aSkinIndex.x, row) * aSkinWeight.x + boneAt(aSkinIndex.y, row) * aSkinWeight.y
              + boneAt(aSkinIndex.z, row) * aSkinWeight.z + boneAt(aSkinIndex.w, row) * aSkinWeight.w;
       }
       mat4 unitSkin() {
         mat4 a = skinAt(iAnim.x);
         if (iAnim.z >= 1.0) return a;
         mat4 b = skinAt(iAnim.y);
         return a * iAnim.z + b * (1.0 - iAnim.z);
       }
       vec3 twistY(vec3 p, float ang) {
         float c = cos(ang), s = sin(ang);
         return vec3(c * p.x - s * p.z, p.y, s * p.x + c * p.z);
       }`,
    )
    .replace('#include <skinbase_vertex>', 'mat4 skinM = unitSkin(); float twistAng = iAnim.w * aUpper;')
    .replace('#include <skinnormal_vertex>', 'objectNormal = twistY(normalize(mat3(skinM) * objectNormal), twistAng);')
    .replace('#include <skinning_vertex>', 'transformed = twistY((skinM * vec4(transformed, 1.0)).xyz, twistAng);');
}

export type { BakedClip } from './animBake';

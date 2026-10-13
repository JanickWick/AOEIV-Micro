/**
 * Geskinnte Einheiten (Stufe 3): ein InstancedMesh je Modell, Skinning im Vertex-Shader aus einer
 * gebackenen Knochen-Textur, Überblenden zwischen zwei Clips, Oberkörperdrehung zum Ziel und
 * Teamfarbe über eine Maskentextur. Alle Animationszustände kommen aus der Simulation:
 * Laufphase aus der Strecke, Spannen/Lösen/Nachlauf aus den Angriffs-Ticks, Treffer aus
 * lastHitTick, Tod aus diedTick. Nichts hier verändert die Simulation.
 */
import * as THREE from 'three';
import { lerp, lerpAngle } from '../../../sim/math';
import type { UnitId, UnitState, World } from '../../../sim/types';
import { PLAYER_COLORS_HEX, unitHeight } from '../../unitVisual';
import type { ClipName } from './rig';
import { bakeHumanClips, clipRow, type BakedAnimation, type BakedClip } from './animBake';
import { buildArcher } from './humanModels';
import atlasJson from '../../../data/atlas/archer.json';
import type { AtlasLayout } from './meshBuilder';

const MAX = 512;
/** Übergangszeit zwischen Clips (s). */
const BLEND_S = 0.14;
/** Schritte pro Zyklus bezogen auf die Figurhöhe: ein Gehzyklus ≈ 0,7 Körperhöhen. */
const WALK_CYCLE_PER_HEIGHT = 0.7;
const RUN_CYCLE_PER_HEIGHT = 1.1;
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

export interface SkinnedRenderStats {
  units: number;
  vertices: number;
  triangles: number;
}

/** Geskinntes Modell mit Material, Knochen-Textur und Animations-Attribut (für Spiel und Vorschau). */
export interface SkinnedModel {
  mesh: THREE.InstancedMesh;
  anim: BakedAnimation;
  iAnim: THREE.InstancedBufferAttribute;
  material: THREE.MeshStandardMaterial;
  boneTex: THREE.DataTexture;
  vertices: number;
  triangles: number;
}

/** Baut das Bogenschützen-Modell: Geometrie, Skinning-Material, Tiefenmaterial für Schatten. */
export function createArcherModel(textureBase = 'textures/units/', capacity = MAX): SkinnedModel {
  const anim = bakeHumanClips();
  const boneTex = new THREE.DataTexture(anim.data, anim.width, anim.height, THREE.RGBAFormat, THREE.FloatType);
  boneTex.minFilter = THREE.NearestFilter;
  boneTex.magFilter = THREE.NearestFilter;
  boneTex.generateMipmaps = false;
  boneTex.needsUpdate = true;

  const model = buildArcher(atlasJson as unknown as AtlasLayout);
  const geo = model.geometry;
  const iAnim = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 4), 4);
  iAnim.setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute('iAnim', iAnim);

  const loader = new THREE.TextureLoader();
  const albedo = loader.load(`${textureBase}archer.png`);
  albedo.colorSpace = THREE.SRGBColorSpace;
  albedo.anisotropy = 4;
  const mask = loader.load(`${textureBase}archer-mask.png`);
  mask.colorSpace = THREE.NoColorSpace;

  const material = new THREE.MeshStandardMaterial({ map: albedo, roughness: 0.85, metalness: 0.0 });
  const uniforms = { uBones: { value: boneTex }, uBonesSize: { value: new THREE.Vector2(anim.width, anim.height) }, uMask: { value: mask } };
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
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
  material.customProgramCacheKey = () => 'skinned-units-v1';

  const mesh = new THREE.InstancedMesh(geo, material, capacity);
  mesh.count = 0;
  mesh.frustumCulled = false;
  mesh.castShadow = true;
  mesh.receiveShadow = false;
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.setColorAt(0, new THREE.Color(0xffffff)); // legt instanceColor an
  const depth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
  depth.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    patchVertex(shader);
  };
  depth.customProgramCacheKey = () => 'skinned-units-depth-v1';
  mesh.customDepthMaterial = depth;
  return { mesh, anim, iAnim, material, boneTex, vertices: model.vertices, triangles: model.triangles };
}

export class SkinnedUnitRenderer {
  readonly group = new THREE.Group();
  private mesh: THREE.InstancedMesh;
  private anim: BakedAnimation;
  private iAnim: THREE.InstancedBufferAttribute;
  private visuals = new Map<UnitId, Visual>();
  private dummy = new THREE.Object3D();
  private color = new THREE.Color();
  private model: SkinnedModel;
  private stats: SkinnedRenderStats;
  /** Welche Einheitentypen dieser Renderer übernimmt. */
  readonly handles: ReadonlySet<string> = new Set(['archer']);

  constructor(textureBase = 'textures/units/') {
    this.model = createArcherModel(textureBase);
    this.mesh = this.model.mesh;
    this.anim = this.model.anim;
    this.iAnim = this.model.iAnim;
    this.group.add(this.mesh);
    this.stats = { units: 0, vertices: this.model.vertices, triangles: this.model.triangles };
  }

  get renderStats(): SkinnedRenderStats {
    return this.stats;
  }

  setShadows(on: boolean): void {
    this.mesh.castShadow = on;
  }

  /** Einheit im Darstellungsraum: Position, Blickrichtung, Höhe (Tiles) und Animationszustand. */
  update(world: World, alpha: number, nowMs: number): void {
    const dtS = 1 / 60;
    const now = world.tick + alpha;
    const seen = new Set<UnitId>();
    let n = 0;
    for (const u of world.units) {
      if (!this.handles.has(u.defId)) continue;
      const dead = !u.alive;
      const deadT = dead ? (now - u.diedTick) / world.rules.tickRate : 0;
      if (dead && deadT > 3.2) continue;
      if (n >= MAX) break;
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
      const cycle = H * (running ? RUN_CYCLE_PER_HEIGHT : WALK_CYCLE_PER_HEIGHT);
      if (!dead && u.speed > 0.01) vis.walkPhase += moved / cycle;

      // Zielclip und Zeit aus dem Simulationszustand
      const w = world.defs.ageStats(u.defId, u.age).weapon;
      const { clip, t } = chooseClip(u, {
        now, tickRate: world.rules.tickRate, recoveryS: w.timing.recovery, deadT, running,
        walkPhase: vis.walkPhase + vis.phase * 0.05, nowS: nowMs / 1000 + vis.phase, dieVariant: vis.dieVariant,
        idleDuration: this.anim.get('idle').duration, readyDuration: this.anim.get('ready').duration, dieDuration: this.anim.get(vis.dieVariant).duration,
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

      // Instanz: Matrix, Farbe, Animationsdaten
      const sink = dead ? Math.max(0, deadT - 2.5) * 0.6 : 0;
      this.dummy.position.set(p.x, -sink, p.y);
      this.dummy.rotation.set(0, Math.PI / 2 - vis.yaw, 0);
      this.dummy.scale.setScalar(H);
      this.dummy.updateMatrix();
      this.mesh.setMatrixAt(n, this.dummy.matrix);
      this.mesh.setColorAt(n, this.color.setHex(dead ? 0x6b7280 : PLAYER_COLORS_HEX[u.player]));
      const rowA = clipRow(this.anim.get(vis.clip), vis.t);
      const rowB = clipRow(this.anim.get(vis.prevClip), vis.prevT);
      // Oberkörperdrehung (Modellraum, um y)
      this.iAnim.setXYZW(n, rowA, rowB, blend, vis.twist);
      n++;
    }
    for (const id of [...this.visuals.keys()]) if (!seen.has(id)) this.visuals.delete(id);
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
    this.iAnim.needsUpdate = true;
    this.stats.units = n;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.model.material.dispose();
    this.model.boneTex.dispose();
  }
}

export interface ClipChoiceInput {
  now: number;
  tickRate: number;
  recoveryS: number;
  deadT: number;
  running: boolean;
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
  if (u.speed > 0.01) return { clip: c.running ? 'run' : 'walk', t: c.walkPhase };
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

export type { BakedClip };

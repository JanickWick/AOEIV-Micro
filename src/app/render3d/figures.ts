/**
 * Prozedurale Low-Poly-Figuren mit Gelenken. Jedes Körperteil ist eine InstancedMesh; pro Einheit
 * werden die Teil-Matrizen aus einem kleinen Rig (Hüfte, Knie, Schulter, Ellbogen, Rumpf, Kopf)
 * berechnet. Posen kommen strikt aus dem Simulationszustand: Laufphase aus zurückgelegter Strecke,
 * Angriff aus Windup/Treffer/Nachlauf-Ticks, Trefferreaktion aus lastHitTick, Tod aus diedTick.
 */
import * as THREE from 'three';
import { lerp, lerpAngle } from '../../sim/math';
import type { UnitId, UnitState, World } from '../../sim/types';
import { PLAYER_COLORS_HEX, unitHeight } from '../unitVisual';

const MAX = 512;

type PartName =
  | 'head' | 'helmet' | 'torso' | 'limb' | 'shield' | 'spear' | 'sword' | 'bow' | 'crossbow' | 'lance'
  | 'horseBody' | 'horseNeck' | 'horseHead' | 'horseLeg' | 'horseTail'
  | 'siegeBase' | 'wheel' | 'siegeArm' | 'siegeBucket' | 'springBow' | 'bolt';

const COLORS = {
  skin: 0xe8c2a0,
  pants: 0x5a4330,
  steel: 0xb8c0c8,
  wood: 0x8b5a2b,
  horse: 0x6e4a2e,
  dark: 0x2b2b2b,
  dead: 0x6b7280,
};

/** Visueller Zustand pro Einheit (nicht Teil der Simulation). */
interface Visual {
  walkPhase: number;
  lastX: number;
  lastY: number;
  prevPhase: 'idle' | 'windup' | 'recovery';
  cancelAtMs: number;
  cancelProgress: number;
}

export interface FigureRenderOptions {
  nowMs: number;
}

export class FigureRenderer {
  private parts = new Map<PartName, THREE.InstancedMesh>();
  private counts = new Map<PartName, number>();
  private visuals = new Map<UnitId, Visual>();
  private m = new THREE.Matrix4();
  private m2 = new THREE.Matrix4();
  private tmpQ = new THREE.Quaternion();
  private tmpE = new THREE.Euler();
  private tmpV = new THREE.Vector3();
  private tmpS = new THREE.Vector3();
  private color = new THREE.Color();
  readonly group = new THREE.Group();

  constructor() {
    const mat = () => new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8, metalness: 0.05 });
    const add = (name: PartName, geo: THREE.BufferGeometry, capacity = MAX) => {
      const mesh = new THREE.InstancedMesh(geo, mat(), capacity);
      mesh.castShadow = true;
      mesh.receiveShadow = false;
      mesh.count = 0;
      mesh.frustumCulled = false;
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      this.parts.set(name, mesh);
      this.group.add(mesh);
    };
    // Kanonische Figurhöhe 1,0; Gliedmaßen hängen vom Gelenk nach −y (Länge 1, wird skaliert).
    add('head', new THREE.SphereGeometry(0.5, 8, 6));
    const helmet = new THREE.ConeGeometry(0.5, 0.6, 8);
    helmet.translate(0, 0.3, 0);
    add('helmet', helmet);
    add('torso', new THREE.BoxGeometry(1, 1, 1));
    const limb = new THREE.CylinderGeometry(0.5, 0.42, 1, 6);
    limb.translate(0, -0.5, 0);
    add('limb', limb, MAX * 8);
    const shield = new THREE.CylinderGeometry(0.5, 0.5, 0.08, 10);
    shield.rotateZ(Math.PI / 2);
    add('shield', shield);
    const spear = new THREE.CylinderGeometry(0.015, 0.015, 1, 5);
    spear.rotateX(Math.PI / 2); // entlang +z
    add('spear', spear, MAX);
    const sword = new THREE.BoxGeometry(0.06, 1, 0.02);
    sword.translate(0, 0.5, 0);
    add('sword', sword);
    const bow = new THREE.TorusGeometry(0.5, 0.02, 4, 10, Math.PI);
    bow.rotateY(Math.PI / 2);
    bow.rotateZ(Math.PI / 2);
    add('bow', bow);
    const crossbow = new THREE.BoxGeometry(0.5, 0.05, 0.4);
    add('crossbow', crossbow);
    const lance = new THREE.ConeGeometry(0.02, 1, 5);
    lance.rotateX(Math.PI / 2);
    add('lance', lance);
    add('horseBody', new THREE.BoxGeometry(1, 1, 1));
    add('horseNeck', new THREE.BoxGeometry(1, 1, 1));
    add('horseHead', new THREE.BoxGeometry(1, 1, 1));
    const hleg = new THREE.CylinderGeometry(0.5, 0.35, 1, 6);
    hleg.translate(0, -0.5, 0);
    add('horseLeg', hleg, MAX * 4);
    const tail = new THREE.CylinderGeometry(0.3, 0.1, 1, 5);
    tail.translate(0, -0.5, 0);
    add('horseTail', tail);
    add('siegeBase', new THREE.BoxGeometry(1, 1, 1));
    const wheel = new THREE.CylinderGeometry(0.5, 0.5, 0.12, 10);
    wheel.rotateZ(Math.PI / 2);
    add('wheel', wheel, MAX * 2);
    const arm = new THREE.BoxGeometry(0.08, 1, 0.08);
    arm.translate(0, 0.5, 0);
    add('siegeArm', arm);
    add('siegeBucket', new THREE.SphereGeometry(0.5, 6, 5));
    add('springBow', new THREE.BoxGeometry(1, 0.06, 0.06));
    const bolt = new THREE.CylinderGeometry(0.03, 0.03, 1, 5);
    bolt.rotateX(Math.PI / 2);
    add('bolt', bolt);
  }

  setShadows(on: boolean): void {
    for (const m of this.parts.values()) m.castShadow = on;
  }

  private begin(): void {
    for (const k of this.parts.keys()) this.counts.set(k, 0);
  }

  private end(): void {
    for (const [k, mesh] of this.parts) {
      mesh.count = this.counts.get(k) ?? 0;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
  }

  /** Teil mit Weltmatrix `m` und Farbe ablegen. */
  private put(name: PartName, m: THREE.Matrix4, color: number): void {
    const mesh = this.parts.get(name)!;
    const i = this.counts.get(name)!;
    if (i >= mesh.instanceMatrix.count) return;
    mesh.setMatrixAt(i, m);
    mesh.setColorAt(i, this.color.setHex(color));
    this.counts.set(name, i + 1);
  }

  /** out = base · T(t) · R(euler) · S(s) */
  private chain(out: THREE.Matrix4, base: THREE.Matrix4, tx: number, ty: number, tz: number, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1): THREE.Matrix4 {
    this.tmpE.set(rx, ry, rz);
    this.tmpQ.setFromEuler(this.tmpE);
    this.tmpV.set(tx, ty, tz);
    this.tmpS.set(sx, sy, sz);
    this.m2.compose(this.tmpV, this.tmpQ, this.tmpS);
    return out.multiplyMatrices(base, this.m2);
  }

  update(world: World, alpha: number, opts: FigureRenderOptions): void {
    this.begin();
    const nowMs = opts.nowMs;
    const seen = new Set<UnitId>();
    for (const u of world.units) {
      const dead = !u.alive;
      const deadT = dead ? (world.tick + alpha - u.diedTick) / world.rules.tickRate : 0;
      if (dead && deadT > 3.2) continue;
      seen.add(u.id);
      const def = world.defs.get(u.defId);
      const p = dead ? u.pos : lerp(u.prevPos, u.pos, alpha);
      const heading = lerpAngle(u.prevHeading, u.heading, alpha);
      let vis = this.visuals.get(u.id);
      if (!vis) {
        vis = { walkPhase: 0, lastX: p.x, lastY: p.y, prevPhase: 'idle', cancelAtMs: -1e9, cancelProgress: 0 };
        this.visuals.set(u.id, vis);
      }
      const moved = Math.hypot(p.x - vis.lastX, p.y - vis.lastY);
      vis.lastX = p.x;
      vis.lastY = p.y;
      const stride = def.kind === 'cavalry' ? 0.9 : 0.42;
      if (!dead && u.speed > 0.01) vis.walkPhase += (moved / stride) * Math.PI * 2;

      // Angriffsphase und Fortschritt (0..1) aus den Ticks
      const w = world.defs.ageStats(u.defId, u.age).weapon;
      const now = world.tick + alpha;
      let attackPose: 'none' | 'windup' | 'strike' | 'recovery' = 'none';
      let progress = 0;
      if (!dead) {
        if (u.attack.phase === 'windup') {
          const total = Math.max(1, u.attack.phaseEndsTick - u.attack.startTick);
          progress = Math.min(1, Math.max(0, (now - u.attack.startTick) / total));
          attackPose = 'windup';
        } else if (u.attack.phase === 'recovery') {
          const total = Math.max(1, Math.round(w.timing.recovery * world.rules.tickRate));
          progress = Math.min(1, Math.max(0, 1 - (u.attack.phaseEndsTick - now) / total));
          attackPose = progress < 0.25 ? 'strike' : 'recovery';
        }
        // Sichtbarer Abbruch: Windup → idle ohne Treffer blendet in 0,2 s zurück
        if (vis.prevPhase === 'windup' && u.attack.phase === 'idle') {
          vis.cancelAtMs = nowMs;
          vis.cancelProgress = vis.cancelProgress || 0.5;
        }
        if (u.attack.phase === 'windup') vis.cancelProgress = progress;
        vis.prevPhase = u.attack.phase;
      }
      const cancelBlend = Math.max(0, 1 - (nowMs - vis.cancelAtMs) / 200);
      if (attackPose === 'none' && cancelBlend > 0) {
        attackPose = 'windup';
        progress = vis.cancelProgress * cancelBlend;
      }

      const hitT = Math.max(0, 1 - (now - u.lastHitTick) / 8);
      const H = unitHeight(def.kind);
      const teamColor = dead ? COLORS.dead : PLAYER_COLORS_HEX[u.player];
      const rootRot = Math.PI / 2 - heading;

      // Wurzel: Position, Blickrichtung, Höhe; Tod: umkippen und nach 2,5 s versinken
      const sink = dead ? Math.max(0, deadT - 2.5) * 0.6 : 0;
      const fall = dead ? Math.min(1, deadT / 0.35) * (Math.PI / 2) : 0;
      this.chain(this.m, IDENTITY, p.x, -sink, p.y, 0, rootRot, 0, 1, 1, 1);
      const root = this.m.clone();
      if (dead) this.chain(root, root, 0, 0, 0, -fall, 0, 0);
      if (def.kind === 'siege') this.drawSiege(root, u, def.id, H, attackPose, progress, teamColor);
      else if (def.kind === 'cavalry') this.drawCavalry(root, u, def.id, H, vis, attackPose, progress, hitT, teamColor, dead);
      else this.drawHuman(root, u, def.id, H, vis, attackPose, progress, hitT, teamColor, dead, 0, 0, 0);
    }
    for (const id of [...this.visuals.keys()]) if (!seen.has(id)) this.visuals.delete(id);
    this.end();
  }

  /** Mensch; `mount*` verschiebt den Reiter auf das Pferd. Höhe H in Tiles. */
  private drawHuman(root: THREE.Matrix4, u: UnitState, defId: string, H: number, vis: Visual, pose: string, prog: number, hitT: number, team: number, dead: boolean, mountY: number, mountScale: number, legSpread: number): void {
    const s = mountScale || H;
    const base = new THREE.Matrix4().copy(root);
    this.chain(base, base, 0, mountY, 0, 0, 0, 0, s, s, s);
    const walking = !dead && u.speed > 0.01 && !mountScale;
    const ph = vis.walkPhase;
    const swing = walking ? 0.7 : 0;
    const braced = u.braceUntilTick >= 0 && !dead && u.braceUntilTick > (u.attack.startTick || 0) && u.braceUntilTick > 0;
    const lean = (walking ? 0.08 : 0) + (braced ? 0.35 : 0) - hitT * 0.4;

    // Beine
    const pelvis = this.chain(new THREE.Matrix4(), base, 0, 0.5, 0, 0, 0, 0);
    for (const side of [-1, 1]) {
      const hip = swing * Math.sin(ph + (side < 0 ? 0 : Math.PI));
      const knee = Math.max(0, -Math.sin(ph + (side < 0 ? 0 : Math.PI))) * 1.1 * (walking ? 1 : 0) + (braced ? 0.5 : 0);
      const hipM = this.chain(new THREE.Matrix4(), pelvis, side * 0.08, 0, 0, -hip, 0, side * legSpread);
      this.put('limb', this.chain(this.m, hipM, 0, 0, 0, 0, 0, 0, 0.09, 0.25, 0.09), COLORS.pants);
      const kneeM = this.chain(new THREE.Matrix4(), hipM, 0, -0.25, 0, knee, 0, 0);
      this.put('limb', this.chain(this.m, kneeM, 0, 0, 0, 0, 0, 0, 0.08, 0.25, 0.08), COLORS.pants);
    }
    // Rumpf, Kopf, Helm
    const torso = this.chain(new THREE.Matrix4(), pelvis, 0, 0, 0, -lean, 0, 0);
    this.put('torso', this.chain(this.m, torso, 0, 0.18, 0, 0, 0, 0, 0.26, 0.36, 0.15), team);
    this.put('head', this.chain(this.m, torso, 0, 0.45, 0, 0, 0, 0, 0.15, 0.15, 0.15), COLORS.skin);
    if (defId === 'man-at-arms' || defId === 'knight' || defId === 'horseman') this.put('helmet', this.chain(this.m, torso, 0, 0.47, 0, 0, 0, 0, 0.16, 0.16, 0.16), COLORS.steel);

    // Arme: Pose je Waffe
    const ranged = defId === 'archer' || defId === 'crossbowman';
    const sword = defId === 'man-at-arms';
    let shR = -0.1 + (walking ? -swing * 0.6 * Math.sin(ph) : 0);
    let elR = 0.3;
    let shL = -0.1 + (walking ? swing * 0.6 * Math.sin(ph) : 0);
    let elL = 0.3;
    let shRz = 0;
    let shLz = 0;
    if (ranged) {
      // Bogen/Armbrust: linker Arm hält die Waffe nach vorn, rechter Arm zieht an
      shL = 1.45;
      elL = 0.1;
      shR = 1.3;
      elR = 1.0;
      if (pose === 'windup') {
        shR = 1.3 + 0.2 * prog;
        elR = 1.0 + 1.2 * prog; // Sehne spannen
      } else if (pose === 'strike') {
        elR = 0.4;
      } else if (pose === 'recovery') {
        elR = 0.6 + 0.4 * prog;
      } else if (u.attack.cooldownLeft === 0 && u.attack.targetId === null) {
        shL = 0.2;
        elL = 0.4;
        shR = -0.1;
        elR = 0.3;
      }
    } else if (sword) {
      shLz = -0.3; // Schildarm leicht seitlich
      elL = 1.2;
      if (pose === 'windup') {
        shR = -0.3 - 2.3 * prog; // über den Kopf heben
        elR = 0.2 + 0.4 * prog;
        shRz = -0.3 * prog;
      } else if (pose === 'strike') {
        shR = 1.0;
        elR = 0.2;
      } else if (pose === 'recovery') {
        shR = 1.0 - 1.1 * prog;
        elR = 0.3;
      }
    } else {
      // Speer/Lanze: Stoß
      shR = 0.4;
      elR = 1.4;
      if (braced) {
        shR = 0.9;
        elR = 0.6;
      }
      if (pose === 'windup') {
        shR = 0.4 - 0.9 * prog;
        elR = 1.4 + 0.3 * prog;
      } else if (pose === 'strike') {
        shR = 1.3;
        elR = 0.2;
      } else if (pose === 'recovery') {
        shR = 1.3 - 0.9 * prog;
        elR = 0.2 + 1.2 * prog;
      }
    }

    const armColor = team;
    // rechter Arm (x = +0.16) mit Waffe
    const shRM = this.chain(new THREE.Matrix4(), torso, 0.17, 0.34, 0, -shR, 0, shRz);
    this.put('limb', this.chain(this.m, shRM, 0, 0, 0, 0, 0, 0, 0.075, 0.2, 0.075), armColor);
    const elRM = this.chain(new THREE.Matrix4(), shRM, 0, -0.2, 0, -elR, 0, 0);
    this.put('limb', this.chain(this.m, elRM, 0, 0, 0, 0, 0, 0, 0.065, 0.2, 0.065), COLORS.skin);
    const handR = this.chain(new THREE.Matrix4(), elRM, 0, -0.2, 0, 0, 0, 0);
    // linker Arm (x = −0.16), ggf. Schild oder Bogen
    const shLM = this.chain(new THREE.Matrix4(), torso, -0.17, 0.34, 0, -shL, 0, shLz);
    this.put('limb', this.chain(this.m, shLM, 0, 0, 0, 0, 0, 0, 0.075, 0.2, 0.075), armColor);
    const elLM = this.chain(new THREE.Matrix4(), shLM, 0, -0.2, 0, -elL, 0, 0);
    this.put('limb', this.chain(this.m, elLM, 0, 0, 0, 0, 0, 0, 0.065, 0.2, 0.065), COLORS.skin);
    const handL = this.chain(new THREE.Matrix4(), elLM, 0, -0.2, 0, 0, 0, 0);

    if (defId === 'spearman') {
      const tilt = braced ? -0.1 : pose === 'strike' ? 0 : -0.5; // Speer schräg nach oben, beim Stoß waagerecht
      this.put('spear', this.chain(this.m, handR, 0, 0, 0.25, tilt, 0, 0, 1, 1, 1.35), COLORS.wood);
    } else if (defId === 'horseman') {
      this.put('spear', this.chain(this.m, handR, 0, 0, 0.2, pose === 'strike' ? 0.1 : -0.3, 0, 0, 1, 1, 1.1), COLORS.wood);
    } else if (defId === 'knight') {
      const charging = u.charge?.charging === true;
      this.put('lance', this.chain(this.m, handR, 0, 0, 0.55, charging || pose === 'strike' ? 0.05 : -0.6, 0, 0, 1, 1, 1.7), COLORS.wood);
      this.put('shield', this.chain(this.m, elLM, -0.08, -0.1, 0, 0, 0, 0, 0.3, 0.3, 0.3), team);
    } else if (sword) {
      this.put('sword', this.chain(this.m, handR, 0, 0, 0, Math.PI, 0, 0, 1, 0.55, 1), COLORS.steel);
      this.put('shield', this.chain(this.m, elLM, -0.08, -0.1, 0, 0, 0, 0, 0.34, 0.34, 0.34), team);
    } else if (defId === 'archer') {
      this.put('bow', this.chain(this.m, handL, 0, 0, 0.05, 0, 0, 0, 0.7, 0.7, 0.7), COLORS.wood);
    } else if (defId === 'crossbowman') {
      this.put('crossbow', this.chain(this.m, handL, 0.08, 0, 0.05, 0, 0, 0, 1, 1, 1), COLORS.wood);
    }
  }

  private drawCavalry(root: THREE.Matrix4, u: UnitState, defId: string, H: number, vis: Visual, pose: string, prog: number, hitT: number, team: number, dead: boolean): void {
    const base = new THREE.Matrix4().copy(root);
    this.chain(base, base, 0, 0, 0, 0, 0, 0, H, H, H);
    const moving = !dead && u.speed > 0.01;
    const ph = vis.walkPhase;
    const bob = moving ? 0.03 * Math.sin(ph * 2) : 0;
    const charging = u.charge?.charging === true;
    const horse = dead ? COLORS.dead : COLORS.horse;
    // Körper (Länge 1 entlang z), Hals, Kopf, Schweif
    const body = this.chain(new THREE.Matrix4(), base, 0, 0.62 + bob, 0, 0, 0, 0);
    this.put('horseBody', this.chain(this.m, body, 0, 0, 0, 0, 0, 0, 0.36, 0.34, 1.0), horse);
    this.put('horseNeck', this.chain(this.m, body, 0, 0.2, 0.45, charging ? -0.3 : -0.6, 0, 0, 0.2, 0.42, 0.2), horse);
    this.put('horseHead', this.chain(this.m, body, 0, 0.4, 0.6, charging ? 0.5 : 0.3, 0, 0, 0.16, 0.18, 0.34), horse);
    this.put('horseTail', this.chain(this.m, body, 0, 0.12, -0.52, 0.5, 0, 0, 0.1, 0.35, 0.1), COLORS.dark);
    // Beine: vorn und hinten gegenläufig (Galopp-Näherung)
    const amp = moving ? (charging ? 0.9 : 0.6) : 0;
    const legs: [number, number, number][] = [[-0.12, 0.35, 0], [0.12, 0.35, Math.PI], [-0.12, -0.35, Math.PI], [0.12, -0.35, 0]];
    for (const [x, z, off] of legs) {
      const a = amp * Math.sin(ph + off);
      const legM = this.chain(new THREE.Matrix4(), body, x, -0.1, z, -a, 0, 0);
      this.put('horseLeg', this.chain(this.m, legM, 0, 0, 0, 0, 0, 0, 0.07, 0.52, 0.07), horse);
    }
    // Reiter: kleiner, sitzt auf dem Rücken, Beine gespreizt
    this.drawHuman(base, u, defId, H, vis, pose, prog, hitT, team, dead, 0.62 + bob + 0.1, 0.62, 0.55);
  }

  private drawSiege(root: THREE.Matrix4, u: UnitState, defId: string, H: number, pose: string, prog: number, team: number): void {
    const base = new THREE.Matrix4().copy(root);
    this.chain(base, base, 0, 0, 0, 0, 0, 0, H * 1.8, H * 1.8, H * 1.8);
    const wood = u.alive ? COLORS.wood : COLORS.dead;
    this.put('siegeBase', this.chain(this.m, base, 0, 0.25, 0, 0, 0, 0, 0.5, 0.18, 0.8), wood);
    for (const x of [-0.3, 0.3]) this.put('wheel', this.chain(this.m, base, x, 0.2, 0.2, 0, 0, 0, 0.4, 0.4, 0.4), COLORS.dark);
    if (defId === 'mangonel') {
      // Wurfarm: hinten angelenkt, Ruhe nach hinten geneigt; beim Treffer nach vorn geschlagen
      let angle = -1.1;
      if (pose === 'windup') angle = -1.1 - 0.2 * prog;
      else if (pose === 'strike') angle = 0.6;
      else if (pose === 'recovery') angle = 0.6 - 1.7 * prog;
      const arm = this.chain(new THREE.Matrix4(), base, 0, 0.3, -0.25, -angle, 0, 0);
      this.put('siegeArm', this.chain(this.m, arm, 0, 0, 0, 0, 0, 0, 1, 0.9, 1), wood);
      this.put('siegeBucket', this.chain(this.m, arm, 0, 0.9, 0, 0, 0, 0, 0.14, 0.14, 0.14), COLORS.dark);
      this.put('torso', this.chain(this.m, base, 0, 0.42, -0.3, 0, 0, 0, 0.2, 0.2, 0.2), team); // Fähnchen/Teamfarbe
    } else {
      // Springald: liegende Bogenarme, Bolzen auf der Schiene
      const draw = pose === 'windup' ? 0.15 * prog : pose === 'strike' ? -0.1 : 0;
      this.put('springBow', this.chain(this.m, base, 0, 0.45, 0.3, 0, 0.35 - draw, 0, 0.9, 1, 1), wood);
      this.put('springBow', this.chain(this.m, base, 0, 0.45, 0.3, 0, -0.35 + draw, 0, 0.9, 1, 1), wood);
      if (pose !== 'strike') this.put('bolt', this.chain(this.m, base, 0, 0.48, 0.1, 0, 0, 0, 1, 1, 0.7), COLORS.steel);
      this.put('torso', this.chain(this.m, base, 0, 0.42, -0.3, 0, 0, 0, 0.2, 0.2, 0.2), team);
    }
  }
}

const IDENTITY = new THREE.Matrix4();

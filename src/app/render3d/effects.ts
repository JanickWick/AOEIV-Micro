/**
 * Effekte: Projektile als fliegende Instanzen mit Bogenbahn (Tempo aus der Simulation), Mangonel-
 * Einschlagzone am Boden, Partikel (Einschlagstaub, Ansturm-Staub, Trefferfunken), Klickmarker.
 */
import * as THREE from 'three';
import { lerp, type Vec2 } from '../../sim/math';
import type { SimEvent, World } from '../../sim/types';
import { PLAYER_COLORS_HEX } from '../unitVisual';

const MAX_PROJ = 1024;
const MAX_PARTICLES = 2048;
const MAX_MARKERS = 32;

interface Particle {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  maxLife: number;
  size: number;
  color: number;
  gravity: number;
}

interface Marker {
  pos: Vec2;
  bornMs: number;
  kind: 'move' | 'attack' | 'queue';
}

export class EffectsRenderer {
  readonly group = new THREE.Group();
  private arrows: THREE.InstancedMesh;
  private stones: THREE.InstancedMesh;
  private impactRings: THREE.InstancedMesh;
  private particles: THREE.InstancedMesh;
  private markerRings: THREE.InstancedMesh;
  private pool: Particle[] = [];
  private markers: Marker[] = [];
  private dummy = new THREE.Object3D();
  private color = new THREE.Color();
  private lastMs = 0;
  private chargeDustTick = new Map<number, number>();

  constructor() {
    const arrowGeo = new THREE.BoxGeometry(0.02, 0.02, 0.4);
    this.arrows = new THREE.InstancedMesh(arrowGeo, new THREE.MeshStandardMaterial({ color: 0xd9c9a8, roughness: 0.7 }), MAX_PROJ);
    const stoneGeo = new THREE.DodecahedronGeometry(0.1, 0);
    this.stones = new THREE.InstancedMesh(stoneGeo, new THREE.MeshStandardMaterial({ color: 0x7a7570, roughness: 1 }), 128);
    const ringGeo = new THREE.RingGeometry(0.9, 1, 32);
    ringGeo.rotateX(-Math.PI / 2);
    this.impactRings = new THREE.InstancedMesh(ringGeo, new THREE.MeshBasicMaterial({ color: 0xfb923c, transparent: true, opacity: 0.6, depthWrite: false }), 128);
    this.impactRings.position.y = 0.03;
    const pGeo = new THREE.TetrahedronGeometry(1, 0);
    this.particles = new THREE.InstancedMesh(pGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85, depthWrite: false }), MAX_PARTICLES);
    const mGeo = new THREE.RingGeometry(0.75, 1, 32);
    mGeo.rotateX(-Math.PI / 2);
    this.markerRings = new THREE.InstancedMesh(mGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85, depthWrite: false }), MAX_MARKERS);
    this.markerRings.position.y = 0.04;
    for (const m of [this.arrows, this.stones, this.impactRings, this.particles, this.markerRings]) {
      m.count = 0;
      m.frustumCulled = false;
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      this.group.add(m);
    }
    this.arrows.castShadow = true;
  }

  addMarker(pos: Vec2, kind: Marker['kind'], nowMs: number): void {
    this.markers.push({ pos: { x: pos.x, y: pos.y }, bornMs: nowMs, kind });
    if (this.markers.length > MAX_MARKERS) this.markers.shift();
  }

  private seed = 1;
  private rnd(): number {
    this.seed = (this.seed * 1664525 + 1013904223) >>> 0;
    return this.seed / 4294967296;
  }

  private spawn(x: number, y: number, z: number, n: number, color: number, speed: number, up: number, life: number, size: number, gravity: number): void {
    const rnd = () => this.rnd();
    for (let i = 0; i < n; i++) {
      if (this.pool.length >= MAX_PARTICLES) this.pool.shift();
      const a = rnd() * Math.PI * 2;
      const s = speed * (0.4 + rnd() * 0.6);
      this.pool.push({ x, y, z, vx: Math.cos(a) * s, vy: up * (0.5 + rnd() * 0.8), vz: Math.sin(a) * s, life: 0, maxLife: life * (0.7 + rnd() * 0.6), size: size * (0.6 + rnd() * 0.8), color, gravity });
    }
  }

  /** Ereignisse der Simulation in Partikel umsetzen. */
  consume(world: World, events: readonly SimEvent[]): void {
    this.seed = (world.tick * 7919 + 13) >>> 0;
    for (const e of events) {
      if (e.kind === 'hit') {
        const t = world.units[e.targetId - 1];
        if (!t) continue;
        const sparks = e.weaponType === 'melee' ? 7 : 4;
        this.spawn(t.pos.x, 0.35, t.pos.y, sparks, e.weaponType === 'melee' ? 0xfff1a8 : 0xffd6a8, 1.6, 1.2, 0.35, 0.04, 4);
        if (e.charge) this.spawn(t.pos.x, 0.2, t.pos.y, 12, 0xc9b48a, 1.2, 1.0, 0.7, 0.08, 1.5);
      } else if (e.kind === 'died') {
        const t = world.units[e.unitId - 1];
        if (t) this.spawn(t.pos.x, 0.1, t.pos.y, 10, 0xb8a384, 0.9, 0.6, 0.8, 0.07, 1.2);
      }
    }
    // Mangonel-Einschlag: Geschosse, die diesen Tick am Ziel ankamen, fehlen in world.projectiles → Einschlag über 'hit'-Ereignisse mit Belagerungswaffe
    for (const e of events) {
      if (e.kind === 'hit' && e.weaponType === 'siege') {
        const t = world.units[e.targetId - 1];
        if (t) this.spawn(t.pos.x, 0.1, t.pos.y, 14, 0xa89070, 1.8, 1.6, 0.9, 0.1, 1.5);
      }
    }
    // Ansturm-Staub hinter anstürmenden Einheiten
    for (const u of world.units) {
      if (!u.alive || !u.charge?.charging) continue;
      const last = this.chargeDustTick.get(u.id) ?? -10;
      if (world.tick - last < 4) continue;
      this.chargeDustTick.set(u.id, world.tick);
      this.spawn(u.pos.x - Math.cos(u.heading) * 0.4, 0.05, u.pos.y - Math.sin(u.heading) * 0.4, 3, 0xc2b08e, 0.5, 0.5, 0.6, 0.07, 0.8);
    }
  }

  /** Einschläge von Geschossen auf Bodenpunkte (Mangonel), auch ohne Treffer. */
  noteImpacts(world: World, before: readonly { id: number; targetPos: Vec2; splashRadius: number }[]): void {
    const now = new Set(world.projectiles.map((p) => p.id));
    for (const p of before) {
      if (p.splashRadius > 0 && !now.has(p.id)) {
        this.seed = (p.id * 31 + 7) >>> 0;
        this.spawn(p.targetPos.x, 0.1, p.targetPos.y, 18, 0xa89070, 2.0, 1.8, 1.0, 0.11, 1.5);
      }
    }
  }

  update(world: World, alpha: number, nowMs: number): void {
    const dt = this.lastMs ? Math.min(0.05, (nowMs - this.lastMs) / 1000) : 0;
    this.lastMs = nowMs;

    // Projektile
    let na = 0;
    let ns = 0;
    let nr = 0;
    for (const p of world.projectiles) {
      const pos = lerp(p.prevPos, p.pos, alpha);
      const total = Math.hypot(p.targetPos.x - p.origin.x, p.targetPos.y - p.origin.y) || 1;
      const done = Math.hypot(pos.x - p.origin.x, pos.y - p.origin.y);
      const t = Math.min(1, done / total);
      const hmax = p.splashRadius > 0 ? Math.max(1.0, total * 0.35) : Math.max(0.3, total * 0.12);
      const h = 0.5 + hmax * Math.sin(Math.PI * t);
      const t2 = Math.min(1, t + 0.03);
      const h2 = 0.5 + hmax * Math.sin(Math.PI * t2);
      const dirx = p.targetPos.x - pos.x;
      const dirz = p.targetPos.y - pos.y;
      const dl = Math.hypot(dirx, dirz) || 1;
      const ahead = (t2 - t) * total;
      this.dummy.position.set(pos.x, h, pos.y);
      this.dummy.lookAt(pos.x + (dirx / dl) * ahead, h2, pos.y + (dirz / dl) * ahead);
      if (p.splashRadius > 0) {
        this.dummy.scale.setScalar(1.3);
        this.dummy.updateMatrix();
        if (ns < 128) this.stones.setMatrixAt(ns++, this.dummy.matrix);
        this.dummy.position.set(p.targetPos.x, 0, p.targetPos.y);
        this.dummy.rotation.set(0, 0, 0);
        this.dummy.scale.setScalar(p.splashRadius);
        this.dummy.updateMatrix();
        if (nr < 128) this.impactRings.setMatrixAt(nr++, this.dummy.matrix);
      } else {
        this.dummy.scale.set(1, 1, p.weaponType === 'ranged' && p.damage >= 11 ? 0.8 : 1);
        this.dummy.updateMatrix();
        if (na < MAX_PROJ) {
          this.arrows.setMatrixAt(na, this.dummy.matrix);
          this.arrows.setColorAt(na, this.color.setHex(p.player === 0 ? 0xe8dcc0 : 0xf0c8c0));
          na++;
        }
      }
    }
    this.arrows.count = na;
    this.arrows.instanceMatrix.needsUpdate = true;
    if (this.arrows.instanceColor) this.arrows.instanceColor.needsUpdate = true;
    this.stones.count = ns;
    this.stones.instanceMatrix.needsUpdate = true;
    this.impactRings.count = nr;
    this.impactRings.instanceMatrix.needsUpdate = true;

    // Partikel
    let np = 0;
    for (let i = this.pool.length - 1; i >= 0; i--) {
      const q = this.pool[i]!;
      q.life += dt;
      if (q.life >= q.maxLife) {
        this.pool.splice(i, 1);
        continue;
      }
      q.vy -= q.gravity * dt;
      q.x += q.vx * dt;
      q.y += q.vy * dt;
      q.z += q.vz * dt;
      if (q.y < 0.02) {
        q.y = 0.02;
        q.vy = 0;
        q.vx *= 0.8;
        q.vz *= 0.8;
      }
      const k = 1 - q.life / q.maxLife;
      this.dummy.position.set(q.x, q.y, q.z);
      this.dummy.rotation.set(q.life * 3, q.life * 2, 0);
      this.dummy.scale.setScalar(q.size * (0.4 + 0.6 * k));
      this.dummy.updateMatrix();
      this.particles.setMatrixAt(np, this.dummy.matrix);
      this.particles.setColorAt(np, this.color.setHex(q.color));
      np++;
    }
    this.particles.count = np;
    this.particles.instanceMatrix.needsUpdate = true;
    if (this.particles.instanceColor) this.particles.instanceColor.needsUpdate = true;

    // Klickmarker: grün Bewegen, rot Angriff, gelb eingereiht; Ring schrumpft in 0,6 s
    let nm = 0;
    this.markers = this.markers.filter((m) => nowMs - m.bornMs < 600);
    for (const m of this.markers) {
      const k = (nowMs - m.bornMs) / 600;
      this.dummy.position.set(m.pos.x, 0, m.pos.y);
      this.dummy.rotation.set(0, 0, 0);
      this.dummy.scale.setScalar(0.25 + 0.45 * (1 - k));
      this.dummy.updateMatrix();
      this.markerRings.setMatrixAt(nm, this.dummy.matrix);
      this.markerRings.setColorAt(nm, this.color.setHex(m.kind === 'move' ? 0x86efac : m.kind === 'attack' ? 0xf87171 : 0xfde047));
      nm++;
    }
    this.markerRings.count = nm;
    this.markerRings.instanceMatrix.needsUpdate = true;
    if (this.markerRings.instanceColor) this.markerRings.instanceColor.needsUpdate = true;
  }
}

export { PLAYER_COLORS_HEX };

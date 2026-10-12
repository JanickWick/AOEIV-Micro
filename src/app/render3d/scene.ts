/**
 * Three.js-Szene (G1): Gelände mit prozeduraler Textur, Deko (Bäume, Felsen, Büsche, Gebäude-
 * Kulisse) als Instanzen, Einheiten als Platzhalter-Instanzen mit Teamfarbe, Auswahlringe,
 * warmes Tageslicht mit weichen Schatten. Alle Grafiken sind hier erzeugt (keine Fremdassets).
 */
import * as THREE from 'three';
import { lerp, lerpAngle } from '../../sim/math';
import type { UnitId, UnitState, World } from '../../sim/types';
import type { Camera3D } from '../camera3d';
import { PLAYER_COLORS_HEX } from '../unitVisual';

const MAX_UNITS = 512;
const DEATH_FADE_TICKS = 60;

export interface SceneOptions {
  shadows: boolean;
}

export class Scene3D {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  private sun: THREE.DirectionalLight;
  private ground: THREE.Mesh | null = null;
  private outer: THREE.Mesh;
  private decorGroup = new THREE.Group();
  private units: Record<'infantry' | 'cavalry' | 'siege', THREE.InstancedMesh>;
  private rings: THREE.InstancedMesh;
  private hoverRing: THREE.Mesh;
  private dummy = new THREE.Object3D();
  private color = new THREE.Color();
  private worldRef: World | null = null;
  private lastDecorWorld: World | null = null;

  constructor(canvas: HTMLCanvasElement, opts: SceneOptions) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    this.renderer.shadowMap.enabled = opts.shadows;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.scene.background = new THREE.Color(0x0b0f0a);
    this.scene.fog = new THREE.Fog(0xcdd6c2, 140, 320);

    const hemi = new THREE.HemisphereLight(0xdfe9ff, 0x6b5a3a, 0.75);
    this.scene.add(hemi);
    this.sun = new THREE.DirectionalLight(0xfff1d6, 2.4);
    this.sun.castShadow = opts.shadows;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.camera.near = 1;
    this.sun.shadow.camera.far = 200;
    this.sun.shadow.bias = -0.0005;
    this.sun.shadow.normalBias = 0.02;
    this.scene.add(this.sun);
    this.scene.add(this.sun.target);

    // Boden außerhalb der Karte
    this.outer = new THREE.Mesh(new THREE.PlaneGeometry(1000, 1000), new THREE.MeshLambertMaterial({ color: 0x3b4d2e }));
    this.outer.rotation.x = -Math.PI / 2;
    this.outer.position.y = -0.05;
    this.outer.receiveShadow = true;
    this.scene.add(this.outer);
    this.scene.add(this.decorGroup);

    const mat = (c: number) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.85, metalness: 0.05 });
    const mk = (geo: THREE.BufferGeometry) => {
      const m = new THREE.InstancedMesh(geo, mat(0xffffff), MAX_UNITS);
      m.castShadow = true;
      m.receiveShadow = false;
      m.count = 0;
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      this.scene.add(m);
      return m;
    };
    // Platzhalter in Video-Maßstab: Infanterie ≈ 0,6 Tiles hoch, Kavallerie ≈ 0,8 lang/hoch, Belagerung ≈ 1 Tile.
    const infantry = new THREE.CapsuleGeometry(0.12, 0.36, 4, 10);
    infantry.translate(0, 0.3, 0);
    const cavalry = new THREE.CapsuleGeometry(0.17, 0.5, 4, 10);
    cavalry.rotateZ(Math.PI / 2);
    cavalry.translate(0, 0.45, 0);
    const siege = new THREE.BoxGeometry(1.0, 0.5, 0.8);
    siege.translate(0, 0.28, 0);
    this.units = { infantry: mk(infantry), cavalry: mk(cavalry), siege: mk(siege) };

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

  setShadows(on: boolean): void {
    this.renderer.shadowMap.enabled = on;
    this.sun.castShadow = on;
    this.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.material) (Array.isArray(m.material) ? m.material : [m.material]).forEach((x) => (x.needsUpdate = true));
    });
  }

  resize(w: number, h: number): void {
    this.renderer.setSize(w, h, false);
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
    const tex = makeGroundTexture(world);
    const geo = new THREE.PlaneGeometry(world.map.width, world.map.height, 1, 1);
    geo.rotateX(-Math.PI / 2);
    geo.translate(world.map.width / 2, 0, world.map.height / 2);
    this.ground = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: tex, roughness: 1, metalness: 0 }));
    this.ground.receiveShadow = true;
    this.scene.add(this.ground);
    this.buildDecor(world);
  }

  private buildDecor(world: World): void {
    this.decorGroup.clear();
    const trees = world.decor.filter((d) => d.kind === 'tree');
    const rocks = world.decor.filter((d) => d.kind === 'rock');
    const bushes = world.decor.filter((d) => d.kind === 'bush');
    const houses = world.decor.filter((d) => d.kind === 'building');
    const add = (geo: THREE.BufferGeometry, color: number, items: typeof trees, place: (d: (typeof trees)[number], i: number) => void, vary = 0.08) => {
      if (items.length === 0) return;
      const mesh = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9 }), items.length);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      items.forEach((d, i) => {
        this.dummy.position.set(d.pos.x, 0, d.pos.y);
        this.dummy.rotation.set(0, d.rotation, 0);
        this.dummy.scale.setScalar(d.scale);
        place(d, i);
        this.dummy.updateMatrix();
        mesh.setMatrixAt(i, this.dummy.matrix);
        const c = this.color.setHex(color);
        const h = ((d.pos.x * 7.3 + d.pos.y * 3.1) % 1) - 0.5;
        c.offsetHSL(h * vary * 0.5, 0, h * vary);
        mesh.setColorAt(i, c);
      });
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      this.decorGroup.add(mesh);
    };
    const trunk = new THREE.CylinderGeometry(0.12, 0.18, 1.2, 6);
    trunk.translate(0, 0.6, 0);
    add(trunk, 0x6b4a2b, trees, () => undefined, 0.05);
    const crown = new THREE.IcosahedronGeometry(1.0, 1);
    crown.scale(1, 1.25, 1);
    crown.translate(0, 2.0, 0);
    add(crown, 0x4f7a32, trees, () => undefined, 0.18);
    const rock = new THREE.DodecahedronGeometry(0.8, 0);
    rock.scale(1.1, 0.7, 0.9);
    rock.translate(0, 0.35, 0);
    add(rock, 0x8a8578, rocks, () => undefined, 0.06);
    const bush = new THREE.IcosahedronGeometry(0.55, 1);
    bush.scale(1.2, 0.7, 1.1);
    bush.translate(0, 0.35, 0);
    add(bush, 0x5f8a3a, bushes, () => undefined, 0.2);
    // Gebäude: Mauerblock plus Pyramidendach, Größe aus den Daten
    const wall = new THREE.BoxGeometry(1, 1, 1);
    wall.translate(0, 0.5, 0);
    add(wall, 0xb7a58c, houses, (d) => {
      this.dummy.scale.set(d.size?.w ?? 3, 2.4, d.size?.h ?? 3);
    }, 0.05);
    const roof = new THREE.ConeGeometry(0.78, 1, 4);
    roof.rotateY(Math.PI / 4);
    roof.translate(0, 0.5, 0);
    add(roof, 0x7a3b2e, houses, (d) => {
      this.dummy.position.y = 2.4;
      this.dummy.scale.set((d.size?.w ?? 3) * 1.02, 1.4, (d.size?.h ?? 3) * 1.02);
    }, 0.06);
  }

  render(world: World, cam: Camera3D, alpha: number, selection: ReadonlySet<UnitId>, hoverId: UnitId | null): void {
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

    const counts = { infantry: 0, cavalry: 0, siege: 0 };
    let ringCount = 0;
    this.hoverRing.visible = false;
    for (const u of world.units) {
      const dead = !u.alive;
      if (dead && world.tick - u.diedTick > DEATH_FADE_TICKS) continue;
      const kind = world.defs.get(u.defId).kind;
      const mesh = this.units[kind];
      const i = counts[kind]++;
      if (i >= MAX_UNITS) break;
      const p = dead ? u.pos : lerp(u.prevPos, u.pos, alpha);
      const heading = lerpAngle(u.prevHeading, u.heading, alpha);
      this.dummy.position.set(p.x, 0, p.y);
      this.dummy.rotation.set(0, -heading, 0);
      if (dead) {
        const t = (world.tick - u.diedTick) / DEATH_FADE_TICKS;
        this.dummy.rotation.z = (Math.PI / 2) * Math.min(1, t * 3);
        this.dummy.scale.set(1, 1, 1);
        this.dummy.position.y = -t * 0.8;
      } else {
        this.dummy.scale.set(1, 1, 1);
      }
      this.dummy.updateMatrix();
      mesh.setMatrixAt(i, this.dummy.matrix);
      this.color.setHex(dead ? 0x4b5563 : PLAYER_COLORS_HEX[u.player]);
      mesh.setColorAt(i, this.color);
      if (!dead && selection.has(u.id)) {
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
    for (const k of ['infantry', 'cavalry', 'siege'] as const) {
      const m = this.units[k];
      m.count = counts[k];
      m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
    }
    this.rings.count = ringCount;
    this.rings.instanceMatrix.needsUpdate = true;
    this.renderer.render(this.scene, cam.three);
  }

  dispose(): void {
    this.renderer.dispose();
  }
}

/** Prozedurale Boden-Textur: Gras mit Farbvariation, Erdflecken, feines Rauschen. */
function makeGroundTexture(world: World): THREE.CanvasTexture {
  const px = 16;
  const w = Math.min(2048, world.map.width * px);
  const h = Math.min(2048, world.map.height * px);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  let seed = world.seed * 9973 + 17;
  const rnd = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  ctx.fillStyle = '#6f8a3c';
  ctx.fillRect(0, 0, w, h);
  const blob = (color: string, count: number, rMin: number, rMax: number, alpha: number) => {
    ctx.globalAlpha = alpha;
    ctx.fillStyle = color;
    for (let i = 0; i < count; i++) {
      const r = rMin + rnd() * (rMax - rMin);
      ctx.beginPath();
      ctx.ellipse(rnd() * w, rnd() * h, r, r * (0.6 + rnd() * 0.6), rnd() * Math.PI, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  };
  blob('#8a9a3e', 260, 20, 90, 0.35); // trockeneres Gras
  blob('#5d7f36', 220, 20, 80, 0.3); // sattes Gras
  blob('#a58a55', 90, 12, 60, 0.35); // Erde
  blob('#b9a56c', 60, 6, 30, 0.3); // Sand
  // feines Rauschen
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (rnd() - 0.5) * 18;
    d[i] = Math.max(0, Math.min(255, d[i]! + n));
    d[i + 1] = Math.max(0, Math.min(255, d[i + 1]! + n));
    d[i + 2] = Math.max(0, Math.min(255, d[i + 2]! + n * 0.6));
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  return tex;
}

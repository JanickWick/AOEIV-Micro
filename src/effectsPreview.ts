/**
 * Vorschau der Kampfeffekte mit synthetischen Ereignissen (ohne Simulation): fliegende Pfeile und
 * Steine, Einschlag mit Krater und Staub, Treffer-Funken, Klickmarker. Dient der Sichtprüfung
 * der Effekte, die im Spiel nur mitten im Gefecht kurz zu sehen sind.
 */
import * as THREE from 'three';
import { EffectsRenderer } from './app/render3d/effects';
import { loadTerrainTextures } from './app/render3d/terrain';
import type { Projectile, SimEvent, World } from './sim/types';

const canvas = document.getElementById('view') as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.shadowMap.enabled = true;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x2a2d33);
scene.add(new THREE.HemisphereLight(0xdfe9ff, 0x6b5a3a, 0.75));
const sun = new THREE.DirectionalLight(0xfff1d6, 2.4);
sun.position.set(-6, 12, 5);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = sun.shadow.camera.bottom = -12;
sun.shadow.camera.right = sun.shadow.camera.top = 12;
scene.add(sun);
const tex = loadTerrainTextures();
tex.grass.repeat.set(4, 4);
const ground = new THREE.Mesh(new THREE.PlaneGeometry(20, 20), new THREE.MeshStandardMaterial({ map: tex.grass, roughness: 1 }));
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

const effects = new EffectsRenderer();
scene.add(effects.group);
(window as unknown as { fx: EffectsRenderer }).fx = effects; // Prüfung per Konsole

const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 100);
camera.position.set(0, 9, 11);
camera.lookAt(0, 0, 0);
function resize(): void {
  const w = canvas.clientWidth, h = canvas.clientHeight;
  renderer.setSize(w, h, false);
  renderer.setPixelRatio(Math.min(2, devicePixelRatio));
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);
resize();

// Minimale Welt: nur die Felder, die der Effekt-Renderer liest
const projectiles: Projectile[] = [];
const units = [
  { id: 1, alive: true, pos: { x: -3, y: 0 }, heading: 0, charge: null },
  { id: 2, alive: true, pos: { x: 3, y: 0 }, heading: Math.PI, charge: null },
  { id: 3, alive: true, pos: { x: 0, y: 3 }, heading: Math.PI / 2, charge: { charging: true } },
];
const world = { tick: 0, projectiles, units } as unknown as World;

let t0 = performance.now();
let nextVolley = 0;
let nextStone = 0;
const stoneBefore: { id: number; targetPos: { x: number; y: number }; splashRadius: number }[] = [];
let nextId = 1;
/** Bewegt ein Geschoss geradlinig; liefert true, wenn es angekommen ist. */
function flight(p: Projectile, speed: number, now: number): boolean {
  const dx = p.targetPos.x - p.origin.x, dy = p.targetPos.y - p.origin.y;
  const len = Math.hypot(dx, dy) || 1;
  const d = Math.min(len, (now - (p as unknown as { born: number }).born) * speed);
  p.prevPos = { ...p.pos };
  p.pos = { x: p.origin.x + (dx / len) * d, y: p.origin.y + (dy / len) * d };
  return d >= len;
}
function frame(): void {
  const nowMs = performance.now();
  const now = (nowMs - t0) / 1000;
  world.tick++;
  // Ansturm-Staub: Einheit 3 bewegt sich im Kreis
  units[2]!.pos = { x: Math.cos(now * 0.6) * 4, y: Math.sin(now * 0.6) * 4 };
  units[2]!.heading = now * 0.6 + Math.PI / 2;
  // Salve alle 1,5 s: Pfeile beider Seiten
  if (now > nextVolley) {
    nextVolley = now + 1.5;
    for (let i = 0; i < 6; i++) {
      const from = i % 2 ? units[0]!.pos : units[1]!.pos;
      const to = i % 2 ? units[1]!.pos : units[0]!.pos;
      const p = { id: nextId++, player: i % 2, origin: { x: from.x, y: from.y + (i - 3) * 0.3 }, pos: { x: from.x, y: from.y }, prevPos: { x: from.x, y: from.y }, targetPos: { x: to.x, y: to.y + (i - 3) * 0.2 }, splashRadius: 0, weaponType: 'ranged', damage: 8, born: now } as unknown as Projectile;
      projectiles.push(p);
    }
    effects.addMarker({ x: 2 + Math.random() * 2, y: -3 }, (['move', 'attack', 'queue'] as const)[Math.floor(Math.random() * 3)]!, nowMs);
  }
  // Mangonel-Stein alle 4 s auf einen zufälligen Punkt
  if (now > nextStone) {
    nextStone = now + 4;
    const target = { x: (Math.random() - 0.5) * 8, y: (Math.random() - 0.5) * 6 };
    projectiles.push({ id: nextId++, player: 1, origin: { x: 7, y: -6 }, pos: { x: 7, y: -6 }, prevPos: { x: 7, y: -6 }, targetPos: target, splashRadius: 1.4, weaponType: 'siege', damage: 30, born: now } as unknown as Projectile);
  }
  stoneBefore.length = 0;
  for (const p of projectiles) if (p.splashRadius > 0) stoneBefore.push({ id: p.id, targetPos: { ...p.targetPos }, splashRadius: p.splashRadius });
  const events: SimEvent[] = [];
  for (let i = projectiles.length - 1; i >= 0; i--) {
    const p = projectiles[i]!;
    if (flight(p, p.splashRadius > 0 ? 6 : 14, now)) {
      projectiles.splice(i, 1);
      if (p.splashRadius === 0) events.push({ kind: 'hit', targetId: p.player === 0 ? 2 : 1, weaponType: 'ranged' } as unknown as SimEvent);
    }
  }
  if (world.tick % 90 === 0) events.push({ kind: 'hit', targetId: 1, weaponType: 'melee', charge: world.tick % 180 === 0 } as unknown as SimEvent);
  effects.noteImpacts(world, stoneBefore);
  effects.consume(world, events);
  effects.update(world, 1, nowMs, camera.quaternion);
  renderer.render(scene, camera);
  document.getElementById('stats')!.textContent = `${projectiles.length} Geschosse`;
  requestAnimationFrame(frame);
}
t0 = performance.now();
requestAnimationFrame(frame);

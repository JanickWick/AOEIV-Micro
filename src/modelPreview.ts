/** Vorschau erzeugter glTF-Modelle (Bild → 3D) mit Statistik. */
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

const canvas = document.getElementById('view') as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.shadowMap.enabled = true;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x2a2d33);
scene.add(new THREE.HemisphereLight(0xdfe9ff, 0x6b5a3a, 0.8));
const sun = new THREE.DirectionalLight(0xfff1d6, 2.2);
sun.position.set(-2, 4, 1.5);
sun.castShadow = true;
scene.add(sun);
const ground = new THREE.Mesh(new THREE.CircleGeometry(1.6, 48), new THREE.MeshStandardMaterial({ color: 0x8a7a4f, roughness: 1 }));
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);
scene.add(new THREE.GridHelper(3, 12, 0x555555, 0x3a3f48));

const camera = new THREE.PerspectiveCamera(35, 1, 0.05, 50);
let yaw = 0.6, pitch = 0.3, dist = 2.6, spin = true;
const target = new THREE.Vector3(0, 0.5, 0);
let dragging = false, lx = 0, ly = 0;
canvas.addEventListener('pointerdown', (e) => { dragging = true; lx = e.clientX; ly = e.clientY; });
window.addEventListener('pointerup', () => (dragging = false));
window.addEventListener('pointermove', (e) => {
  if (!dragging) return;
  yaw -= (e.clientX - lx) * 0.01;
  pitch = Math.max(-0.2, Math.min(1.4, pitch + (e.clientY - ly) * 0.01));
  lx = e.clientX; ly = e.clientY;
});
canvas.addEventListener('wheel', (e) => { dist = Math.max(0.8, Math.min(6, dist * (1 + e.deltaY * 0.001))); e.preventDefault(); }, { passive: false });

const sel = document.getElementById('model') as HTMLSelectElement;
const stats = document.getElementById('stats')!;
const wireBtn = document.getElementById('wire') as HTMLButtonElement;
const spinBtn = document.getElementById('spin') as HTMLButtonElement;
const params = new URLSearchParams(location.search);
const list = (params.get('files') ?? 'assets/raw/models/archer-hunyuan-mv.glb,assets/raw/models/archer-trellis.glb').split(',');
for (const f of list) sel.append(new Option(f.split('/').pop()!, f));
if (params.get('file')) sel.value = params.get('file')!;
if (params.get('yaw')) yaw = Number(params.get('yaw'));
if (params.get('spin') === '0') { spin = false; spinBtn.classList.remove('active'); }
let current: THREE.Object3D | null = null;
let wire = false;

async function load(file: string): Promise<void> {
  if (current) scene.remove(current);
  stats.textContent = 'Lade …';
  try {
    const gltf = await new GLTFLoader().loadAsync(file);
    const root = gltf.scene;
    let tris = 0, verts = 0;
    const textures = new Set<string>();
    root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      m.castShadow = true;
      const g = m.geometry;
      verts += g.getAttribute('position').count;
      tris += (g.index ? g.index.count : g.getAttribute('position').count) / 3;
      const mats = Array.isArray(m.material) ? m.material : [m.material];
      for (const mat of mats) {
        const sm = mat as THREE.MeshStandardMaterial;
        const img = sm.map?.image as { width?: number; height?: number } | undefined; if (img?.width) textures.add(`${img.width}×${img.height}`);
        sm.wireframe = wire;
      }
    });
    // Auf Höhe 1 normieren, Füße auf den Boden
    const box = new THREE.Box3().setFromObject(root);
    const size = box.getSize(new THREE.Vector3());
    const s = 1 / size.y;
    root.scale.setScalar(s);
    const box2 = new THREE.Box3().setFromObject(root);
    root.position.set(-(box2.min.x + box2.max.x) / 2, -box2.min.y, -(box2.min.z + box2.max.z) / 2);
    scene.add(root);
    current = root;
    stats.textContent = `${file}\n${verts} Vertices, ${Math.round(tris)} Dreiecke\nTexturen: ${[...textures].join(', ') || 'keine'}\nMaße (roh): ${size.x.toFixed(2)} × ${size.y.toFixed(2)} × ${size.z.toFixed(2)}`;
  } catch (e) {
    stats.textContent = `Fehler: ${(e as Error).message}`;
  }
}
sel.onchange = () => void load(sel.value);
wireBtn.onclick = () => { wire = !wire; wireBtn.classList.toggle('active', wire); void load(sel.value); };
spinBtn.onclick = () => { spin = !spin; spinBtn.classList.toggle('active', spin); };
void load(sel.value);

let last = performance.now();
function frame(now: number): void {
  const dt = (now - last) / 1000;
  last = now;
  if (spin && !dragging) yaw += dt * 0.5;
  const w = canvas.clientWidth, h = canvas.clientHeight;
  if (canvas.width !== w || canvas.height !== h) {
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  camera.position.set(target.x + dist * Math.cos(pitch) * Math.sin(yaw), target.y + dist * Math.sin(pitch), target.z + dist * Math.cos(pitch) * Math.cos(yaw));
  camera.lookAt(target);
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

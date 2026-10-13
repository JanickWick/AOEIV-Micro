/** Vorschau der geskinnten Figur: Clips, Zeit, Überblenden, Teamfarbe, Oberkörperdrehung. */
import * as THREE from 'three';
import { clipRow } from './app/render3d/skel/animBake';
import { createSkinnedModel, UNIT_SPECS } from './app/render3d/skel/skinnedUnits';
import { PLAYER_COLORS_HEX } from './app/unitVisual';

const canvas = document.getElementById('view') as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x2a2d33);
scene.add(new THREE.HemisphereLight(0xdfe9ff, 0x6b5a3a, 0.75));
const sun = new THREE.DirectionalLight(0xfff1d6, 2.4);
sun.position.set(-2, 4, 1.5);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = sun.shadow.camera.bottom = -2;
sun.shadow.camera.right = sun.shadow.camera.top = 2;
scene.add(sun);
const ground = new THREE.Mesh(new THREE.CircleGeometry(1.6, 48), new THREE.MeshStandardMaterial({ color: 0x8a7a4f, roughness: 1 }));
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);
scene.add(new THREE.GridHelper(3, 12, 0x555555, 0x3a3f48));

const query = new URLSearchParams(location.search);
const unitSel = document.getElementById('unit') as HTMLSelectElement;
for (const k of Object.keys(UNIT_SPECS)) unitSel.append(new Option(k, k));
unitSel.value = query.get('unit') ?? 'archer';
unitSel.addEventListener('change', () => { query.set('unit', unitSel.value); location.search = query.toString(); });
const spec = UNIT_SPECS[unitSel.value] ?? UNIT_SPECS.archer!;
const parts = spec.parts.map((part) => ({ part, model: createSkinnedModel(part, 'textures/units/', { capacity: 8, generated: query.get('gen') !== '0' }) }));
const model = parts[0]!.model;
for (const p of parts) scene.add(p.model.group);
const stats = document.getElementById('stats')!;
function showStats(): void {
  stats.textContent = parts.map((p) => `${p.part.key}: ${p.model.vertices} Vertices, ${p.model.triangles} Dreiecke, ${p.model.anim.clips.length} Clips`).join(' · ');
}
showStats();
void Promise.all(parts.map((p) => p.model.ready)).then(showStats);

const camera = new THREE.PerspectiveCamera(35, 1, 0.05, 50);
let yaw = 0.6, pitch = 0.35, dist = 2.6;
const target = new THREE.Vector3(0, 0.5, 0);
function placeCamera(): void {
  camera.position.set(target.x + dist * Math.cos(pitch) * Math.sin(yaw), target.y + dist * Math.sin(pitch), target.z + dist * Math.cos(pitch) * Math.cos(yaw));
  camera.lookAt(target);
}
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

const clipSel = document.getElementById('clip') as HTMLSelectElement;
const prevSel = document.getElementById('prev') as HTMLSelectElement;
for (const c of spec.parts[0]!.clips) {
  clipSel.append(new Option(`${c.name} (${c.duration} s${c.loop ? ', Schleife' : ''})`, c.name));
  prevSel.append(new Option(c.name, c.name));
}
const timeIn = document.getElementById('time') as HTMLInputElement;
const timeLabel = document.getElementById('time-label')!;
const playBtn = document.getElementById('play') as HTMLButtonElement;
const teamBtn = document.getElementById('team') as HTMLButtonElement;
const speedIn = document.getElementById('speed') as HTMLInputElement;
const twistIn = document.getElementById('twist') as HTMLInputElement;
const blendIn = document.getElementById('blend') as HTMLInputElement;
const wireBtn = document.getElementById('wire') as HTMLButtonElement;
const rowBtn = document.getElementById('row3') as HTMLButtonElement;
let playing = true, team = 0, t = 0, three = false;
playBtn.onclick = () => { playing = !playing; playBtn.classList.toggle('active', playing); };
teamBtn.onclick = () => { team = 1 - team; teamBtn.textContent = team ? 'Team: Rot' : 'Team: Blau'; };
wireBtn.onclick = () => { model.material.wireframe = !model.material.wireframe; wireBtn.classList.toggle('active', model.material.wireframe); };
rowBtn.onclick = () => { three = !three; rowBtn.classList.toggle('active', three); };
timeIn.oninput = () => { t = Number(timeIn.value); playing = false; playBtn.classList.remove('active'); };
clipSel.onchange = () => { t = 0; };
const params = new URLSearchParams(location.search);
if (params.get('clip')) clipSel.value = params.get('clip')!;
if (params.get('t')) { t = Number(params.get('t')); playing = false; playBtn.classList.remove('active'); }
if (params.get('team') === '1') teamBtn.click();
if (params.get('yaw')) yaw = Number(params.get('yaw'));
if (params.get('dist')) dist = Number(params.get('dist'));

const dummy = new THREE.Object3D();
const mountM = new THREE.Matrix4();
const tmpM = new THREE.Matrix4();
const color = new THREE.Color();
let last = performance.now();
function frame(now: number): void {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  const clip = model.anim.get(clipSel.value as never);
  if (playing) {
    t += (dt * Number(speedIn.value)) / clip.duration;
    if (clip.loop) t %= 1;
    else if (t > 1.3) t = 0;
  }
  timeIn.value = String(Math.min(1, t));
  timeLabel.textContent = Math.min(1, t).toFixed(2);
  const n = three ? 3 : 1;
  for (const { part, model: m } of parts) {
    const rowA = clipRow(m.anim.get(clipSel.value as never), t);
    const rowB = clipRow(m.anim.get(prevSel.value as never), 0);
    for (let i = 0; i < n; i++) {
      dummy.position.set((i - (n - 1) / 2) * 0.7, 0, 0);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.setScalar(1);
      dummy.updateMatrix();
      let mat = dummy.matrix;
      if (part.mount) {
        const mt = part.mount;
        mountM.makeTranslation(mt.at[0], mt.at[1] - mt.hip * mt.scale, mt.at[2]).multiply(tmpM.makeScale(mt.scale, mt.scale, mt.scale));
        mat = tmpM.multiplyMatrices(dummy.matrix, mountM);
      }
      m.mesh.setMatrixAt(i, mat);
      m.mesh.setColorAt(i, color.setHex(PLAYER_COLORS_HEX[(team + i) % 2]!));
      m.iAnim.setXYZW(i, rowA, rowB, Number(blendIn.value), Number(twistIn.value));
    }
    m.setCount(n);
    m.mesh.instanceMatrix.needsUpdate = true;
    if (m.mesh.instanceColor) m.mesh.instanceColor.needsUpdate = true;
    m.iAnim.needsUpdate = true;
  }
  const w = canvas.clientWidth, h = canvas.clientHeight;
  if (canvas.width !== w || canvas.height !== h) {
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  placeCamera();
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

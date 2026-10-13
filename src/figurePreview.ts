/** Vorschau der geskinnten Figur: Clips, Zeit, Überblenden, Teamfarbe, Oberkörperdrehung. */
import * as THREE from 'three';
import { HUMAN_CLIPS } from './app/render3d/skel/animClips';
import { clipRow } from './app/render3d/skel/animBake';
import { createArcherModel } from './app/render3d/skel/skinnedUnits';
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

const model = createArcherModel('textures/units/', 8);
const mesh = model.mesh;
mesh.count = 1;
scene.add(mesh);
const stats = document.getElementById('stats')!;
stats.textContent = `${model.vertices} Vertices, ${model.triangles} Dreiecke, ${model.anim.clips.length} Clips, Knochentextur ${model.anim.width}×${model.anim.height}`;

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
for (const c of HUMAN_CLIPS) {
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
  const rowA = clipRow(clip, t);
  const rowB = clipRow(model.anim.get(prevSel.value as never), 0);
  const n = three ? 3 : 1;
  for (let i = 0; i < n; i++) {
    dummy.position.set((i - (n - 1) / 2) * 0.6, 0, 0);
    dummy.rotation.set(0, 0, 0);
    dummy.scale.setScalar(1);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
    mesh.setColorAt(i, color.setHex(PLAYER_COLORS_HEX[(team + i) % 2]!));
    model.iAnim.setXYZW(i, rowA, rowB, Number(blendIn.value), Number(twistIn.value));
  }
  mesh.count = n;
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  model.iAnim.needsUpdate = true;
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

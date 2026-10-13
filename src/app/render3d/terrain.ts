/**
 * Gelände (Stufe 3, H4): vier kachelbare Bodentexturen werden über eine prozedurale Verteilungskarte
 * (Splat) gemischt: Gras als Grund, dazu sattes Gras, trockenes Gras, Erde und Sand in weichen
 * Flecken, plus eine großflächige Helligkeitsvariation gegen sichtbare Wiederholung.
 * Die Verteilung ist deterministisch aus dem Welt-Seed, damit jede Karte gleich aussieht.
 */
import * as THREE from 'three';
import type { World } from '../../sim/types';

/** Kacheln je Texturwiederholung (Tiles). */
const REPEAT_TILES = 5;

export interface TerrainTextures {
  grass: THREE.Texture;
  lush: THREE.Texture;
  dry: THREE.Texture;
  dirt: THREE.Texture;
  sand: THREE.Texture;
}

export function loadTerrainTextures(base = 'textures/terrain/'): TerrainTextures {
  const loader = new THREE.TextureLoader();
  const load = (name: string): THREE.Texture => {
    const t = loader.load(`${base}${name}.jpg`);
    t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 8;
    return t;
  };
  return { grass: load('grass'), lush: load('grass-lush'), dry: load('drygrass'), dirt: load('dirt'), sand: load('sand') };
}

/**
 * Verteilungskarte: R = sattes Gras, G = trockenes Gras, B = Erde, A = Sand (0..255), dazu eine
 * zweite Karte mit großflächiger Helligkeit (R) für die Variation.
 */
export function makeSplatMaps(world: World): { splat: THREE.DataTexture; macro: THREE.DataTexture } {
  const px = 4;
  const w = Math.min(1024, world.map.width * px);
  const h = Math.min(1024, world.map.height * px);
  let seed = world.seed * 9973 + 17;
  const rnd = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const data = new Uint8Array(w * h * 4);
  const acc = new Float32Array(w * h * 4);
  const blob = (ch: number, count: number, rMin: number, rMax: number, strength: number) => {
    for (let i = 0; i < count; i++) {
      const cx = rnd() * w, cy = rnd() * h;
      const r = (rMin + rnd() * (rMax - rMin)) * px;
      const ry = r * (0.6 + rnd() * 0.6);
      const ang = rnd() * Math.PI;
      const ca = Math.cos(ang), sa = Math.sin(ang);
      const x0 = Math.max(0, Math.floor(cx - r * 1.3)), x1 = Math.min(w - 1, Math.ceil(cx + r * 1.3));
      const y0 = Math.max(0, Math.floor(cy - r * 1.3)), y1 = Math.min(h - 1, Math.ceil(cy + r * 1.3));
      for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) {
          const dx = x - cx, dy = y - cy;
          const u = (dx * ca + dy * sa) / r, v = (-dx * sa + dy * ca) / ry;
          const d = u * u + v * v;
          if (d < 1) {
            const k = (y * w + x) * 4 + ch;
            acc[k] = acc[k]! + strength * (1 - d) * (1 - d);
          }
        }
      }
    }
  };
  // Anzahl je Bodenart wächst mit der Kartenfläche (Bezug 48×40 Tiles); Radien in Tiles
  const k = (world.map.width * world.map.height) / 1920;
  blob(0, Math.round(26 * k), 2, 5, 0.9); // sattes Gras
  blob(1, Math.round(18 * k), 2, 6, 0.75); // trockenes Gras
  blob(2, Math.round(10 * k), 1, 2.5, 0.95); // Erde
  blob(3, Math.round(6 * k), 0.7, 1.8, 0.9); // Sand
  // Kleine Unruhe, damit Ränder nicht glatt wirken
  for (let i = 0; i < w * h; i++) {
    const n = (rnd() - 0.5) * 0.12;
    for (let c = 0; c < 4; c++) data[i * 4 + c] = Math.max(0, Math.min(255, Math.round((acc[i * 4 + c]! + n) * 255)));
  }
  const splat = new THREE.DataTexture(data, w, h, THREE.RGBAFormat);
  splat.colorSpace = THREE.NoColorSpace;
  splat.magFilter = THREE.LinearFilter;
  splat.minFilter = THREE.LinearFilter;
  splat.needsUpdate = true;

  // Großflächige Helligkeit: wenige große Flecken
  const mw = 64, mh = 64;
  const mdata = new Uint8Array(mw * mh * 4);
  const macc = new Float32Array(mw * mh);
  for (let i = 0; i < 18; i++) {
    const cx = rnd() * mw, cy = rnd() * mh, r = 6 + rnd() * 14, s = (rnd() - 0.5) * 0.5;
    for (let y = 0; y < mh; y++) for (let x = 0; x < mw; x++) {
      const d = ((x - cx) ** 2 + (y - cy) ** 2) / (r * r);
      if (d < 1) {
        const k = y * mw + x;
        macc[k] = macc[k]! + s * (1 - d);
      }
    }
  }
  for (let i = 0; i < mw * mh; i++) {
    const v = Math.max(0, Math.min(255, Math.round((0.5 + macc[i]!) * 255)));
    mdata[i * 4] = v; mdata[i * 4 + 1] = v; mdata[i * 4 + 2] = v; mdata[i * 4 + 3] = 255;
  }
  const macro = new THREE.DataTexture(mdata, mw, mh, THREE.RGBAFormat);
  macro.colorSpace = THREE.NoColorSpace;
  macro.magFilter = THREE.LinearFilter;
  macro.minFilter = THREE.LinearFilter;
  macro.needsUpdate = true;
  return { splat, macro };
}

/** Bodenmaterial mit Vierfach-Mischung; UV = Weltkoordinaten / Karte. */
export function makeTerrainMaterial(world: World, tex: TerrainTextures): THREE.MeshStandardMaterial {
  const { splat, macro } = makeSplatMaps(world);
  const mat = new THREE.MeshStandardMaterial({ map: tex.grass, roughness: 1, metalness: 0 });
  const uniforms = {
    uLush: { value: tex.lush }, uDry: { value: tex.dry }, uDirt: { value: tex.dirt }, uSand: { value: tex.sand },
    uSplat: { value: splat }, uMacro: { value: macro },
    uRepeat: { value: new THREE.Vector2(world.map.width / REPEAT_TILES, world.map.height / REPEAT_TILES) },
  };
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform sampler2D uLush; uniform sampler2D uDry; uniform sampler2D uDirt; uniform sampler2D uSand;
        uniform sampler2D uSplat; uniform sampler2D uMacro; uniform vec2 uRepeat;`)
      .replace('#include <map_fragment>', `
        vec2 tuv = vMapUv * uRepeat;
        // Zweite, gedrehte Abtastung gegen Kachelwiederholung
        vec2 tuv2 = vec2(tuv.x * 0.7071 - tuv.y * 0.7071, tuv.x * 0.7071 + tuv.y * 0.7071) * 0.53;
        vec4 s = texture2D(uSplat, vMapUv);
        float base = max(0.0, 1.0 - s.r - s.g - s.b - s.a);
        vec3 g = mix(texture2D(map, tuv).rgb, texture2D(map, tuv2).rgb, 0.4);
        vec3 col = g * base
          + mix(texture2D(uLush, tuv).rgb, texture2D(uLush, tuv2).rgb, 0.4) * s.r
          + mix(texture2D(uDry, tuv).rgb, texture2D(uDry, tuv2).rgb, 0.4) * s.g
          + texture2D(uDirt, tuv).rgb * s.b
          + texture2D(uSand, tuv).rgb * s.a;
        float wsum = base + s.r + s.g + s.b + s.a;
        col /= max(wsum, 1e-3);
        float macroL = 0.82 + 0.36 * texture2D(uMacro, vMapUv).r;
        diffuseColor.rgb *= col * macroL;`);
  };
  mat.customProgramCacheKey = () => 'terrain-splat-v1';
  return mat;
}

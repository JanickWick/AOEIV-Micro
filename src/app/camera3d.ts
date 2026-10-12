/**
 * Perspektivische Kamera nach AoE4-Vorbild: Blick schräg von oben (Neigung 45°, Sichtfeld 35°,
 * aus dem Minimap-Trapez des Screenshots gelöst), um 45° gedreht, sodass die Karte als Raute
 * erscheint. Bildschirm-rechts = Weltrichtung (+x, +y)/√2, Bildschirm-oben = (+x, −y)/√2.
 * Weltkoordinaten (x, y) liegen in Three.js auf (x, 0, y); Höhe ist die Three-y-Achse.
 */
import { PerspectiveCamera, Vector3 } from 'three';
import { clamp, type Vec2 } from '../sim/math';
import type { ViewCamera, ViewRect } from './viewCamera';

export const CAMERA_PITCH_DEG = 45;
export const CAMERA_FOV_DEG = 35;
/** Kameraabstand in Tiles: ergibt ≈ 74 px pro Tile in Bildmitte bei 2560×1440 (Maßstab aus den Videos, 55,6 px/Tile bei 1080p). */
export const DEFAULT_DISTANCE = 31;
export const MIN_DISTANCE = 12;
export const MAX_DISTANCE = 70;

const S = Math.SQRT1_2;
/** Bildschirm-rechts und Bildschirm-oben als Bodenrichtungen. */
export const SCREEN_RIGHT: Vec2 = { x: S, y: S };
export const SCREEN_UP: Vec2 = { x: S, y: -S };

export class Camera3D implements ViewCamera {
  readonly kind = '3d' as const;
  center: Vec2 = { x: 0, y: 0 };
  distance = DEFAULT_DISTANCE;
  viewportW = 1;
  viewportH = 1;
  readonly three = new PerspectiveCamera(CAMERA_FOV_DEG, 1, 0.5, 600);
  private readonly pitch = (CAMERA_PITCH_DEG * Math.PI) / 180;
  private tmp = new Vector3();

  constructor(private mapW: number, private mapH: number) {
    this.update();
  }

  get zoomLevel(): number {
    return this.distance;
  }
  set zoomLevel(v: number) {
    this.distance = clamp(v, MIN_DISTANCE, MAX_DISTANCE);
    this.update();
  }

  resetZoom(): void {
    this.distance = DEFAULT_DISTANCE;
    this.update();
  }

  setMap(w: number, h: number): void {
    this.mapW = w;
    this.mapH = h;
    this.clamp();
  }

  setViewport(w: number, h: number): void {
    this.viewportW = Math.max(1, w);
    this.viewportH = Math.max(1, h);
    this.three.aspect = this.viewportW / this.viewportH;
    this.three.updateProjectionMatrix();
    this.clamp();
  }

  /** Kameraposition und Matrizen aus center/distance ableiten. */
  update(): void {
    const back = this.distance * Math.cos(this.pitch);
    const up = this.distance * Math.sin(this.pitch);
    this.three.position.set(this.center.x - SCREEN_UP.x * back, up, this.center.y - SCREEN_UP.y * back);
    this.three.up.set(0, 1, 0);
    this.three.lookAt(this.center.x, 0, this.center.y);
    this.three.updateMatrixWorld(true);
    this.three.updateProjectionMatrix();
  }

  worldToScreen(p: Vec2, height = 0): Vec2 {
    const v = this.tmp.set(p.x, height, p.y).project(this.three);
    return { x: ((v.x + 1) / 2) * this.viewportW, y: ((1 - v.y) / 2) * this.viewportH };
  }

  screenToWorld(p: Vec2): Vec2 {
    const nx = (p.x / this.viewportW) * 2 - 1;
    const ny = 1 - (p.y / this.viewportH) * 2;
    const origin = new Vector3(nx, ny, -1).unproject(this.three);
    const far = new Vector3(nx, ny, 1).unproject(this.three);
    const dir = far.sub(origin).normalize();
    if (dir.y >= -1e-4) {
      // Strahl über dem Horizont: Punkt weit vorn auf dem Boden
      const reach = this.distance * 4;
      return { x: this.center.x + SCREEN_UP.x * reach + (nx * SCREEN_RIGHT.x * reach) / 2, y: this.center.y + SCREEN_UP.y * reach + (nx * SCREEN_RIGHT.y * reach) / 2 };
    }
    const t = -origin.y / dir.y;
    return { x: origin.x + dir.x * t, y: origin.z + dir.z * t };
  }

  scaleAt(p: Vec2): number {
    const a = this.worldToScreen(p);
    const b = this.worldToScreen({ x: p.x + SCREEN_RIGHT.x * 0.5, y: p.y + SCREEN_RIGHT.y * 0.5 });
    return Math.max(1, Math.hypot(b.x - a.x, b.y - a.y) * 2);
  }

  pan(dxTiles: number, dyTiles: number): void {
    this.center.x += dxTiles;
    this.center.y += dyTiles;
    this.clamp();
  }

  panPixels(dxPx: number, dyPx: number): void {
    const scale = this.scaleAt(this.center);
    const right = dxPx / scale;
    const up = -dyPx / (scale * Math.sin(this.pitch));
    this.pan(SCREEN_RIGHT.x * right + SCREEN_UP.x * up, SCREEN_RIGHT.y * right + SCREEN_UP.y * up);
  }

  lookAt(p: Vec2): void {
    this.center = { x: p.x, y: p.y };
    this.clamp();
  }

  zoomAt(factor: number, anchor: Vec2): void {
    const before = this.screenToWorld(anchor);
    this.distance = clamp(this.distance / factor, MIN_DISTANCE, MAX_DISTANCE);
    this.update();
    const after = this.screenToWorld(anchor);
    this.center.x += before.x - after.x;
    this.center.y += before.y - after.y;
    this.clamp();
  }

  clamp(): void {
    const margin = 4;
    this.center.x = clamp(this.center.x, -margin, this.mapW + margin);
    this.center.y = clamp(this.center.y, -margin, this.mapH + margin);
    this.update();
  }

  visibleQuad(): [Vec2, Vec2, Vec2, Vec2] {
    return [
      this.screenToWorld({ x: 0, y: 0 }),
      this.screenToWorld({ x: this.viewportW, y: 0 }),
      this.screenToWorld({ x: this.viewportW, y: this.viewportH }),
      this.screenToWorld({ x: 0, y: this.viewportH }),
    ];
  }

  visibleRect(): ViewRect {
    const q = this.visibleQuad();
    return {
      x0: Math.min(...q.map((p) => p.x)),
      y0: Math.min(...q.map((p) => p.y)),
      x1: Math.max(...q.map((p) => p.x)),
      y1: Math.max(...q.map((p) => p.y)),
    };
  }
}

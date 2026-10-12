import { clamp, type Vec2 } from '../sim/math';

/** Draufsicht-Kamera: `center` in Tiles, `zoom` in Pixel pro Tile. */
export class Camera {
  center: Vec2 = { x: 0, y: 0 };
  zoom = 48;
  minZoom = 28;
  maxZoom = 80;
  viewportW = 1;
  viewportH = 1;

  constructor(private mapW: number, private mapH: number) {}

  setMap(w: number, h: number): void {
    this.mapW = w;
    this.mapH = h;
    this.clamp();
  }

  setViewport(w: number, h: number): void {
    this.viewportW = Math.max(1, w);
    this.viewportH = Math.max(1, h);
    this.clamp();
  }

  /** Sichtbarer Bereich in Tiles. */
  get viewWidth(): number {
    return this.viewportW / this.zoom;
  }
  get viewHeight(): number {
    return this.viewportH / this.zoom;
  }

  worldToScreen(p: Vec2): Vec2 {
    return {
      x: (p.x - this.center.x) * this.zoom + this.viewportW / 2,
      y: (p.y - this.center.y) * this.zoom + this.viewportH / 2,
    };
  }

  screenToWorld(p: Vec2): Vec2 {
    return {
      x: (p.x - this.viewportW / 2) / this.zoom + this.center.x,
      y: (p.y - this.viewportH / 2) / this.zoom + this.center.y,
    };
  }

  pan(dxTiles: number, dyTiles: number): void {
    this.center.x += dxTiles;
    this.center.y += dyTiles;
    this.clamp();
  }

  panPixels(dxPx: number, dyPx: number): void {
    this.pan(dxPx / this.zoom, dyPx / this.zoom);
  }

  lookAt(p: Vec2): void {
    this.center = { x: p.x, y: p.y };
    this.clamp();
  }

  /** Zoomt um den Bildschirmpunkt `anchor` (Pixel) herum. */
  zoomAt(factor: number, anchor: Vec2): void {
    const before = this.screenToWorld(anchor);
    this.zoom = clamp(this.zoom * factor, this.minZoom, this.maxZoom);
    const after = this.screenToWorld(anchor);
    this.center.x += before.x - after.x;
    this.center.y += before.y - after.y;
    this.clamp();
  }

  /** Hält die Kamera auf der Karte (mit etwas Rand, damit man an den Kartenrand sehen kann). */
  clamp(): void {
    const margin = 2;
    const hw = this.viewWidth / 2;
    const hh = this.viewHeight / 2;
    const minX = Math.min(hw - margin, this.mapW / 2);
    const maxX = Math.max(this.mapW - hw + margin, this.mapW / 2);
    const minY = Math.min(hh - margin, this.mapH / 2);
    const maxY = Math.max(this.mapH - hh + margin, this.mapH / 2);
    this.center.x = clamp(this.center.x, minX, maxX);
    this.center.y = clamp(this.center.y, minY, maxY);
  }

  visibleRect(): { x0: number; y0: number; x1: number; y1: number } {
    const a = this.screenToWorld({ x: 0, y: 0 });
    const b = this.screenToWorld({ x: this.viewportW, y: this.viewportH });
    return { x0: a.x, y0: a.y, x1: b.x, y1: b.y };
  }
}

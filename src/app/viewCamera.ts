/** Gemeinsame Schnittstelle der 2D-Debug-Kamera und der perspektivischen 3D-Kamera. */
import type { Vec2 } from '../sim/math';

export interface ViewRect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface ViewCamera {
  readonly kind: '2d' | '3d';
  readonly center: Vec2;
  viewportW: number;
  viewportH: number;
  /** Zoomwert der Kamera (2D: Pixel pro Tile, 3D: Abstand in Tiles). */
  zoomLevel: number;
  setMap(w: number, h: number): void;
  setViewport(w: number, h: number): void;
  /** Bodenpunkt (plus Höhe über dem Boden in Tiles) nach Bildschirm-Pixel. */
  worldToScreen(p: Vec2, height?: number): Vec2;
  /** Bildschirm-Pixel nach Bodenpunkt (Ebene Höhe 0). */
  screenToWorld(p: Vec2): Vec2;
  /** Pixel pro Tile (seitlich) am Bodenpunkt p. */
  scaleAt(p: Vec2): number;
  pan(dxTiles: number, dyTiles: number): void;
  /** Verschiebt die Ansicht um Bildschirm-Pixel (positiv = Ansicht nach rechts/unten). */
  panPixels(dxPx: number, dyPx: number): void;
  lookAt(p: Vec2): void;
  zoomAt(factor: number, anchor: Vec2): void;
  resetZoom(): void;
  clamp(): void;
  /** Umschließendes Rechteck des sichtbaren Bodens. */
  visibleRect(): ViewRect;
  /** Sichtbarer Boden als Viereck: oben links, oben rechts, unten rechts, unten links. */
  visibleQuad(): [Vec2, Vec2, Vec2, Vec2];
}

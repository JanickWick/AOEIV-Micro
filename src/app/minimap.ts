/** Minimap-Geometrie: Rechteck (2D-Debug) oder Raute (3D, um 45° gedreht wie die Kamera). Rein, testbar. */
import type { Vec2 } from '../sim/math';

export interface MinimapLayout {
  /** Mittelpunkt auf dem Bildschirm (Pixel). */
  cx: number;
  cy: number;
  /** Pixel pro Tile. */
  scale: number;
  /** Drehung in Radiant (0 = Rechteck, −π/4 = Raute mit Bildschirm-oben = Weltrichtung (+x, −y)). */
  rotation: number;
  mapW: number;
  mapH: number;
  /** Umschließender Bereich für Treffertests (Pixel). */
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/**
 * Layout in der rechten unteren Ecke. `box` ist die verfügbare Kantenlänge in Pixeln.
 * Raute: Bildschirm-oben entspricht der Weltrichtung (+x, −y)/√2 wie bei der 3D-Kamera, also wird
 * die Karte um −45° gedreht (Welt +x zeigt nach oben rechts).
 */
export function computeMinimapLayout(viewportW: number, viewportH: number, mapW: number, mapH: number, diamond: boolean, box: number, margin = 10): MinimapLayout {
  const rotation = diamond ? -Math.PI / 4 : 0;
  const diag = diamond ? Math.hypot(mapW, mapH) : Math.max(mapW, mapH);
  const scale = box / diag;
  const cx = viewportW - margin - box / 2;
  const cy = viewportH - margin - box / 2;
  return { cx, cy, scale, rotation, mapW, mapH, x0: cx - box / 2, y0: cy - box / 2, x1: cx + box / 2, y1: cy + box / 2 };
}

export function minimapWorldToScreen(m: MinimapLayout, p: Vec2): Vec2 {
  const x = (p.x - m.mapW / 2) * m.scale;
  const y = (p.y - m.mapH / 2) * m.scale;
  const c = Math.cos(m.rotation);
  const s = Math.sin(m.rotation);
  return { x: m.cx + x * c - y * s, y: m.cy + x * s + y * c };
}

export function minimapScreenToWorld(m: MinimapLayout, p: Vec2): Vec2 {
  const dx = p.x - m.cx;
  const dy = p.y - m.cy;
  const c = Math.cos(-m.rotation);
  const s = Math.sin(-m.rotation);
  const x = dx * c - dy * s;
  const y = dx * s + dy * c;
  return { x: x / m.scale + m.mapW / 2, y: y / m.scale + m.mapH / 2 };
}

/** Liegt der Bildschirmpunkt auf der Karte (innerhalb der Raute bzw. des Rechtecks)? */
export function minimapContains(m: MinimapLayout, p: Vec2): boolean {
  const w = minimapScreenToWorld(m, p);
  return w.x >= 0 && w.x <= m.mapW && w.y >= 0 && w.y <= m.mapH;
}

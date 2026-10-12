/** Canvas-2D-Darstellung: Karte, Einheiten (interpoliert), Auswahl, Marker, Minimap. */
import { lerp, lerpAngle, type Vec2 } from '../sim/math';
import type { UnitId, UnitState, World } from '../sim/types';
import type { UnitShape } from '../sim/unitDefs';
import type { Camera } from './camera';
import type { Rect } from './selection';

export interface Marker {
  pos: Vec2;
  bornMs: number;
  kind: 'move' | 'queue';
}

export interface RenderState {
  world: World;
  camera: Camera;
  selection: ReadonlySet<UnitId>;
  dragRect: Rect | null; // Bildschirmkoordinaten
  markers: readonly Marker[];
  showWaypoints: boolean;
  alpha: number; // Interpolation zwischen prevPos und pos
  nowMs: number;
  minimap: MinimapLayout;
  paused: boolean;
}

export interface MinimapLayout {
  x: number;
  y: number;
  w: number;
  h: number;
  scale: number; // Pixel pro Tile
}

export const PLAYER_COLORS = ['#3b82f6', '#ef4444'] as const;
const PLAYER_DARK = ['#1e3a8a', '#7f1d1d'] as const;
const SELECT_COLOR = '#86efac';

/** Kurzkennung im Einheiten-Symbol. */
const UNIT_CODE: Record<string, string> = {
  spearman: 'S',
  archer: 'A',
  'man-at-arms': 'M',
  horseman: 'H',
  knight: 'K',
  crossbowman: 'X',
  mangonel: 'Mg',
  springald: 'Sp',
};

export function computeMinimapLayout(camera: Camera, world: World): MinimapLayout {
  const maxW = 220;
  const maxH = 170;
  const scale = Math.min(maxW / world.map.width, maxH / world.map.height);
  const w = world.map.width * scale;
  const h = world.map.height * scale;
  return { x: 10, y: camera.viewportH - h - 10, w, h, scale };
}

export function interpolatedPos(u: UnitState, alpha: number): Vec2 {
  return lerp(u.prevPos, u.pos, alpha);
}

export function render(ctx: CanvasRenderingContext2D, s: RenderState): void {
  const { camera, world } = s;
  const W = camera.viewportW;
  const H = camera.viewportH;
  ctx.save();
  ctx.fillStyle = '#0b0f0a';
  ctx.fillRect(0, 0, W, H);

  drawMap(ctx, s);
  drawWaypoints(ctx, s);
  drawMarkers(ctx, s);
  drawUnits(ctx, s);
  drawDragRect(ctx, s);
  drawMinimap(ctx, s);
  if (s.paused) {
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#f3f4f6';
    ctx.font = 'bold 28px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('PAUSE', W / 2, H / 2);
  }
  ctx.restore();
}

function drawMap(ctx: CanvasRenderingContext2D, s: RenderState): void {
  const { camera, world } = s;
  const tl = camera.worldToScreen({ x: 0, y: 0 });
  const br = camera.worldToScreen({ x: world.map.width, y: world.map.height });
  ctx.fillStyle = '#2b4323';
  ctx.fillRect(tl.x, tl.y, br.x - tl.x, br.y - tl.y);

  // Tile-Gitter (bei kleinem Zoom nur jede 4. Linie)
  const step = camera.zoom >= 36 ? 1 : 4;
  const vis = camera.visibleRect();
  const x0 = Math.max(0, Math.floor(vis.x0 / step) * step);
  const x1 = Math.min(world.map.width, Math.ceil(vis.x1));
  const y0 = Math.max(0, Math.floor(vis.y0 / step) * step);
  const y1 = Math.min(world.map.height, Math.ceil(vis.y1));
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = x0; x <= x1; x += step) {
    const sx = Math.round(camera.worldToScreen({ x, y: 0 }).x) + 0.5;
    ctx.moveTo(sx, tl.y);
    ctx.lineTo(sx, br.y);
  }
  for (let y = y0; y <= y1; y += step) {
    const sy = Math.round(camera.worldToScreen({ x: 0, y }).y) + 0.5;
    ctx.moveTo(tl.x, sy);
    ctx.lineTo(br.x, sy);
  }
  ctx.strokeStyle = 'rgba(255,255,255,0.045)';
  ctx.stroke();
  // Jede 8. Linie etwas stärker, zur Orientierung
  ctx.beginPath();
  for (let x = Math.ceil(x0 / 8) * 8; x <= x1; x += 8) {
    const sx = Math.round(camera.worldToScreen({ x, y: 0 }).x) + 0.5;
    ctx.moveTo(sx, tl.y);
    ctx.lineTo(sx, br.y);
  }
  for (let y = Math.ceil(y0 / 8) * 8; y <= y1; y += 8) {
    const sy = Math.round(camera.worldToScreen({ x: 0, y }).y) + 0.5;
    ctx.moveTo(tl.x, sy);
    ctx.lineTo(br.x, sy);
  }
  ctx.strokeStyle = 'rgba(255,255,255,0.09)';
  ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.strokeRect(tl.x + 0.5, tl.y + 0.5, br.x - tl.x, br.y - tl.y);
}

function drawShape(ctx: CanvasRenderingContext2D, shape: UnitShape, x: number, y: number, r: number): void {
  ctx.beginPath();
  switch (shape) {
    case 'circle':
      ctx.arc(x, y, r, 0, Math.PI * 2);
      break;
    case 'diamond':
      ctx.moveTo(x, y - r * 1.15);
      ctx.lineTo(x + r * 1.15, y);
      ctx.lineTo(x, y + r * 1.15);
      ctx.lineTo(x - r * 1.15, y);
      ctx.closePath();
      break;
    case 'square':
      ctx.rect(x - r * 0.95, y - r * 0.95, r * 1.9, r * 1.9);
      break;
  }
}

function drawUnits(ctx: CanvasRenderingContext2D, s: RenderState): void {
  const { camera, world, alpha } = s;
  const vis = camera.visibleRect();
  const pad = 2;
  for (const u of world.units) {
    if (!u.alive) continue;
    const p = interpolatedPos(u, alpha);
    if (p.x < vis.x0 - pad || p.x > vis.x1 + pad || p.y < vis.y0 - pad || p.y > vis.y1 + pad) continue;
    const sp = camera.worldToScreen(p);
    const def = world.defs.get(u.defId);
    const r = Math.max(5, u.radius * camera.zoom);
    const selected = s.selection.has(u.id);
    const heading = lerpAngle(u.prevHeading, u.heading, alpha);

    if (selected) {
      ctx.beginPath();
      ctx.arc(sp.x, sp.y, r + 3, 0, Math.PI * 2);
      ctx.strokeStyle = SELECT_COLOR;
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    drawShape(ctx, def.shape, sp.x, sp.y, r);
    ctx.fillStyle = PLAYER_COLORS[u.player];
    ctx.fill();
    ctx.strokeStyle = PLAYER_DARK[u.player];
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Blickrichtung
    ctx.beginPath();
    ctx.moveTo(sp.x, sp.y);
    ctx.lineTo(sp.x + Math.cos(heading) * (r + 4), sp.y + Math.sin(heading) * (r + 4));
    ctx.strokeStyle = 'rgba(255,255,255,0.85)';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Kennung
    if (camera.zoom >= 30) {
      ctx.fillStyle = '#fff';
      ctx.font = `bold ${Math.max(9, Math.round(r * 0.95))}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(UNIT_CODE[u.defId] ?? '?', sp.x, sp.y + 0.5);
    }

    // Lebensbalken bei Auswahl oder Schaden
    if (selected || u.hp < u.maxHp) {
      const bw = Math.max(18, r * 2.4);
      const bh = 4;
      const bx = sp.x - bw / 2;
      const by = sp.y - r - 9;
      ctx.fillStyle = 'rgba(0,0,0,0.7)';
      ctx.fillRect(bx, by, bw, bh);
      const frac = Math.max(0, u.hp / u.maxHp);
      ctx.fillStyle = frac > 0.5 ? '#22c55e' : frac > 0.25 ? '#eab308' : '#ef4444';
      ctx.fillRect(bx, by, bw * frac, bh);
    }
  }
}

function drawWaypoints(ctx: CanvasRenderingContext2D, s: RenderState): void {
  if (!s.showWaypoints) return;
  const { camera, world } = s;
  ctx.lineWidth = 1;
  for (const u of world.units) {
    if (!u.alive || !s.selection.has(u.id) || u.orders.length === 0) continue;
    let prev = camera.worldToScreen(interpolatedPos(u, s.alpha));
    ctx.beginPath();
    ctx.moveTo(prev.x, prev.y);
    for (const o of u.orders) {
      if (o.kind !== 'move') continue;
      const p = camera.worldToScreen(o.target);
      ctx.lineTo(p.x, p.y);
      prev = p;
    }
    ctx.strokeStyle = 'rgba(134,239,172,0.5)';
    ctx.stroke();
    for (const o of u.orders) {
      if (o.kind !== 'move') continue;
      const p = camera.worldToScreen(o.target);
      ctx.beginPath();
      ctx.arc(p.x, p.y, 2.5, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(134,239,172,0.8)';
      ctx.fill();
    }
  }
}

function drawMarkers(ctx: CanvasRenderingContext2D, s: RenderState): void {
  const { camera } = s;
  for (const m of s.markers) {
    const age = (s.nowMs - m.bornMs) / 1000;
    if (age > 0.7) continue;
    const p = camera.worldToScreen(m.pos);
    const t = age / 0.7;
    const r = 4 + 10 * (1 - t);
    ctx.beginPath();
    ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
    ctx.strokeStyle = m.kind === 'move' ? `rgba(134,239,172,${1 - t})` : `rgba(250,204,21,${1 - t})`;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(p.x - 5, p.y);
    ctx.lineTo(p.x + 5, p.y);
    ctx.moveTo(p.x, p.y - 5);
    ctx.lineTo(p.x, p.y + 5);
    ctx.lineWidth = 1;
    ctx.stroke();
  }
}

function drawDragRect(ctx: CanvasRenderingContext2D, s: RenderState): void {
  const r = s.dragRect;
  if (!r) return;
  ctx.fillStyle = 'rgba(134,239,172,0.12)';
  ctx.fillRect(r.x0, r.y0, r.x1 - r.x0, r.y1 - r.y0);
  ctx.strokeStyle = 'rgba(134,239,172,0.9)';
  ctx.lineWidth = 1;
  ctx.strokeRect(r.x0 + 0.5, r.y0 + 0.5, r.x1 - r.x0, r.y1 - r.y0);
}

function drawMinimap(ctx: CanvasRenderingContext2D, s: RenderState): void {
  const { minimap: m, world, camera } = s;
  ctx.fillStyle = 'rgba(10,14,10,0.85)';
  ctx.fillRect(m.x - 3, m.y - 3, m.w + 6, m.h + 6);
  ctx.fillStyle = '#2b4323';
  ctx.fillRect(m.x, m.y, m.w, m.h);
  for (const u of world.units) {
    if (!u.alive) continue;
    const p = interpolatedPos(u, s.alpha);
    ctx.fillStyle = PLAYER_COLORS[u.player];
    const px = m.x + p.x * m.scale;
    const py = m.y + p.y * m.scale;
    ctx.fillRect(px - 1.5, py - 1.5, 3, 3);
  }
  const v = camera.visibleRect();
  ctx.strokeStyle = 'rgba(255,255,255,0.9)';
  ctx.lineWidth = 1;
  ctx.strokeRect(m.x + v.x0 * m.scale + 0.5, m.y + v.y0 * m.scale + 0.5, (v.x1 - v.x0) * m.scale, (v.y1 - v.y0) * m.scale);
  ctx.strokeStyle = 'rgba(255,255,255,0.3)';
  ctx.strokeRect(m.x + 0.5, m.y + 0.5, m.w, m.h);
}

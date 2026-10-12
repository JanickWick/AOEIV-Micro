/**
 * Canvas-2D-Darstellung. Im 2D-Modus zeichnet sie alles (Karte, Einheiten, Projektile); im 3D-Modus
 * nur die Overlay-Ebene (Lebensbalken, Timing, Marker, Auswahlrahmen, Minimap, Zeiger) über der
 * Three.js-Szene. Alle Positionen laufen über die Kamera-Schnittstelle (2D oder perspektivisch).
 */
import { lerp, lerpAngle, type Vec2 } from '../sim/math';
import type { Projectile, UnitId, UnitState, World } from '../sim/types';
import type { UnitShape } from '../sim/unitDefs';
import type { Rect } from './selection';
import type { HealthBarMode } from './settings';
import { PLAYER_COLORS, unitHeight } from './unitVisual';
import type { ViewCamera } from './viewCamera';

export interface Marker {
  pos: Vec2;
  bornMs: number;
  kind: 'move' | 'queue' | 'attack';
}

export interface RenderState {
  mode: '2d' | '3d';
  world: World;
  camera: ViewCamera;
  selection: ReadonlySet<UnitId>;
  dragRect: Rect | null; // Bildschirmkoordinaten
  markers: readonly Marker[];
  showWaypoints: boolean;
  alpha: number; // Interpolation zwischen prevPos und pos
  nowMs: number;
  minimap: MinimapLayout;
  paused: boolean;
  healthBars: HealthBarMode;
  rangeRing: boolean;
  timingBars: boolean;
  hoverEnemyId: UnitId | null;
  targeting: 'attackMove' | 'patrol' | null;
  mouse: Vec2;
  drawCursor: boolean;
  facingDrag: { from: Vec2; to: Vec2 } | null;
  groupsOf: (id: UnitId) => number[];
  drillMarker: Vec2 | null;
}

export interface MinimapLayout {
  x: number;
  y: number;
  w: number;
  h: number;
  scale: number; // Pixel pro Tile
}

export { PLAYER_COLORS };
const PLAYER_DARK = ['#1e3a8a', '#7f1d1d'] as const;
const SELECT_COLOR = '#86efac';
const DEATH_FADE_TICKS = 60;

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

export function computeMinimapLayout(camera: ViewCamera, world: World): MinimapLayout {
  const maxW = 220;
  const maxH = 170;
  const scale = Math.min(maxW / world.map.width, maxH / world.map.height);
  const w = world.map.width * scale;
  const h = world.map.height * scale;
  return { x: 10, y: camera.viewportH - h - 10, w, h, scale };
}

export function interpolatedPos(u: { prevPos: Vec2; pos: Vec2 }, alpha: number): Vec2 {
  return lerp(u.prevPos, u.pos, alpha);
}

export function render(ctx: CanvasRenderingContext2D, s: RenderState): void {
  const { camera } = s;
  const W = camera.viewportW;
  const H = camera.viewportH;
  ctx.save();
  if (s.mode === '2d') {
    ctx.fillStyle = '#0b0f0a';
    ctx.fillRect(0, 0, W, H);
    drawMap(ctx, s);
    drawDecor2D(ctx, s);
  } else {
    ctx.clearRect(0, 0, W, H);
  }
  drawRangeRings(ctx, s);
  drawDrillMarker(ctx, s);
  drawWaypoints(ctx, s);
  drawMarkers(ctx, s);
  if (s.mode === '2d') drawUnitBodies(ctx, s);
  drawUnitOverlays(ctx, s);
  drawProjectiles(ctx, s);
  drawDragRect(ctx, s);
  drawFacingDrag(ctx, s);
  drawMinimap(ctx, s);
  drawCursor(ctx, s);
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
  const zoom = camera.scaleAt(camera.center);
  const step = zoom >= 36 ? 1 : 4;
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

function drawDecor2D(ctx: CanvasRenderingContext2D, s: RenderState): void {
  const { camera, world } = s;
  for (const d of world.decor) {
    const p = camera.worldToScreen(d.pos);
    const r = Math.max(2, (d.radius || 0.4) * camera.scaleAt(d.pos));
    ctx.beginPath();
    if (d.kind === 'building') {
      const w = (d.size?.w ?? 3) * camera.scaleAt(d.pos);
      const h = (d.size?.h ?? 3) * camera.scaleAt(d.pos);
      ctx.rect(p.x - w / 2, p.y - h / 2, w, h);
      ctx.fillStyle = '#8b7355';
    } else {
      ctx.arc(p.x, p.y, r * d.scale, 0, Math.PI * 2);
      ctx.fillStyle = d.kind === 'tree' ? '#3f6b2a' : d.kind === 'rock' ? '#7b776b' : '#4f7f33';
    }
    ctx.fill();
  }
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

function drawRangeRings(ctx: CanvasRenderingContext2D, s: RenderState): void {
  if (!s.rangeRing) return;
  const { world, camera } = s;
  let units = world.units.filter((u) => u.alive && u.player === 0 && s.selection.has(u.id) && world.defs.ageStats(u.defId, u.age).weapon.type !== 'melee');
  if (units.length === 0) {
    const first = world.units.find((u) => u.alive && u.player === 0 && world.defs.ageStats(u.defId, u.age).weapon.type !== 'melee');
    if (first) units = [first];
  }
  for (const u of units) {
    const w = world.defs.ageStats(u.defId, u.age).weapon;
    const c = interpolatedPos(u, s.alpha);
    groundCircle(ctx, camera, c, w.range.max + u.radius, 'rgba(134,239,172,0.55)', 1.5);
    if (w.range.min > 0) groundCircle(ctx, camera, c, w.range.min + u.radius, 'rgba(248,113,113,0.5)', 1);
  }
}

/** Kreis auf dem Boden (im 3D-Modus perspektivisch als Polygon). */
function groundCircle(ctx: CanvasRenderingContext2D, camera: ViewCamera, c: Vec2, r: number, style: string, width: number): void {
  ctx.beginPath();
  const n = 48;
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * Math.PI * 2;
    const p = camera.worldToScreen({ x: c.x + Math.cos(a) * r, y: c.y + Math.sin(a) * r });
    if (i === 0) ctx.moveTo(p.x, p.y);
    else ctx.lineTo(p.x, p.y);
  }
  ctx.strokeStyle = style;
  ctx.lineWidth = width;
  ctx.stroke();
}

function visible(s: RenderState, p: Vec2): boolean {
  const sp = s.camera.worldToScreen(p);
  return sp.x >= -60 && sp.x <= s.camera.viewportW + 60 && sp.y >= -80 && sp.y <= s.camera.viewportH + 60;
}

function drawUnitBodies(ctx: CanvasRenderingContext2D, s: RenderState): void {
  const { camera, world, alpha } = s;
  for (const u of world.units) {
    const dead = !u.alive;
    if (dead && world.tick - u.diedTick > DEATH_FADE_TICKS) continue;
    const p = dead ? u.pos : interpolatedPos(u, alpha);
    if (!visible(s, p)) continue;
    const sp = camera.worldToScreen(p);
    const def = world.defs.get(u.defId);
    const r = Math.max(5, u.radius * camera.scaleAt(p));
    const selected = s.selection.has(u.id);
    const heading = lerpAngle(u.prevHeading, u.heading, alpha);
    if (dead) {
      ctx.globalAlpha = Math.max(0, 1 - (world.tick - u.diedTick) / DEATH_FADE_TICKS) * 0.7;
      drawShape(ctx, def.shape, sp.x, sp.y, r);
      ctx.fillStyle = '#4b5563';
      ctx.fill();
      ctx.globalAlpha = 1;
      continue;
    }
    if (selected) {
      ctx.beginPath();
      ctx.arc(sp.x, sp.y, r + 3, 0, Math.PI * 2);
      ctx.strokeStyle = SELECT_COLOR;
      ctx.lineWidth = 2;
      ctx.stroke();
    }
    if (s.hoverEnemyId === u.id) {
      ctx.beginPath();
      ctx.arc(sp.x, sp.y, r + 3, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(252,165,165,0.9)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
    drawShape(ctx, def.shape, sp.x, sp.y, r);
    ctx.fillStyle = PLAYER_COLORS[u.player];
    ctx.fill();
    const charging = u.charge?.charging === true;
    const braced = u.braceUntilTick >= world.tick;
    ctx.strokeStyle = charging ? '#fb923c' : braced ? '#f8fafc' : PLAYER_DARK[u.player];
    ctx.lineWidth = charging || braced ? 2.5 : 1.5;
    ctx.stroke();
    if (world.tick - u.lastHitTick < 6) {
      ctx.beginPath();
      ctx.arc(sp.x, sp.y, r * 0.8, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255,255,255,${0.7 * (1 - (world.tick - u.lastHitTick) / 6)})`;
      ctx.fill();
    }
    ctx.beginPath();
    ctx.moveTo(sp.x, sp.y);
    ctx.lineTo(sp.x + Math.cos(heading) * (r + 4), sp.y + Math.sin(heading) * (r + 4));
    ctx.strokeStyle = 'rgba(255,255,255,0.85)';
    ctx.lineWidth = 2;
    ctx.stroke();
    if (camera.scaleAt(p) >= 30) {
      ctx.fillStyle = '#fff';
      ctx.font = `bold ${Math.max(9, Math.round(r * 0.95))}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(UNIT_CODE[u.defId] ?? '?', sp.x, sp.y + 0.5);
    }
  }
}

/** Lebensbalken, Timing-Balken und Gruppennummern (beide Modi). */
function drawUnitOverlays(ctx: CanvasRenderingContext2D, s: RenderState): void {
  const { camera, world, alpha } = s;
  for (const u of world.units) {
    if (!u.alive) continue;
    const p = interpolatedPos(u, alpha);
    if (!visible(s, p)) continue;
    const def = world.defs.get(u.defId);
    const scale = camera.scaleAt(p);
    const r = Math.max(5, u.radius * scale);
    const selected = s.selection.has(u.id);
    const head = s.mode === '3d' ? camera.worldToScreen(p, unitHeight(def.kind) + 0.25) : { x: camera.worldToScreen(p).x, y: camera.worldToScreen(p).y - r - 9 };
    const foot = camera.worldToScreen(p);
    const bw = Math.max(18, Math.min(34, r * 2.4));

    if (u.player === 0) {
      const gs = s.groupsOf(u.id);
      if (gs.length) {
        ctx.fillStyle = 'rgba(0,0,0,0.75)';
        ctx.fillRect(foot.x + r - 2, foot.y - 6, 7 * gs.length + 3, 11);
        ctx.fillStyle = '#fde68a';
        ctx.font = 'bold 9px system-ui, sans-serif';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        ctx.fillText(gs.join(''), foot.x + r, foot.y - 5);
      }
    }

    const showBar = s.healthBars === 'always' || selected || (s.healthBars === 'selectedOrDamaged' && u.hp < u.maxHp);
    if (showBar) {
      const bh = 4;
      const bx = head.x - bw / 2;
      const by = head.y - bh;
      ctx.fillStyle = 'rgba(0,0,0,0.7)';
      ctx.fillRect(bx, by, bw, bh);
      const frac = Math.max(0, u.hp / u.maxHp);
      ctx.fillStyle = s.mode === '3d' ? PLAYER_COLORS[u.player] : frac > 0.5 ? '#22c55e' : frac > 0.25 ? '#eab308' : '#ef4444';
      ctx.fillRect(bx, by, bw * frac, bh);
      if (s.mode === '3d') {
        ctx.strokeStyle = 'rgba(255,255,255,0.55)';
        ctx.lineWidth = 1;
        ctx.strokeRect(bx + 0.5, by + 0.5, bw - 1, bh - 1);
      }
    }

    if (s.timingBars && u.player === 0 && (u.attack.phase !== 'idle' || u.attack.cooldownLeft > 0)) {
      const bh = 3;
      const bx = head.x - bw / 2;
      const by = head.y + 2;
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(bx, by, bw, bh);
      const w = world.defs.ageStats(u.defId, u.age).weapon;
      let frac = 0;
      let color = '#9ca3af';
      if (u.attack.phase === 'windup') {
        const total = Math.max(1, u.attack.phaseEndsTick - u.attack.startTick);
        frac = 1 - (u.attack.phaseEndsTick - world.tick - (1 - alpha)) / total;
        color = '#facc15';
      } else if (u.attack.phase === 'recovery') {
        frac = 1;
        color = '#60a5fa';
      } else {
        const total = Math.max(1, Math.round(w.timing.period * world.rules.tickRate));
        frac = 1 - u.attack.cooldownLeft / total;
      }
      ctx.fillStyle = color;
      ctx.fillRect(bx, by, bw * Math.max(0, Math.min(1, frac)), bh);
    }
  }
}

function drawProjectiles(ctx: CanvasRenderingContext2D, s: RenderState): void {
  const { camera, alpha } = s;
  for (const p of s.world.projectiles) {
    const pos = interpolatedPos(p, alpha);
    if (p.splashRadius > 0) drawShell(ctx, s, p, pos);
    else {
      const sp = camera.worldToScreen(pos, s.mode === '3d' ? 1.2 : 0);
      const dir = { x: p.targetPos.x - pos.x, y: p.targetPos.y - pos.y };
      const l = Math.hypot(dir.x, dir.y) || 1;
      const len = Math.max(6, 0.35 * camera.scaleAt(pos));
      ctx.beginPath();
      ctx.moveTo(sp.x - (dir.x / l) * len, sp.y - (dir.y / l) * len);
      ctx.lineTo(sp.x, sp.y);
      ctx.strokeStyle = p.player === 0 ? '#e0f2fe' : '#fee2e2';
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  }
}

function drawShell(ctx: CanvasRenderingContext2D, s: RenderState, p: Projectile, pos: Vec2): void {
  const { camera } = s;
  const total = Math.hypot(p.targetPos.x - p.origin.x, p.targetPos.y - p.origin.y) || 1;
  const done = Math.hypot(pos.x - p.origin.x, pos.y - p.origin.y);
  const t = Math.min(1, done / total);
  const heightTiles = Math.sin(Math.PI * t) * total * 0.35;
  groundCircle(ctx, camera, p.targetPos, p.splashRadius, 'rgba(251,146,60,0.55)', 1.5);
  const shadow = camera.worldToScreen(pos);
  ctx.beginPath();
  ctx.arc(shadow.x, shadow.y, 3, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  ctx.fill();
  const sp = s.mode === '3d' ? camera.worldToScreen(pos, heightTiles) : { x: shadow.x, y: shadow.y - heightTiles * camera.scaleAt(pos) };
  ctx.beginPath();
  ctx.arc(sp.x, sp.y, 4.5, 0, Math.PI * 2);
  ctx.fillStyle = '#d6d3d1';
  ctx.fill();
  ctx.strokeStyle = '#44403c';
  ctx.stroke();
}

function drawWaypoints(ctx: CanvasRenderingContext2D, s: RenderState): void {
  if (!s.showWaypoints) return;
  const { camera, world } = s;
  ctx.lineWidth = 1;
  for (const u of world.units) {
    if (!u.alive || !s.selection.has(u.id) || u.orders.length === 0) continue;
    const start = camera.worldToScreen(interpolatedPos(u, s.alpha));
    ctx.beginPath();
    ctx.moveTo(start.x, start.y);
    const points: { p: Vec2; kind: string }[] = [];
    for (const o of u.orders) {
      if (o.kind === 'move' || o.kind === 'attackMove') points.push({ p: o.target, kind: o.kind });
      else if (o.kind === 'patrol') {
        points.push({ p: o.from, kind: 'patrol' });
        points.push({ p: o.to, kind: 'patrol' });
      }
    }
    for (const pt of points) {
      const p = camera.worldToScreen(pt.p);
      ctx.lineTo(p.x, p.y);
    }
    ctx.strokeStyle = 'rgba(134,239,172,0.5)';
    ctx.stroke();
    for (const pt of points) {
      const p = camera.worldToScreen(pt.p);
      ctx.beginPath();
      ctx.arc(p.x, p.y, 2.5, 0, Math.PI * 2);
      ctx.fillStyle = pt.kind === 'attackMove' ? 'rgba(252,165,165,0.9)' : pt.kind === 'patrol' ? 'rgba(253,224,71,0.9)' : 'rgba(134,239,172,0.8)';
      ctx.fill();
    }
  }
}

function drawMarkers(ctx: CanvasRenderingContext2D, s: RenderState): void {
  const { camera } = s;
  for (const m of s.markers) {
    const age = (s.nowMs - m.bornMs) / 1000;
    if (age > 0.7) continue;
    const t = age / 0.7;
    const style = m.kind === 'move' ? `rgba(134,239,172,${1 - t})` : m.kind === 'queue' ? `rgba(250,204,21,${1 - t})` : `rgba(248,113,113,${1 - t})`;
    const rTiles = (4 + 10 * (1 - t)) / camera.scaleAt(m.pos);
    groundCircle(ctx, camera, m.pos, rTiles, style, 2);
    const p = camera.worldToScreen(m.pos);
    ctx.beginPath();
    ctx.moveTo(p.x - 5, p.y);
    ctx.lineTo(p.x + 5, p.y);
    ctx.moveTo(p.x, p.y - 5);
    ctx.lineTo(p.x, p.y + 5);
    ctx.strokeStyle = style;
    ctx.lineWidth = 1;
    ctx.stroke();
  }
}

function drawDrillMarker(ctx: CanvasRenderingContext2D, s: RenderState): void {
  if (!s.drillMarker) return;
  const pulse = 0.5 + 0.5 * Math.sin(s.nowMs / 180);
  const scale = s.camera.scaleAt(s.drillMarker);
  groundCircle(ctx, s.camera, s.drillMarker, (14 + pulse * 6) / scale, '#fde68a', 3);
  const p = s.camera.worldToScreen(s.drillMarker);
  ctx.fillStyle = 'rgba(253,230,138,0.35)';
  ctx.beginPath();
  ctx.arc(p.x, p.y, 7, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#fde68a';
  ctx.font = 'bold 12px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  ctx.fillText('MARKER', p.x, p.y - 22);
}

function drawFacingDrag(ctx: CanvasRenderingContext2D, s: RenderState): void {
  const f = s.facingDrag;
  if (!f) return;
  const a = s.camera.worldToScreen(f.from);
  const b = s.camera.worldToScreen(f.to);
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const l = Math.hypot(dx, dy);
  if (l < 1) return;
  const ux = dx / l;
  const uy = dy / l;
  ctx.strokeStyle = 'rgba(134,239,172,0.9)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.moveTo(b.x, b.y);
  ctx.lineTo(b.x - ux * 10 - uy * 6, b.y - uy * 10 + ux * 6);
  ctx.moveTo(b.x, b.y);
  ctx.lineTo(b.x - ux * 10 + uy * 6, b.y - uy * 10 - ux * 6);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(134,239,172,0.5)';
  ctx.beginPath();
  ctx.moveTo(a.x - uy * 40, a.y + ux * 40);
  ctx.lineTo(a.x + uy * 40, a.y - ux * 40);
  ctx.stroke();
}

function drawCursor(ctx: CanvasRenderingContext2D, s: RenderState): void {
  const m = s.mouse;
  if (s.targeting) {
    ctx.strokeStyle = s.targeting === 'attackMove' ? '#fca5a5' : '#fde68a';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(m.x, m.y, 9, 0, Math.PI * 2);
    ctx.moveTo(m.x - 14, m.y);
    ctx.lineTo(m.x - 4, m.y);
    ctx.moveTo(m.x + 4, m.y);
    ctx.lineTo(m.x + 14, m.y);
    ctx.moveTo(m.x, m.y - 14);
    ctx.lineTo(m.x, m.y - 4);
    ctx.moveTo(m.x, m.y + 4);
    ctx.lineTo(m.x, m.y + 14);
    ctx.stroke();
  }
  if (!s.drawCursor) return;
  ctx.beginPath();
  ctx.moveTo(m.x, m.y);
  ctx.lineTo(m.x, m.y + 16);
  ctx.lineTo(m.x + 4, m.y + 12);
  ctx.lineTo(m.x + 7, m.y + 18);
  ctx.lineTo(m.x + 9, m.y + 17);
  ctx.lineTo(m.x + 6, m.y + 11);
  ctx.lineTo(m.x + 11, m.y + 11);
  ctx.closePath();
  ctx.fillStyle = '#f9fafb';
  ctx.fill();
  ctx.strokeStyle = '#111827';
  ctx.lineWidth = 1;
  ctx.stroke();
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
  for (const d of world.decor) {
    if (d.kind === 'bush') continue;
    ctx.fillStyle = d.kind === 'tree' ? '#1f5a1f' : d.kind === 'rock' ? '#6b675d' : '#8b7355';
    ctx.fillRect(m.x + d.pos.x * m.scale - 1, m.y + d.pos.y * m.scale - 1, 2, 2);
  }
  for (const u of world.units) {
    if (!u.alive) continue;
    const p = interpolatedPos(u, s.alpha);
    ctx.fillStyle = PLAYER_COLORS[u.player];
    ctx.fillRect(m.x + p.x * m.scale - 1.5, m.y + p.y * m.scale - 1.5, 3, 3);
  }
  ctx.save();
  ctx.beginPath();
  ctx.rect(m.x, m.y, m.w, m.h);
  ctx.clip();
  const q = camera.visibleQuad();
  ctx.beginPath();
  q.forEach((p, i) => {
    const sx = m.x + p.x * m.scale;
    const sy = m.y + p.y * m.scale;
    if (i === 0) ctx.moveTo(sx, sy);
    else ctx.lineTo(sx, sy);
  });
  ctx.closePath();
  ctx.strokeStyle = 'rgba(255,255,255,0.9)';
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.restore();
  ctx.strokeStyle = 'rgba(255,255,255,0.3)';
  ctx.strokeRect(m.x + 0.5, m.y + 0.5, m.w, m.h);
}

/** Canvas-2D-Darstellung: Karte, Einheiten (interpoliert), Projektile, Auswahl, Marker, Minimap. */
import { lerp, lerpAngle, type Vec2 } from '../sim/math';
import type { Projectile, UnitId, UnitState, World } from '../sim/types';
import type { UnitShape } from '../sim/unitDefs';
import type { Camera } from './camera';
import type { Rect } from './selection';
import type { HealthBarMode } from './settings';

export interface Marker {
  pos: Vec2;
  bornMs: number;
  kind: 'move' | 'queue' | 'attack';
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
  healthBars: HealthBarMode;
  rangeRing: boolean;
  timingBars: boolean;
  hoverEnemyId: UnitId | null;
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
const DEATH_FADE_TICKS = 60;

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

export function interpolatedPos(u: { prevPos: Vec2; pos: Vec2 }, alpha: number): Vec2 {
  return lerp(u.prevPos, u.pos, alpha);
}

export function render(ctx: CanvasRenderingContext2D, s: RenderState): void {
  const { camera } = s;
  const W = camera.viewportW;
  const H = camera.viewportH;
  ctx.save();
  ctx.fillStyle = '#0b0f0a';
  ctx.fillRect(0, 0, W, H);

  drawMap(ctx, s);
  drawRangeRings(ctx, s);
  drawWaypoints(ctx, s);
  drawMarkers(ctx, s);
  drawUnits(ctx, s);
  drawProjectiles(ctx, s);
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

/** Reichweitenringe (Kalibrierhilfe): ausgewählte eigene Fernkämpfer, sonst der erste eigene Fernkämpfer. */
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
    const p = camera.worldToScreen(interpolatedPos(u, s.alpha));
    ctx.beginPath();
    ctx.arc(p.x, p.y, (w.range.max + u.radius) * camera.zoom, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(134,239,172,0.55)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    if (w.range.min > 0) {
      ctx.beginPath();
      ctx.arc(p.x, p.y, (w.range.min + u.radius) * camera.zoom, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(248,113,113,0.5)';
      ctx.stroke();
    }
  }
}

function drawUnits(ctx: CanvasRenderingContext2D, s: RenderState): void {
  const { camera, world, alpha } = s;
  const vis = camera.visibleRect();
  const pad = 2;
  for (const u of world.units) {
    const dead = !u.alive;
    if (dead && world.tick - u.diedTick > DEATH_FADE_TICKS) continue;
    const p = dead ? u.pos : interpolatedPos(u, alpha);
    if (p.x < vis.x0 - pad || p.x > vis.x1 + pad || p.y < vis.y0 - pad || p.y > vis.y1 + pad) continue;
    const sp = camera.worldToScreen(p);
    const def = world.defs.get(u.defId);
    const r = Math.max(5, u.radius * camera.zoom);
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

    // Trefferblitz
    if (world.tick - u.lastHitTick < 6) {
      ctx.beginPath();
      ctx.arc(sp.x, sp.y, r * 0.8, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255,255,255,${0.7 * (1 - (world.tick - u.lastHitTick) / 6)})`;
      ctx.fill();
    }

    // Blickrichtung
    ctx.beginPath();
    ctx.moveTo(sp.x, sp.y);
    ctx.lineTo(sp.x + Math.cos(heading) * (r + 4), sp.y + Math.sin(heading) * (r + 4));
    ctx.strokeStyle = 'rgba(255,255,255,0.85)';
    ctx.lineWidth = 2;
    ctx.stroke();

    if (camera.zoom >= 30) {
      ctx.fillStyle = '#fff';
      ctx.font = `bold ${Math.max(9, Math.round(r * 0.95))}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(UNIT_CODE[u.defId] ?? '?', sp.x, sp.y + 0.5);
    }

    // Lebensbalken
    const showBar = s.healthBars === 'always' || selected || (s.healthBars === 'selectedOrDamaged' && u.hp < u.maxHp);
    if (showBar) {
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

    // Angriffs-Timing: gelb = Ausholen (abbrechbar, kein Schaden), blau = Nachlauf, grau = Abklingzeit
    if (s.timingBars && u.player === 0 && (u.attack.phase !== 'idle' || u.attack.cooldownLeft > 0)) {
      const bw = Math.max(18, r * 2.4);
      const bh = 3;
      const bx = sp.x - bw / 2;
      const by = sp.y + r + 5;
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
    const sp = camera.worldToScreen(pos);
    if (p.splashRadius > 0) drawShell(ctx, s, p, pos, sp);
    else {
      const dir = { x: p.targetPos.x - pos.x, y: p.targetPos.y - pos.y };
      const l = Math.hypot(dir.x, dir.y) || 1;
      const len = Math.max(6, 0.35 * camera.zoom);
      ctx.beginPath();
      ctx.moveTo(sp.x - (dir.x / l) * len, sp.y - (dir.y / l) * len);
      ctx.lineTo(sp.x, sp.y);
      ctx.strokeStyle = p.player === 0 ? '#e0f2fe' : '#fee2e2';
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  }
}

/** Mangonel-Geschoss: Schatten am Bodenpunkt, Kugel auf Bogenbahn, Einschlagkreis. */
function drawShell(ctx: CanvasRenderingContext2D, s: RenderState, p: Projectile, pos: Vec2, sp: Vec2): void {
  const { camera } = s;
  const total = Math.hypot(p.targetPos.x - p.origin.x, p.targetPos.y - p.origin.y) || 1;
  const done = Math.hypot(pos.x - p.origin.x, pos.y - p.origin.y);
  const t = Math.min(1, done / total);
  const height = Math.sin(Math.PI * t) * total * 0.35 * camera.zoom;
  const tp = camera.worldToScreen(p.targetPos);
  ctx.beginPath();
  ctx.arc(tp.x, tp.y, p.splashRadius * camera.zoom, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(251,146,60,0.45)';
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 4]);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.beginPath();
  ctx.arc(sp.x, sp.y, 3, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  ctx.fill();
  ctx.beginPath();
  ctx.arc(sp.x, sp.y - height, 4.5, 0, Math.PI * 2);
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
    let prev = camera.worldToScreen(interpolatedPos(u, s.alpha));
    ctx.beginPath();
    ctx.moveTo(prev.x, prev.y);
    for (const o of u.orders) {
      if (o.kind !== 'move' && o.kind !== 'attackMove') continue;
      const p = camera.worldToScreen(o.target);
      ctx.lineTo(p.x, p.y);
      prev = p;
    }
    ctx.strokeStyle = 'rgba(134,239,172,0.5)';
    ctx.stroke();
    for (const o of u.orders) {
      if (o.kind !== 'move' && o.kind !== 'attackMove') continue;
      const p = camera.worldToScreen(o.target);
      ctx.beginPath();
      ctx.arc(p.x, p.y, 2.5, 0, Math.PI * 2);
      ctx.fillStyle = o.kind === 'attackMove' ? 'rgba(252,165,165,0.9)' : 'rgba(134,239,172,0.8)';
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
    ctx.strokeStyle = m.kind === 'move' ? `rgba(134,239,172,${1 - t})` : m.kind === 'queue' ? `rgba(250,204,21,${1 - t})` : `rgba(248,113,113,${1 - t})`;
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
    ctx.fillRect(m.x + p.x * m.scale - 1.5, m.y + p.y * m.scale - 1.5, 3, 3);
  }
  const v = camera.visibleRect();
  ctx.strokeStyle = 'rgba(255,255,255,0.9)';
  ctx.lineWidth = 1;
  ctx.strokeRect(m.x + v.x0 * m.scale + 0.5, m.y + v.y0 * m.scale + 0.5, (v.x1 - v.x0) * m.scale, (v.y1 - v.y0) * m.scale);
  ctx.strokeStyle = 'rgba(255,255,255,0.3)';
  ctx.strokeRect(m.x + 0.5, m.y + 0.5, m.w, m.h);
}

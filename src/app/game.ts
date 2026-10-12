/**
 * Spielzustand im Browser: Welt, Kamera, Auswahl, Eingabe (Maus/Tastatur) und
 * die feste Simulationsschleife mit interpolierter Darstellung.
 */
import { SCENARIOS } from '../data/scenarios/index';
import type { Vec2 } from '../sim/math';
import { buildWorldFromScenario, type ScenarioDef } from '../sim/scenario';
import { stepWorld } from '../sim/step';
import type { Command, UnitId, World } from '../sim/types';
import type { UnitDefLibrary } from '../sim/unitDefs';
import { Camera } from './camera';
import { HotkeyMap, type ActionId } from './hotkeys';
import { computeMinimapLayout, render, type Marker, type MinimapLayout } from './renderer';
import { normalizeRect, pruneSelection, toggleSelection, unitAtPoint, unitsInRect, unitsOfTypeInRect, type Rect } from './selection';

const DRAG_THRESHOLD_PX = 4;
const DOUBLE_CLICK_MS = 350;
const EDGE_SCROLL_PX = 6;
const EDGE_SCROLL_SPEED = 1100; // Pixel pro Sekunde
const KEY_SCROLL_SPEED = 1100;
const MAX_TICKS_PER_FRAME = 10;
const MY_PLAYER = 0;

interface DragState {
  button: number;
  startScreen: Vec2;
  lastScreen: Vec2;
  moved: boolean;
  onMinimap: boolean;
}

export class Game {
  world!: World;
  scenario: ScenarioDef;
  readonly camera: Camera;
  selection = new Set<UnitId>();
  private pending: Command[] = [];
  private markers: Marker[] = [];
  paused = false;
  speed = 1;
  randomStart = false;
  private seedOffset = 0;

  private accumulator = 0;
  private lastFrame = 0;
  private fps = 0;
  private fpsAcc = 0;
  private fpsFrames = 0;

  private readonly keysDown = new Set<string>();
  private mouse: Vec2 = { x: 0, y: 0 };
  private mouseInside = false;
  private drag: DragState | null = null;
  private lastClick: { atMs: number; unitId: UnitId | null } = { atMs: 0, unitId: null };
  private minimap!: MinimapLayout;
  private ctx: CanvasRenderingContext2D;

  onStateChanged: (() => void) | null = null;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly defs: UnitDefLibrary,
    public readonly hotkeys: HotkeyMap,
    scenario: ScenarioDef = SCENARIOS[0]!,
  ) {
    this.scenario = scenario;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D nicht verfügbar');
    this.ctx = ctx;
    this.camera = new Camera(scenario.map.width, scenario.map.height);
    this.restart();
    this.attachInput();
    this.resize();
  }

  // ---------------------------------------------------------------- Szenario

  restart(scenario?: ScenarioDef): void {
    if (scenario) this.scenario = scenario;
    const seed = (this.scenario.seed ?? 1) + (this.randomStart ? this.seedOffset++ : 0);
    this.world = buildWorldFromScenario(this.defs, this.scenario, { seed, randomStart: this.randomStart });
    this.selection.clear();
    this.pending = [];
    this.markers = [];
    this.accumulator = 0;
    this.camera.setMap(this.world.map.width, this.world.map.height);
    // Kamera auf die eigenen Einheiten zentrieren
    const mine = this.world.units.filter((u) => u.player === MY_PLAYER);
    if (mine.length) {
      const cx = mine.reduce((s, u) => s + u.pos.x, 0) / mine.length;
      const cy = mine.reduce((s, u) => s + u.pos.y, 0) / mine.length;
      this.camera.lookAt({ x: cx, y: cy });
    }
    this.onStateChanged?.();
  }

  // ---------------------------------------------------------------- Schleife

  resize(): void {
    const dpr = window.devicePixelRatio || 1;
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.camera.setViewport(w, h);
    this.minimap = computeMinimapLayout(this.camera, this.world);
  }

  frame(nowMs: number): void {
    const dtReal = this.lastFrame ? Math.min((nowMs - this.lastFrame) / 1000, 0.25) : 0;
    this.lastFrame = nowMs;
    this.fpsAcc += dtReal;
    this.fpsFrames++;
    if (this.fpsAcc >= 0.5) {
      this.fps = this.fpsFrames / this.fpsAcc;
      this.fpsAcc = 0;
      this.fpsFrames = 0;
    }

    this.updateCamera(dtReal);

    if (!this.paused) {
      this.accumulator += dtReal * this.speed;
      let ticks = 0;
      while (this.accumulator >= this.world.dt && ticks < MAX_TICKS_PER_FRAME) {
        stepWorld(this.world, this.pending);
        this.pending = [];
        this.accumulator -= this.world.dt;
        ticks++;
      }
      if (ticks >= MAX_TICKS_PER_FRAME) this.accumulator = 0; // Rechner zu langsam: Zeit verwerfen statt Spirale
    }

    const alpha = this.paused ? 1 : Math.min(1, this.accumulator / this.world.dt);
    this.markers = this.markers.filter((m) => nowMs - m.bornMs < 700);
    this.minimap = computeMinimapLayout(this.camera, this.world);
    render(this.ctx, {
      world: this.world,
      camera: this.camera,
      selection: this.selection,
      dragRect: this.drag && this.drag.button === 0 && this.drag.moved && !this.drag.onMinimap ? normalizeRect(this.drag.startScreen, this.drag.lastScreen) : null,
      markers: this.markers,
      showWaypoints: this.keysDown.has('ShiftLeft') || this.keysDown.has('ShiftRight'),
      alpha,
      nowMs,
      minimap: this.minimap,
      paused: this.paused,
    });
  }

  get stats(): { tick: number; fps: number; simTime: number } {
    return { tick: this.world.tick, fps: this.fps, simTime: this.world.tick * this.world.dt };
  }

  private updateCamera(dt: number): void {
    let dx = 0;
    let dy = 0;
    const held = (a: ActionId) => this.hotkeys.get(a).some((b) => this.keysDown.has(b.code));
    if (held('camera.left')) dx -= 1;
    if (held('camera.right')) dx += 1;
    if (held('camera.up')) dy -= 1;
    if (held('camera.down')) dy += 1;
    if (dx || dy) this.camera.panPixels(dx * KEY_SCROLL_SPEED * dt, dy * KEY_SCROLL_SPEED * dt);

    if (this.mouseInside && !(this.drag && this.drag.button === 1)) {
      let ex = 0;
      let ey = 0;
      if (this.mouse.x <= EDGE_SCROLL_PX) ex = -1;
      else if (this.mouse.x >= this.camera.viewportW - EDGE_SCROLL_PX) ex = 1;
      if (this.mouse.y <= EDGE_SCROLL_PX) ey = -1;
      else if (this.mouse.y >= this.camera.viewportH - EDGE_SCROLL_PX) ey = 1;
      if (ex || ey) this.camera.panPixels(ex * EDGE_SCROLL_SPEED * dt, ey * EDGE_SCROLL_SPEED * dt);
    }
  }

  // ---------------------------------------------------------------- Befehle

  private issue(cmd: Command): void {
    this.pending.push(cmd);
  }

  private selectedIds(): UnitId[] {
    this.selection = new Set(pruneSelection([...this.selection], this.world.units));
    return [...this.selection];
  }

  commandMove(target: Vec2, queue: boolean): void {
    const ids = this.selectedIds();
    if (ids.length === 0) return;
    this.issue({ kind: 'move', unitIds: ids, target, queue });
    this.markers.push({ pos: { x: target.x, y: target.y }, bornMs: performance.now(), kind: queue ? 'queue' : 'move' });
  }

  commandStop(): void {
    const ids = this.selectedIds();
    if (ids.length) this.issue({ kind: 'stop', unitIds: ids });
  }

  togglePause(): void {
    this.paused = !this.paused;
    this.onStateChanged?.();
  }

  // ---------------------------------------------------------------- Auswahl

  private setSelection(ids: Iterable<UnitId>): void {
    this.selection = new Set(ids);
    this.onStateChanged?.();
  }

  private clickSelect(world: Vec2, shift: boolean, nowMs: number): void {
    const hit = unitAtPoint(this.world.units, world);
    const isDouble = nowMs - this.lastClick.atMs < DOUBLE_CLICK_MS && hit !== null && this.lastClick.unitId === hit.id;
    this.lastClick = { atMs: nowMs, unitId: hit?.id ?? null };

    if (!hit) {
      if (!shift) this.setSelection([]);
      return;
    }
    if (hit.player !== MY_PLAYER) {
      // Gegner anklicken: zeigt ihn an, ersetzt aber keine Mehrfachauswahl (wie im Spiel: Einzelauswahl)
      if (!shift) this.setSelection([hit.id]);
      return;
    }
    if (isDouble) {
      const vis = this.camera.visibleRect();
      const same = unitsOfTypeInRect(this.world.units, hit.defId, vis, MY_PLAYER).map((u) => u.id);
      this.setSelection(shift ? [...this.selection, ...same] : same);
      return;
    }
    if (shift) this.setSelection(toggleSelection([...this.selection], [hit.id]));
    else this.setSelection([hit.id]);
  }

  private boxSelect(screenRect: Rect, shift: boolean): void {
    const a = this.camera.screenToWorld({ x: screenRect.x0, y: screenRect.y0 });
    const b = this.camera.screenToWorld({ x: screenRect.x1, y: screenRect.y1 });
    const ids = unitsInRect(this.world.units, normalizeRect(a, b), MY_PLAYER).map((u) => u.id);
    if (ids.length === 0 && !shift) {
      this.setSelection([]);
      return;
    }
    if (ids.length === 0) return;
    this.setSelection(shift ? [...this.selection, ...ids] : ids);
  }

  // ---------------------------------------------------------------- Eingabe

  private screenPos(e: MouseEvent): Vec2 {
    const r = this.canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  private onMinimap(p: Vec2): boolean {
    const m = this.minimap;
    return p.x >= m.x && p.x <= m.x + m.w && p.y >= m.y && p.y <= m.y + m.h;
  }

  private minimapToWorld(p: Vec2): Vec2 {
    const m = this.minimap;
    return { x: (p.x - m.x) / m.scale, y: (p.y - m.y) / m.scale };
  }

  private attachInput(): void {
    const c = this.canvas;
    c.addEventListener('contextmenu', (e) => e.preventDefault());
    document.addEventListener('contextmenu', (e) => {
      if ((e.target as HTMLElement | null)?.closest('#hud') == null) e.preventDefault();
    });

    c.addEventListener('mousedown', (e) => {
      const p = this.screenPos(e);
      this.mouse = p;
      c.focus();
      const onMini = this.onMinimap(p);
      if (e.button === 2) {
        // Rechtsklick: Befehl sofort beim Drücken (minimale Latenz)
        const target = onMini ? this.minimapToWorld(p) : this.camera.screenToWorld(p);
        this.commandMove(target, e.shiftKey);
        e.preventDefault();
        return;
      }
      if (e.button === 1) e.preventDefault();
      if (e.button === 0 && onMini) this.camera.lookAt(this.minimapToWorld(p));
      this.drag = { button: e.button, startScreen: p, lastScreen: p, moved: false, onMinimap: onMini };
    });

    window.addEventListener('mousemove', (e) => {
      const p = this.screenPos(e);
      this.mouse = p;
      this.mouseInside = p.x >= 0 && p.y >= 0 && p.x <= this.camera.viewportW && p.y <= this.camera.viewportH;
      const d = this.drag;
      if (!d) return;
      if (!d.moved && Math.hypot(p.x - d.startScreen.x, p.y - d.startScreen.y) > DRAG_THRESHOLD_PX) d.moved = true;
      if (d.button === 1) {
        this.camera.panPixels(d.lastScreen.x - p.x, d.lastScreen.y - p.y);
      } else if (d.button === 0 && d.onMinimap) {
        this.camera.lookAt(this.minimapToWorld(p));
      }
      d.lastScreen = p;
    });

    window.addEventListener('mouseup', (e) => {
      const d = this.drag;
      if (!d || e.button !== d.button) return;
      this.drag = null;
      const p = this.screenPos(e);
      if (d.button === 0 && !d.onMinimap) {
        if (d.moved) this.boxSelect(normalizeRect(d.startScreen, p), e.shiftKey);
        else this.clickSelect(this.camera.screenToWorld(p), e.shiftKey, performance.now());
      }
    });

    c.addEventListener('mouseleave', () => {
      this.mouseInside = false;
    });

    c.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        this.camera.zoomAt(e.deltaY < 0 ? 1.12 : 1 / 1.12, this.screenPos(e));
      },
      { passive: false },
    );

    window.addEventListener('keydown', (e) => {
      const target = e.target as HTMLElement | null;
      const inField = target != null && (target.tagName === 'INPUT' || target.tagName === 'SELECT' || target.tagName === 'TEXTAREA');
      if (inField) return;
      this.keysDown.add(e.code);
      if (shouldPreventDefault(e) || this.hotkeys.isBound(e.code)) e.preventDefault();
      if (e.repeat) return;
      const action = this.hotkeys.match(e);
      if (!action) return;
      switch (action) {
        case 'game.restart':
          this.restart();
          break;
        case 'game.pause':
          this.togglePause();
          break;
        case 'unit.stop':
          this.commandStop();
          break;
        default:
          break; // Kamera-Aktionen laufen über keysDown
      }
    });
    window.addEventListener('keyup', (e) => this.keysDown.delete(e.code));
    window.addEventListener('blur', () => {
      this.keysDown.clear();
      this.drag = null;
    });
  }
}

/** Browser-Standardaktionen unterdrücken, die im Spiel stören (Strg+Zahl, Leertaste, F-Tasten, Tab, Alt). */
function shouldPreventDefault(e: KeyboardEvent): boolean {
  if (e.code === 'Space' || e.code === 'Tab') return true;
  if (/^F\d{1,2}$/.test(e.code) && e.code !== 'F11' && e.code !== 'F12') return true;
  if (/^Digit\d$/.test(e.code) && (e.ctrlKey || e.altKey || e.shiftKey)) return true;
  if (e.code === 'AltLeft' || e.code === 'AltRight') return true;
  if (e.ctrlKey && /^Key[A-Z]$/.test(e.code)) return true;
  return false;
}

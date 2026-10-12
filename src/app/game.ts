/**
 * Spielzustand im Browser: Welt, Kamera, Auswahl, Kontrollgruppen, Eingabe (Maus/Tastatur,
 * Pointer-Lock), KI-Anbindung und die feste Simulationsschleife mit interpolierter Darstellung.
 */
import { SCENARIOS } from '../data/scenarios/index';
import { createAi, type AiController } from '../sim/ai';
import { normalize, type Vec2 } from '../sim/math';
import { buildWorldFromScenario, evaluateOutcome, type Outcome, type ScenarioDef } from '../sim/scenario';
import { stepWorld } from '../sim/step';
import type { Command, SimRules, UnitId, World } from '../sim/types';
import type { UnitDefLibrary } from '../sim/unitDefs';
import { Camera } from './camera';
import { ControlGroups } from './groups';
import { HotkeyMap, type ActionId } from './hotkeys';
import { computeMinimapLayout, render, type Marker, type MinimapLayout } from './renderer';
import { normalizeRect, pruneSelection, toggleSelection, unitAtPoint, unitsInRect, unitsOfTypeInRect, type Rect } from './selection';
import type { DisplaySettings } from './settings';
import { RoundStats, type InputAction, type RoundSummary } from '../sim/stats';
import { Drill, type DrillSummary } from './drill';

const DRAG_THRESHOLD_PX = 4;
const FACING_DRAG_PX = 14;
const DOUBLE_CLICK_MS = 350;
const DOUBLE_TAP_MS = 350;
const EDGE_SCROLL_PX = 6;
const EDGE_SCROLL_SPEED = 1100; // Pixel pro Sekunde
const KEY_SCROLL_SPEED = 1100;
const MAX_TICKS_PER_FRAME = 10;
const MY_PLAYER = 0;

export type TargetingMode = 'attackMove' | 'patrol' | null;

interface DragState {
  button: number;
  startScreen: Vec2;
  lastScreen: Vec2;
  moved: boolean;
  onMinimap: boolean;
  /** Rechtsklick: Ziel des bereits erteilten Bewegungsbefehls (für Ausrichten durch Ziehen). */
  moveTarget?: Vec2;
  queue?: boolean;
}

export class Game {
  world!: World;
  scenario: ScenarioDef;
  readonly camera: Camera;
  selection = new Set<UnitId>();
  readonly groups = new ControlGroups();
  private pending: Command[] = [];
  private markers: Marker[] = [];
  paused = false;
  private seedOffset = 0;
  private ai: AiController | null = null;
  private tracker = new RoundStats(MY_PLAYER);
  outcome: Outcome = 'running';
  summary: RoundSummary | null = null;
  targeting: TargetingMode = null;
  drill: Drill | null = null;
  /** Seed und Zufallsstart der laufenden Runde (für den Vergleichslauf). */
  roundSeed = 1;
  roundRandomStart = false;

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
  private lastGroupTap: { n: number; atMs: number } = { n: 0, atMs: 0 };
  private minimap!: MinimapLayout;
  private ctx: CanvasRenderingContext2D;
  private pointerLocked = false;
  /** Eingabe blockiert, solange ein Menü offen ist. */
  inputBlocked = false;

  onStateChanged: (() => void) | null = null;
  onRoundFinished: ((s: RoundSummary) => void) | null = null;
  onDrillFinished: ((s: DrillSummary) => void) | null = null;
  onDrillChanged: (() => void) | null = null;
  onOpenSettings: (() => void) | null = null;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private defs: UnitDefLibrary,
    public hotkeys: HotkeyMap,
    public readonly settings: DisplaySettings,
    private ruleOverrides: Partial<SimRules>,
    scenario: ScenarioDef = SCENARIOS[0]!,
  ) {
    this.scenario = scenario;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D nicht verfügbar');
    this.ctx = ctx;
    this.camera = new Camera(scenario.map.width, scenario.map.height);
    this.camera.zoom = settings.zoom;
    this.restart();
    this.attachInput();
    this.resize();
  }

  // ---------------------------------------------------------------- Szenario

  /** Neue Einheitendaten/Regeln (Kalibrierung) übernehmen; wirkt ab dem nächsten Neustart. */
  setDefs(defs: UnitDefLibrary, rules: Partial<SimRules>): void {
    this.defs = defs;
    this.ruleOverrides = rules;
  }

  restart(scenario?: ScenarioDef): void {
    if (scenario) this.scenario = scenario;
    const sc = this.scenario;
    const seed = (sc.seed ?? 1) + (this.settings.randomStart ? this.seedOffset++ : 0);
    const merged: ScenarioDef = { ...sc, rules: { ...(sc.rules ?? {}), ...this.ruleOverrides } };
    this.world = buildWorldFromScenario(this.defs, merged, { seed, randomStart: this.settings.randomStart });
    this.roundSeed = seed;
    this.roundRandomStart = this.settings.randomStart;
    this.ai = sc.ai && sc.ai.level !== 'none' ? createAi(1, sc.ai) : null;
    this.tracker = new RoundStats(MY_PLAYER);
    this.outcome = 'running';
    this.summary = null;
    this.selection.clear();
    this.groups.clear();
    this.targeting = null;
    this.pending = [];
    this.markers = [];
    this.accumulator = 0;
    this.paused = false;
    this.camera.setMap(this.world.map.width, this.world.map.height);
    const mine = this.world.units.filter((u) => u.player === MY_PLAYER);
    if (mine.length) this.camera.lookAt(centroid(mine.map((u) => u.pos)));
    this.drill = null;
    if (sc.kind === 'drill') {
      // Szenario-Gruppen werden den Kontrollgruppen 1..n zugewiesen.
      const groupCount = sc.groups.length;
      for (let g = 0; g < groupCount; g++) {
        this.groups.set(g + 1, mine.filter((u) => u.spawnGroup === g).map((u) => u.id));
      }
      const c = centroid(mine.map((u) => u.pos));
      this.drill = new Drill(this.world.rng, sc.drill?.tasks ?? 20, Array.from({ length: groupCount }, (_, i) => i + 1), { center: c, radius: 9 }, performance.now());
    }
    this.onStateChanged?.();
  }

  private recordInput(a: InputAction): void {
    this.tracker.recordInput(a, this.world.tick);
    if (this.drill && this.drill.phase === 'prompt') {
      this.drill.onInput(
        a,
        { selection: this.selection, groupIds: (n) => this.groups.get(n, this.world.units), allMilitary: () => this.world.units.filter((u) => u.alive && u.player === MY_PLAYER).map((u) => u.id) },
        performance.now(),
      );
      this.onDrillChanged?.();
    }
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

    if (!this.inputBlocked) this.updateCamera(dtReal);

    const running = !this.paused && this.outcome === 'running';
    if (running) {
      this.accumulator += dtReal * this.settings.speed;
      let ticks = 0;
      while (this.accumulator >= this.world.dt && ticks < MAX_TICKS_PER_FRAME && this.outcome === 'running') {
        const cmds = this.ai ? [...this.pending, ...this.ai.think(this.world)] : this.pending;
        stepWorld(this.world, cmds);
        this.pending = [];
        this.tracker.consume(this.world, this.world.events);
        this.tracker.sample(this.world);
        this.accumulator -= this.world.dt;
        ticks++;
        this.outcome = evaluateOutcome(this.world, this.scenario, MY_PLAYER);
        if (this.outcome !== 'running') {
          this.summary = this.tracker.finish(this.world, this.outcome);
          this.onRoundFinished?.(this.summary);
        }
      }
      if (ticks >= MAX_TICKS_PER_FRAME) this.accumulator = 0; // Rechner zu langsam: Zeit verwerfen statt Spirale
    }

    if (this.drill && this.drill.phase !== 'done') {
      const before: string = this.drill.phase;
      this.drill.update(nowMs);
      const after: string = this.drill.phase;
      if (after !== before) {
        if (after === 'done') this.onDrillFinished?.(this.drill.summary());
        this.onDrillChanged?.();
      }
    }

    const alpha = running ? Math.min(1, this.accumulator / this.world.dt) : 1;
    this.markers = this.markers.filter((m) => nowMs - m.bornMs < 700);
    this.minimap = computeMinimapLayout(this.camera, this.world);
    const hover = this.mouseInside && !this.drag ? unitAtPoint(this.world.units, this.camera.screenToWorld(this.mouse)) : null;
    const d = this.drag;
    render(this.ctx, {
      world: this.world,
      camera: this.camera,
      selection: this.selection,
      dragRect: d && d.button === 0 && d.moved && !d.onMinimap && !this.targeting ? normalizeRect(d.startScreen, d.lastScreen) : null,
      markers: this.markers,
      showWaypoints: this.keysDown.has('ShiftLeft') || this.keysDown.has('ShiftRight'),
      alpha,
      nowMs,
      minimap: this.minimap,
      paused: this.paused,
      healthBars: this.settings.healthBars,
      rangeRing: this.settings.rangeRing,
      timingBars: this.settings.showTimingBars,
      hoverEnemyId: hover && hover.player !== MY_PLAYER && this.selection.size > 0 ? hover.id : null,
      targeting: this.targeting,
      mouse: this.mouse,
      drawCursor: this.pointerLocked && !this.inputBlocked,
      facingDrag: d && d.button === 2 && d.moved && d.moveTarget ? { from: d.moveTarget, to: this.camera.screenToWorld(d.lastScreen) } : null,
      groupsOf: (id) => this.groups.groupsOf(id),
      drillMarker: this.drill?.marker ?? null,
    });
  }

  get stats(): { tick: number; fps: number; simTime: number; mine: number; theirs: number } {
    let mine = 0;
    let theirs = 0;
    for (const u of this.world.units) if (u.alive) u.player === MY_PLAYER ? mine++ : theirs++;
    return { tick: this.world.tick, fps: this.fps, simTime: this.world.tick * this.world.dt, mine, theirs };
  }

  get pointerLockActive(): boolean {
    return this.pointerLocked;
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
    this.recordInput({ kind: 'command', command: cmd });
  }

  /** Aktuelle Auswertung (auch während der Runde, z. B. für die Anzeige). */
  currentSummary(): RoundSummary {
    return this.tracker.finish(this.world, this.outcome);
  }

  private selectedIds(): UnitId[] {
    this.selection = new Set(pruneSelection([...this.selection], this.world.units).filter((id) => this.world.units[id - 1]?.player === MY_PLAYER));
    return [...this.selection];
  }

  /** Rechtsklick: Angriff auf Gegner unter dem Zeiger, sonst Bewegung. Liefert das Bewegungsziel (für Ausrichten). */
  commandAt(target: Vec2, queue: boolean): Vec2 | null {
    const ids = this.selectedIds();
    if (ids.length === 0) return null;
    const hit = unitAtPoint(this.world.units, target);
    if (hit && hit.player !== MY_PLAYER) {
      this.issue({ kind: 'attack', unitIds: ids, targetId: hit.id, queue });
      this.markers.push({ pos: { x: hit.pos.x, y: hit.pos.y }, bornMs: performance.now(), kind: 'attack' });
      return null;
    }
    this.issue({ kind: 'move', unitIds: ids, target, queue });
    this.markers.push({ pos: { x: target.x, y: target.y }, bornMs: performance.now(), kind: queue ? 'queue' : 'move' });
    return target;
  }

  /** Bewegungsbefehl mit Blickrichtung (Rechtsklick-Ziehen); ersetzt den zuvor erteilten Befehl. */
  commandMoveFacing(target: Vec2, facing: Vec2): void {
    const ids = this.selectedIds();
    if (ids.length === 0) return;
    this.issue({ kind: 'move', unitIds: ids, target, queue: false, facing: normalize(facing) });
  }

  commandTargeted(mode: Exclude<TargetingMode, null>, target: Vec2, queue: boolean): void {
    const ids = this.selectedIds();
    if (ids.length === 0) return;
    this.issue({ kind: mode, unitIds: ids, target, queue });
    this.markers.push({ pos: { x: target.x, y: target.y }, bornMs: performance.now(), kind: mode === 'attackMove' ? 'attack' : 'queue' });
  }

  commandStop(): void {
    const ids = this.selectedIds();
    if (ids.length) this.issue({ kind: 'stop', unitIds: ids });
  }

  commandHold(queue: boolean): void {
    const ids = this.selectedIds();
    if (ids.length) this.issue({ kind: 'hold', unitIds: ids, queue });
  }

  setTargeting(mode: TargetingMode): void {
    if (mode && this.selectedIds().length === 0) mode = null;
    this.targeting = mode;
    this.onStateChanged?.();
  }

  togglePause(): void {
    if (this.outcome !== 'running') return;
    this.paused = !this.paused;
    this.onStateChanged?.();
  }

  focusSelection(): void {
    const units = this.selectedIds().map((id) => this.world.units[id - 1]!);
    if (units.length) this.camera.lookAt(centroid(units.map((u) => u.pos)));
  }

  // ---------------------------------------------------------------- Auswahl

  private setSelection(ids: Iterable<UnitId>): void {
    this.selection = new Set(ids);
    this.recordInput({ kind: 'select' });
    this.onStateChanged?.();
  }

  selectAllMilitary(): void {
    this.setSelection(this.world.units.filter((u) => u.alive && u.player === MY_PLAYER).map((u) => u.id));
  }

  selectAllOfSelectedTypes(): void {
    const types = new Set(this.selectedIds().map((id) => this.world.units[id - 1]!.defId));
    if (types.size === 0) return;
    this.setSelection(this.world.units.filter((u) => u.alive && u.player === MY_PLAYER && types.has(u.defId)).map((u) => u.id));
  }

  groupSet(n: number): void {
    this.groups.set(n, this.selectedIds());
    this.recordInput({ kind: 'group', n });
    this.onStateChanged?.();
  }

  groupAdd(n: number): void {
    this.groups.add(n, this.selectedIds());
    this.recordInput({ kind: 'group', n });
    this.onStateChanged?.();
  }

  groupSelect(n: number, nowMs: number): void {
    const ids = this.groups.get(n, this.world.units);
    if (ids.length === 0) {
      this.recordInput({ kind: 'group', n });
      return;
    }
    this.setSelection(ids);
    if (this.lastGroupTap.n === n && nowMs - this.lastGroupTap.atMs < DOUBLE_TAP_MS) {
      this.camera.lookAt(centroid(ids.map((id) => this.world.units[id - 1]!.pos)));
    }
    this.lastGroupTap = { n, atMs: nowMs };
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
    if (this.pointerLocked) return { x: this.mouse.x, y: this.mouse.y };
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

  /** Pointer-Lock anfordern (nur nach Nutzeraktion möglich). */
  requestPointerLock(): void {
    if (!this.settings.pointerLock || this.pointerLocked || this.inputBlocked) return;
    try {
      const p = this.canvas.requestPointerLock({ unadjustedMovement: true } as unknown as undefined) as unknown as Promise<void> | undefined;
      p?.catch?.(() => this.canvas.requestPointerLock());
    } catch {
      try {
        this.canvas.requestPointerLock();
      } catch {
        /* nicht unterstützt */
      }
    }
  }

  exitPointerLock(): void {
    if (this.pointerLocked && document.pointerLockElement === this.canvas) document.exitPointerLock();
  }

  private attachInput(): void {
    const c = this.canvas;
    c.addEventListener('contextmenu', (e) => e.preventDefault());
    document.addEventListener('contextmenu', (e) => {
      if ((e.target as HTMLElement | null)?.closest('#hud') == null) e.preventDefault();
    });
    document.addEventListener('pointerlockchange', () => {
      this.pointerLocked = document.pointerLockElement === c;
      if (this.pointerLocked) this.mouseInside = true;
      this.onStateChanged?.();
    });

    c.addEventListener('mousedown', (e) => {
      if (this.inputBlocked) return;
      c.focus();
      if (!this.pointerLocked && this.settings.pointerLock) this.requestPointerLock();
      const p = this.screenPos(e);
      this.mouse = p;
      const onMini = this.onMinimap(p);
      const worldPos = onMini ? this.minimapToWorld(p) : this.camera.screenToWorld(p);

      if (this.targeting) {
        if (e.button === 0) {
          this.commandTargeted(this.targeting, worldPos, e.shiftKey);
          if (!e.shiftKey) this.setTargeting(null);
        } else if (e.button === 2) this.setTargeting(null);
        e.preventDefault();
        return;
      }
      if (e.button === 2) {
        const moveTarget = this.commandAt(worldPos, e.shiftKey);
        this.drag = { button: 2, startScreen: p, lastScreen: p, moved: false, onMinimap: onMini, queue: e.shiftKey };
        if (moveTarget && !onMini && !e.shiftKey) this.drag.moveTarget = moveTarget;
        e.preventDefault();
        return;
      }
      if (e.button === 1) e.preventDefault();
      if (e.button === 0 && onMini) this.camera.lookAt(worldPos);
      this.drag = { button: e.button, startScreen: p, lastScreen: p, moved: false, onMinimap: onMini };
    });

    window.addEventListener('mousemove', (e) => {
      let p: Vec2;
      if (this.pointerLocked) {
        p = {
          x: Math.max(0, Math.min(this.camera.viewportW, this.mouse.x + e.movementX)),
          y: Math.max(0, Math.min(this.camera.viewportH, this.mouse.y + e.movementY)),
        };
        this.mouseInside = !this.inputBlocked;
      } else {
        const r = this.canvas.getBoundingClientRect();
        p = { x: e.clientX - r.left, y: e.clientY - r.top };
        this.mouseInside = !this.inputBlocked && p.x >= 0 && p.y >= 0 && p.x <= this.camera.viewportW && p.y <= this.camera.viewportH;
      }
      this.mouse = p;
      const d = this.drag;
      if (!d) return;
      const threshold = d.button === 2 ? FACING_DRAG_PX : DRAG_THRESHOLD_PX;
      if (!d.moved && Math.hypot(p.x - d.startScreen.x, p.y - d.startScreen.y) > threshold) d.moved = true;
      if (d.button === 1) this.camera.panPixels(d.lastScreen.x - p.x, d.lastScreen.y - p.y);
      else if (d.button === 0 && d.onMinimap) this.camera.lookAt(this.minimapToWorld(p));
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
      } else if (d.button === 2 && d.moved && d.moveTarget) {
        const to = this.camera.screenToWorld(p);
        this.commandMoveFacing(d.moveTarget, { x: to.x - d.moveTarget.x, y: to.y - d.moveTarget.y });
      }
    });

    c.addEventListener('mouseleave', () => {
      if (!this.pointerLocked) this.mouseInside = false;
    });

    c.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        if (this.inputBlocked) return;
        this.camera.zoomAt(e.deltaY < 0 ? 1.08 : 1 / 1.08, this.screenPos(e));
        this.settings.zoom = this.camera.zoom;
        this.onStateChanged?.();
      },
      { passive: false },
    );

    window.addEventListener('keydown', (e) => {
      const target = e.target as HTMLElement | null;
      const inField = target != null && (target.tagName === 'INPUT' || target.tagName === 'SELECT' || target.tagName === 'TEXTAREA');
      if (inField || this.inputBlocked) return;
      this.keysDown.add(e.code);
      if (shouldPreventDefault(e) || this.hotkeys.isBound(e.code)) e.preventDefault();
      if (e.repeat) return;
      if (e.code === 'Escape') {
        if (this.targeting) this.setTargeting(null);
        return;
      }
      const action = this.hotkeys.match(e);
      if (!action) return;
      this.runAction(action, e.shiftKey);
    });
    window.addEventListener('keyup', (e) => this.keysDown.delete(e.code));
    window.addEventListener('blur', () => {
      this.keysDown.clear();
      this.drag = null;
    });
  }

  runAction(action: ActionId, shift: boolean): void {
    const now = performance.now();
    switch (action) {
      case 'game.restart':
        this.restart();
        return;
      case 'game.pause':
        this.togglePause();
        return;
      case 'game.settings':
        this.onOpenSettings?.();
        return;
      case 'unit.stop':
        this.setTargeting(null);
        this.commandStop();
        return;
      case 'unit.hold':
        this.setTargeting(null);
        this.commandHold(shift);
        return;
      case 'unit.attackMove':
        this.setTargeting('attackMove');
        return;
      case 'unit.patrol':
        this.setTargeting('patrol');
        return;
      case 'select.allMilitary':
        this.selectAllMilitary();
        return;
      case 'select.allOfType':
        this.selectAllOfSelectedTypes();
        return;
      case 'camera.focusSelection':
        this.focusSelection();
        return;
      default:
        break;
    }
    const m = /^group\.(set|select|add)\.(\d)$/.exec(action);
    if (m) {
      const n = Number(m[2]);
      if (m[1] === 'set') this.groupSet(n);
      else if (m[1] === 'add') this.groupAdd(n);
      else this.groupSelect(n, now);
    }
  }
}

function centroid(points: readonly Vec2[]): Vec2 {
  let x = 0;
  let y = 0;
  for (const p of points) {
    x += p.x;
    y += p.y;
  }
  return { x: x / points.length, y: y / points.length };
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

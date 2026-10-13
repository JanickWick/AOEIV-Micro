/**
 * Spielzustand im Browser: Welt, Kamera, Auswahl, Kontrollgruppen, Eingabe (Maus/Tastatur,
 * Pointer-Lock), KI-Anbindung und die feste Simulationsschleife mit interpolierter Darstellung.
 */
import { SCENARIOS } from '../data/scenarios/index';
import { createAi, type AiController } from '../sim/ai';
import { normalize, type Vec2 } from '../sim/math';
import { buildWorldFromScenario, evaluateOutcome, type Outcome, type ScenarioDef } from '../sim/scenario';
import { stepWorld } from '../sim/step';
import type { Command, Formation, SimRules, UnitId, World } from '../sim/types';
import type { UnitDefLibrary } from '../sim/unitDefs';
import { Camera2D } from './camera';
import { Camera3D } from './camera3d';
import { ControlGroups } from './groups';
import { Scene3D } from './render3d/scene';
import type { ViewCamera } from './viewCamera';
import { GameAudio } from './audio';
import { HotkeyMap, type ActionId } from './hotkeys';
import { computeMinimapLayout, minimapContains, minimapScreenToWorld, type MinimapLayout } from './minimap';
import { render, type Marker } from './renderer';
import { commandTargets, cycleSubgroup, onlyType, removeType, resolveActive, subgroupsOf, unitName } from './subgroups';
import { normalizeRect, pruneSelection, toggleSelection, unitAtPoint, unitAtScreenPoint, unitsInScreenRect, unitsOfTypeInRect, type Rect } from './selection';
import type { DisplaySettings, QualityLevel } from './settings';
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
  camera: ViewCamera;
  private cam2d: Camera2D;
  private cam3d: Camera3D;
  private scene3d: Scene3D | null = null;
  readonly audio = new GameAudio();
  private frameEvents: import('../sim/types').SimEvent[] = [];
  view: '2d' | '3d';
  selection = new Set<UnitId>();
  /** Aktive Untergruppe der Auswahl (Einheitentyp) oder null = alle. */
  activeSubgroup: string | null = null;
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
  /** Mittlere CPU-Zeit je Bild (ms): Simulation (alle Ticks) und Darstellung (JS-Anteil von Three.js + Overlay). */
  private simMs = 0;
  private renderMs = 0;
  private simAcc = 0;
  private renderAcc = 0;
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
  /** Für das HUD: Aktion wurde ausgelöst (Taste oder Klick), z. B. zum Aufblitzen der Rasterzelle. */
  onActionTriggered: ((action: ActionId) => void) | null = null;
  /** Liefert die verfügbare Kantenlänge und den rechten/unteren Rand der Minimap in Pixeln (vom HUD). */
  minimapBox: () => { box: number; margin: number } = () => ({ box: 200, margin: 10 });

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly glCanvas: HTMLCanvasElement,
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
    this.cam2d = new Camera2D(scenario.map.width, scenario.map.height);
    this.cam2d.zoomLevel = settings.zoom;
    this.cam3d = new Camera3D(scenario.map.width, scenario.map.height);
    this.cam3d.zoomLevel = settings.zoom3d;
    this.view = settings.view;
    this.camera = this.view === '3d' ? this.cam3d : this.cam2d;
    this.setView(this.view, true);
    this.restart();
    this.attachInput();
    this.resize();
  }

  /** Ansicht wechseln: 3D (Three.js) oder 2D-Debug. Kamera-Mitte wird übernommen. */
  setView(view: '2d' | '3d', initial = false): void {
    const center = { ...this.camera.center };
    this.view = view;
    this.settings.view = view;
    this.camera = view === '3d' ? this.cam3d : this.cam2d;
    if (!initial) this.camera.lookAt(center);
    if (view === '3d') {
      if (!this.scene3d) {
        try {
          this.scene3d = new Scene3D(this.glCanvas, { quality: this.settings.quality });
        } catch (e) {
          console.error('3D-Ansicht nicht verfügbar (WebGL?):', e);
          this.view = '2d';
          this.settings.view = '2d';
          this.camera = this.cam2d;
        }
      }
    }
    this.glCanvas.style.display = this.view === '3d' ? 'block' : 'none';
    if (this.world) this.resize();
    this.onStateChanged?.();
  }

  setShadows(on: boolean): void {
    this.scene3d?.setShadows(on);
  }

  setQuality(level: QualityLevel): void {
    this.scene3d?.setQuality(level);
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
    this.cam2d.setMap(this.world.map.width, this.world.map.height);
    this.cam3d.setMap(this.world.map.width, this.world.map.height);
    const mine = this.world.units.filter((u) => u.player === MY_PLAYER);
    if (mine.length) {
      const c = centroid(mine.map((u) => u.pos));
      this.cam2d.lookAt(c);
      this.cam3d.lookAt(c);
    }
    this.scene3d?.setWorld(this.world);
    this.drill = null;
    if (sc.kind === 'drill') {
      // Szenario-Gruppen werden den Kontrollgruppen 1..n zugewiesen.
      const groupCount = sc.groups.length;
      if (sc.drill?.mode !== 'subgroups') {
        for (let g = 0; g < groupCount; g++) {
          this.groups.set(g + 1, mine.filter((u) => u.spawnGroup === g).map((u) => u.id));
        }
      }
      const c = centroid(mine.map((u) => u.pos));
      const types = [...new Set(mine.map((u) => u.defId))].map((defId) => ({ defId, name: unitName(defId, this.world.defs.get(defId).name) }));
      if (sc.drill?.mode === 'subgroups') this.groups.set(1, mine.map((u) => u.id));
      this.drill = new Drill(this.world.rng, sc.drill?.tasks ?? 20, Array.from({ length: groupCount }, (_, i) => i + 1), { center: c, radius: 9 }, performance.now(), { mode: sc.drill?.mode ?? 'groups', types });
    }
    this.onStateChanged?.();
  }

  private recordInput(a: InputAction): void {
    this.tracker.recordInput(a, this.world.tick);
    if (this.drill && this.drill.phase === 'prompt') {
      this.drill.onInput(
        a,
        {
          selection: this.selection,
          groupIds: (n) => this.groups.get(n, this.world.units),
          allMilitary: () => this.world.units.filter((u) => u.alive && u.player === MY_PLAYER).map((u) => u.id),
          activeSubgroup: this.activeSubgroup,
          typeOf: (id) => this.world.units[id - 1]?.defId ?? '',
        },
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
    this.cam2d.setViewport(w, h);
    this.cam3d.setViewport(w, h);
    this.scene3d?.resize(w, h);
    this.layoutMinimap();
  }

  /** Minimap-Lage neu berechnen (nach Zuweisung von minimapBox oder Änderung der HUD-Größe). */
  relayoutMinimap(): void {
    this.layoutMinimap();
  }

  private layoutMinimap(): void {
    const { box, margin } = this.minimapBox();
    this.minimap = computeMinimapLayout(this.camera.viewportW, this.camera.viewportH, this.world.map.width, this.world.map.height, this.view === '3d', box, margin);
  }

  frame(nowMs: number): void {
    const dtReal = this.lastFrame ? Math.min((nowMs - this.lastFrame) / 1000, 0.25) : 0;
    this.lastFrame = nowMs;
    this.fpsAcc += dtReal;
    this.fpsFrames++;
    if (this.fpsAcc >= 0.5) {
      this.fps = this.fpsFrames / this.fpsAcc;
      this.simMs = this.simAcc / this.fpsFrames;
      this.renderMs = this.renderAcc / this.fpsFrames;
      this.fpsAcc = 0;
      this.fpsFrames = 0;
      this.simAcc = 0;
      this.renderAcc = 0;
    }

    if (!this.inputBlocked) this.updateCamera(dtReal);

    const running = !this.paused && this.outcome === 'running';
    const simStart = performance.now();
    if (running) {
      this.accumulator += dtReal * this.settings.speed;
      let ticks = 0;
      while (this.accumulator >= this.world.dt && ticks < MAX_TICKS_PER_FRAME && this.outcome === 'running') {
        const cmds = this.ai ? [...this.pending, ...this.ai.think(this.world)] : this.pending;
        const projectilesBefore = this.world.projectiles.filter((p) => p.splashRadius > 0).map((p) => ({ id: p.id, targetPos: { ...p.targetPos }, splashRadius: p.splashRadius }));
        stepWorld(this.world, cmds);
        this.pending = [];
        this.tracker.consume(this.world, this.world.events);
        this.tracker.sample(this.world);
        this.frameEvents.push(...this.world.events);
        if (projectilesBefore.length && this.scene3d) this.scene3d.noteImpacts(this.world, projectilesBefore);
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
    this.simAcc += performance.now() - simStart;

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
    if (!this.minimap || this.minimap.mapW !== this.world.map.width || this.minimap.mapH !== this.world.map.height || (this.minimap.rotation !== 0) !== (this.view === '3d')) this.layoutMinimap();
    const hover = this.mouseInside && !this.drag ? unitAtScreenPoint(this.world.units, this.world.defs, this.mouse, this.camera) : null;
    const d = this.drag;
    const hoverEnemyId = hover && hover.player !== MY_PLAYER && this.selection.size > 0 ? hover.id : null;
    if (this.frameEvents.length) {
      this.scene3d?.consumeEvents(this.world, this.frameEvents);
      this.audio.consume(this.world, this.frameEvents, nowMs);
      this.frameEvents = [];
    }
    const renderStart = performance.now();
    if (this.view === '3d' && this.scene3d) this.scene3d.render(this.world, this.cam3d, alpha, this.selection, hoverEnemyId, nowMs);
    render(this.ctx, {
      mode: this.view,
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
      hoverEnemyId,
      targeting: this.targeting,
      mouse: this.mouse,
      drawCursor: this.pointerLocked && !this.inputBlocked,
      facingDrag: d && d.button === 2 && d.moved && d.moveTarget ? { from: d.moveTarget, to: this.camera.screenToWorld(d.lastScreen) } : null,
      groupsOf: (id) => this.groups.groupsOf(id),
      drillMarker: this.drill?.marker ?? null,
    });
    this.renderAcc += performance.now() - renderStart;
  }

  get stats(): { tick: number; fps: number; simMs: number; renderMs: number; simTime: number; mine: number; theirs: number; calls: number; triangles: number } {
    let mine = 0;
    let theirs = 0;
    for (const u of this.world.units) if (u.alive) u.player === MY_PLAYER ? mine++ : theirs++;
    const info = this.scene3d?.renderInfo ?? { calls: 0, triangles: 0 };
    return { tick: this.world.tick, fps: this.fps, simMs: this.simMs, renderMs: this.renderMs, simTime: this.world.tick * this.world.dt, mine, theirs, calls: info.calls, triangles: info.triangles };
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
    this.activeSubgroup = resolveActive(this.activeSubgroup, subgroupsOf(this.world.units, this.selection));
    return [...this.selection];
  }

  /** Einheiten, an die Befehle gehen: aktive Untergruppe oder ganze Auswahl. */
  commandIds(): UnitId[] {
    this.selectedIds();
    return commandTargets(this.world.units, this.selection, this.activeSubgroup);
  }

  /** Untergruppe wechseln (Tab = nächste, Strg+Tab = vorige). */
  subselect(dir: 1 | -1): void {
    this.selectedIds();
    this.activeSubgroup = cycleSubgroup(this.activeSubgroup, subgroupsOf(this.world.units, this.selection), dir);
    this.recordInput({ kind: 'select' });
    this.onStateChanged?.();
  }

  /** Untergruppe direkt wählen (Klick auf "ALLE" oder eine Typ-Karte im Untergruppen-Modus). */
  setActiveSubgroup(defId: string | null): void {
    this.selectedIds();
    this.activeSubgroup = resolveActive(defId, subgroupsOf(this.world.units, this.selection));
    this.recordInput({ kind: 'select' });
    this.onStateChanged?.();
  }

  /** Auswahl auf einen Typ reduzieren (Klick auf die Typ-Karte). */
  selectionOnlyType(defId: string): void {
    this.setSelection(onlyType(this.world.units, this.selection, defId));
  }

  /** Typ aus der Auswahl entfernen (Shift/Strg+Klick auf die Typ-Karte). */
  selectionRemoveType(defId: string): void {
    this.setSelection(removeType(this.world.units, this.selection, defId));
  }

  /** Rechtsklick: Angriff auf Gegner unter dem Zeiger, sonst Bewegung. Liefert das Bewegungsziel (für Ausrichten). */
  commandAt(target: Vec2, queue: boolean, screen?: Vec2): Vec2 | null {
    const ids = this.commandIds();
    if (ids.length === 0) return null;
    const hit = screen ? unitAtScreenPoint(this.world.units, this.world.defs, screen, this.camera) : unitAtPoint(this.world.units, target);
    if (hit && hit.player !== MY_PLAYER) {
      this.issue({ kind: 'attack', unitIds: ids, targetId: hit.id, queue });
      this.marker(hit.pos, 'attack');
      return null;
    }
    this.issue({ kind: 'move', unitIds: ids, target, queue });
    this.marker(target, queue ? 'queue' : 'move');
    return target;
  }

  /** Bewegungsbefehl mit Blickrichtung (Rechtsklick-Ziehen); ersetzt den zuvor erteilten Befehl. */
  commandMoveFacing(target: Vec2, facing: Vec2): void {
    const ids = this.commandIds();
    if (ids.length === 0) return;
    this.issue({ kind: 'move', unitIds: ids, target, queue: false, facing: normalize(facing) });
  }

  commandTargeted(mode: Exclude<TargetingMode, null>, target: Vec2, queue: boolean): void {
    const ids = this.commandIds();
    if (ids.length === 0) return;
    this.issue({ kind: mode, unitIds: ids, target, queue });
    this.marker(target, mode === 'attackMove' ? 'attack' : 'queue');
  }

  private marker(pos: Vec2, kind: 'move' | 'attack' | 'queue'): void {
    const now = performance.now();
    this.markers.push({ pos: { x: pos.x, y: pos.y }, bornMs: now, kind });
    this.scene3d?.addMarker(pos, kind, now);
    if (this.audio.enabled) this.audio.ack();
  }

  commandStop(): void {
    const ids = this.commandIds();
    if (ids.length) this.issue({ kind: 'stop', unitIds: ids });
  }

  commandHold(queue: boolean): void {
    const ids = this.commandIds();
    if (ids.length) this.issue({ kind: 'hold', unitIds: ids, queue });
  }

  setTargeting(mode: TargetingMode): void {
    if (mode && this.commandIds().length === 0) mode = null;
    this.targeting = mode;
    this.onStateChanged?.();
  }

  /** Erfüllt, sobald die 3D-Modelle geladen sind (2D-Ansicht: sofort). */
  whenReady(): Promise<void> {
    return this.scene3d ? this.scene3d.skinned.ready : Promise.resolve();
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
    this.activeSubgroup = null;
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

  groupAddExclusive(n: number): void {
    this.groups.addExclusive(n, this.selectedIds());
    this.recordInput({ kind: 'group', n });
    this.onStateChanged?.();
  }

  groupRemove(n: number): void {
    this.groups.remove(n, this.selectedIds());
    this.recordInput({ kind: 'group', n });
    this.onStateChanged?.();
  }

  groupRemoveAll(): void {
    this.groups.removeFromAll(this.selectedIds());
    this.recordInput({ kind: 'group', n: -1 });
    this.onStateChanged?.();
  }

  selectIdleMilitary(): void {
    this.setSelection(this.world.units.filter((u) => u.alive && u.player === MY_PLAYER && u.orders.length === 0 && u.attack.targetId === null).map((u) => u.id));
  }

  /** Wählt die nächste untätige Einheit (zyklisch nach der aktuellen Auswahl) und zentriert die Kamera. */
  selectNextIdleMilitary(): void {
    const idle = this.world.units.filter((u) => u.alive && u.player === MY_PLAYER && u.orders.length === 0 && u.attack.targetId === null);
    if (idle.length === 0) return;
    const current = this.selection.size === 1 ? [...this.selection][0]! : -1;
    const i = idle.findIndex((u) => u.id === current);
    const next = idle[(i + 1) % idle.length]!;
    this.setSelection([next.id]);
    this.camera.lookAt(next.pos);
  }

  cameraReset(): void {
    this.camera.resetZoom();
    if (this.view === '3d') this.settings.zoom3d = this.camera.zoomLevel;
    else this.settings.zoom = this.camera.zoomLevel;
    const mine = this.world.units.filter((u) => u.alive && u.player === MY_PLAYER);
    if (mine.length) this.camera.lookAt(centroid(mine.map((u) => u.pos)));
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

  private clickSelect(screen: Vec2, shift: boolean, nowMs: number): void {
    const hit = unitAtScreenPoint(this.world.units, this.world.defs, screen, this.camera);
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
    const ids = unitsInScreenRect(this.world.units, screenRect, this.camera, MY_PLAYER).map((u) => u.id);
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
    return minimapContains(this.minimap, p);
  }

  private minimapToWorld(p: Vec2): Vec2 {
    const w = minimapScreenToWorld(this.minimap, p);
    return { x: Math.max(0, Math.min(this.world.map.width, w.x)), y: Math.max(0, Math.min(this.world.map.height, w.y)) };
  }

  /** Formation der Auswahl setzen (wirkt auf die nächste Bewegung). */
  commandFormation(f: Formation): void {
    const ids = this.commandIds();
    if (ids.length === 0) return;
    this.issue({ kind: 'formation', unitIds: ids, formation: f });
    this.onStateChanged?.();
  }

  /** Ausgewählte eigene Einheiten löschen (wie ENTF im Spiel). */
  commandDelete(): void {
    const ids = this.commandIds();
    if (ids.length === 0) return;
    this.issue({ kind: 'delete', unitIds: ids });
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
      this.audio.unlock();
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
        const moveTarget = this.commandAt(worldPos, e.shiftKey, onMini ? undefined : p);
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
        else this.clickSelect(p, e.shiftKey, performance.now());
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
        if (this.view === '3d') this.settings.zoom3d = this.camera.zoomLevel;
        else this.settings.zoom = this.camera.zoomLevel;
        this.onStateChanged?.();
      },
      { passive: false },
    );

    window.addEventListener('keydown', (e) => {
      const target = e.target as HTMLElement | null;
      const inField = target != null && (target.tagName === 'INPUT' || target.tagName === 'SELECT' || target.tagName === 'TEXTAREA');
      if (inField || this.inputBlocked) return;
      this.audio.unlock();
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
    this.onActionTriggered?.(action);
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
      case 'camera.reset':
        this.cameraReset();
        return;
      case 'select.idleMilitary':
        this.selectIdleMilitary();
        return;
      case 'select.nextIdleMilitary':
        this.selectNextIdleMilitary();
        return;
      case 'group.removeAll':
        this.groupRemoveAll();
        return;
      case 'formation.line':
      case 'formation.wedge':
      case 'formation.spread':
        this.commandFormation(action.slice('formation.'.length) as Formation);
        return;
      case 'unit.delete':
        this.setTargeting(null);
        this.commandDelete();
        return;
      case 'subselect.next':
        this.subselect(1);
        return;
      case 'subselect.prev':
        this.subselect(-1);
        return;
      default:
        break;
    }
    const m = /^group\.(set|select|add|addExclusive|remove)\.(\d)$/.exec(action);
    if (m) {
      const n = Number(m[2]);
      if (m[1] === 'set') this.groupSet(n);
      else if (m[1] === 'add') this.groupAdd(n);
      else if (m[1] === 'addExclusive') this.groupAddExclusive(n);
      else if (m[1] === 'remove') this.groupRemove(n);
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

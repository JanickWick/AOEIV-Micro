/**
 * Hotkey-Drill ohne Kampf: Ansagen wie "Gruppe 2 auswählen, Attack-Move auf den Marker",
 * misst Reaktionszeit (Ansage bis Erfüllung) und Fehlgriffe (Eingaben, die den aktuellen
 * Schritt nicht erfüllen).
 */
import type { Vec2 } from '../sim/math';
import type { Rng } from '../sim/rng';
import type { InputAction } from '../sim/stats';
import type { UnitId } from '../sim/types';

export type DrillStep =
  | { kind: 'selectGroup'; n: number }
  | { kind: 'selectAll' }
  | { kind: 'setGroup'; n: number }
  | { kind: 'command'; command: 'attackMove' | 'move' | 'patrol'; marker: Vec2 }
  | { kind: 'stop' }
  | { kind: 'hold' };

export interface DrillTask {
  label: string;
  steps: DrillStep[];
}

export interface DrillResult {
  label: string;
  ms: number;
  errors: number;
}

export interface DrillSummary {
  results: DrillResult[];
  avgMs: number;
  medianMs: number;
  bestMs: number;
  worstMs: number;
  errors: number;
  byType: Record<string, { count: number; avgMs: number }>;
}

export interface DrillContext {
  selection: ReadonlySet<UnitId>;
  groupIds(n: number): UnitId[];
  allMilitary(): UnitId[];
}

const MARKER_TOLERANCE = 3; // Tiles
const DELAY_MIN_MS = 900;
const DELAY_MAX_MS = 2200;

export class Drill {
  readonly tasks: DrillTask[];
  private index = -1;
  private stepIndex = 0;
  private promptAt = 0;
  private nextPromptAt: number;
  private errorsInTask = 0;
  readonly results: DrillResult[] = [];
  phase: 'waiting' | 'prompt' | 'done' = 'waiting';

  constructor(rng: Rng, count: number, groups: number[], area: { center: Vec2; radius: number }, nowMs: number) {
    this.tasks = generateTasks(rng, count, groups, area);
    this.nextPromptAt = nowMs + 1500;
  }

  get current(): DrillTask | null {
    return this.phase === 'prompt' ? (this.tasks[this.index] ?? null) : null;
  }

  get currentStep(): DrillStep | null {
    return this.current?.steps[this.stepIndex] ?? null;
  }

  get marker(): Vec2 | null {
    const t = this.current;
    if (!t) return null;
    for (const s of t.steps) if (s.kind === 'command') return s.marker;
    return null;
  }

  get progress(): { done: number; total: number } {
    return { done: this.results.length, total: this.tasks.length };
  }

  update(nowMs: number): void {
    if (this.phase === 'waiting' && nowMs >= this.nextPromptAt) {
      this.index++;
      if (this.index >= this.tasks.length) {
        this.phase = 'done';
        return;
      }
      this.stepIndex = 0;
      this.errorsInTask = 0;
      this.promptAt = nowMs;
      this.phase = 'prompt';
    }
  }

  /** Liefert true, wenn die Eingabe den aktuellen Schritt erfüllt hat. */
  onInput(a: InputAction, ctx: DrillContext, nowMs: number): boolean {
    const step = this.currentStep;
    if (!step) return false;
    const ok = satisfies(step, a, ctx);
    if (ok) {
      this.stepIndex++;
      if (this.stepIndex >= this.current!.steps.length) {
        this.results.push({ label: this.current!.label, ms: nowMs - this.promptAt, errors: this.errorsInTask });
        this.phase = 'waiting';
        this.nextPromptAt = nowMs + (this.tasks[this.index] as TaskWithPause).pauseMs;
      }
      return true;
    }
    if (isError(step, a)) this.errorsInTask++;
    return false;
  }

  summary(): DrillSummary {
    const ms = this.results.map((r) => r.ms).sort((a, b) => a - b);
    const byType: Record<string, { count: number; sum: number }> = {};
    for (const r of this.results) {
      const key = r.label.replace(/\d/g, 'n');
      const e = (byType[key] ??= { count: 0, sum: 0 });
      e.count++;
      e.sum += r.ms;
    }
    return {
      results: this.results,
      avgMs: ms.length ? ms.reduce((s, v) => s + v, 0) / ms.length : 0,
      medianMs: ms.length ? ms[Math.floor(ms.length / 2)]! : 0,
      bestMs: ms[0] ?? 0,
      worstMs: ms[ms.length - 1] ?? 0,
      errors: this.results.reduce((s, r) => s + r.errors, 0),
      byType: Object.fromEntries(Object.entries(byType).map(([k, v]) => [k, { count: v.count, avgMs: v.sum / v.count }])),
    };
  }
}

interface TaskWithPause extends DrillTask {
  pauseMs: number;
}

function sameSet(a: ReadonlySet<UnitId>, ids: UnitId[]): boolean {
  if (a.size !== ids.length) return false;
  for (const id of ids) if (!a.has(id)) return false;
  return true;
}

function satisfies(step: DrillStep, a: InputAction, ctx: DrillContext): boolean {
  switch (step.kind) {
    case 'selectGroup':
      return a.kind !== 'command' && sameSet(ctx.selection, ctx.groupIds(step.n)) && ctx.selection.size > 0;
    case 'selectAll':
      return a.kind !== 'command' && sameSet(ctx.selection, ctx.allMilitary());
    case 'setGroup':
      return a.kind === 'group' && a.n === step.n && sameSet(ctx.selection, ctx.groupIds(step.n)) && ctx.selection.size > 0;
    case 'command': {
      if (a.kind !== 'command' || a.command.kind !== step.command || a.command.unitIds.length === 0) return false;
      const t = a.command.target;
      return Math.hypot(t.x - step.marker.x, t.y - step.marker.y) <= MARKER_TOLERANCE;
    }
    case 'stop':
      return a.kind === 'command' && a.command.kind === 'stop' && a.command.unitIds.length > 0;
    case 'hold':
      return a.kind === 'command' && a.command.kind === 'hold' && a.command.unitIds.length > 0;
  }
}

/** Fehlgriff: ein Befehl oder eine Gruppenaktion, die den Schritt nicht erfüllt. Reine Auswahländerungen zählen nicht. */
function isError(step: DrillStep, a: InputAction): boolean {
  void step;
  return a.kind !== 'select';
}

function generateTasks(rng: Rng, count: number, groups: number[], area: { center: Vec2; radius: number }): TaskWithPause[] {
  const tasks: TaskWithPause[] = [];
  const marker = (): Vec2 => ({ x: area.center.x + rng.range(-area.radius, area.radius), y: area.center.y + rng.range(-area.radius, area.radius) });
  const group = () => groups[rng.int(0, groups.length - 1)]!;
  const cmdName = { attackMove: 'Attack-Move auf den Marker', move: 'Bewegen zum Marker', patrol: 'Patrouille zum Marker' } as const;
  for (let i = 0; i < count; i++) {
    const kind = rng.int(0, 7);
    const n = group();
    let task: DrillTask;
    if (kind === 0) task = { label: `Gruppe ${n} auswählen`, steps: [{ kind: 'selectGroup', n }] };
    else if (kind === 1 || kind === 2) task = { label: `Gruppe ${n} auswählen, Attack-Move auf den Marker`, steps: [{ kind: 'selectGroup', n }, { kind: 'command', command: 'attackMove', marker: marker() }] };
    else if (kind === 3) task = { label: `Gruppe ${n} auswählen, Bewegen zum Marker`, steps: [{ kind: 'selectGroup', n }, { kind: 'command', command: 'move', marker: marker() }] };
    else if (kind === 4) task = { label: `Gruppe ${n} auswählen, Stopp`, steps: [{ kind: 'selectGroup', n }, { kind: 'stop' }] };
    else if (kind === 5) task = { label: `Gruppe ${n} auswählen, Position halten`, steps: [{ kind: 'selectGroup', n }, { kind: 'hold' }] };
    else if (kind === 6) task = { label: `Alle Militäreinheiten auswählen, ${cmdName.attackMove}`, steps: [{ kind: 'selectAll' }, { kind: 'command', command: 'attackMove', marker: marker() }] };
    else task = { label: `Gruppe ${n} auswählen, Patrouille zum Marker`, steps: [{ kind: 'selectGroup', n }, { kind: 'command', command: 'patrol', marker: marker() }] };
    tasks.push({ ...task, pauseMs: rng.range(DELAY_MIN_MS, DELAY_MAX_MS) });
  }
  return tasks;
}
